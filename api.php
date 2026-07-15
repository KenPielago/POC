<?php
// api.php — JSON endpoint for the trip-planner UI.
// POST { "query": "...", "profileInterests": ["Beach", ...], "origin": "Bacolod City" }
// -> { success, result } or { success: false, error }

header('Content-Type: application/json');
require_once __DIR__ . '/LLM.php';

$input = json_decode(file_get_contents('php://input'), true);
$query = trim($input['query'] ?? ($_GET['query'] ?? ''));
$profileInterests = array_values(array_intersect((array)($input['profileInterests'] ?? []), TRAVEL_INTERESTS));
$origin = trim((string)($input['origin'] ?? ''));
$origin = mb_substr($origin, 0, 80) ?: null;

if ($query === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please describe your trip.']);
    exit;
}

if (empty(GEMINI_API_KEY) || str_starts_with(GEMINI_API_KEY, 'PASTE')) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No Gemini API key configured on the server.']);
    exit;
}

try {
    $result = parseTripRequest($query, $profileInterests, $origin);
    echo json_encode(['success' => true, 'result' => $result]);
} catch (\RuntimeException $e) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
