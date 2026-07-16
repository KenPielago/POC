<?php
/**
 * LLM.php — Budgetra's natural-language trip planner.
 *
 * Turns a free-text request like "find me a cheap flight to Cebu next week,
 * budget around 3000 pesos" into structured search parameters (origin,
 * destination, dates, budget, interests, recommendations).
 *
 * This file owns the trip-planning domain: the response schema, the system
 * prompt, and result post-processing. The Gemini transport lives in
 * gemini.php; exchange rates live in currency.php.
 *
 * SETUP:
 *   1. Get a free API key at aistudio.google.com -> Get API key
 *   2. Paste it into config.php
 *   3. Run:  php LLM.php "your request here"
 */

require_once __DIR__ . '/gemini.php';
require_once __DIR__ . '/currency.php';

const TRAVEL_INTERESTS = [
    'Beach', 'Nature', 'Food Trip', 'Adventure', 'Historical Sites',
    'Shopping', 'Museums', 'Nightlife', 'Relaxation',
];

/** JSON schema (Gemini's OpenAPI-subset format) the response is constrained to. */
function tripRequestSchema(): array
{
    return [
        'type' => 'OBJECT',
        'properties' => [
            'origin' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Departure city or airport as stated by the user, or null if not mentioned'],
            'destination' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Arrival city or airport as stated by the user, or null if not mentioned'],
            'departure_date' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Resolved departure date in YYYY-MM-DD format, or null if unclear'],
            'return_date' => ['type' => 'STRING', 'nullable' => true, 'description' => 'Resolved return date in YYYY-MM-DD format for round trips, or null'],
            'trip_type' => ['type' => 'STRING', 'enum' => ['one_way', 'round_trip', 'multi_city', 'unclear']],
            'budget_amount' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'The raw budget number as stated by the user, in their own currency (before conversion), or null if no budget was mentioned'],
            'budget_currency' => ['type' => 'STRING', 'nullable' => true, 'description' => '3-letter ISO 4217 currency code for budget_amount (e.g. USD, PHP, JPY, EUR) — explicit if the user named a currency or used a symbol, otherwise your best guess from their origin; null if no budget was mentioned'],
            'budget_php' => ['type' => 'NUMBER', 'nullable' => true, 'description' => 'Your best-effort estimate of budget_amount converted to Philippine pesos. The server recalculates this precisely with a live exchange rate when possible, so an approximate estimate here is fine — never leave this null when budget_amount is set.'],
            'interests' => [
                'type' => 'ARRAY',
                'items' => ['type' => 'STRING', 'enum' => TRAVEL_INTERESTS],
                'description' => 'Travel interests stated or clearly implied by the request (e.g. "relaxing beach trip" -> Beach, Relaxation). Empty array if none are evident.',
            ],
            'recommended_places' => [
                'type' => 'ARRAY',
                'items' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'name' => ['type' => 'STRING', 'description' => 'A specific real destination (city or island), not a vague region'],
                        'reason' => ['type' => 'STRING', 'description' => 'One short sentence tying this place to the user\'s stated budget, interests, or dates'],
                    ],
                    'required' => ['name', 'reason'],
                ],
                'description' => 'Almost always populated with 3-5 specific real suggestions. If the user has not named a destination, these are destination suggestions (cities/islands). If the user has named a destination, these are specific named spots within or very near it (beaches, resorts, neighborhoods, landmarks, activities) matching their interests and budget.',
            ],
            'clarification_needed' => ['type' => 'STRING', 'nullable' => true, 'description' => 'A short, friendly question to ask the user if origin or date is missing; null if the request is complete. Do not ask about destination here if recommended_places already offers options.'],
            'summary' => ['type' => 'STRING', 'description' => 'One sentence, plain-language restatement of what the user is asking for'],
        ],
        'required' => ['origin', 'destination', 'departure_date', 'return_date', 'trip_type', 'budget_amount', 'budget_currency', 'budget_php', 'interests', 'recommended_places', 'clarification_needed', 'summary'],
    ];
}

