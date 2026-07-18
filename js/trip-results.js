// trip-results.js — renders the conversational planner's turns into the
// results area. Each turn appends (rather than replaces), so the page reads
// as a scrolling transcript: the user's message, then the assistant's reply.

import { escapeHtml } from "./utils.js";
import { fmtMoney } from "./currency.js";

const CHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const COMPASS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

/** Appends a new turn (user message + a pending assistant slot) to the
 *  transcript and returns the slot element to render the response into. */
export function appendTurn(container, userText) {
  const turn = document.createElement("div");
  turn.className = "chat-turn";
  turn.innerHTML = `
    <div class="user-turn">${escapeHtml(userText)}</div>
    <div class="assistant-turn"></div>
  `;
  container.appendChild(turn);
  return turn.querySelector(".assistant-turn");
}

export function renderLoading(container) {
  container.innerHTML = '<div class="result-card"><div class="spinner"></div></div>';
}

export function renderError(container, message) {
  container.innerHTML = `<div class="result-card"><div class="error-box">${escapeHtml(message)}</div></div>`;
}

function renderOffTopic(container, reply) {
  container.innerHTML = `
    <div class="result-card off-topic-card">
      <div class="off-topic-icon">${COMPASS_ICON}</div>
      <div class="off-topic-text">${escapeHtml(reply)}</div>
    </div>
  `;
}

