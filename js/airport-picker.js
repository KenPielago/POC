// airport-picker.js — type-ahead airport combobox for the Flight Search page.
// Pure UI component: selection changes are reported via callbacks.

import { matchAirports, detectAirport, airportFlagImg, airportLabel } from "./airports.js";
import { escapeHtml } from "./utils.js";

/**
 * @param {object} opts
 * @param {HTMLInputElement} opts.input the text field
 * @param {HTMLElement} opts.list the dropdown container
 * @param {() => void} [opts.onSelectionChange] fired whenever the selected airport changes
 */
export function createAirportPicker({ input, list, onSelectionChange = () => {} }) {
  let selection = null;
  let matches = [];
  let activeIdx = -1;

  function close() {
    list.classList.remove("open");
    activeIdx = -1;
  }

  function select(a) {
    selection = a;
    input.value = airportLabel(a);
    onSelectionChange();
    close();
  }

  function renderList() {
    if (!matches.length) { close(); return; }
    list.innerHTML = matches.map((a, i) => `
      <div class="loc-item ${i === activeIdx ? "active" : ""}" data-idx="${i}">
        ${airportFlagImg(a.iso)}
        <span class="loc-name">${escapeHtml(a.city)} <small>· ${escapeHtml(a.name)}</small></span>
        <span class="loc-cur">${a.code}</span>
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

  input.addEventListener("input", () => {
    if (selection && input.value !== airportLabel(selection)) {
      selection = null;
      onSelectionChange();
    }
    matches = matchAirports(input.value);
    activeIdx = -1;
    renderList();
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) {
      matches = matchAirports(input.value);
      renderList();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      close();
      if (!selection) {
        const found = detectAirport(input.value);
        if (found) select(found);
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
      if (open && matches.length) select(matches[Math.max(activeIdx, 0)]);
    } else if (e.key === "Escape") {
      close();
    }
  });

  return {
    getSelection: () => selection,
    setSelection(a) {
      selection = a;
      input.value = a ? airportLabel(a) : "";
      onSelectionChange();
    },
  };
}
