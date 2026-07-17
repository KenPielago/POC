<?php
// receipt-api.php — OCR.Space integration + endpoint for the Expense Tracker.
// Pipeline: OCR.Space extracts raw text from the uploaded receipt (any of its
// 200+ supported languages, auto-detected via OCREngine 3), then that text
// (never the image itself) is handed to receipt.php's Gemini analysis, which
// translates, corrects OCR noise, and structures it — keeping LLM token usage low.
// POST multipart/form-data: file field "receipt" (JPG/JPEG/PNG/PDF), optional "currencyHint"
// -> { success, result: {readable, detectedLanguage, merchant, total, currency,
//      date, time, tax, category, note} } or { success: false, error }

header('Content-Type: application/json');
require_once __DIR__ . '/receipt.php';

// This endpoint chains two external API calls — OCR.Space (up to 60s; Engine
// 3 is the most accurate but the slowest, especially on larger files) then
// Gemini (up to 30s per attempt, retried up to 3x on transient failures, so
// up to ~98s worst case) — which can legitimately exceed PHP's default 30s
// execution limit and kill the script mid-response, truncating the JSON the
// browser is waiting on. 180s covers the realistic worst case of both.
set_time_limit(180);

// Currencies whose receipts are reliably Latin-script or Chinese — Engine 2
// auto-detects these well (per OCR.Space's own docs) and is meaningfully
// faster than Engine 3. Everything else (Japanese, Korean, Thai, Hebrew,
// Indian scripts) needs Engine 3's full 200+ language coverage to actually
// read correctly — so we only pay Engine 3's speed cost where it matters.
const OCR_FAST_ENGINE_CURRENCIES = [
    'PHP', 'USD', 'CNY', 'HKD', 'SGD', 'MYR', 'IDR', 'AUD', 'NZD', 'GBP',
    'EUR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR',
    'MXN', 'BRL', 'CAD',
];

/**
 * Sends a file to OCR.Space and returns the plain text it extracted.
 * Throws on transport/API failure; returns "" (not an exception) when OCR.Space
 * processes the file successfully but simply finds no readable text on it.
 *
 * @param string $filePath path to the uploaded file on disk
 * @param string $mimeType e.g. "image/jpeg" or "application/pdf"
 * @param string $fileName original filename, forwarded so OCR.Space can infer file type
 * @param ?string $currencyHint the trip's tracked currency — used to pick a
 *   faster OCR engine when the destination's script is known to be safe on
 *   Engine 2; unknown/unset defaults to Engine 3 (broader, slower) so we
 *   never silently lose language coverage when we don't know the destination
 */
function ocrSpaceExtractText(string $filePath, string $mimeType, string $fileName, ?string $currencyHint): string
{
    $useFastEngine = $currencyHint !== null && in_array($currencyHint, OCR_FAST_ENGINE_CURRENCIES, true);
    $ch = curl_init('https://api.ocr.space/parse/image');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_POSTFIELDS => [
            'apikey' => OCR_SPACE_API_KEY,
            'file' => new CURLFile($filePath, $mimeType, $fileName),
            'OCREngine' => $useFastEngine ? '2' : '3',
            'language' => 'auto',
            // 'scale' upscales low-res scans for better accuracy, but adds
            // processing time — OCR.Space's own default is false, and a
            // normal phone photo doesn't need it. Only degraded/tiny images do.
            'scale' => 'false',
            'isTable' => 'true',
        ],
    ]);
    $raw = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw === false) {
        throw new RuntimeException("Could not reach OCR.Space: {$curlError}");
    }
    if ($httpCode !== 200) {
        throw new RuntimeException("OCR.Space API error (HTTP {$httpCode}).");
    }

    $json = json_decode($raw, true);
    if ($json === null) {
        throw new RuntimeException('OCR.Space returned an unreadable response.');
    }
    if (!empty($json['IsErroredOnProcessing'])) {
        $rawMessage = $json['ErrorMessage'] ?? 'Unknown OCR error';
        $message = is_array($rawMessage) ? implode('; ', $rawMessage) : (string)$rawMessage;
        throw new RuntimeException("OCR.Space couldn't process the file: {$message}");
    }

    return trim($json['ParsedResults'][0]['ParsedText'] ?? '');
}

/** A soft "couldn't read this" result — same shape the UI already handles for unreadable receipts. */
function unreadableResult(): array
{
    return [
        'readable' => false, 'detectedLanguage' => null, 'merchant' => null, 'total' => null,
        'currency' => null, 'date' => null, 'time' => null, 'tax' => null,
        'category' => 'Other', 'note' => null,
    ];
}

if (empty(GEMINI_API_KEY) || str_starts_with(GEMINI_API_KEY, 'PASTE')) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No Gemini API key configured on the server.']);
    exit;
}

if (empty(OCR_SPACE_API_KEY)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No OCR.Space API key configured on the server.']);
    exit;
}

if (!isset($_FILES['receipt']) || $_FILES['receipt']['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($_FILES['receipt']['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please attach a receipt image or PDF.']);
    exit;
}

$file = $_FILES['receipt'];

// OCR.Space's free tier caps uploads at 1MB — reject early with a clear
// message rather than letting a bigger file fail opaquely at their end.
$maxBytes = 1 * 1024 * 1024;
if ($file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'File is too large (max 1MB on the free OCR tier) — try a lower-resolution photo.']);
    exit;
}

$allowedMimes = ['image/jpeg' => true, 'image/png' => true, 'application/pdf' => true];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!isset($allowedMimes[$mimeType])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please upload a JPG, PNG, or PDF file.']);
    exit;
}

$currencyHint = strtoupper(trim((string)($_POST['currencyHint'] ?? '')));
$currencyHint = preg_match('/^[A-Z]{3}$/', $currencyHint) ? $currencyHint : null;

try {
    $extractedText = ocrSpaceExtractText($file['tmp_name'], $mimeType, $file['name'], $currencyHint);

    // Nothing usable came back — surface it the same way an unreadable photo
    // is, without spending a Gemini call analyzing empty text.
    if (mb_strlen($extractedText) < 5) {
        echo json_encode(['success' => true, 'result' => unreadableResult()]);
        exit;
    }

    $result = parseReceiptText($extractedText, $currencyHint);
    echo json_encode(['success' => true, 'result' => $result]);
} catch (\RuntimeException $e) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
