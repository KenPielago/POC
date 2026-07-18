// api.js — all server calls in one place.

/**
 * Sends the full trip-planning conversation so far to the LLM endpoint —
 * the assistant remembers earlier turns, so only the new user message needs
 * to be appended before calling this, not the whole thing re-explained.
 * @param {{role: "user"|"assistant", text: string}[]} messages oldest first,
 *   ending with the latest user message
 * @param {string[]} profileInterests saved Profile Builder interests
 * Resolves to { success, type: "off_topic"|"clarify"|"itinerary", reply,
 *   requirements?, itinerary?, dataAvailability? } or { success: false, error }.
 */
export async function requestTripPlan(messages, profileInterests) {
  const res = await fetch("/api.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, profileInterests }),
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

/**
 * Searches real-time flight fares via the Flight Search page.
 * Resolves to { success, results, currency } or { success: false, error }.
 */
export async function requestFlightSearch(payload) {
  const res = await fetch("/flight-api.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}
