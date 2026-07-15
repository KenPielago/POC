<?php
// convert.php — live currency conversion endpoint for the Currency Converter widget.
// GET ?amount=500&from=USD&to=PHP
// -> { success, amount, from, to, converted, rate, date } or { success: false, error }

header('Content-Type: application/json');
require_once __DIR__ . '/currency.php';

$amount = (float)($_GET['amount'] ?? 0);
$from = strtoupper(trim((string)($_GET['from'] ?? '')));
$to = strtoupper(trim((string)($_GET['to'] ?? '')));

if ($amount <= 0 || !preg_match('/^[A-Z]{3}$/', $from) || !preg_match('/^[A-Z]{3}$/', $to)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Provide a positive amount and two valid 3-letter currency codes.']);
    exit;
}

$result = convertCurrency($amount, $from, $to);

if ($result === null) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'Could not fetch a live exchange rate right now. Please try again.']);
    exit;
}

echo json_encode(['success' => true, 'amount' => $amount, 'from' => $from, 'to' => $to] + $result);
