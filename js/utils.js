// utils.js — small shared helpers with no app knowledge.

/** Escapes text for safe interpolation into innerHTML templates. */
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Returns a debounced wrapper that runs `fn` after `delayMs` of quiet. */
export function debounce(fn, delayMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
