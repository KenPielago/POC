<?php
/**
 * currency.php — live currency conversion.
 *
 * Uses Frankfurter (European Central Bank reference rates) — free, no API
 * key. Shared by the trip planner (budget-to-PHP) and convert.php (the
 * Smart Currency Converter endpoint).
 */

/**
 * Converts an amount between any two currencies using live exchange rates.
 * Returns null on any failure (unsupported currency, network issue) so
 * callers can fall back gracefully rather than erroring out.
 *
 * @return ?array{converted:float,rate:float,date:string}
 */
function convertCurrency(float $amount, string $fromCurrency, string $toCurrency): ?array
{
    $from = strtoupper(trim($fromCurrency));
    $to = strtoupper(trim($toCurrency));

    if (!preg_match('/^[A-Z]{3}$/', $from) || !preg_match('/^[A-Z]{3}$/', $to) || $amount <= 0) {
        return null;
    }
    if ($from === $to) {
        return ['converted' => $amount, 'rate' => 1.0, 'date' => date('Y-m-d')];
    }

    $url = 'https://api.frankfurter.dev/v1/latest?amount=' . urlencode((string)$amount)
        . '&from=' . urlencode($from) . '&to=' . urlencode($to);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 8,
    ]);
    $raw = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw === false || $httpCode !== 200) {
        return null;
    }

    $json = json_decode($raw, true);
    if (!isset($json['rates'][$to])) {
        return null;
    }

    $converted = (float)$json['rates'][$to];
    return [
        'converted' => $converted,
        'rate' => $converted / $amount,
        'date' => $json['date'] ?? date('Y-m-d'),
    ];
}

/** Thin wrapper kept for the trip-planner's PHP-equivalent budget field. */
function convertToPhp(float $amount, string $fromCurrency): ?float
{
    return convertCurrency($amount, $fromCurrency, 'PHP')['converted'] ?? null;
}
