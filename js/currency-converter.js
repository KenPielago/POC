// currency-converter.js — the Smart Currency Converter card inside the
// Budget section. Detected currencies come from the location pickers via
// injected getters; manual overrides (View details) win over detection.

import { requestCurrencyConversion } from "./api.js";
import { SUPPORTED_CURRENCIES } from "./locations.js";
import { CURRENCY_SYMBOLS, fmtMoney, parseAmountFromBudget } from "./currency.js";
import { escapeHtml, debounce } from "./utils.js";
import { loadConverterOverrides, saveConverterOverrides } from "./storage.js";

const CONVERT_DEBOUNCE_MS = 350;

export function createCurrencyConverter({
  container,
  budgetInput,
  symbolEl,
  getDetectedHomeCurrency,
  getDetectedDestCurrency,
}) {
  const overrides = loadConverterOverrides();
  let detailsOpen = false;
  let requestSeq = 0; // guards against stale responses overwriting newer ones

  const homeCurrency = () => overrides.home || getDetectedHomeCurrency();
  const destCurrency = () => overrides.dest || getDetectedDestCurrency();

  function overridesHtml() {
    const optionsFor = (current) =>
      '<option value="">Auto (detected)</option>' +
      SUPPORTED_CURRENCIES.map(c => `<option value="${c}" ${c === current ? "selected" : ""}>${c}</option>`).join("");
    return `
      <div class="cv-overrides">
        <label>Your currency<select id="homeOverride">${optionsFor(overrides.home)}</select></label>
        <label>Destination currency<select id="destOverride">${optionsFor(overrides.dest)}</select></label>
      </div>
    `;
  }

  function detailsHtml(extraRow = "") {
    return `
      <button class="cv-toggle" type="button">${detailsOpen ? "Hide details ▴" : "View details ▾"}</button>
      <div class="cv-details ${detailsOpen ? "open" : ""}">
        ${extraRow}
        ${overridesHtml()}
      </div>
    `;
  }

  function renderMissingInputs(from, to, amount) {
    const missing = [];
    if (!amount || amount <= 0) missing.push("a budget amount");
    if (!from) missing.push("where you're from");
    if (!to) missing.push("where you're going");
    container.innerHTML = missing.length === 3 ? "" : `
      <div class="cv-hint">💱 Add ${missing.join(" and ")} to see your budget in the local currency.${!from || !to ? detailsHtml() : ""}</div>
    `;
  }

  function renderSameCurrency(amount, currency) {
    container.innerHTML = `
      <div class="cv-card">
        <div class="cv-main">${fmtMoney(amount, currency)}</div>
        <div class="cv-rate">Same currency at home and destination — no conversion needed.</div>
        ${detailsHtml()}
      </div>
    `;
  }

  function renderConversion(amount, from, to, data) {
    const rateStr = Number(data.rate).toLocaleString(undefined, { maximumSignificantDigits: 4 });
    const lastUpdated = new Date(data.date + "T00:00:00")
      .toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    container.innerHTML = `
      <div class="cv-card">
        <div class="cv-main">${fmtMoney(amount, from)} → ${fmtMoney(data.converted, to)} ${to}</div>
        <div class="cv-rate">Exchange Rate: 1 ${from} = ${rateStr} ${to}</div>
        ${detailsHtml(`<div class="row">Last updated: ${escapeHtml(lastUpdated)} · Live rates via the European Central Bank</div>`)}
      </div>
    `;
  }

  function renderError(message) {
    container.innerHTML = `<div class="error-box" style="margin-top:16px;">${escapeHtml(message)}</div>`;
  }

  async function runConvert() {
    const from = homeCurrency();
    const to = destCurrency();
    const amount = parseAmountFromBudget(budgetInput.value);
    const seq = ++requestSeq;

    if (!from || !to || !amount || amount <= 0) {
      renderMissingInputs(from, to, amount);
      return;
    }
    if (from === to) {
      renderSameCurrency(amount, from);
      return;
    }

    container.innerHTML = `<div class="cv-loading">Getting live rate…</div>`;

    try {
      const data = await requestCurrencyConversion(amount, from, to);
      if (seq !== requestSeq) return; // a newer request superseded this one
      if (!data.success) {
        renderError(data.error || "Conversion failed.");
        return;
      }
      renderConversion(amount, from, to, data);
    } catch (e) {
      if (seq !== requestSeq) return;
      renderError(`Couldn't reach the server: ${e.message}`);
    }
  }

  const scheduleConvert = debounce(runConvert, CONVERT_DEBOUNCE_MS);

  /** Refreshes the budget symbol prefix and re-converts. Call whenever a
   *  picker's detected location changes. */
  function onDetectionChange() {
    const home = homeCurrency();
    symbolEl.textContent = home ? (CURRENCY_SYMBOLS[home] || home) : "";
    scheduleConvert();
  }

  // The card is re-rendered on every update, so its controls use delegation.
  container.addEventListener("click", (e) => {
    const toggle = e.target.closest(".cv-toggle");
    if (toggle) {
      detailsOpen = !detailsOpen;
      toggle.textContent = detailsOpen ? "Hide details ▴" : "View details ▾";
      toggle.nextElementSibling.classList.toggle("open", detailsOpen);
    }
  });
  container.addEventListener("change", (e) => {
    if (e.target.id === "homeOverride" || e.target.id === "destOverride") {
      overrides[e.target.id === "homeOverride" ? "home" : "dest"] = e.target.value;
      saveConverterOverrides(overrides);
      onDetectionChange();
    }
  });
  budgetInput.addEventListener("input", scheduleConvert);

  return { onDetectionChange, scheduleConvert, homeCurrency };
}
