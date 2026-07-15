// trip-results.js — renders the LLM trip-plan response into the results area.

import { escapeHtml } from "./utils.js";

const TRIP_TYPE_LABELS = {
  one_way: "One-way",
  round_trip: "Round-trip",
  multi_city: "Multi-city",
  unclear: "Unclear",
};

function fieldHtml(label, value) {
  const isEmpty = value === null || value === undefined || value === "";
  return `
    <div class="trip-field">
      <div class="label">${label}</div>
      <div class="value ${isEmpty ? "empty" : ""}">${isEmpty ? "Not specified" : escapeHtml(String(value))}</div>
    </div>
  `;
}

/** "500 USD ≈ ₱30,847" for foreign budgets, "₱10,000" for peso budgets. */
function budgetDisplay(r) {
  if (r.budget_php == null) return null;
  const phpStr = "₱" + Number(r.budget_php).toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (r.budget_currency && r.budget_currency !== "PHP" && r.budget_amount != null) {
    const origStr = Number(r.budget_amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + r.budget_currency;
    return `${origStr} ≈ ${phpStr}${r.budget_live_rate ? "" : " (est.)"}`;
  }
  return phpStr;
}

export function renderLoading(container) {
  container.innerHTML = '<div class="result-card"><div class="spinner"></div></div>';
}

export function renderError(container, message) {
  container.innerHTML = `<div class="result-card"><div class="error-box">${escapeHtml(message)}</div></div>`;
}

/**
 * Renders a successful trip-plan result.
 * @param {(place: {name: string, reason: string}) => void} onPickPlace fired
 *   when the user clicks one of the recommended places
 */
export function renderTripResult(container, r, onPickPlace) {
  let html = `
    <div class="badge-row">
      <span class="trip-type-badge">${TRIP_TYPE_LABELS[r.trip_type] || r.trip_type}</span>
    </div>
    <div class="summary-line">${escapeHtml(r.summary)}</div>
    <div class="trip-grid">
      ${fieldHtml("From", r.origin)}
      ${fieldHtml("To", r.destination)}
      ${fieldHtml("Depart", r.departure_date)}
      ${fieldHtml("Return", r.return_date)}
      ${fieldHtml("Budget", budgetDisplay(r))}
    </div>
  `;

  if (r.interests && r.interests.length) {
    html += `<div class="interest-tags">${r.interests.map(i => `<span class="interest-tag">${escapeHtml(i)}</span>`).join("")}</div>`;
  }

  if (r.recommended_places && r.recommended_places.length) {
    html += `<div class="recommend-heading">Places you might like</div><div class="place-list">`;
    html += r.recommended_places.map((p, i) => `
      <div class="place-card" data-place-index="${i}">
        <div>
          <div class="place-name">${escapeHtml(p.name)}</div>
          <div class="place-reason">${escapeHtml(p.reason)}</div>
        </div>
        <div class="place-pick">Pick this →</div>
      </div>
    `).join("");
    html += `</div>`;
  }

  if (r.clarification_needed) {
    html += `<div class="clarify-box"><span>💬</span><span>${escapeHtml(r.clarification_needed)}</span></div>`;
  }

  container.innerHTML = `<div class="result-card">${html}</div>`;

  container.querySelectorAll(".place-card").forEach(card => {
    card.addEventListener("click", () => {
      onPickPlace(r.recommended_places[Number(card.dataset.placeIndex)]);
    });
  });
}
