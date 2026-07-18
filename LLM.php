<?php
/**
 * LLM.php — Budgetra's conversational trip-planning assistant.
 *
 * Two-step, per-turn flow (see planTripConversation()):
 *   1. Extract what's known so far from the whole conversation and decide
 *      whether all required info (origin, destination, dates, travelers,
 *      budget) is present. If not, return just a conversational reply
 *      asking for what's missing — never invents required fields.
 *   2. Once everything required is known, the server calls the real
 *      Flights/Accommodation/Attractions/Restaurants APIs (flights.php,
 *      hotels.php, places.php — all SerpApi-backed) and asks Gemini to
 *      assemble a full itinerary grounded ONLY in that real data: Gemini
 *      picks flight/hotel/attraction/restaurant options by array index and
 *      writes the explanatory prose, but every price/name/rating in the
 *      final result is re-hydrated server-side from the actual API
 *      response — never retyped by the model — so numbers can't drift.
 *
 * This file owns the trip-planning domain: schemas, prompts, and
 * orchestration. The Gemini transport lives in gemini.php; live search
 * lives in flights.php/hotels.php/places.php; exchange rates in currency.php.
 */

require_once __DIR__ . '/gemini.php';
require_once __DIR__ . '/serpapi.php';
require_once __DIR__ . '/flights.php';
require_once __DIR__ . '/hotels.php';
require_once __DIR__ . '/places.php';

const TRAVEL_INTERESTS = [
    'Beach', 'Nature', 'Food Trip', 'Adventure', 'Historical Sites',
    'Shopping', 'Museums', 'Nightlife', 'Relaxation',
];

// How many of each API's results to hand Gemini to choose from — enough for
// a genuine choice, small enough to keep the prompt (and cost) reasonable.
const MAX_FLIGHT_OPTIONS = 8;
const MAX_HOTEL_OPTIONS = 8;
const MAX_ATTRACTION_OPTIONS = 12;
const MAX_RESTAURANT_OPTIONS = 12;

// ---------------------------------------------------------------------
// Step 1 — requirements extraction
// ---------------------------------------------------------------------

function requirementsSchema(): array
{
    return [
        'type' => 'OBJECT',
        'properties' => [
            'on_topic' => ['type' => 'BOOLEAN', 'description' => 'true if this conversation is genuinely about travel/trip planning, even if vague or incomplete; false if it has nothing to do with travel (e.g. asking for code, general trivia, unrelated tasks).'],
            'reply' => ['type' => 'STRING', 'description' => 'Your natural, friendly, conversational response to the user right now — either asking for the next missing detail (one or two things at a time, never a long list), suggesting destinations if they don\'t know where to go, or a short lead-in if everything needed is now known and you\'re about to build their itinerary.'],
            'origin' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Departure city as stated across the conversation, or null'],
            'origin_airport_code' => ['type' => 'STRING', 'nullable' => true, 'description' => 'The primary IATA airport code (3 letters) for the origin city, e.g. Manila -> MNL, Tokyo -> NRT. Null if origin is unknown or you are not confident of a specific airport.'],
            'destination' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Destination city as stated or chosen, or null if not yet decided'],
            'destination_airport_code' => ['type' => 'STRING', 'nullable' => true, 'description' => 'The primary IATA airport code (3 letters) for the destination city. Null if destination is unknown or unclear.'],
            'departure_date' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Resolved departure date in YYYY-MM-DD. Resolve relative dates ("next month", "in two weeks") against today\'s date. If the user only gave a trip length with no anchor at all (e.g. just "5 days"), default to a date about 3 weeks from today and say in "reply" that you picked a placeholder window they can adjust. Null only if there is truly zero timing signal in the conversation.'],
            'return_date' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Resolved return date in YYYY-MM-DD, computed from departure_date plus stated/implied trip length. Null only if departure_date is also null.'],
            'duration_label' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Human label for the trip length, e.g. "4 days, 3 nights"'],
            'travelers' => ['type' => 'INTEGER', 'nullable' => true, 'description' => 'Number of travelers. Null if not yet stated — never assume 1.'],
            'budget_amount' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'The raw budget number as stated, in the traveler\'s own currency, or null'],
            'budget_currency' => ['type' => 'STRING', 'nullable' => true, 'description' => '3-letter ISO 4217 code for budget_amount — explicit if named/symbolized, otherwise your best guess from origin. Null if no budget was mentioned.'],
            'interests' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING', 'enum' => TRAVEL_INTERESTS], 'description' => 'Optional. Only choose from this fixed list, only when clearly stated or implied.'],
            'accommodation_preference' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Optional, e.g. "beachfront resort", "budget hostel"'],
            'airline_preference' => ['type' => 'STRING', 'nullable' => true],
            'activity_preference' => ['type' => 'STRING', 'nullable' => true],
            'dietary_preference' => ['type' => 'STRING', 'nullable' => true],
            'destination_suggestions' => [
                'type' => 'ARRAY',
                'items' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'name' => ['type' => 'STRING'],
                        'reason' => ['type' => 'STRING'],
                    ],
                    'required' => ['name', 'reason'],
                ],
                'description' => 'Only populate when the user does not yet know where to go — 3-5 specific real destinations fitting their budget/interests/duration/origin. Empty array once a destination is chosen.',
            ],
            'missing_required_fields' => [
                'type' => 'ARRAY',
                'items' => ['type' => 'STRING', 'enum' => ['origin', 'destination', 'dates', 'travelers', 'budget']],
                'description' => 'Which required fields are still unknown after this message.',
            ],
            'ready_for_itinerary' => ['type' => 'BOOLEAN', 'description' => 'true only when origin, destination, departure_date, travelers, and budget_amount are ALL non-null.'],
        ],
        'required' => [
            'on_topic', 'reply', 'origin', 'origin_airport_code', 'destination', 'destination_airport_code',
            'departure_date', 'return_date', 'duration_label', 'travelers', 'budget_amount', 'budget_currency',
            'interests', 'accommodation_preference', 'airline_preference', 'activity_preference', 'dietary_preference',
            'destination_suggestions', 'missing_required_fields', 'ready_for_itinerary',
        ],
    ];
}