/**
 * @param string[] $profileInterests interests the user saved earlier in the Profile Builder
 * @param ?string $explicitOrigin departure city typed into the dedicated "From" field, if any
 */
function buildSystemPrompt(array $profileInterests = [], ?string $explicitOrigin = null): string
{
    $today = date('Y-m-d, l');
    $interestList = implode(', ', TRAVEL_INTERESTS);
    $prompt = "You are Budgetra's trip-planning assistant. Extract structured flight "
        . "search parameters from the user's natural-language request. Today's date "
        . "is {$today}. Resolve relative dates (\"next week\", \"this weekend\", "
        . "\"in two months\") into exact YYYY-MM-DD dates based on today. If no year "
        . "is stated, assume the nearest future occurrence. If the user gives no date "
        . "signal at all, leave \"departure_date\" and \"return_date\" null (never invent "
        . "exact dates they didn't imply) — but weave a suggested timeframe into "
        . "\"summary\" instead, e.g. \"since you didn't mention dates, a 4-5 day trip "
        . "within the next few weeks would suit this budget,\" so timing isn't left "
        . "completely unaddressed. Only report what the user "
        . "actually stated or what can be directly inferred from it — never invent an "
        . "origin, destination, or budget the user didn't mention. For \"interests\", "
        . "only choose from this fixed list: {$interestList}. Include a category only "
        . "when the request clearly states or implies it (e.g. \"chill beach getaway\" "
        . "implies Beach and Relaxation; \"museums and old churches\" implies Museums "
        . "and Historical Sites) — do not guess interests the user gave no signal for.\n\n"
        . "Budget and currency: if a budget is mentioned, put the raw number in "
        . "\"budget_amount\". Determine its currency: use an explicit currency the "
        . "user named or symbolized (\"$500\", \"500 USD\", \"€300\"); if none is "
        . "stated, infer the likely currency from their origin (e.g. origin in the "
        . "US -> USD, Japan -> JPY, the Eurozone -> EUR, unspecified or Philippine "
        . "origin -> PHP) and put its 3-letter ISO 4217 code in \"budget_currency\". "
        . "Always also fill \"budget_php\" with your best-effort peso equivalent "
        . "(the server refines this with a live exchange rate when the currency "
        . "isn't already PHP, so a rough estimate is fine).\n\n"
        . "Recommending places: \"recommended_places\" should almost always contain 3-5 "
        . "specific real suggestions — it is rarely correct to leave it empty. If the "
        . "user has NOT named a specific destination (e.g. \"somewhere warm this "
        . "weekend\", \"where should I go for a beach trip\"), fill it with specific "
        . "real destinations (actual cities or islands, not vague regions) that fit "
        . "their budget, interests (see the \"interests\" field you're producing for "
        . "this same response — including any profile fallback described below), and "
        . "dates — prefer Philippine destinations unless the request implies "
        . "international travel. Leave \"destination\" null in this case; do not pick "
        . "one on their behalf. If the user HAS already named a clear destination, "
        . "switch scope: fill \"recommended_places\" with specific named spots within "
        . "or very near that destination instead — particular beaches, resorts, "
        . "restaurants, neighborhoods, landmarks, or activities that match their "
        . "interests and budget (e.g. for a beach trip to Cebu, suggest specific beach "
        . "resorts in Cebu, not other cities). Give each a one-sentence reason tied to "
        . "what actually drove the pick (their own words, or their saved profile if "
        . "that's what filled \"interests\").\n\n"
        . "Personalizing by interest: whenever \"interests\" ends up non-empty (from "
        . "this request or the saved-profile fallback below), it must drive the picks — "
        . "prioritize places and activities that clearly match those interests over "
        . "generic \"best of\" suggestions. When more than one interest is present, "
        . "deliberately blend them across the picks rather than leaning on just one "
        . "(e.g. for Beach + Food Trip, include at least one beach/resort pick and one "
        . "food-focused pick, not five near-identical beaches). Don't include a spot "
        . "that matches none of the selected interests unless it's a genuinely famous, "
        . "must-see landmark for that destination (e.g. Chocolate Hills for a Bohol "
        . "trip) — those are worth including even off-interest since skipping them "
        . "would be a worse recommendation. Only fall back to that destination's most "
        . "popular, broadly-appealing attractions when \"interests\" is completely "
        . "empty — no signal from the request and no saved profile to fall back on.";

    if ($profileInterests) {
        $saved = implode(', ', $profileInterests);
        $prompt .= " The user's saved profile lists these general interests: {$saved}. "
            . "If this specific request signals its own interests, use those instead "
            . "(a request can differ from someone's general profile, e.g. a work trip). "
            . "If the request gives no interest signal of its own, default \"interests\" "
            . "to the saved profile list so the trip still reflects their preferences — "
            . "and when recommending places under those same no-signal conditions, "
            . "base the suggestions on this saved profile too.";
    }

    if ($explicitOrigin !== null && $explicitOrigin !== '') {
        $prompt .= " The user has set their departure city to \"{$explicitOrigin}\" in a "
            . "dedicated field on the form — always use this as \"origin\" unless this "
            . "specific message clearly states a different departure city. Because you "
            . "know the real origin, factor actual travel feasibility from it into "
            . "\"recommended_places\": prefer destinations realistically reachable from "
            . "{$explicitOrigin} (e.g. don't suggest a place with no practical flight or "
            . "ferry connection from there), and let the reason mention the trip from "
            . "{$explicitOrigin} when relevant. Since origin is already known, do not ask "
            . "for it in \"clarification_needed\".";
    }

    return $prompt;
}

