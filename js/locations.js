// locations.js — searchable location dataset plus lookup helpers.
//
// Only currencies our live-rate source (Frankfurter / European Central Bank)
// supports are listed, so a picked location can never produce a currency the
// converter fails on.
//
// Entry shape: { n: name, c: country ("" if the entry IS a country),
//                iso: flag code, cur: currency, a?: aliases }

export const LOCATIONS = [
  { n: "Philippines", c: "", iso: "ph", cur: "PHP", a: ["pilipinas"] },
  { n: "Manila", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Cebu City", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Bacolod City", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Davao City", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Iloilo City", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Boracay", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Puerto Princesa", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "El Nido", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Siargao", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Baguio", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "Bohol", c: "Philippines", iso: "ph", cur: "PHP" },
  { n: "United States", c: "", iso: "us", cur: "USD", a: ["america", "usa"] },
  { n: "New York", c: "United States", iso: "us", cur: "USD" },
  { n: "Los Angeles", c: "United States", iso: "us", cur: "USD" },
  { n: "San Francisco", c: "United States", iso: "us", cur: "USD" },
  { n: "Japan", c: "", iso: "jp", cur: "JPY" },
  { n: "Tokyo", c: "Japan", iso: "jp", cur: "JPY" },
  { n: "Osaka", c: "Japan", iso: "jp", cur: "JPY" },
  { n: "South Korea", c: "", iso: "kr", cur: "KRW", a: ["korea"] },
  { n: "Seoul", c: "South Korea", iso: "kr", cur: "KRW" },
  { n: "China", c: "", iso: "cn", cur: "CNY" },
  { n: "Hong Kong", c: "", iso: "hk", cur: "HKD" },
  { n: "Singapore", c: "", iso: "sg", cur: "SGD" },
  { n: "Thailand", c: "", iso: "th", cur: "THB" },
  { n: "Bangkok", c: "Thailand", iso: "th", cur: "THB" },
  { n: "Malaysia", c: "", iso: "my", cur: "MYR" },
  { n: "Kuala Lumpur", c: "Malaysia", iso: "my", cur: "MYR" },
  { n: "Indonesia", c: "", iso: "id", cur: "IDR" },
  { n: "Bali", c: "Indonesia", iso: "id", cur: "IDR" },
  { n: "Jakarta", c: "Indonesia", iso: "id", cur: "IDR" },
  { n: "India", c: "", iso: "in", cur: "INR" },
  { n: "Australia", c: "", iso: "au", cur: "AUD" },
  { n: "Sydney", c: "Australia", iso: "au", cur: "AUD" },
  { n: "Melbourne", c: "Australia", iso: "au", cur: "AUD" },
  { n: "New Zealand", c: "", iso: "nz", cur: "NZD" },
  { n: "United Kingdom", c: "", iso: "gb", cur: "GBP", a: ["uk", "england", "britain"] },
  { n: "London", c: "United Kingdom", iso: "gb", cur: "GBP" },
  { n: "France", c: "", iso: "fr", cur: "EUR" },
  { n: "Paris", c: "France", iso: "fr", cur: "EUR" },
  { n: "Germany", c: "", iso: "de", cur: "EUR" },
  { n: "Italy", c: "", iso: "it", cur: "EUR" },
  { n: "Rome", c: "Italy", iso: "it", cur: "EUR" },
  { n: "Spain", c: "", iso: "es", cur: "EUR" },
  { n: "Barcelona", c: "Spain", iso: "es", cur: "EUR" },
  { n: "Portugal", c: "", iso: "pt", cur: "EUR" },
  { n: "Netherlands", c: "", iso: "nl", cur: "EUR" },
  { n: "Amsterdam", c: "Netherlands", iso: "nl", cur: "EUR" },
  { n: "Ireland", c: "", iso: "ie", cur: "EUR" },
  { n: "Switzerland", c: "", iso: "ch", cur: "CHF" },
  { n: "Zurich", c: "Switzerland", iso: "ch", cur: "CHF" },
  { n: "Sweden", c: "", iso: "se", cur: "SEK" },
  { n: "Norway", c: "", iso: "no", cur: "NOK" },
  { n: "Denmark", c: "", iso: "dk", cur: "DKK" },
  { n: "Poland", c: "", iso: "pl", cur: "PLN" },
  { n: "Czech Republic", c: "", iso: "cz", cur: "CZK" },
  { n: "Hungary", c: "", iso: "hu", cur: "HUF" },
  { n: "Turkey", c: "", iso: "tr", cur: "TRY" },
  { n: "Istanbul", c: "Turkey", iso: "tr", cur: "TRY" },
  { n: "Israel", c: "", iso: "il", cur: "ILS" },
  { n: "South Africa", c: "", iso: "za", cur: "ZAR" },
  { n: "Mexico", c: "", iso: "mx", cur: "MXN" },
  { n: "Brazil", c: "", iso: "br", cur: "BRL" },
  { n: "Canada", c: "", iso: "ca", cur: "CAD" },
  { n: "Toronto", c: "Canada", iso: "ca", cur: "CAD" },
  { n: "Vancouver", c: "Canada", iso: "ca", cur: "CAD" },
];

export const SUPPORTED_CURRENCIES = [...new Set(LOCATIONS.map(l => l.cur))].sort();

/** <img> tag for a location's flag (flagcdn, retina-ready). */
export function flagImg(iso, size = 20) {
  return `<img src="https://flagcdn.com/w${size}/${iso}.png" srcset="https://flagcdn.com/w${size * 2}/${iso}.png 2x" alt="" loading="lazy" />`;
}

/** Ranked type-ahead matches for the picker dropdown (best 7). */
export function matchLocations(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return LOCATIONS
    .map(loc => {
      const name = loc.n.toLowerCase();
      const country = (loc.c || "").toLowerCase();
      let score = -1;
      if (name.startsWith(q)) score = 0;
      else if ((loc.a || []).some(a => a.startsWith(q))) score = 1;
      else if (name.includes(q)) score = 2;
      else if (country.startsWith(q)) score = 3;
      else if (country.includes(q)) score = 4;
      return { loc, score };
    })
    .filter(m => m.score >= 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 7)
    .map(m => m.loc);
}

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