function buildRequirementsPrompt(array $profileInterests): string
{
    $today = date('Y-m-d, l');
    $interestList = implode(', ', TRAVEL_INTERESTS);

    $prompt = "You are Budgetra's trip-planning assistant. Hold a natural, friendly conversation "
        . "to gather what's needed to build a complete personalized itinerary. Today's date is {$today}.\n\n"
        . "Required before you can generate a plan: departure location, destination, travel dates or "
        . "trip duration, number of travelers, and budget. Optional: interests, accommodation "
        . "preference, airline preference, activity preference, dietary preference.\n\n"
        . "Rules: never assume a required field the user hasn't stated — leave it null and ask for "
        . "it. Ask only for what's still missing, and never overwhelm the user by listing many "
        . "questions at once — ask about one or two missing things at a time, prioritizing whichever "
        . "is most natural next (e.g. if the user just says \"I want to travel\" with nothing else, "
        . "ask where they'll be departing from first). If they don't know where to go yet, "
        . "recommend specific real destinations based on whatever budget/interests/duration/origin "
        . "you already know, via \"destination_suggestions\" — don't force them to name a "
        . "destination before you'll help. Be warm and professional, never robotic or "
        . "interrogation-like. For \"interests\", only choose from this fixed list: {$interestList}.";

    if ($profileInterests) {
        $saved = implode(', ', $profileInterests);
        $prompt .= " The user's saved profile lists these general interests: {$saved} — use them as a "
            . "default for \"interests\" if this conversation gives no interest signal of its own.";
    }

    return $prompt;
}

/**
 * @param array<array{role:string,text:string}> $messages full conversation so far, oldest first
 */
function extractTripRequirements(array $messages, array $profileInterests): array
{
    $payload = [
        'contents' => toGeminiContents($messages),
        'systemInstruction' => ['parts' => [['text' => buildRequirementsPrompt($profileInterests)]]],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseSchema' => requirementsSchema(),
        ],
    ];

    $response = callGemini($payload);
    $text = $response['candidates'][0]['content']['parts'][0]['text'] ?? null;
    if ($text === null) {
        throw new RuntimeException('Gemini returned no content');
    }
    return json_decode($text, true);
}

// ---------------------------------------------------------------------
// Step 2 — full itinerary, grounded in real API data
// ---------------------------------------------------------------------

