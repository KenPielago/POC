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
const fileInputCamera = document.getElementById("fileInputCamera");
const fileInputGallery = document.getElementById("fileInputGallery");
const previewArea = document.getElementById("previewArea");
const scanBtn = document.getElementById("scanBtn");
const reviewArea = document.getElementById("reviewArea");
const expenseListEl = document.getElementById("expenseList");
const toast = document.getElementById("toast");
const uploadChooser = document.getElementById("uploadChooser");
const uploadChooserBackdrop = document.getElementById("uploadChooserBackdrop");
const chooseCameraBtn = document.getElementById("chooseCameraBtn");
const chooseGalleryBtn = document.getElementById("chooseGalleryBtn");
const uploadChooserCancel = document.getElementById("uploadChooserCancel");
const cameraOverlay = document.getElementById("cameraOverlay");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
const cameraCloseBtn = document.getElementById("cameraCloseBtn");
const cameraShutterBtn = document.getElementById("cameraShutterBtn");

// ---- State ----
let expenses = getExpenses();
let tripBudget = initTripBudget();
let selectedFile = null;
let ocrResult = null;
let cameraStream = null;

/** Reads the trip-planner's current draft budget/currency, if any set. */
function plannerBudget() {
  const draft = loadDraft();
  if (!draft || !draft.budget) return null;
  const amount = parseAmountFromBudget(draft.budget);
  if (!(amount > 0)) return null;
  // The AI already resolves an exact currency for whatever it parsed out of
  // the free-text query — prefer that over guessing from a destination name
  // that might not be an exact match in our curated city list.
  const currency = draft.budgetCurrency || detectLocation(draft.destination)?.cur || detectLocation(draft.origin)?.cur || "PHP";
  return { amount, currency, source: "planner" };
}

/**
 * Trip budget stays live-linked to the trip planner (so changing the
 * destination/budget there flows through here automatically) right up until
 * the user manually edits it on this page, or logs an expense — either of
 * those "locks in" their choice so nothing gets silently overwritten.
 */
function initTripBudget() {
  const saved = getTripBudget();
  if (saved && (saved.source !== "planner" || expenses.length)) return saved;

  const fromPlanner = plannerBudget();
  // Nothing locked in yet — either a first visit, or expenses were logged
  // in an earlier session before this lock existed. Lock in the current
  // best guess right now so it can never silently drift under already-
  // logged expenses again.
  if (expenses.length && fromPlanner) saveTripBudget(fromPlanner);
  return fromPlanner;
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
function syncNoticeHtml() {
  const fromPlanner = plannerBudget();
  if (!fromPlanner || expenses.length) return "";
  if (tripBudget && tripBudget.amount === fromPlanner.amount && tripBudget.currency === fromPlanner.currency) return "";
  return `<button class="cv-toggle" id="syncBudgetBtn" type="button" style="display:block; margin-top:10px;">
    🔄 Use Trip Planner's budget — ${escapeHtml(fmtMoney(fromPlanner.amount, fromPlanner.currency))}
  </button>`;
}

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
      tripBudget = { amount, currency, source: "manual" };
      saveTripBudget(tripBudget);
      renderBudgetCard();
    });
    return;
  }

  const spent = totalSpent();
  const remaining = tripBudget.amount - spent;
  const over = remaining < 0;
  const pct = tripBudget.amount > 0 ? Math.min(100, Math.max(0, (spent / tripBudget.amount) * 100)) : 0;

  budgetCard.innerHTML = `
    <div class="budget-figures">
      <div class="budget-remaining">${fmtMoney(Math.abs(remaining), tripBudget.currency)}
        <span class="of-total">${over ? "over your" : "left of"} ${fmtMoney(tripBudget.amount, tripBudget.currency)} budget</span>
      </div>
      <div class="budget-bar-track"><div class="budget-bar-fill ${over ? "over" : ""}" style="width:${pct}%;"></div></div>
      ${syncNoticeHtml()}
    </div>
    <div class="budget-edit-row">
      <div class="field"><input type="number" id="budgetAmountInput" value="${tripBudget.amount}" min="0" step="0.01" /></div>
      <div class="field"><select id="budgetCurrencyInput">${currencyOptions(tripBudget.currency)}</select></div>
    </div>
  `;
  document.getElementById("budgetAmountInput").addEventListener("change", updateBudgetFromInputs);
  document.getElementById("budgetCurrencyInput").addEventListener("change", handleCurrencyChange);
  document.getElementById("syncBudgetBtn")?.addEventListener("click", () => {
    tripBudget = plannerBudget();
    saveTripBudget(tripBudget);
    renderBudgetCard();
    showToast("Synced from Trip Planner");
  });
}

