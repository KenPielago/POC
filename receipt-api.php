<?php
// receipt-api.php — receipt OCR endpoint for the Expense Tracker.
// POST multipart/form-data: file field "receipt" (image), optional "currencyHint"
// -> { success, result: {readable, merchant, total, currency, date, category, note} }
//    or { success: false, error }

header('Content-Type: application/json');
require_once __DIR__ . '/receipt.php';

if (empty(GEMINI_API_KEY) || str_starts_with(GEMINI_API_KEY, 'PASTE')) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No Gemini API key configured on the server.']);
    exit;
}

if (!isset($_FILES['receipt']) || $_FILES['receipt']['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($_FILES['receipt']['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please attach a receipt image.']);
    exit;
}

$file = $_FILES['receipt'];

$maxBytes = 8 * 1024 * 1024;
if ($file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Image is too large (max 8MB).']);
    exit;
}

$allowedMimes = ['image/jpeg' => true, 'image/png' => true, 'image/webp' => true];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!isset($allowedMimes[$mimeType])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please upload a JPEG, PNG, or WEBP image.']);
    exit;
}

$currencyHint = strtoupper(trim((string)($_POST['currencyHint'] ?? '')));
$currencyHint = preg_match('/^[A-Z]{3}$/', $currencyHint) ? $currencyHint : null;

$imageData = file_get_contents($file['tmp_name']);
$base64 = base64_encode($imageData);

try {
    $result = parseReceipt($base64, $mimeType, $currencyHint);
    echo json_encode(['success' => true, 'result' => $result]);
} catch (\RuntimeException $e) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
