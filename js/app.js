// app.js — entry point: wires the form, pickers, converter, and LLM flow.

import { requestTripPlan } from "./api.js";
import { getProfileInterests, loadDraft, saveDraft, loadRememberedOrigin } from "./storage.js";
import { createLocationPicker } from "./location-picker.js";
import { createCurrencyConverter } from "./currency-converter.js";
import { renderLoading, renderError, renderTripResult } from "./trip-results.js";
import { escapeHtml } from "./utils.js";

// ---- Elements ----
const originEl = document.getElementById("origin");
const destinationEl = document.getElementById("destination");
const budgetEl = document.getElementById("budget");
const departDateEl = document.getElementById("departDate");
const returnDateEl = document.getElementById("returnDate");
const notesEl = document.getElementById("notes");
const askBtn = document.getElementById("askBtn");
const nextBtn = document.getElementById("nextBtn");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const swapBtn = document.getElementById("swapBtn");
const infoNote = document.getElementById("infoNote");
const resultArea = document.getElementById("resultArea");
const toast = document.getElementById("toast");

// ---- Pickers + converter ----
// The pickers report selection changes to the converter; the converter pulls
// detected currencies back out of the pickers. `converter` is assigned right
// after the pickers, before any user event can fire.
const onDetectionChange = () => converter?.onDetectionChange();

function pickerFor(key, input, extra = {}) {
  return createLocationPicker({
    input,
    badge: document.getElementById(key + "Badge"),
    list: document.getElementById(key + "List"),
    onSelectionChange: onDetectionChange,
    onSubmit: planTrip,
    ...extra,
  });
}
const originPicker = pickerFor("origin", originEl);
// Destination is where you're actually headed, so keep suggestions to
// specific cities rather than whole countries, and personalize the
// empty-state shortlist to what the user picked in the Profile Builder.
const destinationPicker = pickerFor("destination", destinationEl, {
  citiesOnly: true,
  interests: getProfileInterests(),
});

const converter = createCurrencyConverter({
  container: document.getElementById("convertResult"),
  budgetInput: budgetEl,
  symbolEl: document.getElementById("budgetSym"),
  getDetectedHomeCurrency: () => originPicker.getSelection()?.cur || "",
  getDetectedDestCurrency: () => destinationPicker.getSelection()?.cur || "",
});

swapBtn.addEventListener("click", () => {
  [originEl.value, destinationEl.value] = [destinationEl.value, originEl.value];
  const originSelection = originPicker.getSelection();
  originPicker.setSelection(destinationPicker.getSelection());
  destinationPicker.setSelection(originSelection);
});

// ---- Form state ----
function currentFields() {
  return {
    origin: originEl.value.trim(),
    destination: destinationEl.value.trim(),
    budget: budgetEl.value.trim(),
    departDate: departDateEl.value,
    returnDate: returnDateEl.value,
    notes: notesEl.value.trim(),
  };
}

function hasAnyInput(f) {
  return !!(f.origin || f.destination || f.budget || f.departDate || f.returnDate || f.notes);
}

(function restoreDraft() {
  const draft = loadDraft();
  if (draft) {
    originEl.value = draft.origin || "";
    destinationEl.value = draft.destination || "";
    budgetEl.value = draft.budget || "";
    departDateEl.value = draft.departDate || "";
    returnDateEl.value = draft.returnDate || "";
    notesEl.value = draft.notes || "";
  } else {
    originEl.value = loadRememberedOrigin();
  }
  originPicker.detectFromInput();
  destinationPicker.detectFromInput();
})();

saveDraftBtn.addEventListener("click", () => {
  saveDraft(currentFields());
  showToast("Draft saved");
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1600);
}

function flashInvalid(message) {
  const original = infoNote.textContent;
  infoNote.classList.add("warn");
  infoNote.textContent = message;
  setTimeout(() => {
    infoNote.classList.remove("warn");
    infoNote.textContent = original;
  }, 2200);
}

// ---- Profile interests row ----
(function renderProfileRow() {
  const interests = getProfileInterests();
  const row = document.getElementById("profileRow");
  if (interests.length) {
    row.innerHTML = interests.map(i => `<span class="profile-tag">${escapeHtml(i)}</span>`).join("")
      + ` <a href="profile.html">Edit</a>`;
  } else {
    row.innerHTML = `<a href="profile.html">Set up your travel interests →</a>`;
  }
})();

// ---- Plan trip (LLM) ----
function buildQueryText(f) {
  const parts = [];
  if (f.destination) {
    parts.push(`Plan a trip to ${f.destination}` + (f.origin ? ` from ${f.origin}` : "") + ".");
  } else {
    parts.push("I haven't decided on a destination yet — please recommend places to go"
      + (f.origin ? ` from ${f.origin}` : "") + ".");
  }
  if (f.budget) {
    // If the budget text is a bare number, attach the detected home currency
    // so the LLM doesn't have to guess it.
    const homeCur = converter.homeCurrency();
    const hasCurrencyHint = /[A-Za-z₱$€£¥₩₹฿₺₪]/.test(f.budget);
    parts.push(`My preferred budget range is ${f.budget}${!hasCurrencyHint && homeCur ? " " + homeCur : ""}.`);
  }
  if (f.departDate && f.returnDate) {
    parts.push(`I want to travel from ${f.departDate} to ${f.returnDate}.`);
  } else if (f.departDate) {
    parts.push(`I want to depart around ${f.departDate}.`);
  }
  if (f.notes) parts.push(f.notes);
  return parts.join(" ");
}

async function planTrip() {
  const fields = currentFields();

  if (!hasAnyInput(fields)) {
    flashInvalid("Please fill in at least one field to continue.");
    return;
  }

  saveDraft(fields);
  nextBtn.disabled = true;
  askBtn.disabled = true;
  renderLoading(resultArea);

  try {
    const data = await requestTripPlan(buildQueryText(fields), getProfileInterests(), fields.origin);
    if (!data.success) {
      renderError(resultArea, data.error || "Something went wrong.");
      return;
    }
    renderTripResult(resultArea, data.result, (place) => {
      destinationEl.value = place.name;
      destinationPicker.detectFromInput();
      planTrip();
    });
  } catch (e) {
    renderError(resultArea, `Couldn't reach the server: ${e.message}`);
  } finally {
    nextBtn.disabled = false;
    askBtn.disabled = false;
  }
}

// ---- Submit triggers ----
budgetEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); planTrip(); }
});
notesEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); planTrip(); }
});
nextBtn.addEventListener("click", planTrip);
askBtn.addEventListener("click", planTrip);
document.querySelectorAll(".example-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    notesEl.value = btn.dataset.q;
    planTrip();
  });
});

// Initial converter state (after draft restore + detection above).
converter.scheduleConvert();