function renderClarify(container, reply, requirements, onPickSuggestion) {
  const suggestions = requirements?.destination_suggestions || [];
  let html = `
    <div class="clarify-turn">
      ${CHAT_ICON}
      <span>${escapeHtml(reply)}</span>
    </div>
  `;
  if (suggestions.length) {
    html += `<div class="place-list">`;
    html += suggestions.map((s, i) => `
      <div class="place-card" data-suggestion-index="${i}">
        <div>
          <div class="place-name">${escapeHtml(s.name)}</div>
          <div class="place-reason">${escapeHtml(s.reason)}</div>
        </div>
        <div class="place-pick">Pick this →</div>
      </div>
    `).join("");
    html += `</div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll(".place-card").forEach(card => {
    card.addEventListener("click", () => {
      onPickSuggestion(suggestions[Number(card.dataset.suggestionIndex)]);
    });
  });
}

function fieldHtml(label, value) {
  return `<div class="trip-field"><div class="label">${label}</div><div class="value">${escapeHtml(String(value))}</div></div>`;
}

function flightCardHtml(flight, reason) {
  if (!flight) {
    return `<div class="itinerary-empty">${escapeHtml(reason || "No live flight data was available for this route.")}</div>`;
  }
  const logo = flight.airlineLogo
    ? `<img class="airline-logo" src="${flight.airlineLogo}" alt="" />`
    : `<div class="airline-logo airline-logo-fallback">✈️</div>`;
  const stops = flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
  return `
    <div class="itinerary-pick-card">
      <div class="flight-airline">
        ${logo}
        <div>
          <div class="flight-airline-name">${escapeHtml(flight.airline)}</div>
          <div class="flight-number">${escapeHtml((flight.flightNumbers || []).join(" · "))}</div>
        </div>
      </div>
      <div class="itinerary-pick-detail">
        <span>${escapeHtml(flight.departureAirport)} → ${escapeHtml(flight.arrivalAirport)}</span>
        <span>${stops}</span>
        ${flight.price != null ? `<span class="itinerary-pick-price">${fmtMoney(flight.price, flight.currency || "PHP")}</span>` : ""}
      </div>
      ${reason ? `<div class="itinerary-pick-reason">${escapeHtml(reason)}</div>` : ""}
    </div>
  `;
}

function hotelCardHtml(hotel, reason) {
  if (!hotel) {
    return `<div class="itinerary-empty">${escapeHtml(reason || "No live accommodation data was available for this destination.")}</div>`;
  }
  const image = hotel.image ? `<img class="hotel-thumb" src="${hotel.image}" alt="" />` : "";
  const amenities = (hotel.amenities || []).slice(0, 4);
  return `
    <div class="itinerary-pick-card itinerary-pick-card-hotel">
      ${image}
      <div class="itinerary-pick-hotel-body">
        <div class="itinerary-pick-hotel-name">${escapeHtml(hotel.name)}</div>
        <div class="itinerary-pick-detail">
          ${hotel.hotelClass ? `<span>${escapeHtml(hotel.hotelClass)}</span>` : ""}
          ${hotel.rating != null ? `<span>★ ${hotel.rating} (${hotel.reviews ?? 0})</span>` : ""}
          ${hotel.pricePerNight != null ? `<span class="itinerary-pick-price">${fmtMoney(hotel.pricePerNight, hotel.currency || "PHP")}/night</span>` : ""}
        </div>
        ${amenities.length ? `<div class="itinerary-amenities">${amenities.map(a => `<span class="fare-badge">${escapeHtml(a)}</span>`).join("")}</div>` : ""}
        ${reason ? `<div class="itinerary-pick-reason">${escapeHtml(reason)}</div>` : ""}
      </div>
    </div>
  `;
}

function placeListHtml(places, badgeKey) {
  if (!places || !places.length) return `<div class="itinerary-empty">No live data was available.</div>`;
  return `<div class="place-list">${places.map(p => `
    <div class="place-card place-card-static">
      <div>
        <div class="place-name">${escapeHtml(p.name)}${p.rating != null ? ` <span class="place-rating">★ ${p.rating}</span>` : ""}</div>
        <div class="place-reason">${escapeHtml(p.note || p.description || "")}</div>
      </div>
      ${badgeKey && p[badgeKey] ? `<div class="place-pick place-badge">${escapeHtml(String(p[badgeKey]))}</div>` : ""}
    </div>
  `).join("")}</div>`;
}

function dailyItineraryHtml(days) {
  if (!days || !days.length) return "";
  return days.map(d => `
    <div class="itinerary-day">
      <div class="itinerary-day-label">Day ${d.day}${d.date ? ` · ${escapeHtml(d.date)}` : ""}</div>
      <div class="itinerary-day-slot"><span class="itinerary-day-slot-label">Morning</span><span>${escapeHtml(d.morning)}</span></div>
      <div class="itinerary-day-slot"><span class="itinerary-day-slot-label">Afternoon</span><span>${escapeHtml(d.afternoon)}</span></div>
      <div class="itinerary-day-slot"><span class="itinerary-day-slot-label">Evening</span><span>${escapeHtml(d.evening)}</span></div>
    </div>
  `).join("");
}

function budgetBreakdownHtml(b) {
  if (!b) return "";
  const rows = [
    ["Flights", b.flights], ["Accommodation", b.accommodation], ["Food", b.food],
    ["Activities", b.activities], ["Transportation", b.transportation], ["Emergency Fund", b.emergency_fund],
  ].filter(([, v]) => v != null);
  return `
    <div class="budget-breakdown">
      ${rows.map(([label, value]) => `
        <div class="budget-breakdown-row">
          <span>${label}</span><span>${fmtMoney(value, b.currency)}</span>
        </div>
      `).join("")}
      <div class="budget-breakdown-row budget-breakdown-total">
        <span>Total Estimated Cost</span><span>${fmtMoney(b.total, b.currency)}</span>
      </div>
    </div>
    ${b.notes ? `<div class="itinerary-note">${escapeHtml(b.notes)}</div>` : ""}
  `;
}

function travelTipsHtml(tips) {
  if (!tips) return "";
  const rows = [
    ["Currency", tips.currency], ["Local Transportation", tips.local_transportation],
    ["Safety", tips.safety], ["Weather", tips.weather], ["Etiquette", tips.etiquette],
  ].filter(([, v]) => v);
  return `<div class="travel-tips">${rows.map(([label, value]) => `
    <div class="travel-tip-row"><div class="travel-tip-label">${label}</div><div>${escapeHtml(value)}</div></div>
  `).join("")}</div>`;
}

function sectionHtml(title, bodyHtml) {
  if (!bodyHtml) return "";
  return `<div class="itinerary-section"><div class="recommend-heading">${title}</div>${bodyHtml}</div>`;
}

function renderItinerary(container, data, onSaveDraft) {
  const it = data.itinerary;
  const o = it.trip_overview || {};

  let html = `<div class="summary-line">${escapeHtml(it.reply || data.reply)}</div>`;

  html += sectionHtml("Trip Overview", `<div class="trip-grid">
    ${fieldHtml("Destination", o.destination)}
    ${fieldHtml("Departure", o.departure)}
    ${fieldHtml("Dates", o.dates)}
    ${fieldHtml("Duration", o.duration)}
    ${fieldHtml("Travelers", o.travelers)}
  </div>`);

  html += sectionHtml("Recommended Flight", flightCardHtml(it.flight, it.flight_reason));
  html += sectionHtml("Recommended Accommodation", hotelCardHtml(it.hotel, it.hotel_reason));
  html += sectionHtml("Attractions", placeListHtml(it.attractions, "day"));
  html += sectionHtml("Food & Dining", placeListHtml(it.restaurants, "meal"));
  html += sectionHtml("Daily Itinerary", dailyItineraryHtml(it.daily_itinerary));
  html += sectionHtml("Budget Breakdown", budgetBreakdownHtml(it.budget_breakdown));
  html += sectionHtml("Travel Tips", travelTipsHtml(it.travel_tips));

  if (it.summary) {
    html += `<div class="itinerary-summary">${escapeHtml(it.summary)}</div>`;
  }

  html += `
    <div class="result-actions">
      <button class="btn-ghost" id="resultSaveDraftBtn" type="button">Save Draft</button>
    </div>
  `;

  container.innerHTML = html;
  document.getElementById("resultSaveDraftBtn").addEventListener("click", onSaveDraft);
}

/**
 * Renders one assistant turn based on its response type.
 * @param {HTMLElement} container the assistant-turn slot from appendTurn()
 * @param {object} data the api.php response ({ type, reply, requirements?, itinerary? })
 * @param {(name: string) => void} onPickSuggestion fired when a destination suggestion is picked
 * @param {() => void} onSaveDraft fired when "Save Draft" is clicked
 */
export function renderPlannerResponse(container, data, onPickSuggestion, onSaveDraft) {
  if (data.type === "off_topic") {
    renderOffTopic(container, data.reply);
  } else if (data.type === "itinerary") {
    renderItinerary(container, data, onSaveDraft);
  } else {
    renderClarify(container, data.reply, data.requirements, onPickSuggestion);
  }
}
