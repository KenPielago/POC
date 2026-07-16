// api.js — all server calls in one place.

/**
 * Sends a natural-language trip request to the LLM endpoint.
 * Resolves to { success, result } or { success: false, error }.
 */
export async function requestTripPlan(query, profileInterests, origin) {
  const res = await fetch("/api.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, profileInterests, origin }),
  });
  return res.json();
}

/**
 * Converts an amount between two currencies using live rates.
 * Resolves to { success, converted, rate, date } or { success: false, error }.
 */
export async function requestCurrencyConversion(amount, from, to) {
  const res = await fetch(
    `/convert.php?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  return res.json();
}

/**
 * Sends a receipt photo for OCR extraction (merchant, total, currency, date,
 * category). Resolves to { success, result } or { success: false, error }.
 * @param {File} file the receipt image
 * @param {string} [currencyHint] the trip's tracked currency, used when the
 *   receipt's own currency is ambiguous
 */
export async function requestReceiptScan(file, currencyHint) {
  const formData = new FormData();
  formData.append("receipt", file);
  if (currencyHint) formData.append("currencyHint", currencyHint);
  const res = await fetch("/receipt-api.php", { method: "POST", body: formData });
  return res.json();
}
