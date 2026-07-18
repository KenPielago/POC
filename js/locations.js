// locations.js — searchable location dataset plus lookup helpers.
//
// Only currencies our live-rate source (Frankfurter / European Central Bank)
// supports are listed, so a picked location can never produce a currency the
// converter fails on.
//
// Entry shape: { n: name, c: country ("" if the entry IS a country),
//                iso: flag code, cur: currency, a?: aliases, p?: popular city,
//                t?: interest tags — same category names as the Profile
//                Builder (profile.html) / TRAVEL_INTERESTS in LLM.php }

export const LOCATIONS = [
  { n: "Philippines", c: "", iso: "ph", cur: "PHP", a: ["pilipinas"] },
  { n: "Manila", c: "Philippines", iso: "ph", cur: "PHP", p: true, t: ["Food Trip", "Shopping", "Nightlife"] },
  { n: "Cebu City", c: "Philippines", iso: "ph", cur: "PHP", p: true, t: ["Beach", "Food Trip", "Historical Sites"] },
  { n: "Bacolod City", c: "Philippines", iso: "ph", cur: "PHP", t: ["Food Trip"] },
  { n: "Davao City", c: "Philippines", iso: "ph", cur: "PHP", t: ["Nature", "Adventure"] },
  { n: "Iloilo City", c: "Philippines", iso: "ph", cur: "PHP", t: ["Historical Sites", "Food Trip"] },
  { n: "Boracay", c: "Philippines", iso: "ph", cur: "PHP", p: true, t: ["Beach", "Relaxation", "Nightlife"] },
  { n: "Puerto Princesa", c: "Philippines", iso: "ph", cur: "PHP", t: ["Nature", "Adventure"] },
  { n: "El Nido", c: "Philippines", iso: "ph", cur: "PHP", p: true, t: ["Beach", "Nature", "Adventure"] },
  { n: "Siargao", c: "Philippines", iso: "ph", cur: "PHP", p: true, t: ["Beach", "Adventure"] },
  { n: "Baguio", c: "Philippines", iso: "ph", cur: "PHP", t: ["Nature", "Relaxation"] },
  { n: "Bohol", c: "Philippines", iso: "ph", cur: "PHP", t: ["Beach", "Nature", "Adventure"] },
  { n: "United States", c: "", iso: "us", cur: "USD", a: ["america", "usa"] },
  { n: "New York", c: "United States", iso: "us", cur: "USD", t: ["Museums", "Shopping", "Nightlife"] },
  { n: "Los Angeles", c: "United States", iso: "us", cur: "USD", t: ["Shopping", "Nightlife"] },
  { n: "San Francisco", c: "United States", iso: "us", cur: "USD", t: ["Museums", "Historical Sites"] },
  { n: "Japan", c: "", iso: "jp", cur: "JPY" },
  { n: "Tokyo", c: "Japan", iso: "jp", cur: "JPY", p: true, t: ["Shopping", "Food Trip", "Nightlife", "Museums"] },
  { n: "Osaka", c: "Japan", iso: "jp", cur: "JPY", t: ["Food Trip", "Nightlife"] },
  { n: "South Korea", c: "", iso: "kr", cur: "KRW", a: ["korea"] },
  { n: "Seoul", c: "South Korea", iso: "kr", cur: "KRW", p: true, t: ["Shopping", "Food Trip", "Nightlife"] },
  { n: "China", c: "", iso: "cn", cur: "CNY" },
  { n: "Hong Kong", c: "", iso: "hk", cur: "HKD" },
  { n: "Singapore", c: "", iso: "sg", cur: "SGD" },
  { n: "Thailand", c: "", iso: "th", cur: "THB" },
  { n: "Bangkok", c: "Thailand", iso: "th", cur: "THB", p: true, t: ["Food Trip", "Nightlife", "Shopping"] },
  { n: "Malaysia", c: "", iso: "my", cur: "MYR" },
  { n: "Kuala Lumpur", c: "Malaysia", iso: "my", cur: "MYR", t: ["Shopping", "Food Trip"] },
  { n: "Indonesia", c: "", iso: "id", cur: "IDR" },
  { n: "Bali", c: "Indonesia", iso: "id", cur: "IDR", p: true, t: ["Beach", "Relaxation", "Nature"] },
  { n: "Jakarta", c: "Indonesia", iso: "id", cur: "IDR", t: ["Shopping", "Food Trip"] },
  { n: "India", c: "", iso: "in", cur: "INR" },
  { n: "Australia", c: "", iso: "au", cur: "AUD" },
  { n: "Sydney", c: "Australia", iso: "au", cur: "AUD", t: ["Beach", "Museums"] },
  { n: "Melbourne", c: "Australia", iso: "au", cur: "AUD", t: ["Food Trip", "Museums", "Nightlife"] },
  { n: "New Zealand", c: "", iso: "nz", cur: "NZD" },
  { n: "United Kingdom", c: "", iso: "gb", cur: "GBP", a: ["uk", "england", "britain"] },
  { n: "London", c: "United Kingdom", iso: "gb", cur: "GBP", t: ["Museums", "Historical Sites", "Shopping"] },
  { n: "France", c: "", iso: "fr", cur: "EUR" },
  { n: "Paris", c: "France", iso: "fr", cur: "EUR", t: ["Museums", "Historical Sites", "Shopping"] },
  { n: "Germany", c: "", iso: "de", cur: "EUR" },
  { n: "Italy", c: "", iso: "it", cur: "EUR" },
  { n: "Rome", c: "Italy", iso: "it", cur: "EUR", t: ["Historical Sites", "Museums", "Food Trip"] },
  { n: "Spain", c: "", iso: "es", cur: "EUR" },
  { n: "Barcelona", c: "Spain", iso: "es", cur: "EUR", t: ["Beach", "Historical Sites", "Nightlife"] },
  { n: "Portugal", c: "", iso: "pt", cur: "EUR" },
  { n: "Netherlands", c: "", iso: "nl", cur: "EUR" },
  { n: "Amsterdam", c: "Netherlands", iso: "nl", cur: "EUR", t: ["Museums", "Nightlife"] },
  { n: "Ireland", c: "", iso: "ie", cur: "EUR" },
  { n: "Switzerland", c: "", iso: "ch", cur: "CHF" },
  { n: "Zurich", c: "Switzerland", iso: "ch", cur: "CHF", t: ["Nature", "Relaxation"] },
  { n: "Sweden", c: "", iso: "se", cur: "SEK" },
  { n: "Norway", c: "", iso: "no", cur: "NOK" },
  { n: "Denmark", c: "", iso: "dk", cur: "DKK" },
  { n: "Poland", c: "", iso: "pl", cur: "PLN" },
  { n: "Czech Republic", c: "", iso: "cz", cur: "CZK" },
  { n: "Hungary", c: "", iso: "hu", cur: "HUF" },
  { n: "Turkey", c: "", iso: "tr", cur: "TRY" },
  { n: "Istanbul", c: "Turkey", iso: "tr", cur: "TRY", t: ["Historical Sites", "Shopping", "Food Trip"] },
  { n: "Israel", c: "", iso: "il", cur: "ILS" },
  { n: "South Africa", c: "", iso: "za", cur: "ZAR" },
  { n: "Mexico", c: "", iso: "mx", cur: "MXN" },
  { n: "Brazil", c: "", iso: "br", cur: "BRL" },
  { n: "Canada", c: "", iso: "ca", cur: "CAD" },
  { n: "Toronto", c: "Canada", iso: "ca", cur: "CAD", t: ["Museums", "Shopping"] },
  { n: "Vancouver", c: "Canada", iso: "ca", cur: "CAD", t: ["Nature", "Adventure"] },
];

export const SUPPORTED_CURRENCIES = [...new Set(LOCATIONS.map(l => l.cur))].sort();

/** Best-effort match for free-typed text (used on blur / draft restore). */
export function detectLocation(text) {
  const q = (text || "").trim().toLowerCase();
  if (!q) return null;
  return LOCATIONS.find(l => l.n.toLowerCase() === q)
    || LOCATIONS.find(l => (l.a || []).includes(q))
    || LOCATIONS.find(l => l.n.toLowerCase().startsWith(q) && q.length >= 3)
    || LOCATIONS.find(l => q.includes(l.n.toLowerCase()))
    || null;
}
