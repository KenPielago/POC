<?php
/**
 * api.php — JSON endpoint for the trip-planner UI.
 *
 * POST { "messages": [{"role":"user","text":"..."}, ...], "profileInterests": ["Beach", ...] }
 *   messages is the full conversation so far, oldest first, ending with the
 *   latest user message.
 * -> { success, type: "off_topic"|"clarify"|"itinerary", reply, requirements?, itinerary?, dataAvailability? }
 *    or { success: false, error }
 */

header('Content-Type: application/json');
require_once __DIR__ . '/LLM.php';

set_time_limit(90);

$input = json_decode(file_get_contents('php://input'), true);
$messages = is_array($input['messages'] ?? null) ? $input['messages'] : [];
$profileInterests = array_values(array_intersect((array)($input['profileInterests'] ?? []), TRAVEL_INTERESTS));

$messages = array_values(array_filter(array_map(function ($m) {
    $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
    $text = trim((string)($m['text'] ?? ''));
    return $text === '' ? null : ['role' => $role, 'text' => mb_substr($text, 0, 2000)];
}, $messages)));

if (!$messages || end($messages)['role'] !== 'user') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please describe your trip.']);
    exit;
}

if (empty(GEMINI_API_KEY)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No Gemini API key configured on the server.']);
    exit;
}
if (empty(SERPAPI_KEY)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No SerpApi key configured on the server.']);
    exit;
}

try {
    $result = planTripConversation($messages, $profileInterests);
    echo json_encode(['success' => true] + $result);
} catch (\RuntimeException $e) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
