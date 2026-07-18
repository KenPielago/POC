<?php
/**
 * places.php — attractions & restaurant search domain logic
 * (SerpApi Google Local engine).
 */

/**
 * @param string $category "attractions" | "restaurants"
 * @return array{success:bool, results?:array, error?:string}
 */
function searchPlaces(string $location, string $category): array
{
    if (trim($location) === '') {
        return ['success' => false, 'error' => 'A destination is needed to search places.'];
    }
    $query = $category === 'restaurants'
        ? "restaurants in {$location}"
        : "tourist attractions in {$location}";

    $params = [
        'engine' => 'google_local',
        'api_key' => SERPAPI_KEY,
        'q' => $query,
        'hl' => 'en',
    ];

    $json = callSerpApi($params);
    if ($json === null) {
        return ['success' => false, 'error' => 'Could not reach the places search provider.'];
    }
    if (isset($json['error'])) {
        return ['success' => false, 'error' => $json['error']];
    }

    $local = $json['local_results'] ?? [];
    $results = array_values(array_filter(array_map('normalizePlace', $local)));

    return ['success' => true, 'results' => $results];
}

/** Flattens a SerpApi Google Local result into the flat shape the UI expects. */
function normalizePlace(array $p): ?array
{
    if (empty($p['title'])) return null;
    return [
        'name' => $p['title'],
        'type' => $p['type'] ?? null,
        'rating' => $p['rating'] ?? null,
        'reviews' => $p['reviews'] ?? null,
        'description' => $p['description'] ?? null,
        'address' => $p['address'] ?? null,
        'image' => $p['thumbnail'] ?? null,
    ];
}
