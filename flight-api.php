<?php
/**
 * flight-api.php — Flight Search endpoint (used by the Flight Search page).
 *
 * POST JSON body:
 *   {
 *     tripType: "round-trip" | "one-way" | "multi-city",
 *     legs: [{ from: "MNL", to: "NRT", date: "2026-08-01" }, ...],
 *     returnDate: "2026-08-08",   // round-trip only
 *     adults: 1, children: 0, infants: 0,
 *     cabinClass: "economy" | "premium" | "business" | "first",
 *     nonstopOnly: false,
 *     currency: "PHP",
 *   }
 * -> { success, results: [...], currency } or { success: false, error }
 */

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/serpapi.php';
require_once __DIR__ . '/flights.php';

set_time_limit(60);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid request body.']);
    exit;
}

$currency = strtoupper(trim((string)($body['currency'] ?? 'PHP')));

$result = searchFlights(
    $body['tripType'] ?? 'round-trip',
    is_array($body['legs'] ?? null) ? $body['legs'] : [],
    trim((string)($body['returnDate'] ?? '')),
    (int)($body['adults'] ?? 1),
    (int)($body['children'] ?? 0),
    (int)($body['infants'] ?? 0),
    $body['cabinClass'] ?? 'economy',
    !empty($body['nonstopOnly']),
    $currency
);

http_response_code($result['success'] ? 200 : 400);
echo json_encode($result);
