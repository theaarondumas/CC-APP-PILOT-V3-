/* ===========================
   Verifi — Crash Cart Verification
   BUILD: 20260110-01
   Fixes:
   - Cache proof (visible build ID)
   - Auto-save visible (Saved ✓)
   - iOS-proof auto-scroll to newest card
   - Error toasts (no silent failure)
   =========================== */

const BUILD_ID = "20260110-01";
const $ = (id) => document.getElementById(id);

const LOCAL_KEY_TECH = "verifi_pilot_round_v1";
const LOCAL_KEY_NURSE = "verifi_pilot_nurse_log_v1";

/* ---------------------------
   Toast + inline status
--------------------------- */
const toastEl = $("toast");
let toastTimer = null;

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = String(msg || "");
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function setInlineStatus(msg) {
  const el = $("inlineStatus");
  if (!el) return;
  el.textContent = msg ? String(msg) : "";
}

// Show runtime errors as toasts
window.addEventListener("error", (e) => {
  showToast(`JS error: ${e?.message || "unknown"}`);
});
window.addEventListener("unhandledrejection", (e) => {
  showToast(`Promise error: ${e?.reason?.message || "unknown"}`);
});

/* ---------------------------
   Cache proof: show build on screen
--------------------------- */
(function showBuild() {
  const el = $("buildId");
  if (el) el.textContent = `Build: ${BUILD_ID} (loaded)`;
  console.log("Verifi build loaded:", BUILD_ID);
})();

/* ---------------------------
   iOS-proof scroll helper
--------------------------- */
function scrollToEl(el) {
  if (!el) return;

  // 1) Try element scrollIntoView
  try {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    try { el.scrollIntoView(true); } catch {}
  }

  // 2) Force exact Y position (iOS sometimes ignores #1)
  setTimeout(() => {
    try {
      const y = el.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: y, behavior: "smooth" });
    } catch {}
  }, 60);

  // 3) Final hard fallback
  setTimeout(() => {
    try {
      const y = el.offsetTop - 12;
      window.scrollTo(0, y);
    } catch {}
  }, 120);
}

/* ---------------------------
   Local save with explicit success/fail
--------------------------- */
function saveTechToLocal() {
  try {
    localStorage.setItem(LOCAL_KEY_TECH, JSON.stringify(round));
    return true;
  } catch (e) {
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
  } catch {
    return false;
  }
}

let lastSaveToastAt = 0;
function toastSavedThrottled() {
  const now = Date.now();
  if (now - lastSaveToastAt < 1200) return;
  lastSaveToastAt = now;
  showToast("Saved ✓");
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
    techView.classList.add("hidden");
    nursingView.classList.remove("hidden");
    navTech.classList.remove("active");
    navNursing.classList.add("active");
  } else {
    nursingView.classList.add("hidden");
    techView.classList.remove("hidden");
    navNursing.classList.remove("active");
    navTech.classList.add("active");
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
const windowPanel = $("windowPanel");
const windowStatusPill = $("windowStatusPill");

const roundMeta = $("roundMeta");
const cartList = $("cartList");

const nursingMeta = $("nursingMeta");
const nursingLogContainer = $("nursingLogContainer");
const nursingLogPrintContainer = $("nursingLogPrintContainer");
const showAllToggle = $("showAllToggle");
const printPdfBtn = $("printPdfBtn");

const scanBtn = $("scanBtn");

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
  return PAPER_PAGES_BY_DEPT[cart.department || ""] ?? DEFAULT_PAGES_PER_VERIFICATION;
}

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
function inferVerificationEventType(isoOpenedAt) {
  if (!isoOpenedAt) return "Unspecified";
  const d = new Date(isoOpenedAt);
  if (Number.isNaN(d.getTime())) return "Unspecified";
  return d.getDay() === 3 ? "Routine weekly" : "Post-use update";
}

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

function isCartVerified(cart) {
  return !!String(cart.checkedBy||"").trim()
    && !!String(cart.checkDate||"").trim()
    && !!String(cart.shift||"").trim()
    && !!String(cart.supplyExp||"").trim()
    && !!String(cart.supplyName||"").trim()
    && !!String(cart.drugExp||"").trim()
    && !!String(cart.drugName||"").trim();
}

function stampEdit(cart) {
  cart.lastEditedAt = new Date().toISOString();
  if (isCartVerified(cart) && !cart.verifiedAt) cart.verifiedAt = new Date().toISOString();
}

function computeVerificationPill(cart) {
  if (!isCartVerified(cart)) return { pill: "Not verified", cls: "notVerified", level: "notVerified" };
  if (cart.issue) return { pill: "Needs review", cls: "review", level: "review" };
  return { pill: "Verified", cls: "verified", level: "verified" };
}
function isException(cart) {
  return computeVerificationPill(cart).level !== "verified";
}

