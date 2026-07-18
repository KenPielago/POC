// airports.js — searchable airport dataset for the Flight Search page.
//
// Entry shape: { code: IATA code, name: airport name, city, country, iso: flag code }

export const AIRPORTS = [
  { code: "MNL", name: "Ninoy Aquino International", city: "Manila", country: "Philippines", iso: "ph" },
  { code: "CEB", name: "Mactan-Cebu International", city: "Cebu City", country: "Philippines", iso: "ph" },
  { code: "DVO", name: "Francisco Bangoy International", city: "Davao City", country: "Philippines", iso: "ph" },
  { code: "ILO", name: "Iloilo International", city: "Iloilo City", country: "Philippines", iso: "ph" },
  { code: "KLO", name: "Bacolod-Silay", city: "Bacolod City", country: "Philippines", iso: "ph" },
  { code: "PPS", name: "Puerto Princesa International", city: "Puerto Princesa", country: "Philippines", iso: "ph" },
  { code: "MPH", name: "Godofredo P. Ramos", city: "Boracay / Caticlan", country: "Philippines", iso: "ph" },
  { code: "USU", name: "Sibuyan Airport", city: "Siargao", country: "Philippines", iso: "ph" },
  { code: "BAG", name: "Loakan Airport", city: "Baguio", country: "Philippines", iso: "ph" },
  { code: "TAG", name: "Bohol-Panglao International", city: "Bohol", country: "Philippines", iso: "ph" },
  { code: "ECJ", name: "El Nido Airport", city: "El Nido", country: "Philippines", iso: "ph" },

  { code: "JFK", name: "John F. Kennedy International", city: "New York", country: "United States", iso: "us" },
  { code: "LGA", name: "LaGuardia", city: "New York", country: "United States", iso: "us" },
  { code: "LAX", name: "Los Angeles International", city: "Los Angeles", country: "United States", iso: "us" },
  { code: "SFO", name: "San Francisco International", city: "San Francisco", country: "United States", iso: "us" },
  { code: "ORD", name: "O'Hare International", city: "Chicago", country: "United States", iso: "us" },
  { code: "SEA", name: "Seattle-Tacoma International", city: "Seattle", country: "United States", iso: "us" },

  { code: "NRT", name: "Narita International", city: "Tokyo", country: "Japan", iso: "jp" },
  { code: "HND", name: "Haneda Airport", city: "Tokyo", country: "Japan", iso: "jp" },
  { code: "KIX", name: "Kansai International", city: "Osaka", country: "Japan", iso: "jp" },

  { code: "ICN", name: "Incheon International", city: "Seoul", country: "South Korea", iso: "kr" },
  { code: "GMP", name: "Gimpo International", city: "Seoul", country: "South Korea", iso: "kr" },

  { code: "PEK", name: "Beijing Capital International", city: "Beijing", country: "China", iso: "cn" },
  { code: "PVG", name: "Shanghai Pudong International", city: "Shanghai", country: "China", iso: "cn" },
  { code: "HKG", name: "Hong Kong International", city: "Hong Kong", country: "Hong Kong", iso: "hk" },
  { code: "SIN", name: "Singapore Changi", city: "Singapore", country: "Singapore", iso: "sg" },

  { code: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand", iso: "th" },
  { code: "DMK", name: "Don Mueang International", city: "Bangkok", country: "Thailand", iso: "th" },

  { code: "KUL", name: "Kuala Lumpur International", city: "Kuala Lumpur", country: "Malaysia", iso: "my" },
  { code: "DPS", name: "Ngurah Rai International", city: "Bali", country: "Indonesia", iso: "id" },
  { code: "CGK", name: "Soekarno-Hatta International", city: "Jakarta", country: "Indonesia", iso: "id" },

  { code: "DEL", name: "Indira Gandhi International", city: "Delhi", country: "India", iso: "in" },
  { code: "BOM", name: "Chhatrapati Shivaji International", city: "Mumbai", country: "India", iso: "in" },

  { code: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia", iso: "au" },
  { code: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia", iso: "au" },
  { code: "AKL", name: "Auckland Airport", city: "Auckland", country: "New Zealand", iso: "nz" },

  { code: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom", iso: "gb" },
  { code: "LGW", name: "Gatwick Airport", city: "London", country: "United Kingdom", iso: "gb" },

  { code: "CDG", name: "Charles de Gaulle", city: "Paris", country: "France", iso: "fr" },
  { code: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", iso: "de" },
  { code: "MUC", name: "Munich Airport", city: "Munich", country: "Germany", iso: "de" },
  { code: "FCO", name: "Leonardo da Vinci–Fiumicino", city: "Rome", country: "Italy", iso: "it" },
  { code: "BCN", name: "Josep Tarradellas Barcelona-El Prat", city: "Barcelona", country: "Spain", iso: "es" },
  { code: "MAD", name: "Adolfo Suárez Madrid–Barajas", city: "Madrid", country: "Spain", iso: "es" },
  { code: "LIS", name: "Humberto Delgado Airport", city: "Lisbon", country: "Portugal", iso: "pt" },
  { code: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands", iso: "nl" },
  { code: "DUB", name: "Dublin Airport", city: "Dublin", country: "Ireland", iso: "ie" },
  { code: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland", iso: "ch" },
  { code: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden", iso: "se" },
  { code: "OSL", name: "Oslo Airport", city: "Oslo", country: "Norway", iso: "no" },
  { code: "CPH", name: "Copenhagen Airport", city: "Copenhagen", country: "Denmark", iso: "dk" },
  { code: "WAW", name: "Warsaw Chopin Airport", city: "Warsaw", country: "Poland", iso: "pl" },
  { code: "PRG", name: "Václav Havel Airport", city: "Prague", country: "Czech Republic", iso: "cz" },
  { code: "BUD", name: "Budapest Ferenc Liszt International", city: "Budapest", country: "Hungary", iso: "hu" },
  { code: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey", iso: "tr" },
  { code: "TLV", name: "Ben Gurion Airport", city: "Tel Aviv", country: "Israel", iso: "il" },
  { code: "JNB", name: "O.R. Tambo International", city: "Johannesburg", country: "South Africa", iso: "za" },

  { code: "MEX", name: "Mexico City International", city: "Mexico City", country: "Mexico", iso: "mx" },
  { code: "GRU", name: "São Paulo–Guarulhos International", city: "São Paulo", country: "Brazil", iso: "br" },

  { code: "YYZ", name: "Toronto Pearson International", city: "Toronto", country: "Canada", iso: "ca" },
  { code: "YVR", name: "Vancouver International", city: "Vancouver", country: "Canada", iso: "ca" },

  { code: "DXB", name: "Dubai International", city: "Dubai", country: "United Arab Emirates", iso: "ae" },
  { code: "DOH", name: "Hamad International", city: "Doha", country: "Qatar", iso: "qa" },
];

/** <img> tag for an airport's country flag (flagcdn, retina-ready). */
export function airportFlagImg(iso, size = 20) {
  return `<img src="https://flagcdn.com/w${size}/${iso}.png" srcset="https://flagcdn.com/w${size * 2}/${iso}.png 2x" alt="" loading="lazy" />`;
}

/** Ranked type-ahead matches for the airport picker dropdown (best 7). */
export function matchAirports(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return AIRPORTS
    .map(a => {
      const code = a.code.toLowerCase();
      const city = a.city.toLowerCase();
      const name = a.name.toLowerCase();
      let score = -1;
      if (code === q) score = 0;
      else if (city.startsWith(q)) score = 1;
      else if (code.startsWith(q)) score = 2;
      else if (name.startsWith(q)) score = 3;
      else if (city.includes(q)) score = 4;
      else if (name.includes(q)) score = 5;
      return { a, score };
    })
    .filter(m => m.score >= 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 7)
    .map(m => m.a);
}

/** Best-effort match for free-typed text (used on blur / draft restore). */
export function detectAirport(text) {
  const q = (text || "").trim().toLowerCase();
  if (!q) return null;
  const codeMatch = q.match(/\(([a-z]{3})\)\s*$/i);
  if (codeMatch) {
    const byCode = AIRPORTS.find(a => a.code.toLowerCase() === codeMatch[1].toLowerCase());
    if (byCode) return byCode;
  }
  return AIRPORTS.find(a => a.code.toLowerCase() === q)
    || AIRPORTS.find(a => a.city.toLowerCase() === q)
    || AIRPORTS.find(a => a.city.toLowerCase().startsWith(q) && q.length >= 3)
    || null;
}

/** Display label for a selected airport: "Manila (MNL)". */
export function airportLabel(a) {
  return `${a.city} (${a.code})`;
}
