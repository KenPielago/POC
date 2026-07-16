// location-picker.js — type-ahead location combobox with a flag + currency
// badge. Pure UI component: selection changes are reported via callbacks.

import { matchLocations, detectLocation, flagImg, getPopularCities } from "./locations.js";
import { escapeHtml } from "./utils.js";

/**
 * @param {object} opts
 * @param {HTMLInputElement} opts.input the text field
 * @param {HTMLElement} opts.badge the currency badge inside the field
 * @param {HTMLElement} opts.list the dropdown container
 * @param {() => void} opts.onSelectionChange fired whenever the detected
 *   location (and therefore its currency) may have changed
 * @param {() => void} opts.onSubmit fired on Enter when no suggestion is open
 * @param {boolean} [opts.citiesOnly] restrict suggestions to specific cities
 *   (excludes whole-country entries) — for a "destination" field, not "origin"
 * @param {string[]} [opts.interests] the user's saved profile interests, used
 *   to personalize the empty-state suggestion list (citiesOnly fields only)
 */
export function createLocationPicker({ input, badge, list, onSelectionChange, onSubmit, citiesOnly = false, interests = [] }) {
  let selection = null;
  let matches = [];
  let showingPopular = false;
  let popularLabel = "";
  let activeIdx = -1;

  function renderBadge() {
    if (selection) {
      badge.innerHTML = `${flagImg(selection.iso)} ${selection.cur}`;
      badge.classList.add("show");
    } else {
      badge.classList.remove("show");
    }
    onSelectionChange();
  }

  function close() {
    list.classList.remove("open");
    activeIdx = -1;
  }

  function select(loc) {
    selection = loc;
    input.value = loc.n;
    renderBadge();
    close();
  }

  function renderList() {
    if (!matches.length) { close(); return; }
    const label = showingPopular
      ? `<div class="loc-list-label">${escapeHtml(popularLabel)}</div>` : "";
    list.innerHTML = label + matches.map((loc, i) => `
      <div class="loc-item ${i === activeIdx ? "active" : ""}" data-idx="${i}">
        ${flagImg(loc.iso)}
        <span class="loc-name">${escapeHtml(loc.n)}${loc.c ? ` <small>· ${escapeHtml(loc.c)}</small>` : ""}</span>
        <span class="loc-cur">${loc.cur}</span>
      </div>
    `).join("");
    list.classList.add("open");
    list.querySelectorAll(".loc-item").forEach(item => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        select(matches[Number(item.dataset.idx)]);
      });
    });
  }

  function refreshMatches() {
    if (input.value.trim()) {
      showingPopular = false;
      matches = matchLocations(input.value, { citiesOnly });
    } else if (citiesOnly) {
      // Nothing typed yet — surface popular cities instead of an empty list,
      // personalized to the user's saved interests when available.
      const { cities, personalized } = getPopularCities(interests);
      showingPopular = true;
      popularLabel = personalized ? "Picked for your interests" : "Popular destinations";
      matches = cities;
    } else {
      showingPopular = false;
      matches = [];
    }
  }

  input.addEventListener("input", () => {
    if (selection && input.value !== selection.n) {
      selection = null;
      renderBadge();
    }
    refreshMatches();
    activeIdx = -1;
    renderList();
  });

  input.addEventListener("focus", () => {
    refreshMatches();
    renderList();
  });

  // Delayed so a mousedown on a suggestion wins over the blur.
  input.addEventListener("blur", () => {
    setTimeout(() => {
      close();
      if (!selection) {
        const found = detectLocation(input.value);
        if (found) { selection = found; renderBadge(); }
      }
    }, 150);
  });

  input.addEventListener("keydown", (e) => {
    const open = list.classList.contains("open");
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, matches.length - 1);
      renderList();
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      renderList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && matches.length) {
        select(matches[Math.max(activeIdx, 0)]);
      } else {
        onSubmit();
      }
    } else if (e.key === "Escape") {
      close();
    }
  });

  return {
    /** Current selected/detected location, or null. */
    getSelection: () => selection,
    /** Replaces the selection (used by the swap button). */
    setSelection(loc) {
      selection = loc;
      renderBadge();
    },
    /** Re-detects from whatever text is in the input (restore, place pick). */
    detectFromInput() {
      selection = detectLocation(input.value);
      renderBadge();
    },
  };
}
