<?php
/**
 * receipt.php — Budgetra's receipt-scanning OCR.
 *
 * Turns a photo of a purchase receipt into structured expense data (merchant,
 * total, currency, date, category) via Gemini's multimodal vision input.
 *
 * This file owns the receipt-scanning domain: the response schema, the
 * system prompt, and result parsing. Transport lives in gemini.php;
 * credentials live in config.php.
 */

require_once __DIR__ . '/gemini.php';

const EXPENSE_CATEGORIES = [
    'Food & Drink', 'Transportation', 'Lodging', 'Activities', 'Shopping', 'Other',
];

/** JSON schema (Gemini's OpenAPI-subset format) the response is constrained to. */
function receiptSchema(): array
{
    return [
        'type' => 'OBJECT',
        'properties' => [
            'readable' => ['type' => 'BOOLEAN', 'description' => 'False only when the image is too blurry, dark, cropped, or low-resolution to confidently read the total amount.'],
            'merchant' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Business/merchant name as printed on the receipt, or null if not legible.'],
            'total' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'The final total amount actually paid (not a subtotal before tax/tip, and not a single line item), or null if not legible.'],
            'currency' => ['type' => 'STRING', 'nullable' => true, 'description' => '3-letter ISO 4217 currency code inferred from a printed symbol, code, or other context on the receipt, or null if genuinely unclear.'],
            'date' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Purchase date in YYYY-MM-DD format if printed on the receipt, or null.'],
            'category' => ['type' => 'STRING', 'enum' => EXPENSE_CATEGORIES, 'description' => 'Best-fit expense category based on the merchant name and listed items.'],
            'note' => ['type' => 'STRING', 'nullable' => true, 'description' => 'One short phrase describing what was purchased, e.g. "Dinner - 2 mains, 1 dessert", or null.'],
        ],
        'required' => ['readable', 'merchant', 'total', 'currency', 'date', 'category', 'note'],
    ];
}

function buildReceiptPrompt(?string $currencyHint = null): string
{
    $today = date('Y-m-d');
    $categoryList = implode(', ', EXPENSE_CATEGORIES);
    $prompt = "You are Budgetra's receipt-scanning assistant. Read the attached photo of a "
        . "purchase receipt via OCR and extract structured expense data. Extract the "
        . "merchant/business name, the final total amount actually paid (not a subtotal "
        . "before tax or tip, and not a single line item), the currency (infer from a "
        . "printed symbol or code, or other context on the receipt), and the purchase "
        . "date in YYYY-MM-DD (today is {$today} — use it only to resolve an ambiguous "
        . "or 2-digit year, and only if a date is actually printed on the receipt). Pick "
        . "the single best-fit category from this fixed list: {$categoryList}, based on "
        . "the merchant name and listed items. Set \"readable\" to false — and leave "
        . "merchant/total/currency/date null — only when the image is genuinely too "
        . "blurry, dark, cropped, or low-resolution to confidently read the total; a "
        . "receipt that's readable but simply missing one field (e.g. no printed date) "
        . "is still \"readable\": true, just leave that specific field null. Never invent "
        . "a merchant name, amount, or date that isn't actually visible in the image.";

    if ($currencyHint !== null) {
        $prompt .= " If the receipt's currency is genuinely ambiguous from the image "
            . "alone, assume {$currencyHint} since that's the currency this trip is "
            . "being tracked in.";
    }

    return $prompt;
}

/**
 * Extracts structured expense data from a receipt photo via Gemini vision.
 *
 * @param string $imageBase64 base64-encoded image bytes
 * @param string $mimeType e.g. "image/jpeg"
 * @param ?string $currencyHint 3-letter currency code to prefer when the
 *   receipt's own currency is ambiguous (the trip's tracked currency)
 * @return array{readable:bool,merchant:?string,total:?float,currency:?string,
 *   date:?string,category:string,note:?string}
 */
function parseReceipt(string $imageBase64, string $mimeType, ?string $currencyHint = null): array
{
    $payload = [
        'contents' => [[
            'role' => 'user',
            'parts' => [
                ['inlineData' => ['mimeType' => $mimeType, 'data' => $imageBase64]],
            ],
        ]],
        'systemInstruction' => [
            'parts' => [['text' => buildReceiptPrompt($currencyHint)]],
        ],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseSchema' => receiptSchema(),
        ],
    ];

    $response = callGemini($payload);

    $text = $response['candidates'][0]['content']['parts'][0]['text'] ?? null;
    if ($text === null) {
        throw new RuntimeException('Gemini returned no content');
    }

    return json_decode($text, true);
}