function itinerarySchema(): array
{
    $pickItem = [
        'type' => 'OBJECT',
        'properties' => [
            'index' => ['type' => 'INTEGER', 'description' => '0-based index into the matching options list provided'],
            'note' => ['type' => 'STRING', 'description' => 'One short sentence on why/when this fits'],
        ],
        'required' => ['index', 'note'],
    ];

    return [
        'type' => 'OBJECT',
        'properties' => [
            'reply' => ['type' => 'STRING', 'description' => 'A short, warm, personalized message introducing this itinerary'],
            'trip_overview' => [
                'type' => 'OBJECT',
                'properties' => [
                    'destination' => ['type' => 'STRING'],
                    'departure' => ['type' => 'STRING'],
                    'dates' => ['type' => 'STRING', 'description' => 'e.g. "Sep 1 - Sep 5, 2026"'],
                    'duration' => ['type' => 'STRING', 'description' => 'e.g. "4 days, 3 nights"'],
                    'travelers' => ['type' => 'STRING', 'description' => 'e.g. "2 adults"'],
                ],
                'required' => ['destination', 'departure', 'dates', 'duration', 'travelers'],
            ],
            'flight_pick_index' => ['type' => 'INTEGER', 'nullable' => true, 'description' => '0-based index into the provided flight options, or null if none were available'],
            'flight_reason' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Why this flight, referencing its real price/time/airline; or an explanation that live flight data was unavailable'],
            'hotel_pick_index' => ['type' => 'INTEGER', 'nullable' => true],
            'hotel_reason' => ['type' => 'STRING', 'nullable' => true],
            'attraction_picks' => [
                'type' => 'ARRAY',
                'items' => ['type' => 'OBJECT', 'properties' => $pickItem['properties'] + ['day' => ['type' => 'INTEGER', 'description' => '1-based day number this fits best']], 'required' => ['index', 'note', 'day']],
                'description' => '3-8 picks from the provided attraction options, spread sensibly across the trip\'s days',
            ],
            'restaurant_picks' => [
                'type' => 'ARRAY',
                'items' => ['type' => 'OBJECT', 'properties' => $pickItem['properties'] + ['meal' => ['type' => 'STRING', 'enum' => ['Breakfast', 'Lunch', 'Dinner']]], 'required' => ['index', 'note', 'meal']],
                'description' => 'Picks from the provided restaurant options covering meals across the trip',
            ],
            'daily_itinerary' => [
                'type' => 'ARRAY',
                'items' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'day' => ['type' => 'INTEGER'],
                        'date' => ['type' => 'STRING', 'nullable' => true],
                        'morning' => ['type' => 'STRING'],
                        'afternoon' => ['type' => 'STRING'],
                        'evening' => ['type' => 'STRING'],
                    ],
                    'required' => ['day', 'date', 'morning', 'afternoon', 'evening'],
                ],
                'description' => 'One entry per day of the trip, referencing the picked attractions/restaurants by name',
            ],
            'budget_breakdown' => [
                'type' => 'OBJECT',
                'properties' => [
                    'flights' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'From the picked flight\'s real price if available'],
                    'accommodation' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'From the picked hotel\'s real total price if available'],
                    'food' => ['type' => 'NUMBER', 'description' => 'Reasonable estimate for the destination and duration'],
                    'activities' => ['type' => 'NUMBER', 'description' => 'Reasonable estimate'],
                    'transportation' => ['type' => 'NUMBER', 'description' => 'Local transportation estimate'],
                    'emergency_fund' => ['type' => 'NUMBER', 'description' => 'Reasonable buffer, roughly 10% of the rest'],
                    'total' => ['type' => 'NUMBER'],
                    'currency' => ['type' => 'STRING'],
                    'notes' => ['type' => 'STRING', 'description' => 'Which figures are real API prices vs. estimates, and whether this fits the stated budget'],
                ],
                'required' => ['flights', 'accommodation', 'food', 'activities', 'transportation', 'emergency_fund', 'total', 'currency', 'notes'],
            ],
            'travel_tips' => [
                'type' => 'OBJECT',
                'properties' => [
                    'currency' => ['type' => 'STRING'],
                    'local_transportation' => ['type' => 'STRING'],
                    'safety' => ['type' => 'STRING'],
                    'weather' => ['type' => 'STRING'],
                    'etiquette' => ['type' => 'STRING'],
                ],
                'required' => ['currency', 'local_transportation', 'safety', 'weather', 'etiquette'],
            ],
            'summary' => ['type' => 'STRING', 'description' => 'A short personalized closing note encouraging the trip'],
        ],
        'required' => [
            'reply', 'trip_overview', 'flight_pick_index', 'flight_reason', 'hotel_pick_index', 'hotel_reason',
            'attraction_picks', 'restaurant_picks', 'daily_itinerary', 'budget_breakdown', 'travel_tips', 'summary',
        ],
    ];
}

function formatOptionsForPrompt(array $items, callable $lineFormatter): string
{
    if (!$items) return '(none available)';
    $lines = [];
    foreach ($items as $i => $item) {
        $lines[] = "[{$i}] " . $lineFormatter($item);
    }
    return implode("\n", $lines);
}

