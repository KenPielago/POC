// sidebar.js — shared left navigation, rendered into #sidebar on every page.

// Inline SVG icons (stroke = currentColor) so they render identically on every
// OS instead of depending on the system emoji font.
const ICONS = {
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.1 5.6 9.9 3.5a1 1 0 0 0-.8 0L3.6 5.9A1 1 0 0 0 3 6.8v12.7a1 1 0 0 0 1.4.9l5.1-2.3 4.6 2.3a1 1 0 0 0 .8 0l5.5-2.4a1 1 0 0 0 .6-.9V4.4a1 1 0 0 0-1.4-.9l-5.5 2.1z"/><path d="M9.5 3.5v14.5"/><path d="M14.5 5.6V21"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  plane: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.3.5-.1 1.1.4 1.4L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.1 5.2c.3.5.9.7 1.4.4l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`,
};

const NAV_ITEMS = [
  { href: "index.html", icon: ICONS.map, label: "Plan Trip" },
  { href: "flights.html", icon: ICONS.plane, label: "Flights" },
  { href: "expenses.html", icon: ICONS.receipt, label: "Expenses" },
  { href: "profile.html", icon: ICONS.heart, label: "Interests" },
];

function currentPage() {
  return location.pathname.split("/").pop() || "index.html";
}

function renderSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;
  el.classList.add("sidebar");
  const current = currentPage();
  el.innerHTML = `
    <div class="sidebar-brand">
      <span class="brand-mark">${ICONS.pin}</span>
      <span>Budgetra</span>
    </div>
    <div class="sidebar-sec">Menu</div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.map(item => `
        <a class="sidebar-link${item.href === current ? " active" : ""}" href="${item.href}">
          <span class="sidebar-icon">${item.icon}</span>
          <span class="sidebar-label">${item.label}</span>
        </a>
      `).join("")}
    </nav>
    <div class="sidebar-foot">Travel budgeting · POC</div>
  `;
}

renderSidebar();
