// flights.js — Flight Search page: multi-leg search form, live results, and
// selecting a fare into the trip budget as a Transportation expense.

import { requestFlightSearch, requestCurrencyConversion } from "./api.js";
import { getTripBudget, saveTripBudget, getExpenses, saveExpenses } from "./storage.js";
import { detectLocation } from "./locations.js";
import { createAirportPicker } from "./airport-picker.js";
import { fmtMoney } from "./currency.js";
import { escapeHtml } from "./utils.js";

const SWAP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`;

// ---- Elements ----
const tripTypeTabs = document.getElementById("tripTypeTabs");
const legsContainer = document.getElementById("legsContainer");
const travelersInput = document.getElementById("travelers");
const cabinClassInput = document.getElementById("cabinClass");
const searchBtn = document.getElementById("searchBtn");
const resultsArea = document.getElementById("resultsArea");
const toast = document.getElementById("toast");

// ---- State ----
let tripType = "round-trip";
let legs = [{ from: null, to: null, date: "" }];
let returnDate = "";
let results = [];
let searchCurrency = "PHP";
let sortMode = "price";

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

// ---- Trip type + leg rows ----
tripTypeTabs.querySelectorAll(".trip-type-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    tripTypeTabs.querySelectorAll(".trip-type-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    tripType = tab.dataset.type;
    if (tripType === "multi-city" && legs.length < 2) {
      legs.push({ from: null, to: null, date: "" });
    } else if (tripType !== "multi-city") {
      legs = [legs[0]];
    }
    mountLegs();
  });
});

function legRowHtml(i) {
  const label = tripType === "multi-city" ? `<div class="leg-num">Flight ${i + 1}</div>` : "";
  const returnField = tripType === "round-trip" && i === 0
    ? `<div class="field"><input type="date" id="returnDateInput" value="${returnDate}" /></div>` : "";
  return `
    <div class="leg-row" data-leg="${i}">
      ${label}
      <div class="loc-field">
        <div class="field"><input type="text" id="legFrom${i}" placeholder="Leaving from" autocomplete="off" /></div>
        <div class="loc-list" id="legFromList${i}"></div>
      </div>
      ${tripType !== "multi-city" ? `<button class="swap-btn" id="legSwap${i}" type="button" title="Swap">${SWAP_ICON}</button>` : ""}
      <div class="loc-field">
        <div class="field"><input type="text" id="legTo${i}" placeholder="Going to" autocomplete="off" /></div>
        <div class="loc-list" id="legToList${i}"></div>
      </div>
      <div class="field"><input type="date" id="legDate${i}" value="${legs[i].date}" /></div>
      ${returnField}
    </div>
  `;
}

function mountLegs() {
  legsContainer.innerHTML = legs.map((_, i) => legRowHtml(i)).join("");

  legs.forEach((leg, i) => {
    const fromPicker = createAirportPicker({
      input: document.getElementById(`legFrom${i}`),
      list: document.getElementById(`legFromList${i}`),
      onSelectionChange: () => { legs[i].from = fromPicker.getSelection(); },
    });
    const toPicker = createAirportPicker({
      input: document.getElementById(`legTo${i}`),
      list: document.getElementById(`legToList${i}`),
      onSelectionChange: () => { legs[i].to = toPicker.getSelection(); },
    });
    if (leg.from) fromPicker.setSelection(leg.from);
    if (leg.to) toPicker.setSelection(leg.to);

    document.getElementById(`legDate${i}`).addEventListener("change", (e) => {
      legs[i].date = e.target.value;
    });

    document.getElementById(`legSwap${i}`)?.addEventListener("click", () => {
      const f = fromPicker.getSelection();
      fromPicker.setSelection(toPicker.getSelection());
      toPicker.setSelection(f);
      legs[i].from = fromPicker.getSelection();
      legs[i].to = toPicker.getSelection();
    });

  });

  document.getElementById("returnDateInput")?.addEventListener("change", (e) => {
    returnDate = e.target.value;
  });
}

// ---- Search ----
function resolveSearchCurrency() {
  const budget = getTripBudget();
  if (budget?.currency) return budget.currency;
  const origin = legs[0]?.from;
  if (origin) {
    const loc = detectLocation(origin.city);
    if (loc?.cur) return loc.cur;
  }
  return "PHP";
}

function validateSearch() {
  for (const [i, leg] of legs.entries()) {
    if (!leg.from || !leg.to || !leg.date) {
      return `Fill in from, to, and date for ${tripType === "multi-city" ? `flight ${i + 1}` : "your trip"}.`;
    }
    if (leg.from.code === leg.to.code) {
      return "Departure and arrival airports can't be the same.";
    }
  }
  if (tripType === "round-trip" && !returnDate) {
    return "Pick a return date.";
  }
  return null;
}

searchBtn.addEventListener("click", async () => {
  const error = validateSearch();
  if (error) { showToast(error); return; }

  searchCurrency = resolveSearchCurrency();
  searchBtn.disabled = true;
  searchBtn.textContent = "Searching…";
  resultsArea.innerHTML = `<div class="result-card"><div class="spinner"></div><div class="placeholder">Searching live fares…</div></div>`;

  try {
    const data = await requestFlightSearch({
      tripType,
      legs: legs.map(l => ({ from: l.from.code, to: l.to.code, date: l.date })),
      returnDate: tripType === "round-trip" ? returnDate : undefined,
      adults: Math.max(1, parseInt(travelersInput.value, 10) || 1),
      children: 0,
      infants: 0,
      cabinClass: cabinClassInput.value,
      currency: searchCurrency,
    });
    if (!data.success) {
      resultsArea.innerHTML = `<div class="result-card"><div class="error-box">${escapeHtml(data.error || "Couldn't search flights.")}</div></div>`;
      return;
    }
    results = data.results || [];
    searchCurrency = data.currency || searchCurrency;
    renderResults();
  } catch (e) {
    resultsArea.innerHTML = `<div class="result-card"><div class="error-box">Couldn't reach the server: ${escapeHtml(e.message)}</div></div>`;
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = "Search Flights";
  }
});