function buildItineraryPrompt(array $req, array $flights, array $hotels, array $attractions, array $restaurants): string
{
    $today = date('Y-m-d, l');
    $prompt = "You are Budgetra's trip-planning assistant, now assembling a complete itinerary. "
        . "Today's date is {$today}. Use ONLY the real options listed below for flights, "
        . "accommodation, attractions, and restaurants — never invent a name, price, rating, or "
        . "availability beyond what's given. Reference picked items' real prices in the budget "
        . "breakdown; for food/activities/transportation/emergency fund (which have no live price "
        . "source), give a reasonable destination-appropriate estimate and say so in \"notes\".\n\n";

    $prompt .= "FLIGHT OPTIONS:\n" . formatOptionsForPrompt($flights, function ($f) {
        $stops = $f['stops'] === 0 ? 'nonstop' : "{$f['stops']} stop(s)";
        $price = $f['price'] !== null ? $f['price'] : 'unknown';
        return "{$f['airline']} " . implode('/', $f['flightNumbers']) . ", {$f['departureAirport']}->{$f['arrivalAirport']}, "
            . "depart {$f['departureTime']} arrive {$f['arrivalTime']}, {$stops}, price {$price}";
    }) . "\n\n";

    $prompt .= "ACCOMMODATION OPTIONS:\n" . formatOptionsForPrompt($hotels, function ($h) {
        $amenities = implode(', ', array_slice($h['amenities'] ?? [], 0, 4));
        return "{$h['name']}, " . ($h['hotelClass'] ?? 'unrated') . ", rating " . ($h['rating'] ?? 'n/a')
            . " ({$h['reviews']} reviews), " . ($h['pricePerNight'] ?? 'unknown') . "/night, total "
            . ($h['totalPrice'] ?? 'unknown') . ", amenities: {$amenities}";
    }) . "\n\n";

    $prompt .= "ATTRACTION OPTIONS:\n" . formatOptionsForPrompt($attractions, function ($p) {
        return "{$p['name']} (" . ($p['type'] ?? 'attraction') . "), rating " . ($p['rating'] ?? 'n/a')
            . " ({$p['reviews']} reviews) — " . ($p['description'] ?? '');
    }) . "\n\n";

    $prompt .= "RESTAURANT OPTIONS:\n" . formatOptionsForPrompt($restaurants, function ($p) {
        return "{$p['name']} (" . ($p['type'] ?? 'restaurant') . "), rating " . ($p['rating'] ?? 'n/a')
            . " ({$p['reviews']} reviews) — " . ($p['description'] ?? '');
    }) . "\n\n";

    $prompt .= "TRAVELER: from {$req['origin']} to {$req['destination']}, {$req['departure_date']} to "
        . ($req['return_date'] ?: 'unspecified') . ", {$req['travelers']} traveler(s), budget "
        . "{$req['budget_amount']} {$req['budget_currency']}.";
    if (!empty($req['interests'])) $prompt .= ' Interests: ' . implode(', ', $req['interests']) . '.';
    if (!empty($req['accommodation_preference'])) $prompt .= " Accommodation preference: {$req['accommodation_preference']}.";
    if (!empty($req['airline_preference'])) $prompt .= " Airline preference: {$req['airline_preference']}.";
    if (!empty($req['activity_preference'])) $prompt .= " Activity preference: {$req['activity_preference']}.";
    if (!empty($req['dietary_preference'])) $prompt .= " Dietary preference: {$req['dietary_preference']}.";

    return $prompt;
}

/** Clamps a model-picked index to a valid, safe bound and returns the real item, or null. */
function hydratePick(?int $index, array $options): ?array
{
    if ($index === null || $index < 0 || $index >= count($options)) return null;
    return $options[$index];
}

function generateItinerary(array $messages, array $req, array $flights, array $hotels, array $attractions, array $restaurants): array
{
    $payload = [
        'contents' => toGeminiContents($messages),
        'systemInstruction' => ['parts' => [['text' => buildItineraryPrompt($req, $flights, $hotels, $attractions, $restaurants)]]],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseSchema' => itinerarySchema(),
        ],
    ];

    $response = callGemini($payload);
    $text = $response['candidates'][0]['content']['parts'][0]['text'] ?? null;
    if ($text === null) {
        throw new RuntimeException('Gemini returned no content');
    }
    $plan = json_decode($text, true);

    // Re-hydrate every pick from the real, already-fetched API data — the
    // model only ever chose an index and wrote prose; actual names/prices/
    // ratings always come straight from our own normalized arrays, never
    // from the model retyping them.
    $plan['flight'] = hydratePick($plan['flight_pick_index'] ?? null, $flights);
    $plan['hotel'] = hydratePick($plan['hotel_pick_index'] ?? null, $hotels);
    unset($plan['flight_pick_index'], $plan['hotel_pick_index']);

    $plan['attractions'] = array_values(array_filter(array_map(function ($pick) use ($attractions) {
        $item = hydratePick($pick['index'] ?? null, $attractions);
        if (!$item) return null;
        return $item + ['day' => $pick['day'], 'note' => $pick['note']];
    }, $plan['attraction_picks'] ?? [])));

    $plan['restaurants'] = array_values(array_filter(array_map(function ($pick) use ($restaurants) {
        $item = hydratePick($pick['index'] ?? null, $restaurants);
        if (!$item) return null;
        return $item + ['meal' => $pick['meal'], 'note' => $pick['note']];
    }, $plan['restaurant_picks'] ?? [])));
    unset($plan['attraction_picks'], $plan['restaurant_picks']);

    return $plan;
}

