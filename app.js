/* app.js (DROP IN)
   PRODUCTION + VERIFI button (red, all caps) + scroll to setup + security gate
*/

const $ = (id) => document.getElementById(id);

const LOCAL_KEY_TECH = "verifi_pilot_round_v1";
const LOCAL_KEY_NURSE = "verifi_pilot_nurse_log_v1";

/* ---------------------------
   Toast
--------------------------- */
const toastEl = $("toast");
let toastTimer = null;

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = String(msg || "");
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
}

/* ---------------------------
   iOS-proof scroll helper
--------------------------- */
function scrollToEl(el) {
  if (!el) return;

  try {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    try { el.scrollIntoView(true); } catch {}
  }

  setTimeout(() => {
    try {
      const y = el.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: y, behavior: "smooth" });
    } catch {}
  }, 60);
}

/* ---------------------------
   NAV
--------------------------- */
const techView = $("techView");
const nursingView = $("nursingView");
const navTech = $("navTech");
const navNursing = $("navNursing");

function showScreen(screen) {
  if (screen === "nursing") {
    techView?.classList.add("hidden");
    nursingView?.classList.remove("hidden");
    navTech?.classList.remove("active");
    navNursing?.classList.add("active");
  } else {
    nursingView?.classList.add("hidden");
    techView?.classList.remove("hidden");
    navNursing?.classList.remove("active");
    navTech?.classList.add("active");
  }
}

navTech?.addEventListener("click", () => showScreen("tech"));
navNursing?.addEventListener("click", () => showScreen("nursing"));

/* ===========================
   TECH MODULE
=========================== */
const cartTypeTabs = $("cartTypeTabs");
const departmentSelect = $("departmentSelect");
const cartNumberInput = $("cartNumberInput");
const addCartBtn = $("addCartBtn");
const clearRoundBtn = $("clearRoundBtn");
const exportJsonBtn = $("exportJsonBtn");

const readyToggle = $("readyToggle");
const windowMeta = $("windowMeta");

const roundMeta = $("roundMeta");
const cartList = $("cartList");

const setupPanel = $("verificationSetupPanel");

const nursingMeta = $("nursingMeta");
const nursingLogContainer = $("nursingLogContainer");
const nursingLogPrintContainer = $("nursingLogPrintContainer");
const showAllToggle = $("showAllToggle");
const printPdfBtn = $("printPdfBtn");

const metricGaps = $("metricGaps");
const metricPaper = $("metricPaper");
const metricMoney = $("metricMoney");

let showAll = false;
let currentCartIndex = -1;

const IMPACT = {
  costPerPage: 0.06,
  minutesSavedPerVerified: 2.0,
  laborCostPerHour: 35
};

let round = {
  cartType: "Adult – Towers",
  department: "",
  carts: [],
  verificationWindowOpenedAt: null,
  verificationWindowClosedAt: null,
  verificationEventType: "Unspecified"
};

const DEPARTMENTS = {
  "Adult – Towers": [
    "4 South","4 East","3 South","3 East","2 South","2 East",
    "2A","2B","2C","2D","3A","3B","3C","3D",
    "ICU Pavilion — Pav A","ICU Pavilion — Pav B","ICU Pavilion — Pav C",
    "Tower Extra Cart"
  ],
  "Adult – ER / Procedural": [
    "ER Area","Cardiology","EDX1","EDX2","ER Triage","ER Room 2",
    "X-Ray Dept","CT1","CT2 / MRI","Specials Room 5","Specials Room 6",
    "Cath Lab","CT Trailer",
    "Mother/Baby — L&D Triage","Mother/Baby — L&D Nurse Station","Mother/Baby — Maternity",
    "Surgery — OR","Surgery — Recovery",
    "North Building","Physical Therapy","Basement","GI Lab",
    "Central Backup Carts","X-Ray Trailer","Urology"
  ],
  "Neonatal": [
    "Labor & Delivery — OR Hallway","Labor & Delivery — L&D Hallway",
    "Mother/Baby — NICU","Mother/Baby — Nursery","Pav C NICU",
    "Central Backup Carts"
  ],
  "Broselow": [
    "2C","ER","EDX1","EDX2","ER MAIN",
    "Surgery — Recovery",
    "Central Backup Carts"
  ]
};