function updateBudgetFromInputs() {
  const amount = parseFloat(document.getElementById("budgetAmountInput").value);
  if (!(amount > 0)) return;
  tripBudget = { ...tripBudget, amount, source: "manual" };
  saveTripBudget(tripBudget);
  renderBudgetCard();
}

/**
 * Switching currencies has to re-convert every already-logged expense too —
 * otherwise their budgetAmount stays numerically the same but gets relabeled
 * into a wildly different real value (¥199,999 silently becoming ₱199,999),
 * corrupting the remaining-budget math. Re-converts from each expense's own
 * original amount/currency (not its old budgetAmount) to avoid compounding
 * rounding across a double conversion.
 */
async function handleCurrencyChange() {
  const select = document.getElementById("budgetCurrencyInput");
  const newCurrency = select.value;
  const oldCurrency = tripBudget.currency;
  if (newCurrency === oldCurrency) return;

  if (!expenses.length) {
    tripBudget = { ...tripBudget, currency: newCurrency, source: "manual" };
    saveTripBudget(tripBudget);
    renderBudgetCard();
    return;
  }

  select.disabled = true;
  showToast(`Converting your budget to ${newCurrency}…`);

  try {
    const budgetConv = await requestCurrencyConversion(tripBudget.amount, oldCurrency, newCurrency);
    if (!budgetConv.success) throw new Error(budgetConv.error || "Conversion failed");

    const expenseConversions = await Promise.all(
      expenses.map(e => e.currency === newCurrency
        ? Promise.resolve({ success: true, converted: e.amount })
        : requestCurrencyConversion(e.amount, e.currency, newCurrency))
    );
    const failed = expenseConversions.find(c => !c.success);
    if (failed) throw new Error(failed.error || "Conversion failed");

    expenses = expenses.map((e, i) => ({ ...e, budgetAmount: expenseConversions[i].converted }));
    saveExpenses(expenses);

    tripBudget = { amount: budgetConv.converted, currency: newCurrency, source: "manual" };
    saveTripBudget(tripBudget);

    renderBudgetCard();
    renderExpenseList();
    showToast(`Budget and ${expenses.length} expense${expenses.length > 1 ? "s" : ""} converted to ${newCurrency}`);
  } catch (e) {
    showToast(`Couldn't convert currency: ${e.message}`);
    renderBudgetCard();
  }
}

// ---- Receipt upload ----
function openUploadChooser() {
  uploadChooser.hidden = false;
}
function closeUploadChooser() {
  uploadChooser.hidden = true;
}

dropzone.addEventListener("click", openUploadChooser);
uploadChooserBackdrop.addEventListener("click", closeUploadChooser);
uploadChooserCancel.addEventListener("click", closeUploadChooser);
chooseCameraBtn.addEventListener("click", () => { closeUploadChooser(); openCamera(); });
chooseGalleryBtn.addEventListener("click", () => { closeUploadChooser(); fileInputGallery.click(); });

dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});
fileInputCamera.addEventListener("change", () => {
  if (fileInputCamera.files[0]) selectFile(fileInputCamera.files[0]);
});
fileInputGallery.addEventListener("change", () => {
  if (fileInputGallery.files[0]) selectFile(fileInputGallery.files[0]);
});

// ---- Live camera capture ----
// A plain <input capture> only hands off to a camera app on mobile browsers
// — desktops have no such handoff and just fall back to the file picker. A
// real getUserMedia() viewfinder gives an actual camera on every platform,
// including a laptop's webcam. fileInputCamera stays as the fallback for
// browsers/contexts where getUserMedia is unavailable (e.g. non-HTTPS,
// non-localhost origins, where the browser hides the API entirely).
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    fileInputCamera.click();
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    showToast("Couldn't access your camera — check permissions, or choose a photo instead.");
    return;
  }
  cameraVideo.srcObject = cameraStream;
  cameraOverlay.hidden = false;
}