// ---------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------

/** Converts our {role, text} history into Gemini's {role: user|model, parts} shape. */
function toGeminiContents(array $messages): array
{
    return array_map(fn($m) => [
        'role' => ($m['role'] ?? 'user') === 'assistant' ? 'model' : 'user',
        'parts' => [['text' => $m['text'] ?? '']],
    ], $messages);
}

/**
 * Runs one turn of the conversational planner.
 *
 * @param array<array{role:string,text:string}> $messages full conversation, oldest first, ending with the latest user message
 * @param string[] $profileInterests interests saved earlier in the Profile Builder
 * @return array{type:string} type is "off_topic"|"clarify"|"itinerary", plus a "reply" string
 *   always, plus "requirements"/"itinerary" data depending on type
 */
function planTripConversation(array $messages, array $profileInterests = []): array
{
    $req = extractTripRequirements($messages, $profileInterests);

    if (!($req['on_topic'] ?? true)) {
        return ['type' => 'off_topic', 'reply' => $req['reply']];
    }
    if (empty($req['ready_for_itinerary'])) {
        return ['type' => 'clarify', 'reply' => $req['reply'], 'requirements' => $req];
    }

    $currency = $req['budget_currency'] ?: 'PHP';
    $checkOut = $req['return_date'] ?: date('Y-m-d', strtotime($req['departure_date'] . ' +3 days'));

    $flightResult = ($req['origin_airport_code'] && $req['destination_airport_code'])
        ? searchFlights(
            $req['return_date'] ? 'round-trip' : 'one-way',
            [['from' => $req['origin_airport_code'], 'to' => $req['destination_airport_code'], 'date' => $req['departure_date']]],
            $checkOut,
            max(1, (int)$req['travelers']), 0, 0, 'economy', false, $currency
        )
        : ['success' => false, 'results' => []];

    $hotelResult = searchHotels($req['destination'], $req['departure_date'], $checkOut, max(1, (int)$req['travelers']), $currency);
    $attractionResult = searchPlaces($req['destination'], 'attractions');
    $restaurantResult = searchPlaces($req['destination'], 'restaurants');

    $flights = array_slice($flightResult['results'] ?? [], 0, MAX_FLIGHT_OPTIONS);
    $hotels = array_slice($hotelResult['results'] ?? [], 0, MAX_HOTEL_OPTIONS);
    $attractions = array_slice($attractionResult['results'] ?? [], 0, MAX_ATTRACTION_OPTIONS);
    $restaurants = array_slice($restaurantResult['results'] ?? [], 0, MAX_RESTAURANT_OPTIONS);

    $itinerary = generateItinerary($messages, $req, $flights, $hotels, $attractions, $restaurants);

    return [
        'type' => 'itinerary',
        'reply' => $itinerary['reply'],
        'requirements' => $req,
        'itinerary' => $itinerary,
        'dataAvailability' => [
            'flights' => $flightResult['success'] ?? false,
            'accommodation' => $hotelResult['success'] ?? false,
            'attractions' => $attractionResult['success'] ?? false,
            'restaurants' => $restaurantResult['success'] ?? false,
        ],
    ];
}

// --- CLI demo: php LLM.php "find me a cheap flight to Cebu next week"
if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if (empty(GEMINI_API_KEY)) {
        fwrite(STDERR, "No Gemini API key set. Paste one into config.php.\n");
        exit(1);
    }

    $userInput = $argv[1] ?? 'Find me a cheap flight to Cebu next week, budget around 3000 pesos';
    echo "You said: {$userInput}\n\n";

    try {
        $result = planTripConversation([['role' => 'user', 'text' => $userInput]]);
    } catch (\RuntimeException $e) {
        fwrite(STDERR, "{$e->getMessage()}\n");
        exit(1);
    }

    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
}
