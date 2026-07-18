<?php
/**
 * places-api.php — Attractions/restaurants search endpoint.
 *
 * POST JSON body: { location, category: "attractions" | "restaurants" }
 * -> { success, results: [...] } or { success: false, error }
 */

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/serpapi.php';
require_once __DIR__ . '/places.php';

set_time_limit(60);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid request body.']);
    exit;
}

$category = ($body['category'] ?? '') === 'restaurants' ? 'restaurants' : 'attractions';

$result = searchPlaces(trim((string)($body['location'] ?? '')), $category);

http_response_code($result['success'] ? 200 : 400);
echo json_encode($result);
