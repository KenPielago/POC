// expenses.js — Expense Tracker page: receipt OCR, budget deduction, trip history.

import { requestReceiptScan, requestCurrencyConversion } from "./api.js";
import { getExpenses, saveExpenses, getTripBudget, saveTripBudget, loadDraft } from "./storage.js";
import { SUPPORTED_CURRENCIES, detectLocation } from "./locations.js";
import { fmtMoney, parseAmountFromBudget } from "./currency.js";
import { escapeHtml } from "./utils.js";

const EXPENSE_CATEGORIES = ["Food & Drink", "Transportation", "Lodging", "Activities", "Shopping", "Other"];
const CATEGORY_ICONS = {
  "Food & Drink": "🍽️", "Transportation": "🚗", "Lodging": "🏨",
  "Activities": "🎟️", "Shopping": "🛍️", "Other": "📦",
};

// ---- Elements ----
const budgetCard = document.getElementById("budgetCard");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const previewArea = document.getElementById("previewArea");
const scanBtn = document.getElementById("scanBtn");
const reviewArea = document.getElementById("reviewArea");
const expenseListEl = document.getElementById("expenseList");
const toast = document.getElementById("toast");

// ---- State ----
let tripBudget = getTripBudget() || deriveDefaultBudget();
let expenses = getExpenses();
let selectedFile = null;
let ocrResult = null;

/** Falls back to the last trip-planner draft's budget/currency, if any. */
function deriveDefaultBudget() {
  const draft = loadDraft();
  if (!draft || !draft.budget) return null;
  const amount = parseAmountFromBudget(draft.budget);
  if (!(amount > 0)) return null;
  const currency = detectLocation(draft.destination)?.cur || detectLocation(draft.origin)?.cur || "PHP";
  return { amount, currency };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function currencyOptions(selected) {
  return SUPPORTED_CURRENCIES.map(c => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`).join("");
}

function totalSpent() {
  return expenses.reduce((sum, e) => sum + e.budgetAmount, 0);
}

// ---- Budget card ----
function renderBudgetCard() {
  if (!tripBudget || !(tripBudget.amount > 0)) {
    budgetCard.innerHTML = `
      <div class="budget-figures">
        <div class="sec-label" style="margin-bottom:10px;">Set Your Travel Budget</div>
        <div class="budget-edit-row">
          <div class="field"><input type="number" id="budgetAmountInput" placeholder="e.g. 50000" min="0" step="0.01" /></div>
          <div class="field"><select id="budgetCurrencyInput">${currencyOptions("PHP")}</select></div>
          <button class="btn-primary" id="setBudgetBtn" type="button">Start Tracking</button>
        </div>
      </div>
    `;
    document.getElementById("setBudgetBtn").addEventListener("click", () => {
      const amount = parseFloat(document.getElementById("budgetAmountInput").value);
      const currency = document.getElementById("budgetCurrencyInput").value;
      if (!(amount > 0)) { showToast("Enter a budget amount first"); return; }
      tripBudget = { amount, currency };
      saveTripBudget(tripBudget);
      renderBudgetCard();
    });
    return;
  }

  const spent = totalSpent();
  const remaining = tripBudget.amount - spent;
  const over = remaining < 0;
  const pct = tripBudget.amount > 0 ? Math.min(100, Math.max(0, (spent / tripBudget.amount) * 100)) : 0;

  // Currency is locked once an expense exists — changing it wouldn't
  // retroactively re-convert already-logged expenses.
  const currencyControl = expenses.length
    ? `<span class="cur-badge show">${tripBudget.currency}</span>`
    : `<div class="field"><select id="budgetCurrencyInput">${currencyOptions(tripBudget.currency)}</select></div>`;

  budgetCard.innerHTML = `
    <div class="budget-figures">
      <div class="budget-remaining">${fmtMoney(Math.abs(remaining), tripBudget.currency)}
        <span class="of-total">${over ? "over your" : "left of"} ${fmtMoney(tripBudget.amount, tripBudget.currency)} budget</span>
      </div>
      <div class="budget-bar-track"><div class="budget-bar-fill ${over ? "over" : ""}" style="width:${pct}%;"></div></div>
    </div>
    <div class="budget-edit-row">
      <div class="field"><input type="number" id="budgetAmountInput" value="${tripBudget.amount}" min="0" step="0.01" /></div>
      ${currencyControl}
    </div>
  `;
  document.getElementById("budgetAmountInput").addEventListener("change", updateBudgetFromInputs);
  document.getElementById("budgetCurrencyInput")?.addEventListener("change", updateBudgetFromInputs);
}

function updateBudgetFromInputs() {
  const amount = parseFloat(document.getElementById("budgetAmountInput").value);
  const currencyInput = document.getElementById("budgetCurrencyInput");
  const currency = currencyInput ? currencyInput.value : tripBudget.currency;
  if (!(amount > 0)) return;
  tripBudget = { amount, currency };
  saveTripBudget(tripBudget);
  renderBudgetCard();
}

// ---- Receipt upload ----
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) selectFile(fileInput.files[0]);
});

function selectFile(file) {
  if (!file.type.startsWith("image/")) { showToast("Please choose an image file"); return; }
  selectedFile = file;
  ocrResult = null;
  reviewArea.innerHTML = "";
  const url = URL.createObjectURL(file);
  previewArea.innerHTML = `
    <div class="receipt-preview">
      <img src="${url}" alt="" />
      <div class="file-name">${escapeHtml(file.name)}</div>
    </div>
  `;
  scanBtn.style.display = "inline-block";
  scanBtn.disabled = false;
  scanBtn.textContent = "Scan Receipt";
}

scanBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning…";
  reviewArea.innerHTML = `<div class="cv-loading">Reading your receipt…</div>`;
  try {
    const data = await requestReceiptScan(selectedFile, tripBudget?.currency);
    if (!data.success) {
      reviewArea.innerHTML = `<div class="error-box" style="margin-top:16px;">${escapeHtml(data.error || "Couldn't scan that receipt.")}</div>`;
      return;
    }
    ocrResult = data.result;
    renderReviewForm();
  } catch (e) {
    reviewArea.innerHTML = `<div class="error-box" style="margin-top:16px;">Couldn't reach the server: ${escapeHtml(e.message)}</div>`;
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "Scan Receipt";
  }
});