function closeCamera() {
  cameraStream?.getTracks().forEach(t => t.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
  cameraOverlay.hidden = true;
}

cameraCloseBtn.addEventListener("click", closeCamera);

cameraShutterBtn.addEventListener("click", () => {
  const w = cameraVideo.videoWidth;
  const h = cameraVideo.videoHeight;
  cameraCanvas.width = w;
  cameraCanvas.height = h;
  cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0, w, h);
  cameraCanvas.toBlob((blob) => {
    if (!blob) { showToast("Couldn't capture that photo — try again."); return; }
    const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
    closeCamera();
    selectFile(file);
  }, "image/jpeg", 0.9);
});

/**
 * Downscales and re-compresses an image client-side before upload. Smaller
 * files both upload faster and process faster on OCR.Space (processing time
 * grows with file size, especially on Engine 3) — with no accuracy trade-off
 * for a normal phone photo, since 1600px is well past what's needed to read
 * receipt text. PDFs pass through untouched (canvas can't process them).
 */
function compressImage(file, maxDimension = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Compression failed")); return; }
        const compressedName = file.name.replace(/\.\w+$/, "") + ".jpg";
        resolve(new File([blob], compressedName, { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
}

async function selectFile(file) {
  const isPdf = file.type === "application/pdf";
  const isSupportedImage = file.type === "image/jpeg" || file.type === "image/png";
  if (!isPdf && !isSupportedImage) {
    // Explicit allowlist, not just "image/*" — HEIC (the default on iPhone
    // cameras) reports as an image type but can't be read by canvas, and
    // silently falling through to OCR.Space with it just fails there instead
    // with a much more confusing error.
    showToast("Please choose a JPG, PNG, or PDF file (not HEIC/HEIF — check your camera's format setting)");
    return;
  }
  ocrResult = null;
  reviewArea.innerHTML = "";

  try {
    selectedFile = isPdf ? file : await compressImage(file);
  } catch {
    showToast("Couldn't process that image — try a different photo");
    return;
  }

  const thumb = isPdf
    ? `<div class="expense-cat-badge">📄</div>`
    : `<img src="${URL.createObjectURL(selectedFile)}" alt="" />`;
  previewArea.innerHTML = `
    <div class="receipt-preview">
      ${thumb}
      <div class="file-name">${escapeHtml(selectedFile.name)}</div>
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
  const langNote = r.detectedLanguage
    ? `<div class="clarify-box"><span>🌐</span><span>Detected ${escapeHtml(r.detectedLanguage)} receipt — translated to English below.</span></div>`
    : "";
  reviewArea.innerHTML = `
    ${warn}
    ${langNote}
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
      <div>
        <div class="field-label">Time (optional)</div>
        <div class="field"><input type="time" id="rvTime" value="${r.time || ""}" /></div>
      </div>
      <div>
        <div class="field-label">Tax (optional)</div>
        <div class="field"><input type="number" id="rvTax" value="${r.tax ?? ""}" min="0" step="0.01" placeholder="0.00" /></div>
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
  fileInputCamera.value = "";
  fileInputGallery.value = "";
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
  const time = document.getElementById("rvTime").value || null;
  const tax = document.getElementById("rvTax").value ? parseFloat(document.getElementById("rvTax").value) : null;

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
    merchant, category, date, time, tax, amount, currency, budgetAmount,
    note: ocrResult?.note || null,
    detectedLanguage: ocrResult?.detectedLanguage || null,
    addedAt: new Date().toISOString(),
  });
  saveExpenses(expenses);
  // Lock the budget in storage now that an expense exists against it — even
  // if it was never manually edited, it must stop following planner changes
  // from here on, or a later destination change would swap the currency out
  // from under already-logged expenses.
  saveTripBudget(tripBudget);
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
        <div class="expense-meta">${escapeHtml(e.category)}${e.date ? " · " + escapeHtml(e.date) : ""}${e.time ? " " + escapeHtml(e.time) : ""}</div>
      </div>
      <div class="expense-amount">
        ${fmtMoney(e.budgetAmount, tripBudget?.currency || e.currency)}
        ${tripBudget && e.currency !== tripBudget.currency ? `<span class="orig">${fmtMoney(e.amount, e.currency)}</span>` : ""}
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
