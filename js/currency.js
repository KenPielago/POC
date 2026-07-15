// currency.js — money formatting and budget-amount parsing.

export const CURRENCY_SYMBOLS = {
  PHP: "₱", USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", KRW: "₩",
  INR: "₹", THB: "฿", IDR: "Rp", MYR: "RM", SGD: "S$", HKD: "HK$",
  AUD: "A$", NZD: "NZ$", CAD: "C$", TRY: "₺", BRL: "R$", MXN: "MX$",
  ILS: "₪", ZAR: "R",
};

/** "₱100,000" — symbol-prefixed, whole numbers above 100. */
export function fmtMoney(value, currency) {
  const sym = CURRENCY_SYMBOLS[currency] || (currency + " ");
  return sym + value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 2 });
}

/**
 * Pulls the amount out of the free-text Budget field — for a range like
 * "5,000 - 10,000" this takes the upper bound. NaN when no number present.
 */
export function parseAmountFromBudget(text) {
  const matches = (text || "").replace(/,/g, "").match(/\d+(\.\d+)?/g);
  return matches ? parseFloat(matches[matches.length - 1]) : NaN;
}
