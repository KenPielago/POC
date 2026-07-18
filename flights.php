<?php
/**
 * flights.php — flight search domain logic (SerpApi Google Flights engine).
 *
 * Normalizes SerpApi's best_flights/other_flights/multi_city_json quirks
 * into a flat, UI-friendly shape. Used directly by flight-api.php (the
 * Flight Search page's endpoint) and by LLM.php's itinerary planner.
 */

/**
 * @param array $legs [{ from: "MNL", to: "NRT", date: "2026-08-01" }, ...]
 *   round-trip/one-way send exactly one leg; a round-trip's return date
 *   goes in $returnDate, not a second leg.
 * @return array{success:bool, results?:array, currency?:string, error?:string}
 */
function searchFlights(
    string $tripType,
    array $legs,
    string $returnDate,
    int $adults,
    int $children,
    int $infants,
    string $cabinClass,
    bool $nonstopOnly,
    string $currency
): array {
    if (!preg_match('/^[A-Z]{3}$/', $currency)) $currency = 'PHP';

    if (!$legs || !isset($legs[0]['from'], $legs[0]['to'], $legs[0]['date'])) {
        return ['success' => false, 'error' => 'Choose a departure airport, arrival airport, and date.'];
    }
    foreach ($legs as $leg) {
        if (!preg_match('/^[A-Z]{3}$/i', (string)($leg['from'] ?? '')) || !preg_match('/^[A-Z]{3}$/i', (string)($leg['to'] ?? ''))) {
            return ['success' => false, 'error' => 'Airport codes must be valid 3-letter IATA codes.'];
        }
    }
    if ($tripType === 'round-trip' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $returnDate)) {
        return ['success' => false, 'error' => 'A round-trip search needs a return date.'];
    }

    $travelClassMap = ['economy' => 1, 'premium' => 2, 'business' => 3, 'first' => 4];
    $typeMap = ['round-trip' => 1, 'one-way' => 2, 'multi-city' => 3];

    $params = [
        'engine' => 'google_flights',
        'api_key' => SERPAPI_KEY,
        'hl' => 'en',
        'currency' => $currency,
        'adults' => max(1, $adults),
        'children' => max(0, $children),
        'infants_in_seat' => max(0, $infants),
        'travel_class' => $travelClassMap[$cabinClass] ?? 1,
        'type' => $typeMap[$tripType] ?? 1,
        'stops' => $nonstopOnly ? 1 : 0,
        'deep_search' => 'true',
    ];

    if ($tripType === 'multi-city') {
        $multiCity = array_map(fn($leg) => [
            'departure_id' => strtoupper($leg['from']),
            'arrival_id' => strtoupper($leg['to']),
            'date' => $leg['date'],
        ], $legs);
        $params['multi_city_json'] = json_encode($multiCity);
    } else {
        $params['departure_id'] = strtoupper($legs[0]['from']);
        $params['arrival_id'] = strtoupper($legs[0]['to']);
        $params['outbound_date'] = $legs[0]['date'];
        if ($tripType === 'round-trip') {
            $params['return_date'] = $returnDate;
        }
    }

    $json = callSerpApi($params);
    if ($json === null) {
        return ['success' => false, 'error' => 'Could not reach the flight search provider.'];
    }
    if (isset($json['error'])) {
        return ['success' => false, 'error' => $json['error']];
    }

    $itineraries = array_merge($json['best_flights'] ?? [], $json['other_flights'] ?? []);
    $results = array_values(array_filter(array_map('normalizeItinerary', $itineraries)));

    return ['success' => true, 'results' => $results, 'currency' => $currency];
}

/** Flattens a SerpApi itinerary into the flat shape the UI expects. */
function normalizeItinerary(array $itin): ?array
{
    $legs = $itin['flights'] ?? [];
    if (!$legs) return null;

    $first = $legs[0];
    $last = $legs[count($legs) - 1];
    $stops = count($legs) - 1;

    $bags = [];
    $refundable = null;
    foreach ($legs as $leg) {
        foreach ($leg['extensions'] ?? [] as $ext) {
            if (stripos($ext, 'bag') !== false) $bags[] = $ext;
            if (stripos($ext, 'non-refundable') !== false || stripos($ext, 'nonrefundable') !== false) $refundable = false;
            elseif (stripos($ext, 'refundable') !== false) $refundable = true;
        }
    }

    return [
        'id' => $itin['booking_token'] ?? md5(json_encode($itin)),
        'airline' => $first['airline'] ?? 'Unknown Airline',
        'airlineLogo' => $itin['airline_logo'] ?? $first['airline_logo'] ?? null,
        'flightNumbers' => array_values(array_unique(array_map(fn($l) => $l['flight_number'] ?? '', $legs))),
        'departureAirport' => $first['departure_airport']['id'] ?? '',
        'departureAirportName' => $first['departure_airport']['name'] ?? '',
        'departureTime' => $first['departure_airport']['time'] ?? '',
        'arrivalAirport' => $last['arrival_airport']['id'] ?? '',
        'arrivalAirportName' => $last['arrival_airport']['name'] ?? '',
        'arrivalTime' => $last['arrival_airport']['time'] ?? '',
        'durationMinutes' => (int)($itin['total_duration'] ?? array_sum(array_column($legs, 'duration'))),
        'stops' => $stops,
        'stopAirports' => array_slice(array_map(fn($l) => $l['arrival_airport']['id'] ?? '', $legs), 0, -1),
        'cabinClass' => $first['travel_class'] ?? null,
        'baggage' => $bags ? implode('; ', array_unique($bags)) : null,
        'refundable' => $refundable,
        'price' => $itin['price'] ?? null,
        'type' => $itin['type'] ?? null,
    ];
}