// ---- Sorting ----
const SORT_LABELS = {
  price: "Lowest Price",
  duration: "Shortest Duration",
  departure: "Earliest Departure",
  value: "Best Value",
};

/**
 * "Best Value" blends normalized price and duration (65/35 — price matters
 * more to most travelers than shaving off an hour) plus a small per-stop
 * penalty, so a slightly pricier nonstop can outrank a cheaper multi-stop.
 */
function valueScore(f, minP, maxP, minD, maxD) {
  const pNorm = maxP > minP ? (f.price - minP) / (maxP - minP) : 0;
  const dNorm = maxD > minD ? (f.durationMinutes - minD) / (maxD - minD) : 0;
  return pNorm * 0.65 + dNorm * 0.35 + f.stops * 0.05;
}

function sortedResults() {
  const arr = [...results];
  if (sortMode === "price") return arr.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (sortMode === "duration") return arr.sort((a, b) => a.durationMinutes - b.durationMinutes);
  if (sortMode === "departure") return arr.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
  const prices = arr.map(r => r.price ?? 0);
  const durations = arr.map(r => r.durationMinutes ?? 0);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const minD = Math.min(...durations), maxD = Math.max(...durations);
  return arr.sort((a, b) => valueScore(a, minP, maxP, minD, maxD) - valueScore(b, minP, maxP, minD, maxD));
}