function updateCartHeaderStatus(cardEl, cart) {
  const subEl = cardEl.querySelector(".cartSub");
  if (!subEl) return;
  const s = computeVerificationPill(cart);
  subEl.textContent = `${cart.cartType} • ${cart.department} • ${s.pill}`;
}

function renderAfterEdit(cardEl, cart) {
  updateCartHeaderStatus(cardEl, cart);
  renderRoundMeta();
  renderTechNursingLog();
  renderImpactMetrics();
  const ok = saveTechToLocal();
  if (ok) toastSavedThrottled();
}

function openVerificationWindowIfNeeded() {
  const isOpen = !!round.verificationWindowOpenedAt && !round.verificationWindowClosedAt;
  if (isOpen) return;
  round.verificationWindowOpenedAt = new Date().toISOString();
  round.verificationWindowClosedAt = null;
  round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);
  if (readyToggle) readyToggle.checked = true;
}

function renderWindowMeta() {
  if (!windowMeta) return;
  const opened = round.verificationWindowOpenedAt ? `Started ${formatTimeHM(round.verificationWindowOpenedAt)}` : "";
  const closed = round.verificationWindowClosedAt ? `Ended ${formatTimeHM(round.verificationWindowClosedAt)}` : "";
  const isOpen = !!round.verificationWindowOpenedAt && !round.verificationWindowClosedAt;
  const openState = isOpen ? "Active" : "";
  const eventType = round.verificationEventType || "";
  const parts = [eventType, opened, closed, openState].filter(Boolean);
  windowMeta.textContent = parts.length ? parts.join(" • ") : "";
}

function renderVerificationWindowUI() {
  const isOpen = !!round.verificationWindowOpenedAt && !round.verificationWindowClosedAt;
  if (readyToggle) readyToggle.checked = isOpen;
  windowPanel?.classList.toggle("open", isOpen);
  if (windowStatusPill) {
    windowStatusPill.className = `statusPill ${isOpen ? "verified" : "notVerified"}`;
    windowStatusPill.textContent = isOpen ? "Open" : "Closed";
  }
  setInlineStatus(isOpen ? "Window open — add carts as you walk." : "");
}

function renderDepartmentOptions() {
  const opts = DEPARTMENTS[round.cartType] || [];
  departmentSelect.innerHTML = opts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
  if (!opts.includes(round.department)) round.department = opts[0] || "";
  departmentSelect.value = round.department;
}

function renderRoundMeta() {
  const c = round.carts.length;
  roundMeta.textContent = c === 0 ? "No carts in progress" : `${round.cartType} • ${round.department} • ${c} cart${c>1?"s":""}`;
}

function addCart(cartNo) {
  try {
    showToast("Add pressed (debug)"); // proves the new code is running

    const cleaned = String(cartNo).trim();
    if (!cleaned) {
      showToast("Enter a Cart ID first.");
      cartNumberInput.focus();
      return;
    }

    const dup = round.carts.some(c => c.cartNo === cleaned && c.department === round.department && c.cartType === round.cartType);
    if (dup) {
      cartNumberInput.value = "";
      cartNumberInput.placeholder = "Duplicate — already added";
      showToast("Duplicate ID detected.");
      return;
    }

    if (round.carts.length === 0) {
      openVerificationWindowIfNeeded();
      showToast("Verification window opened.");
    }

    round.carts.push(newCart(cleaned));
    currentCartIndex = round.carts.length - 1;

    cartNumberInput.value = "";
    cartNumberInput.placeholder = "Enter cart ID (numbers)";

    saveTechToLocal();
    renderTechAll();

    // Strongest iOS-safe scroll sequence
    setTimeout(() => {
      const cards = cartList?.querySelectorAll(".cartCard");
      const last = cards?.[cards.length - 1];
      if (!last) {
        showToast("No card found (debug)");
        return;
      }
      scrollToEl(last);
      const firstField = last.querySelector(".supplyName");
      if (firstField) setTimeout(() => firstField.focus(), 250);
    }, 80);

    showToast("Cart added ✔︎");
  } catch (e) {
    showToast(`Add failed: ${e?.message || "unknown"}`);
  }
}

function removeCart(index) {
  round.carts.splice(index, 1);
  currentCartIndex = round.carts.length ? round.carts.length - 1 : -1;
  saveTechToLocal();
  renderTechAll();
}

function cartCardHTML(cart, index, isCurrent=false) {
  const s = computeVerificationPill(cart);
  return `
    <div class="cartCard ${isCurrent ? "current" : ""}" data-index="${index}">
      <div class="cartHeader">
        <div>
          <div class="cartTitle">Cart # ${escapeHtml(cart.cartNo)}</div>
          <div class="cartSub">${escapeHtml(cart.cartType)} • ${escapeHtml(cart.department)} • ${escapeHtml(s.pill)}</div>
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
      </section>
    </div>
  `;
}

