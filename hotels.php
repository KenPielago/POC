<?php
/**
 * hotels.php — accommodation search domain logic (SerpApi Google Hotels engine).
 */

/**
 * @return array{success:bool, results?:array, currency?:string, error?:string}
 */
function searchHotels(string $location, string $checkIn, string $checkOut, int $adults, string $currency): array
{
    if (!preg_match('/^[A-Z]{3}$/', $currency)) $currency = 'PHP';

    if (trim($location) === '') {
        return ['success' => false, 'error' => 'A destination is needed to search accommodation.'];
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkIn) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkOut)) {
        return ['success' => false, 'error' => 'Valid check-in and check-out dates are needed to search accommodation.'];
    }

    $params = [
        'engine' => 'google_hotels',
        'api_key' => SERPAPI_KEY,
        'q' => $location,
        'check_in_date' => $checkIn,
        'check_out_date' => $checkOut,
        'adults' => max(1, $adults),
        'currency' => $currency,
        'hl' => 'en',
    ];

    $json = callSerpApi($params);
    if ($json === null) {
        return ['success' => false, 'error' => 'Could not reach the accommodation search provider.'];
    }
    if (isset($json['error'])) {
        return ['success' => false, 'error' => $json['error']];
    }

    $properties = $json['properties'] ?? [];
    $results = array_values(array_filter(array_map('normalizeHotel', $properties)));

    return ['success' => true, 'results' => $results, 'currency' => $currency];
}

/** Flattens a SerpApi Google Hotels property into the flat shape the UI expects. */
function normalizeHotel(array $p): ?array
{
    if (empty($p['name'])) return null;
    return [
        'name' => $p['name'],
        'description' => $p['description'] ?? null,
        'link' => $p['link'] ?? null,
        'image' => $p['images'][0]['thumbnail'] ?? null,
        'hotelClass' => $p['hotel_class'] ?? null,
        'rating' => $p['overall_rating'] ?? null,
        'reviews' => $p['reviews'] ?? null,
        'pricePerNight' => $p['rate_per_night']['extracted_lowest'] ?? null,
        'totalPrice' => $p['total_rate']['extracted_lowest'] ?? null,
        'amenities' => array_slice($p['amenities'] ?? [], 0, 6),
        'nearby' => array_slice(array_map(fn($n) => $n['name'] ?? '', $p['nearby_places'] ?? []), 0, 2),
    ];
}