/**
 * Refines Gemini's rough peso estimate with a live exchange rate and flags
 * the result via "budget_live_rate". Falls back to the estimate untouched
 * when the currency is unknown or the rate lookup fails.
 */
function refineBudgetPhp(array $result): array
{
    $result['budget_live_rate'] = false;
    if (!empty($result['budget_amount']) && !empty($result['budget_currency'])) {
        $converted = convertToPhp((float)$result['budget_amount'], (string)$result['budget_currency']);
        if ($converted !== null) {
            $result['budget_php'] = $converted;
            $result['budget_live_rate'] = true;
        }
    }
    return $result;
}

/**
 * Parses a free-text trip request into structured search parameters via Gemini.
 *
 * @param string[] $profileInterests interests saved earlier in the Profile Builder
 * @param ?string $explicitOrigin departure city typed into the dedicated "From" field, if any
 * @return array{origin:?string,destination:?string,departure_date:?string,
 *   return_date:?string,trip_type:string,budget_amount:?float,budget_currency:?string,
 *   budget_php:?float,budget_live_rate:bool,interests:string[],
 *   recommended_places:array<array{name:string,reason:string}>,
 *   clarification_needed:?string,summary:string}
 */
function parseTripRequest(string $userInput, array $profileInterests = [], ?string $explicitOrigin = null): array
{
    $payload = [
        'contents' => [
            ['role' => 'user', 'parts' => [['text' => $userInput]]],
        ],
        'systemInstruction' => [
            'parts' => [['text' => buildSystemPrompt($profileInterests, $explicitOrigin)]],
        ],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseSchema' => tripRequestSchema(),
        ],
    ];

    $response = callGemini($payload);

    $text = $response['candidates'][0]['content']['parts'][0]['text'] ?? null;
    if ($text === null) {
        throw new RuntimeException('Gemini returned no content');
    }

    return refineBudgetPhp(json_decode($text, true));
}

// --- CLI demo: php LLM.php "find me a cheap flight to Cebu next week"
if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if (empty(GEMINI_API_KEY) || str_starts_with(GEMINI_API_KEY, 'PASTE')) {
        fwrite(STDERR, "No API key set. Get one at aistudio.google.com -> Get API key, then paste it into config.php.\n");
        exit(1);
    }

    $userInput = $argv[1] ?? 'Find me a cheap flight to Cebu next week, budget around 3000 pesos';

    echo "You said: {$userInput}\n\n";

    try {
        $result = parseTripRequest($userInput);
    } catch (\RuntimeException $e) {
        fwrite(STDERR, "{$e->getMessage()}\n");
        exit(1);
    }

    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
}