function renderReviewForm() {
  const r = ocrResult;
  const warn = !r.readable
    ? `<div class="clarify-box"><span>⚠️</span><span>We couldn't clearly read the total on this receipt. Please check the amount below, or upload a clearer photo.</span></div>`
    : "";
  reviewArea.innerHTML = `
    ${warn}
    <div class="review-grid">
      <div>
        <div class="field-label">Merchant</div>
        <div class="field"><input type="text" id="rvMerchant" value="${escapeHtml(r.merchant || "")}" placeholder="e.g. Jollibee" /></div>
      </div>
      <div>
        <div class="field-label">Category</div>
        <div class="field"><select id="rvCategory">${EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${c === r.category ? "selected" : ""}>${CATEGORY_ICONS[c]} ${c}</option>`).join("")}</select></div>
      </div>
      <div>
        <div class="field-label">Total</div>
        <div class="field"><input type="number" id="rvTotal" value="${r.total ?? ""}" min="0" step="0.01" placeholder="0.00" /></div>
      </div>
      <div>
        <div class="field-label">Currency</div>
        <div class="field"><select id="rvCurrency">${currencyOptions(r.currency || tripBudget?.currency || "PHP")}</select></div>
      </div>
      <div>
        <div class="field-label">Date</div>
        <div class="field"><input type="date" id="rvDate" value="${r.date || new Date().toISOString().slice(0, 10)}" /></div>
      </div>
    </div>
    <div class="review-actions">
      <button class="btn-ghost" id="cancelReviewBtn" type="button">Cancel</button>
      <button class="btn-primary" id="confirmExpenseBtn" type="button">Add Expense</button>
    </div>
  `;

  document.getElementById("cancelReviewBtn").addEventListener("click", resetUpload);
  document.getElementById("confirmExpenseBtn").addEventListener("click", confirmExpense);
}

function resetUpload() {
  selectedFile = null;
  ocrResult = null;
  fileInput.value = "";
  previewArea.innerHTML = "";
  reviewArea.innerHTML = "";
  scanBtn.style.display = "none";
}

async function confirmExpense() {
  if (!tripBudget) { showToast("Set your travel budget first"); return; }

  const merchant = document.getElementById("rvMerchant").value.trim() || "Unknown merchant";
  const category = document.getElementById("rvCategory").value;
  const amount = parseFloat(document.getElementById("rvTotal").value);
  const currency = document.getElementById("rvCurrency").value;
  const date = document.getElementById("rvDate").value;

  if (!(amount > 0)) { showToast("Enter a valid total first"); return; }

  const confirmBtn = document.getElementById("confirmExpenseBtn");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Adding…";

  let budgetAmount = amount;
  if (currency !== tripBudget.currency) {
    try {
      const conv = await requestCurrencyConversion(amount, currency, tripBudget.currency);
      if (!conv.success) {
        showToast(conv.error || "Couldn't convert currency — try again.");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Add Expense";
        return;
      }
      budgetAmount = conv.converted;
    } catch (e) {
      showToast(`Couldn't reach the server: ${e.message}`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Add Expense";
      return;
    }
  }

  expenses.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    merchant, category, date, amount, currency, budgetAmount,
    note: ocrResult?.note || null,
    addedAt: new Date().toISOString(),
  });
  saveExpenses(expenses);
  resetUpload();
  renderBudgetCard();
  renderExpenseList();
  showToast("Expense added");
}

// ---- Trip history ----
function renderExpenseList() {
  if (!expenses.length) {
    expenseListEl.innerHTML = `<div class="empty-list">No expenses logged yet — scan a receipt to get started.</div>`;
    return;
  }
  expenseListEl.innerHTML = expenses.map(e => `
    <div class="expense-row">
      <div class="expense-cat-badge">${CATEGORY_ICONS[e.category] || "📦"}</div>
      <div class="expense-details">
        <div class="expense-merchant">${escapeHtml(e.merchant)}</div>
        <div class="expense-meta">${escapeHtml(e.category)}${e.date ? " · " + escapeHtml(e.date) : ""}</div>
      </div>
      <div class="expense-amount">
        ${fmtMoney(e.budgetAmount, tripBudget.currency)}
        ${e.currency !== tripBudget.currency ? `<span class="orig">${fmtMoney(e.amount, e.currency)}</span>` : ""}
      </div>
      <button class="expense-delete" data-id="${e.id}" title="Delete">✕</button>
    </div>
  `).join("");

  expenseListEl.querySelectorAll(".expense-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      expenses = expenses.filter(e => e.id !== btn.dataset.id);
      saveExpenses(expenses);
      renderBudgetCard();
      renderExpenseList();
    });
  });
}

renderBudgetCard();
renderExpenseList();
