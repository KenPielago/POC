<?php
/**
 * receipt.php — Budgetra's receipt-analysis LLM logic.
 *
 * Turns OCR-extracted receipt text (see receipt-api.php, which pulls the
 * text out via OCR.Space before handing it here) into structured expense
 * data — merchant, total, currency, date, category — via Gemini Flash Lite.
 * Only the extracted text is sent to Gemini, never the image, to keep token
 * usage down.
 *
 * This file owns the receipt-analysis domain: the response schema, the
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
            'readable' => ['type' => 'BOOLEAN', 'description' => 'False only when the OCR text is too sparse, garbled, or incomplete to confidently identify a total amount.'],
            'detectedLanguage' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Full name of the language the receipt was originally printed in (e.g. "Japanese", "French"), or null if it was already English or can\'t be determined.'],
            'merchant' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Business/merchant name as it appears in the text (keep the original name as printed — proper nouns aren\'t translated), or null if not present.'],
            'total' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'The final total amount actually paid (not a subtotal before tax/tip, and not a single line item), or null if not present.'],
            'currency' => ['type' => 'STRING', 'nullable' => true, 'description' => '3-letter ISO 4217 currency code inferred from a symbol, code, or other context in the text, or null if genuinely unclear.'],
            'date' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Purchase date in YYYY-MM-DD format if present in the text, or null.'],
            'time' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Purchase time in 24-hour HH:MM format if printed on the receipt, or null.'],
            'tax' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'Tax amount if separately itemized on the receipt (e.g. VAT, sales tax, service charge), or null if not shown.'],
            'category' => ['type' => 'STRING', 'enum' => EXPENSE_CATEGORIES, 'description' => 'Best-fit expense category based on the merchant name and listed items.'],
            'note' => ['type' => 'STRING', 'nullable' => true, 'description' => 'One short phrase in English describing what was purchased, e.g. "Dinner - 2 mains, 1 dessert", or null.'],
        ],
        'required' => ['readable', 'detectedLanguage', 'merchant', 'total', 'currency', 'date', 'time', 'tax', 'category', 'note'],
    ];
}

function buildReceiptPrompt(?string $currencyHint = null): string
{
    $today = date('Y-m-d');
    $categoryList = implode(', ', EXPENSE_CATEGORIES);
    $prompt = "You are Budgetra's receipt-analysis assistant. You'll be given raw OCR "
        . "text extracted from a purchase receipt, pulled by an OCR engine from a photo "
        . "or PDF that could be in any language and from any country — the OCR pass may "
        . "also contain typos, misread characters (e.g. O/0, I/1/l, S/5, B/8 confusion), "
        . "or jumbled line order, and numbers may use a different decimal/thousands "
        . "convention than you'd expect (e.g. \"1.234,56\" meaning 1234.56, not 1.234). "
        . "Read past this noise using context rather than taking every character "
        . "literally, and ignore text that isn't part of the transaction itself — "
        . "advertisements, promotions, loyalty-program pitches, QR/barcode filler text, "
        . "and legal disclaimers.\n\n"
        . "First, detect what language the receipt was originally printed in and set "
        . "\"detectedLanguage\" to its full name (e.g. \"Japanese\"), or null if it's "
        . "already English or truly undeterminable. Then extract, giving \"note\" in "
        . "English regardless of the receipt's original language (translate if needed) "
        . "while keeping \"merchant\" as printed since business names generally aren't "
        . "translated: the merchant/business name; the final total amount actually paid "
        . "(not a subtotal before tax/tip, and not a single line item); the currency "
        . "(infer from a printed symbol or code, or other context — don't assume a "
        . "country from the language alone, e.g. French can appear on receipts outside "
        . "France); the purchase date in YYYY-MM-DD (today is {$today} — use it only to "
        . "resolve an ambiguous or 2-digit year, and only if a date actually appears); "
        . "the purchase time in 24-hour HH:MM if printed; and the tax amount if it's "
        . "separately itemized (VAT, sales tax, service charge). Pick the single "
        . "best-fit category from this fixed list: {$categoryList}, based on the "
        . "merchant name and listed items. Set \"readable\" to false — and leave "
        . "merchant/total/currency/date/time/tax null — only when the text is too "
        . "sparse, garbled, or incomplete to confidently identify a total amount; text "
        . "that's readable but simply missing one field (e.g. no printed time) is still "
        . "\"readable\": true, just leave that specific field null. Never invent a "
        . "merchant name, amount, or date that isn't actually present in the text.";

    if ($currencyHint !== null) {
        $prompt .= " If the currency is genuinely ambiguous from the text alone, assume "
            . "{$currencyHint} since that's the currency this trip is being tracked in.";
    }

    return $prompt;
}

/**
 * Extracts structured expense data from OCR-extracted receipt text via
 * Gemini Flash Lite. Only ever sees the text — never the original image.
 *
 * @param string $extractedText raw text pulled from the receipt by OCR.Space
 * @param ?string $currencyHint 3-letter currency code to prefer when the
 *   receipt's own currency is ambiguous (the trip's tracked currency)
 * @return array{readable:bool,detectedLanguage:?string,merchant:?string,
 *   total:?float,currency:?string,date:?string,time:?string,tax:?float,
 *   category:string,note:?string}
 */
function parseReceiptText(string $extractedText, ?string $currencyHint = null): array
{
    $payload = [
        'contents' => [[
            'role' => 'user',
            'parts' => [
                ['text' => "OCR text extracted from the receipt:\n\n{$extractedText}"],
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