function renderCartCards() {
  cartList.innerHTML = round.carts.map((c,i) => cartCardHTML(c,i, i===currentCartIndex)).join("");

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
    const issueCheckbox = cardEl.querySelector(".issueCheckbox");
    const issueNoteInput = cardEl.querySelector(".issueNoteInput");
    const shiftBtns = cardEl.querySelectorAll(".shiftBtn");

    supplyName.addEventListener("input", () => { cart.supplyName = supplyName.value; stampEdit(cart); renderAfterEdit(cardEl, cart); });
    supplyExp.addEventListener("change", () => { cart.supplyExp = supplyExp.value; stampEdit(cart); renderAfterEdit(cardEl, cart); });
    checkDate.addEventListener("change", () => { cart.checkDate = checkDate.value; stampEdit(cart); renderAfterEdit(cardEl, cart); });
    checkedBy.addEventListener("input", () => { cart.checkedBy = checkedBy.value; stampEdit(cart); renderAfterEdit(cardEl, cart); });
    drugExp.addEventListener("change", () => { cart.drugExp = drugExp.value; stampEdit(cart); renderAfterEdit(cardEl, cart); });
    drugName.addEventListener("input", () => { cart.drugName = drugName.value; stampEdit(cart); renderAfterEdit(cardEl, cart); });

    shiftBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        cart.shift = btn.getAttribute("data-shift") || "";
        stampEdit(cart);
        shiftBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderAfterEdit(cardEl, cart);
      });
      if (cart.shift && btn.getAttribute("data-shift") === cart.shift) btn.classList.add("active");
    });

    issueCheckbox.addEventListener("change", () => {
      cart.issue = issueCheckbox.checked;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });

    issueNoteInput?.addEventListener("input", () => {
      cart.issueNote = issueNoteInput.value;
      stampEdit(cart);
      renderAfterEdit(cardEl, cart);
    });
  });
}

function renderNursingTable(targetEl, rows) {
  if (!targetEl) return;
  if (rows.length === 0) {
    targetEl.innerHTML = `<div style="color:rgba(234,242,247,.65); padding:10px;">No issues detected.</div>`;
    return;
  }
  targetEl.innerHTML = `<div style="color:rgba(234,242,247,.65); padding:10px;">(Summary table unchanged in this debug build)</div>`;
}

function renderTechNursingLog() {
  const scoped = round.carts.filter(c => c.cartType === round.cartType);
  const rows = showAll ? scoped : scoped.filter(isException);
  nursingMeta.textContent = showAll ? "Showing all" : "Showing exceptions only";
  renderNursingTable(nursingLogContainer, rows);
}

function renderImpactMetrics() {
  if (!metricGaps || !metricPaper || !metricMoney) return;

  const all = round.carts;
  const verified = all.filter(isCartVerified);
  metricGaps.textContent = String(all.filter(c => computeVerificationPill(c).level !== "verified").length);
  metricPaper.textContent = String(verified.reduce((sum, cart) => sum + pagesPerVerificationForCart(cart), 0));
  metricMoney.textContent = formatMoney(0);
}

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

function renderTechAll() {
  renderWindowMeta();
  renderVerificationWindowUI();
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
  if (!confirm("Reset this verification? This clears all carts.")) return;
  round.carts = [];
  currentCartIndex = -1;
  saveTechToLocal();
  renderTechAll();
  showToast("Cleared.");
});

readyToggle?.addEventListener("change", () => {
  const open = readyToggle.checked;
  if (open) {
    round.verificationWindowOpenedAt = new Date().toISOString();
    round.verificationWindowClosedAt = null;
    round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);
    saveTechToLocal();
    renderTechAll();
    showToast("Verification window opened.");
  } else {
    round.verificationWindowClosedAt = new Date().toISOString();
    saveTechToLocal();
    renderTechAll();
    showToast("Verification window closed.");
  }
});

showAllToggle?.addEventListener("change", () => {
  showAll = showAllToggle.checked;
  renderTechNursingLog();
});

printPdfBtn?.addEventListener("click", () => window.print());

scanBtn?.addEventListener("click", () => {
  showToast("Scan coming soon — enter Cart ID for now.");
  cartNumberInput?.focus();
});

/* ---------------------------
   Minimal nursing module kept as-is for now
   (Your full nursing module can be reinserted after we confirm tech scroll/save)
--------------------------- */
(function init() {
  loadTechFromLocal();
  renderDepartmentOptions();

  if (!round.department) round.department = (DEPARTMENTS[round.cartType] || [])[0] || "";
  departmentSelect.value = round.department;

  currentCartIndex = round.carts.length ? round.carts.length - 1 : -1;

  renderTechAll();
  showScreen("tech");

  // quick proof on load
  showToast(`Build ${BUILD_ID} active`);
})();

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