/* ---------------------------
   Paper pages per verification
--------------------------- */
const DEFAULT_PAGES_PER_VERIFICATION = 2;
const PAPER_PAGES_BY_DEPT = {
  "ICU Pavilion — Pav A": 3,
  "ICU Pavilion — Pav B": 3,
  "ICU Pavilion — Pav C": 3,
  "ER Area": 3,
  "ER Triage": 3,
  "Cath Lab": 3,
  "4 South": 2,
  "4 East": 2,
  "3 South": 2,
  "3 East": 2,
  "2 South": 2,
  "2 East": 2,
  "Central Backup Carts": 2,
  "Tower Extra Cart": 2
};
function pagesPerVerificationForCart(cart) {
  const dept = cart.department || "";
  return PAPER_PAGES_BY_DEPT[dept] ?? DEFAULT_PAGES_PER_VERIFICATION;
}

/* ---------------------------
   Helpers
--------------------------- */
function formatTimeHM(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatMoney(n) {
  const val = Math.max(0, Number(n) || 0);
  return val.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatLateDelta(ms) {
  if (ms <= 0 || Number.isNaN(ms)) return "";
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `+${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `+${hours}h ${minutes}m` : `+${hours}h`;
}
function inferVerificationEventType(isoOpenedAt) {
  if (!isoOpenedAt) return "Unspecified";
  const d = new Date(isoOpenedAt);
  if (Number.isNaN(d.getTime())) return "Unspecified";
  return d.getDay() === 3 ? "Routine weekly" : "Post-use update";
}

function isWindowOpen() {
  return !!round.verificationWindowOpenedAt && !round.verificationWindowClosedAt;
}

/* ---------------------------
   SECURITY GATE: close window before export/print
--------------------------- */
function requireClosedWindowOrConfirm(actionLabel = "submit") {
  if (!isWindowOpen()) return true;

  const ok = confirm(
    `Verification Window is still OPEN.\n\nFor security and audit integrity, please CLOSE the Verification Window before you ${actionLabel}.\n\nClose it now?`
  );
  if (!ok) return false;

  round.verificationWindowClosedAt = new Date().toISOString();
  if (readyToggle) readyToggle.checked = false;

  saveTechToLocal();
  renderTechAll();
  showToast("Window closed.");
  return true;
}

/* ---------------------------
   Cart model
--------------------------- */
function newCart(cartNo) {
  return {
    cartType: round.cartType,
    department: round.department,
    cartNo: String(cartNo).trim(),

    supplyName: "",
    supplyExp: "",
    checkDate: "",
    checkedBy: "",

    shift: "",

    issue: false,
    issueNote: "",

    drugExp: "",
    drugName: "",

    verifiedAt: null,
    lastEditedAt: null
  };
}

/* ---------------------------
   Strict verification
--------------------------- */
function isCartVerified(cart) {
  const checkedByOk = !!String(cart.checkedBy || "").trim();
  const checkDateOk = !!String(cart.checkDate || "").trim();
  const shiftOk = !!String(cart.shift || "").trim();

  const supplyExpOk = !!String(cart.supplyExp || "").trim();
  const supplyNameOk = !!String(cart.supplyName || "").trim();

  const drugExpOk = !!String(cart.drugExp || "").trim();
  const drugNameOk = !!String(cart.drugName || "").trim();

  return checkedByOk && checkDateOk && shiftOk && supplyExpOk && supplyNameOk && drugExpOk && drugNameOk;
}

function stampEdit(cart) {
  cart.lastEditedAt = new Date().toISOString();
  if (isCartVerified(cart) && !cart.verifiedAt) {
    cart.verifiedAt = new Date().toISOString();
  }
}

/* ---------------------------
   Verified late
--------------------------- */
function isVerifiedLate(cart) {
  if (!cart?.verifiedAt) return false;
  if (!round?.verificationWindowClosedAt) return false;

  const v = new Date(cart.verifiedAt).getTime();
  const c = new Date(round.verificationWindowClosedAt).getTime();
  if (Number.isNaN(v) || Number.isNaN(c)) return false;
  return v > c;
}
function verifiedLateDelta(cart) {
  if (!cart?.verifiedAt || !round?.verificationWindowClosedAt) return "";
  const v = new Date(cart.verifiedAt).getTime();
  const c = new Date(round.verificationWindowClosedAt).getTime();
  if (Number.isNaN(v) || Number.isNaN(c)) return "";
  if (v <= c) return "";
  return formatLateDelta(v - c);
}

/* ---------------------------
   Risk logic
--------------------------- */
const DUE_SOON_DAYS = 30;
function parseISODate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / ms);
}
function earliestDate(d1, d2) {
  if (!d1) return d2;
  if (!d2) return d1;
  return d1 <= d2 ? d1 : d2;
}
function computeExpiryRisk(cart) {
  const today = startOfToday();
  const s = parseISODate(cart.supplyExp);
  const d = parseISODate(cart.drugExp);
  const next = earliestDate(s, d);

  if (!next) return { level: "dueSoon" };

  const daysLeft = daysBetween(today, next);
  if (daysLeft < 0) return { level: "overdue" };
  if (daysLeft <= DUE_SOON_DAYS) return { level: "dueSoon" };
  return { level: "ok" };
}

/* ---------------------------
   Status mapping
--------------------------- */
function computeVerificationPill(cart) {
  const verified = isCartVerified(cart);
  if (!verified) return { level: "notVerified", pill: "Not verified", cls: "notVerified" };

  if (isVerifiedLate(cart)) {
    const delta = verifiedLateDelta(cart);
    return { level: "verifiedLate", pill: delta ? `Verified late · ${delta}` : "Verified late", cls: "pending" };
  }

  const risk = computeExpiryRisk(cart);
  if (cart.issue) return { level: "review", pill: "Needs review", cls: "review" };
  if (risk.level === "overdue") return { level: "review", pill: "Needs review", cls: "review" };
  if (risk.level === "dueSoon") return { level: "review", pill: "Needs review", cls: "review" };

  return { level: "verified", pill: "Verified", cls: "verified" };
}
function isException(cart) {
  return computeVerificationPill(cart).level !== "verified";
}

/* ---------------------------
   iOS keyboard fix helpers
--------------------------- */
function updateCartHeaderStatus(cardEl, cart) {
  const subEl = cardEl.querySelector(".cartSub");
  if (!subEl) return;

  const status = computeVerificationPill(cart);
  const verifiedAtTime = cart.verifiedAt
    ? new Date(cart.verifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const statusLine = `${status.pill}${verifiedAtTime ? ` · ${verifiedAtTime}` : ""}`;
  subEl.textContent = `${cart.cartType} • ${cart.department} • ${statusLine}`;
}

function renderAfterEdit(cardEl, cart) {
  updateCartHeaderStatus(cardEl, cart);
  renderRoundMeta();
  renderTechNursingLog();
  renderImpactMetrics();
  saveTechToLocal();
}

/* ---------------------------
   Render: window meta
--------------------------- */
function renderWindowMeta() {
  if (!windowMeta) return;

  const opened = round.verificationWindowOpenedAt
    ? `Started ${formatTimeHM(round.verificationWindowOpenedAt)}`
    : "";

  const closed = round.verificationWindowClosedAt
    ? `Ended ${formatTimeHM(round.verificationWindowClosedAt)}`
    : "";

  const openState = isWindowOpen() ? "Active" : "";
  const eventType = round.verificationEventType || "";

  const parts = [eventType, opened, closed, openState].filter(Boolean);
  windowMeta.textContent = parts.length ? parts.join(" • ") : "";
}

/* ---------------------------
   Render: department options + meta
--------------------------- */
function renderDepartmentOptions() {
  const opts = DEPARTMENTS[round.cartType] || [];
  if (!departmentSelect) return;

  departmentSelect.innerHTML = opts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");

  if (!opts.includes(round.department)) {
    round.department = opts[0] || "";
  }
  departmentSelect.value = round.department;
}

function renderRoundMeta() {
  const c = round.carts.length;
  if (!roundMeta) return;
  roundMeta.textContent = c === 0
    ? "No carts in progress"
    : `${round.cartType} • ${round.department} • ${c} cart${c > 1 ? "s" : ""}`;
}

/* ---------------------------
   Auto-open window on first add
--------------------------- */
function openVerificationWindowIfNeeded() {
  if (isWindowOpen()) return;

  round.verificationWindowOpenedAt = new Date().toISOString();
  round.verificationWindowClosedAt = null;
  round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);

  if (readyToggle) readyToggle.checked = true;
}

/* ---------------------------
   CRUD
--------------------------- */
function addCart(cartNo) {
  const cleaned = String(cartNo).trim();
  if (!cleaned) {
    showToast("Enter a Cart ID first.");
    cartNumberInput?.focus();
    return;
  }

  const dup = round.carts.some(c =>
    c.cartNo === cleaned &&
    c.department === round.department &&
    c.cartType === round.cartType
  );
  if (dup) {
    if (cartNumberInput) {
      cartNumberInput.value = "";
      cartNumberInput.placeholder = "Duplicate — already added";
    }
    showToast("Duplicate ID detected.");
    return;
  }

  if (round.carts.length === 0) {
    openVerificationWindowIfNeeded();
  }

  round.carts.push(newCart(cleaned));
  currentCartIndex = round.carts.length - 1;

  if (cartNumberInput) {
    cartNumberInput.value = "";
    cartNumberInput.placeholder = "Enter cart ID (numbers)";
  }

  saveTechToLocal();
  renderTechAll();

  setTimeout(() => {
    const cards = cartList?.querySelectorAll(".cartCard");
    const last = cards?.[cards.length - 1];
    if (last) {
      scrollToEl(last);
      const firstField = last.querySelector(".supplyName");
      if (firstField) setTimeout(() => firstField.focus(), 200);
    }
  }, 60);

  showToast("Cart added ✔︎");
}

function removeCart(index) {
  round.carts.splice(index, 1);

  if (round.carts.length === 0) currentCartIndex = -1;
  else if (currentCartIndex === index) currentCartIndex = round.carts.length - 1;
  else if (index < currentCartIndex) currentCartIndex = Math.max(0, currentCartIndex - 1);

  saveTechToLocal();
  renderTechAll();
}

/* ---------------------------
   Shift + issue wiring
--------------------------- */
function wireShiftButtons(cart, cardEl) {
  const buttons = cardEl.querySelectorAll(".shiftBtn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      cart.shift = btn.getAttribute("data-shift");
      stampEdit(cart);

      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      renderAfterEdit(cardEl, cart);
    });
  });

  if (cart.shift) {
    buttons.forEach(b => {
      if (b.getAttribute("data-shift") === cart.shift) b.classList.add("active");
    });
  }
}

function syncIssueUI(cart, cardEl) {
  const issueCheckbox = cardEl.querySelector(".issueCheckbox");
  const noteRow = cardEl.querySelector(".issueNoteRow");
  const noteInput = cardEl.querySelector(".issueNoteInput");

  const apply = () => {
    cart.issue = issueCheckbox.checked;

    if (cart.issue) {
      noteRow.classList.remove("hidden");
      cardEl.style.outline = "4px solid rgba(244,162,27,.55)";
    } else {
      noteRow.classList.add("hidden");
      cart.issueNote = "";
      noteInput.value = "";
      cardEl.style.outline = "none";
    }

    stampEdit(cart);
    renderAfterEdit(cardEl, cart);
  };

  issueCheckbox.addEventListener("change", apply);
  noteInput.addEventListener("input", () => {
    cart.issueNote = noteInput.value;
    stampEdit(cart);
    renderAfterEdit(cardEl, cart);
  });

  issueCheckbox.checked = !!cart.issue;
  noteInput.value = cart.issueNote || "";
  apply();
}

/* ---------------------------
   Cards
--------------------------- */
function cartCardHTML(cart, index, isCurrent = false) {
  const status = computeVerificationPill(cart);

  const verifiedAtTime = cart.verifiedAt
    ? new Date(cart.verifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const statusLine = `${status.pill}${verifiedAtTime ? ` · ${verifiedAtTime}` : ""}`;

  return `
    <div class="cartCard ${isCurrent ? "current" : ""}" data-index="${index}">
      <div class="cartHeader">
        <div>
          <div class="cartTitle">Cart # ${escapeHtml(cart.cartNo)}</div>
          <div class="cartSub">${escapeHtml(cart.cartType)} • ${escapeHtml(cart.department)} • ${escapeHtml(statusLine)}</div>
        </div>
        <div class="cartActions noPrint">
          <button class="iconBtn removeBtn" type="button" title="Remove">✕</button>
        </div>
      </div>

      <section class="sticker sticker--lime">
        <div class="sticker__title">Crash Cart Check</div>
        <div class="sticker__rule"></div>

        <div class="formRow">
          <div class="label">Earliest supply expiration:</div>
          <input class="underline supplyName" placeholder="Supply item" value="${escapeHtml(cart.supplyName)}" />
        </div>

        <div class="formRow">
          <div class="label">Expiration date:</div>
          <input class="underline supplyExp" type="date" value="${escapeHtml(cart.supplyExp)}" />
        </div>

        <div class="formRow">
          <div class="label">Date checked:</div>
          <input class="underline checkDate" type="date" value="${escapeHtml(cart.checkDate)}" />
        </div>

        <div class="formRow">
          <div class="label">Checked by:</div>
          <input class="underline checkedBy" placeholder="Initials / Name" value="${escapeHtml(cart.checkedBy)}" />
        </div>

        <div class="shiftRow">
          <span class="shiftLabel">Shift (required):</span>
          <div class="shiftPills">
            <button type="button" class="shiftBtn" data-shift="Day">Day</button>
            <button type="button" class="shiftBtn" data-shift="Evening">Evening</button>
            <button type="button" class="shiftBtn" data-shift="Night">Night</button>
          </div>
        </div>

        <div class="issueRow">
          <label class="issueToggle">
            <input type="checkbox" class="issueCheckbox" ${cart.issue ? "checked" : ""} />
            <span>⚠️ Exception</span>
          </label>
          <span class="issueHint">Needs review</span>
        </div>

        <div class="issueNoteRow ${cart.issue ? "" : "hidden"}">
          <input class="issueNoteInput" maxlength="60"
            placeholder="Add note (optional)"
            value="${escapeHtml(cart.issueNote || "")}"
          />
        </div>
      </section>

      <section class="sticker sticker--orange">
        <div class="sticker__titleSmall">Crash Cart Check</div>
        <div class="sticker__rule"></div>

        <div class="formRow">
          <div class="label">Earliest medication expiration:</div>
          <input class="underline drugExp" type="date" value="${escapeHtml(cart.drugExp)}" />
        </div>

        <div class="formRow">
          <div class="label">Medication name:</div>
          <input class="underline drugName" placeholder="Medication" type="text"
            autocomplete="off" autocapitalize="words" spellcheck="false"
            value="${escapeHtml(cart.drugName)}" />
        </div>

        <div class="stickerFooter">
          <button type="button" class="saveStickerBtn">VERIFI</button>
        </div>
      </section>
    </div>
  `;
}

function renderCartCards() {
  if (!cartList) return;

  cartList.innerHTML = round.carts
    .map((c, i) => cartCardHTML(c, i, i === currentCartIndex))
    .join("");

  cartList.querySelectorAll(".cartCard").forEach((cardEl) => {
    const idx = Number(cardEl.getAttribute("data-index"));
    const cart = round.carts[idx];

    cardEl.querySelector(".removeBtn")?.addEventListener("click", () => removeCart(idx));

    const supplyName = cardEl.querySelector(".supplyName");
    const supplyExp = cardEl.querySelector(".supplyExp");
    const checkDate = cardEl.querySelector(".checkDate");
    const checkedBy = cardEl.querySelector(".checkedBy");
    const drugExp = cardEl.querySelector(".drugExp");
    const drugName = cardEl.querySelector(".drugName");

    supplyName.addEventListener("input", () => {
      cart.supplyName = supplyName.value;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });

    supplyExp.addEventListener("change", () => {
      cart.supplyExp = supplyExp.value;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });

    checkDate.addEventListener("change", () => {
      cart.checkDate = checkDate.value;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });

    checkedBy.addEventListener("input", () => {
      cart.checkedBy = checkedBy.value;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });

    drugExp.addEventListener("change", () => {
      cart.drugExp = drugExp.value;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });

    drugName.addEventListener("input", () => {
      cart.drugName = drugName.value;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });

    wireShiftButtons(cart, cardEl);
    syncIssueUI(cart, cardEl);

    // VERIFI button -> save + scroll to setup + focus Cart ID
    const verifiBtn = cardEl.querySelector(".saveStickerBtn");
    verifiBtn?.addEventListener("click", () => {
      stampEdit(cart);
      saveTechToLocal();
      showToast("VERIFIED ✓");

      const target = setupPanel || cartTypeTabs?.closest(".panel") || cartTypeTabs;
      if (target) {
        setTimeout(() => {
          scrollToEl(target);
          setTimeout(() => cartNumberInput?.focus(), 200);
        }, 60);
      }
    });
  });
}

/* ---------------------------
   Summary table
--------------------------- */
function groupByDepartment(rows) {
  const map = new Map();
  rows.forEach(r => {
    const dept = r.department || "Unassigned";
    if (!map.has(dept)) map.set(dept, []);
    map.get(dept).push(r);
  });
  return Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0]));
}

function renderNursingTable(targetEl, rows) {
  if (!targetEl) return;

  if (rows.length === 0) {
    targetEl.innerHTML = `<div style="color:rgba(234,242,247,.65); padding:10px;">No issues detected.</div>`;
    return;
  }

  const groups = groupByDepartment(rows);

  targetEl.innerHTML = groups.map(([dept, items]) => {
    const tableRows = items.map(cart => {
      const status = computeVerificationPill(cart);
      const supplyExp = cart.supplyExp || "—";
      const drugExp = cart.drugExp || "—";
      const checkedBy = cart.checkedBy || "—";
      const checkDate = cart.checkDate || "—";
      const shift = cart.shift || "—";
      const noteIcon = cart.issue && cart.issueNote ? " 📝" : "";

      return `
        <tr>
          <td>${escapeHtml(cart.cartNo || "—")}</td>
          <td>${escapeHtml(supplyExp)}</td>
          <td>${escapeHtml(drugExp)}</td>
          <td>${escapeHtml(checkedBy)} • ${escapeHtml(checkDate)} • ${escapeHtml(shift)}${noteIcon}</td>
          <td><span class="statusPill ${escapeHtml(status.cls)}">${escapeHtml(status.pill)}</span></td>
        </tr>
      `;
    }).join("");

    return `
      <div class="groupHeader">${escapeHtml(dept)}</div>
      <table class="nurseTable">
        <thead>
          <tr>
            <th>Cart ID</th>
            <th>Supply Exp</th>
            <th>Medication Exp</th>
            <th>Verification</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `;
  }).join("");
}

function renderTechNursingLog() {
  const scoped = round.carts.filter(c => c.cartType === round.cartType);
  const rows = showAll ? scoped : scoped.filter(isException);

  let meta = showAll ? "Showing all" : "Showing exceptions only";

  const openedAt = round.verificationWindowOpenedAt
    ? `Started ${formatTimeHM(round.verificationWindowOpenedAt)}`
    : "";
  const closedAt = round.verificationWindowClosedAt
    ? `Ended ${formatTimeHM(round.verificationWindowClosedAt)}`
    : "";

  const windowLine = [openedAt, closedAt].filter(Boolean).join(" • ");
  if (windowLine) meta += ` • ${windowLine}`;

  if (nursingMeta) nursingMeta.textContent = meta;
  renderNursingTable(nursingLogContainer, rows);
}

function renderTechNursingLogForPrint() {
  $("printCartType").textContent = round.cartType;

  const generated = new Date().toLocaleString();
  const openedAt = round.verificationWindowOpenedAt
    ? `Started ${formatTimeHM(round.verificationWindowOpenedAt)}`
    : "";
  const closedAt = round.verificationWindowClosedAt
    ? `Ended ${formatTimeHM(round.verificationWindowClosedAt)}`
    : "";
  const eventType = round.verificationEventType || "";
  const windowLine = [eventType, openedAt, closedAt].filter(Boolean).join(" • ");
  const suffix = windowLine ? ` • ${windowLine}` : "";

  $("printGeneratedAt").textContent = generated + suffix;

  const scoped = round.carts.filter(c => c.cartType === round.cartType);
  const rows = showAll ? scoped : scoped.filter(isException);
  renderNursingTable(nursingLogPrintContainer, rows);
}

/* ---------------------------
   Impact metrics
--------------------------- */
function countGapsSurfaced(carts) {
  let gaps = 0;
  carts.forEach(c => {
    const s = computeVerificationPill(c);
    if (s.level !== "verified") gaps += 1;
  });
  return gaps;
}

function renderImpactMetrics() {
  if (!metricGaps || !metricPaper || !metricMoney) return;

  const all = round.carts;
  const verified = all.filter(isCartVerified);

  const gaps = countGapsSurfaced(all);
  const paperAvoided = verified.reduce((sum, cart) => sum + pagesPerVerificationForCart(cart), 0);

  const paperSavedDollars = paperAvoided * IMPACT.costPerPage;
  const laborSavedDollars = (verified.length * IMPACT.minutesSavedPerVerified / 60) * IMPACT.laborCostPerHour;
  const totalSaved = paperSavedDollars + laborSavedDollars;

  metricGaps.textContent = String(gaps);
  metricPaper.textContent = String(paperAvoided);
  metricMoney.textContent = formatMoney(totalSaved);
}

/* ---------------------------
   Local save/load
--------------------------- */
function migrateRound(parsed) {
  if (typeof parsed.verificationWindowOpenedAt === "undefined") parsed.verificationWindowOpenedAt = null;
  if (typeof parsed.verificationWindowClosedAt === "undefined") parsed.verificationWindowClosedAt = null;
  if (typeof parsed.verificationEventType === "undefined") parsed.verificationEventType = "Unspecified";

  if (Array.isArray(parsed.carts)) {
    parsed.carts.forEach(c => {
      if (typeof c.verifiedAt === "undefined") c.verifiedAt = null;
      if (typeof c.lastEditedAt === "undefined") c.lastEditedAt = null;
    });
  }
  return parsed;
}

function saveTechToLocal() {
  try {
    localStorage.setItem(LOCAL_KEY_TECH, JSON.stringify(round));
    return true;
  } catch {
    showToast("⚠️ Auto-save failed (storage blocked).");
    return false;
  }
}

function loadTechFromLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY_TECH);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.cartType || !Array.isArray(parsed.carts)) return false;
    round = migrateRound(parsed);
    return true;
  } catch { return false; }
}

function loadNurseFromLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY_NURSE);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return false;
    nurseLog = parsed;
    return true;
  } catch { return false; }
}

function downloadJSON(data, filename = "verifi_verification_record.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------------
   Main render
--------------------------- */
function renderTechAll() {
  renderWindowMeta();
  renderDepartmentOptions();
  renderRoundMeta();
  renderCartCards();
  renderTechNursingLog();
  renderImpactMetrics();
}

/* ---------------------------
   Events
--------------------------- */
cartTypeTabs?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-type]");
  if (!btn) return;

  round.cartType = btn.getAttribute("data-type");
  document.querySelectorAll("#cartTypeTabs .tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");

  renderDepartmentOptions();
  saveTechToLocal();
  renderTechAll();
});

departmentSelect?.addEventListener("change", () => {
  round.department = departmentSelect.value;
  saveTechToLocal();
  renderTechAll();
});

addCartBtn?.addEventListener("click", () => addCart(cartNumberInput.value));
cartNumberInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addCart(cartNumberInput.value);
});

clearRoundBtn?.addEventListener("click", () => {
  if (!confirm("Reset this verification? This clears all carts on this screen.")) return;
  round.carts = [];
  currentCartIndex = -1;
  saveTechToLocal();
  renderTechAll();
  showToast("Cleared.");
});

exportJsonBtn?.addEventListener("click", () => {
  if (!requireClosedWindowOrConfirm("export")) return;

  const all = round.carts;
  const verified = all.filter(isCartVerified);

  const exportRecord = {
    ...round,
    impact: {
      scope: "GLOBAL",
      gapsSurfaced: countGapsSurfaced(all),
      paperAvoidedPages: verified.reduce((sum, cart) => sum + pagesPerVerificationForCart(cart), 0),
      assumptions: { ...IMPACT }
    }
  };

  downloadJSON(exportRecord, `verifi_GLOBAL_verification_record.json`);
  showToast("Exported JSON.");
});

showAllToggle?.addEventListener("change", () => {
  showAll = showAllToggle.checked;
  renderTechNursingLog();
});

printPdfBtn?.addEventListener("click", () => {
  if (!requireClosedWindowOrConfirm("export/print")) return;
  renderTechNursingLogForPrint();
  window.print();
});

readyToggle?.addEventListener("change", () => {
  const open = readyToggle.checked;

  if (open) {
    round.verificationWindowOpenedAt = new Date().toISOString();
    round.verificationWindowClosedAt = null;
    round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);
    saveTechToLocal();
    renderTechAll();
    showToast("Window opened.");
    setTimeout(() => cartNumberInput?.focus(), 50);
  } else {
    round.verificationWindowClosedAt = new Date().toISOString();
    saveTechToLocal();
    renderTechAll();
    showToast("Window closed.");
  }
});

/* ===========================
   NURSING MODULE
=========================== */
const nurseUnitName = $("nurseUnitName");
const nurseMonth = $("nurseMonth");
const nurseAddRowBtn = $("nurseAddRowBtn");
const nurseSaveBtn = $("nurseSaveBtn");
const nursePrintBtn = $("nursePrintBtn");
const nurseClearBtn = $("nurseClearBtn");
const nurseTableWrap = $("nurseTableWrap");
const nursePrintTableWrap = $("nursePrintTableWrap");
const nursePaperMeta = $("nursePaperMeta");

let nurseLog = { unitName: "", month: "", rows: [] };

const NURSE_COLS = [
  { key:"day", label:"Day" },
  { key:"lockNo", label:"Cart Lock #" },
  { key:"sealed", label:"Cart Sealed" },
  { key:"plugged", label:"Cart Plugged" },
  { key:"defib", label:"Defib Test" },
  { key:"supplyExpPresent", label:"Supplies Exp Date Present" },
  { key:"medExpPresent", label:"Med Drawer Exp Date Present" },
  { key:"contents", label:"Contents Listed" },
  { key:"suction", label:"Suction OK" },
  { key:"o2", label:"O₂ Green Zone" },
  { key:"signature", label:"Signature" }
];

function todayDayOfMonth() { return String(new Date().getDate()); }
function newNurseRow(day) {
  return {
    day: day || todayDayOfMonth(),
    lockNo: "",
    sealed: false,
    plugged: false,
    defib: false,
    supplyExpPresent: false,
    medExpPresent: false,
    contents: false,
    suction: false,
    o2: false,
    signature: ""
  };
}

function saveNurseToLocal() {
  nurseLog.unitName = nurseUnitName?.value || "";
  nurseLog.month = nurseMonth?.value || "";
  try { localStorage.setItem(LOCAL_KEY_NURSE, JSON.stringify(nurseLog)); } catch {}
  if (nursePaperMeta) nursePaperMeta.textContent = `Saved • ${nurseLog.rows.length} row(s)`;
}

function renderNurseTable(targetEl, rows, isPrint=false) {
  if (!targetEl) return;

  const th = NURSE_COLS.map(c => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows.map((r, idx) => {
    const tds = NURSE_COLS.map(col => {
      if (col.key === "day") {
        return isPrint
          ? `<td>${escapeHtml(r.day)}</td>`
          : `<td><input class="paperInput" data-i="${idx}" data-k="day" value="${escapeHtml(r.day)}" /></td>`;
      }
      if (col.key === "lockNo" || col.key === "signature") {
        return isPrint
          ? `<td>${escapeHtml(r[col.key] || "")}</td>`
          : `<td><input class="paperInput" data-i="${idx}" data-k="${col.key}" value="${escapeHtml(r[col.key] || "")}" /></td>`;
      }
      return isPrint
        ? `<td>${r[col.key] ? "Y" : ""}</td>`
        : `<td><input class="paperChk" type="checkbox" data-i="${idx}" data-k="${col.key}" ${r[col.key] ? "checked" : ""} /></td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  targetEl.innerHTML = `
    <table class="paperTable">
      <thead><tr>${th}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;

  if (isPrint) return;

  targetEl.querySelectorAll("input.paperInput").forEach(inp => {
    inp.addEventListener("input", () => {
      const i = Number(inp.getAttribute("data-i"));
      const k = inp.getAttribute("data-k");
      nurseLog.rows[i][k] = inp.value;
      saveNurseToLocal();
    });
  });

  targetEl.querySelectorAll("input.paperChk").forEach(chk => {
    chk.addEventListener("change", () => {
      const i = Number(chk.getAttribute("data-i"));
      const k = chk.getAttribute("data-k");
      nurseLog.rows[i][k] = chk.checked;
      saveNurseToLocal();
    });
  });
}

function renderNurseAll() {
  if (nurseUnitName) nurseUnitName.value = nurseLog.unitName || "";
  if (nurseMonth) nurseMonth.value = nurseLog.month || "";
  renderNurseTable(nurseTableWrap, nurseLog.rows, false);
}

nurseAddRowBtn?.addEventListener("click", () => {
  nurseLog.rows.unshift(newNurseRow(todayDayOfMonth()));
  saveNurseToLocal();
  renderNurseAll();
});
nurseSaveBtn?.addEventListener("click", () => {
  saveNurseToLocal();
  showToast("Nursing log saved.");
});
nurseClearBtn?.addEventListener("click", () => {
  if (!confirm("Reset this month? This clears all rows.")) return;
  nurseLog.rows = [];
  saveNurseToLocal();
  renderNurseAll();
  showToast("Month cleared.");
});
nursePrintBtn?.addEventListener("click", () => {
  if (!requireClosedWindowOrConfirm("print")) return;
  $("nursePrintUnit").textContent = nurseUnitName?.value || "—";
  $("nursePrintMonth").textContent = nurseMonth?.value || "—";
  renderNurseTable(nursePrintTableWrap, nurseLog.rows, true);
  window.print();
});

/* ---------------------------
   Utilities
--------------------------- */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------------------
   Init
--------------------------- */
(function init() {
  // Tech
  loadTechFromLocal();
  renderDepartmentOptions();

  if (!round.department) round.department = (DEPARTMENTS[round.cartType] || [])[0] || "";

  document.querySelectorAll("#cartTypeTabs .tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`#cartTypeTabs .tab[data-type="${CSS.escape(round.cartType)}"]`)?.classList.add("active");
  if (departmentSelect) departmentSelect.value = round.department;

  currentCartIndex = round.carts.length ? round.carts.length - 1 : -1;

  if (readyToggle) readyToggle.checked = isWindowOpen();

  if (round.verificationWindowOpenedAt && (!round.verificationEventType || round.verificationEventType === "Unspecified")) {
    round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);
  }

  renderTechAll();

  // Nursing
  loadNurseFromLocal();
  if (!nurseLog.month) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    nurseLog.month = `${now.getFullYear()}-${mm}`;
  }
  renderNurseAll();

  showScreen("tech");
})();
