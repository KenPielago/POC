<?php
/**
 * hotel-api.php — Accommodation search endpoint.
 *
 * POST JSON body: { location, checkIn, checkOut, adults, currency }
 * -> { success, results: [...], currency } or { success: false, error }
 */

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/serpapi.php';
require_once __DIR__ . '/hotels.php';

set_time_limit(60);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid request body.']);
    exit;
}

$currency = strtoupper(trim((string)($body['currency'] ?? 'PHP')));

$result = searchHotels(
    trim((string)($body['location'] ?? '')),
    trim((string)($body['checkIn'] ?? '')),
    trim((string)($body['checkOut'] ?? '')),
    (int)($body['adults'] ?? 1),
    $currency
);

http_response_code($result['success'] ? 200 : 400);
echo json_encode($result);
