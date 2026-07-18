<?php
/**
 * serpapi.php — shared SerpApi transport. Used by flights.php, hotels.php,
 * and places.php for their respective Google Flights/Hotels/Local engines.
 */

/**
 * Calls SerpApi's /search.json with the given params.
 * @return ?array the decoded JSON response, or null on a hard transport
 *   failure (network/timeout/non-JSON). An API-level error still decodes
 *   fine and comes back as ['error' => '...'] for the caller to check.
 */
function callSerpApi(array $params): ?array
{
    $url = 'https://serpapi.com/search.json?' . http_build_query($params);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);

    if ($raw === false) return null;

    $json = json_decode($raw, true);
    return is_array($json) ? $json : null;
}
