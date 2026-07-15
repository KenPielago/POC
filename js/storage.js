// storage.js — localStorage persistence; every key the app uses lives here.

const PROFILE_KEY = "budgetra_profile_interests";
const ORIGIN_KEY = "budgetra_origin";
const DRAFT_KEY = "budgetra_draft";
const CONVERTER_KEY = "budgetra_converter";

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

/** Manual currency overrides picked under the converter's View details. */
export function loadConverterOverrides() {
  const saved = readJson(CONVERTER_KEY, {});
  return { home: saved.home || "", dest: saved.dest || "" };
}

export function saveConverterOverrides(overrides) {
  localStorage.setItem(CONVERTER_KEY, JSON.stringify(overrides));
}
