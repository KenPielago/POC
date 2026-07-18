// storage.js — localStorage persistence; every key the app uses lives here.

const PROFILE_KEY = "budgetra_profile_interests";
const ORIGIN_KEY = "budgetra_origin";
const DRAFT_KEY = "budgetra_draft";
const EXPENSES_KEY = "budgetra_expenses";
const TRIP_BUDGET_KEY = "budgetra_trip_budget";

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Interest categories saved by the Profile Builder (profile.html). */
export function getProfileInterests() {
  return readJson(PROFILE_KEY, []);
}

/** The full form draft, or null when none was saved. */
export function loadDraft() {
  return readJson(DRAFT_KEY, null);
}

/** Saves the form draft and remembers the origin for future visits. */
export function saveDraft(fields) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(fields));
  if (fields.origin) localStorage.setItem(ORIGIN_KEY, fields.origin);
}

/** Origin remembered from a previous visit ("" when unknown). */
export function loadRememberedOrigin() {
  return localStorage.getItem(ORIGIN_KEY) || "";
}

/** Logged trip expenses, newest first. */
export function getExpenses() {
  return readJson(EXPENSES_KEY, []);
}

export function saveExpenses(expenses) {
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
}

/** The trip's tracked budget as { amount, currency }, or null if not set yet. */
export function getTripBudget() {
  return readJson(TRIP_BUDGET_KEY, null);
}

export function saveTripBudget(budget) {
  localStorage.setItem(TRIP_BUDGET_KEY, JSON.stringify(budget));
}
