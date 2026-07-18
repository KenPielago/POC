// app.js — entry point: wires the Ask AI form to the conversational planner.
// Holds the message history for the session so the assistant remembers
// earlier turns (origin/destination/dates/etc. already given don't need to
// be repeated) — see LLM.php's planTripConversation().

import { requestTripPlan } from "./api.js";
import { getProfileInterests, loadDraft, saveDraft } from "./storage.js";
import { renderLoading, renderError, renderPlannerResponse, appendTurn } from "./trip-results.js";
import { escapeHtml } from "./utils.js";

// ---- Elements ----
const notesEl = document.getElementById("notes");
const askBtn = document.getElementById("askBtn");
const infoNote = document.getElementById("infoNote");
const resultArea = document.getElementById("resultArea");
const planStage = document.getElementById("planStage");
const toast = document.getElementById("toast");

// ---- State ----
// In-memory only — a fresh page load starts a fresh conversation, same as
// opening a new chat. The last-known trip requirements still persist to
// storage (see persistPlannerDraft) so Track Expenses keeps working.
let conversation = [];

(function restoreDraft() {
  const draft = loadDraft();
  if (draft) notesEl.value = draft.notes || "";
})();

function saveDraftNow() {
  // Merge onto the existing draft rather than replacing it outright, so this
  // doesn't wipe out the origin/destination/budget the last AI response
  // wrote in for Track Expenses to sync from.
  saveDraft({ ...(loadDraft() || {}), notes: notesEl.value.trim() });
  showToast("Draft saved");
}

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

/**
 * Keeps Track Expenses' "sync from Trip Planner" feature working — the
 * assistant's own extracted origin/destination/budget/dates get written
 * into the same draft shape Track Expenses already reads, updated after
 * every on-topic turn (even before the full itinerary is ready) so the
 * budget stays as current as possible.
 */
function persistPlannerDraft(requirements, notes) {
  saveDraft({
    origin: requirements.origin || "",
    destination: requirements.destination || "",
    budget: requirements.budget_amount != null ? String(requirements.budget_amount) : "",
    budgetCurrency: requirements.budget_currency || "",
    departDate: requirements.departure_date || "",
    returnDate: requirements.return_date || "",
    notes,
  });
}

/**
 * Collapses the centered greeting/input into the bottom-docked bar. A plain
 * classList.add here would make the input teleport instantly from the
 * middle of the page to the bottom edge — instead this uses a FLIP
 * animation (capture the pill's position before/after the layout change,
 * then transform-animate the gap away) so it visibly slides into place.
 * No-op on later queries: once docked, before/after positions match.
 */
function dockPlanStage() {
  if (planStage.classList.contains("docked")) return;

  const pill = document.querySelector(".ask-pill");
  const before = pill.getBoundingClientRect();

  planStage.classList.add("docked");

  const after = pill.getBoundingClientRect();
  const dx = before.left - after.left;
  const dy = before.top - after.top;

  pill.style.transition = "none";
  pill.style.transform = `translate(${dx}px, ${dy}px)`;
  pill.getBoundingClientRect(); // force reflow so the start position registers
  pill.style.transition = "transform .35s cubic-bezier(.2, .8, .2, 1)";
  pill.style.transform = "translate(0, 0)";
  pill.addEventListener("transitionend", () => {
    pill.style.transition = "";
    pill.style.transform = "";
  }, { once: true });
}

// ---- Plan trip (conversational LLM) ----
async function sendMessage(query) {
  dockPlanStage();
  askBtn.disabled = true;
  conversation.push({ role: "user", text: query });

  const slot = appendTurn(resultArea, query);
  renderLoading(slot);
  slot.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const data = await requestTripPlan(conversation, getProfileInterests());
    if (!data.success) {
      renderError(slot, data.error || "Something went wrong.");
      conversation.pop(); // don't poison history with a failed turn
      return;
    }
    conversation.push({ role: "assistant", text: data.reply });

    // An off-topic reply carries no real trip info — persisting it would
    // wipe out a previously-saved destination/budget the Expenses page
    // still needs to sync from.
    if (data.type !== "off_topic" && data.requirements) {
      persistPlannerDraft(data.requirements, query);
    }

    renderPlannerResponse(
      slot,
      data,
      (suggestion) => sendMessage(`I'd like to go to ${suggestion.name}.`),
      saveDraftNow
    );
  } catch (e) {
    renderError(slot, `Couldn't reach the server: ${e.message}`);
    conversation.pop();
  } finally {
    askBtn.disabled = false;
  }
}

function planTrip() {
  const query = notesEl.value.trim();
  if (!query) {
    flashInvalid("Tell the AI where you'd like to go or what you're planning.");
    return;
  }
  notesEl.value = "";
  sendMessage(query);
}

// ---- Submit triggers ----
notesEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); planTrip(); }
});
askBtn.addEventListener("click", planTrip);
document.querySelectorAll(".example-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    notesEl.value = btn.dataset.q;
    planTrip();
  });
});
