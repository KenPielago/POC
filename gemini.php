<?php
/**
 * gemini.php — low-level Google Gemini API client.
 *
 * Transport only: builds the request, handles retries, surfaces errors.
 * What to ask the model lives in LLM.php; credentials live in config.php.
 */

require_once __DIR__ . '/config.php';

const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_DELAY_SECONDS = 4;

/**
 * Calls Gemini's generateContent endpoint, retrying on transient failures
 * (503 "high demand", network timeouts) — Google's free tier sees short
 * overload spikes fairly often, and these usually clear within seconds.
 * Non-transient errors (bad key, bad request) fail immediately.
 */
function callGemini(array $payload): array
{
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        . GEMINI_MODEL . ':generateContent?key=' . GEMINI_API_KEY;

    for ($attempt = 1; $attempt <= GEMINI_MAX_ATTEMPTS; $attempt++) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 30,
        ]);
        $raw = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $transportFailed = $raw === false;
        $isTransient = $transportFailed || $httpCode === 503;
        $hasMoreAttempts = $attempt < GEMINI_MAX_ATTEMPTS;

        if ($isTransient && $hasMoreAttempts) {
            sleep(GEMINI_RETRY_DELAY_SECONDS);
            continue;
        }

        if ($transportFailed) {
            throw new RuntimeException("cURL error: {$curlError}");
        }

        $json = json_decode($raw, true);

        if ($httpCode !== 200) {
            $message = $json['error']['message'] ?? 'Unknown error';
            throw new RuntimeException("Gemini API error ({$httpCode}): {$message}");
        }

        return $json;
    }
}