// ---- Rendering ----
function fmtClock(dtString) {
  if (!dtString) return "--:--";
  const d = new Date(dtString.replace(" ", "T"));
  if (isNaN(d)) return dtString;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(dtString) {
  if (!dtString) return "";
  const d = new Date(dtString.replace(" ", "T"));
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDuration(mins) {
  if (!mins && mins !== 0) return "—";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function stopsLabel(f) {
  if (f.stops === 0) return "Nonstop";
  return `${f.stops} stop${f.stops > 1 ? "s" : ""}${f.stopAirports?.length ? " · " + f.stopAirports.join(", ") : ""}`;
}

function flightCardHtml(f) {
  const logo = f.airlineLogo
    ? `<img class="airline-logo" src="${f.airlineLogo}" alt="" />`
    : `<div class="airline-logo airline-logo-fallback">✈️</div>`;
  const badges = [];
  if (f.refundable === true) badges.push(`<span class="fare-badge good">Refundable</span>`);
  if (f.refundable === false) badges.push(`<span class="fare-badge">Non-refundable</span>`);
  if (f.baggage) badges.push(`<span class="fare-badge" title="${escapeHtml(f.baggage)}">🧳 Baggage included</span>`);

  return `
    <div class="flight-card" data-id="${escapeHtml(f.id)}">
      <div class="flight-card-main">
        <div class="flight-airline">
          ${logo}
          <div>
            <div class="flight-airline-name">${escapeHtml(f.airline)}</div>
            <div class="flight-number">${escapeHtml((f.flightNumbers || []).join(" · "))}</div>
          </div>
        </div>

        <div class="flight-route">
          <div class="flight-endpoint">
            <div class="flight-time">${fmtClock(f.departureTime)}</div>
            <div class="flight-airport">${escapeHtml(f.departureAirport)}</div>
            <div class="flight-date-sm">${fmtDate(f.departureTime)}</div>
          </div>
          <div class="flight-path">
            <div class="flight-duration">${fmtDuration(f.durationMinutes)}</div>
            <div class="flight-path-line"><span class="dot"></span><span class="line"></span><span class="dot"></span></div>
            <div class="flight-stops">${stopsLabel(f)}</div>
          </div>
          <div class="flight-endpoint">
            <div class="flight-time">${fmtClock(f.arrivalTime)}</div>
            <div class="flight-airport">${escapeHtml(f.arrivalAirport)}</div>
            <div class="flight-date-sm">${fmtDate(f.arrivalTime)}</div>
          </div>
        </div>

        <div class="flight-price-block">
          <div class="flight-price">${f.price != null ? fmtMoney(f.price, searchCurrency) : "—"}</div>
          <div class="flight-cabin">${escapeHtml(f.cabinClass || "")}</div>
          <button class="btn-primary select-flight-btn" data-id="${escapeHtml(f.id)}" type="button">Select Flight</button>
        </div>
      </div>
      ${badges.length ? `<div class="fare-badge-row">${badges.join("")}</div>` : ""}
    </div>
  `;
}

function renderResults() {
  if (!results.length) {
    resultsArea.innerHTML = `<div class="result-card"><div class="placeholder">No flights found for that search — try different dates or airports.</div></div>`;
    return;
  }
  const sorted = sortedResults();
  resultsArea.innerHTML = `
    <div class="sort-tabs" id="sortTabs">
      ${Object.entries(SORT_LABELS).map(([key, label]) =>
        `<button class="sort-tab ${key === sortMode ? "active" : ""}" data-sort="${key}" type="button">${label}</button>`
      ).join("")}
    </div>
    <div class="flight-list">${sorted.map(flightCardHtml).join("")}</div>
  `;

  document.getElementById("sortTabs").querySelectorAll(".sort-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      sortMode = tab.dataset.sort;
      renderResults();
    });
  });
  resultsArea.querySelectorAll(".select-flight-btn").forEach(btn => {
    btn.addEventListener("click", () => selectFlight(results.find(r => r.id === btn.dataset.id)));
  });
}

// ---- Select flight -> trip budget ----
async function selectFlight(flight) {
  if (!flight) return;
  const tripBudget = getTripBudget();
  if (!tripBudget) {
    showToast("Set your travel budget on Track Expenses first");
    return;
  }

  let budgetAmount = flight.price;
  if (searchCurrency !== tripBudget.currency) {
    try {
      const conv = await requestCurrencyConversion(flight.price, searchCurrency, tripBudget.currency);
      if (!conv.success) { showToast(conv.error || "Couldn't convert currency — try again."); return; }
      budgetAmount = conv.converted;
    } catch (e) {
      showToast(`Couldn't reach the server: ${e.message}`);
      return;
    }
  }

  const expenses = getExpenses();
  const [datePart, timePart] = (flight.departureTime || "").split(" ");
  expenses.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    merchant: `${flight.airline} ${(flight.flightNumbers || []).join("/")}`.trim(),
    category: "Transportation",
    date: datePart || new Date().toISOString().slice(0, 10),
    time: timePart || null,
    tax: null,
    amount: flight.price,
    currency: searchCurrency,
    budgetAmount,
    note: `${flight.departureAirport} → ${flight.arrivalAirport} · ${stopsLabel(flight)}`,
    detectedLanguage: null,
    addedAt: new Date().toISOString(),
  });
  saveExpenses(expenses);
  saveTripBudget(tripBudget);
  showToast("Flight added to your trip budget");
}

// ---- Init ----
mountLegs();
