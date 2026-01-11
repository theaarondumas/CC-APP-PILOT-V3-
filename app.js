const $ = (id) => document.getElementById(id);

const LOCAL_KEY_TECH = "verifi_pilot_round_v1";
const LOCAL_KEY_NURSE = "verifi_pilot_nurse_log_v1";

/* Toast */
const toastEl = $("toast");
let toastTimer = null;
function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = String(msg || "");
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
}

/* iOS scroll helper */
function scrollToEl(el) {
  if (!el) return;
  try { el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  catch { try { el.scrollIntoView(true); } catch {} }
  setTimeout(() => {
    try {
      const y = el.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: y, behavior: "smooth" });
    } catch {}
  }, 60);
}

/* NAV */
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

/* TECH refs */
const cartTypeTabs = $("cartTypeTabs");
const departmentSelect = $("departmentSelect");
const cartNumberInput = $("cartNumberInput");
const addCartBtn = $("addCartBtn");
const atRiskBtn = $("atRiskBtn"); // NEW
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

const sortEntryBtn = $("sortEntryBtn");
const sortRiskBtn = $("sortRiskBtn");

const metricGaps = $("metricGaps");
const metricPaper = $("metricPaper");
const metricMoney = $("metricMoney");

let showAll = false;
let currentCartIndex = -1;
let cartSortMode = "entry"; // entry|risk

const IMPACT = { costPerPage: 0.06, minutesSavedPerVerified: 2.0, laborCostPerHour: 35 };

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

/* helpers */
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
function isWindowOpen() {
  return !!round.verificationWindowOpenedAt && !round.verificationWindowClosedAt;
}

/* Security gate */
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

/* cart model */
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

/* verification */
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

/* Expiry math */
const DUE_SOON_DAYS = 30;
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function parseISODate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
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

/* Enterprise badge wording + days */
function dateRiskLabel(dateStr) {
  if (!dateStr) return { cls: "", label: "—" };
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { cls: "", label: "—" };

  const today = startOfToday();
  const daysLeft = daysBetween(today, d);

  if (daysLeft < 0) {
    const over = Math.abs(daysLeft);
    return { cls: "expired", label: `NON-COMPLIANT · ${over} DAY${over===1?"":"S"} OVER` };
  }
  if (daysLeft <= DUE_SOON_DAYS) {
    return { cls: "soon", label: `ATTENTION REQUIRED · ${daysLeft} DAY${daysLeft===1?"":"S"}` };
  }
  return { cls: "good", label: "COMPLIANT" };
}

function updateStickerBadges(cardEl, cart) {
  const supply = dateRiskLabel(cart.supplyExp);
  const drug = dateRiskLabel(cart.drugExp);

  const sEl = cardEl.querySelector(".supplyRiskBadge");
  const dEl = cardEl.querySelector(".drugRiskBadge");

  if (sEl) { sEl.className = `expBadge ${supply.cls}`; sEl.textContent = supply.label; }
  if (dEl) { dEl.className = `expBadge ${drug.cls}`; dEl.textContent = drug.label; }
}

/* Summary pill */
function computeVerificationPill(cart) {
  if (!isCartVerified(cart)) return { level:"notVerified", pill:"Not verified", cls:"notVerified" };
  const risk = computeExpiryRisk(cart);
  if (cart.issue || risk.level === "overdue" || risk.level === "dueSoon") return { level:"review", pill:"Needs review", cls:"review" };
  return { level:"verified", pill:"Verified", cls:"verified" };
}
function isException(cart) { return computeVerificationPill(cart).level !== "verified"; }

/* Risk sorting */
function earliestExpiryDate(cart) {
  return earliestDate(parseISODate(cart.supplyExp), parseISODate(cart.drugExp));
}
function daysLeftToEarliestExpiry(cart) {
  const next = earliestExpiryDate(cart);
  if (!next) return Number.POSITIVE_INFINITY;
  return daysBetween(startOfToday(), next);
}
function riskSortScore(cart) {
  if (cart.issue) return 0;
  const risk = computeExpiryRisk(cart);
  if (risk.level === "overdue") return 0;
  if (risk.level === "dueSoon") return 1;
  if (!isCartVerified(cart)) return 2;
  return 3;
}
function sortByHighestRiskFirst(a, b) {
  const sa = riskSortScore(a), sb = riskSortScore(b);
  if (sa !== sb) return sa - sb;
  const da = daysLeftToEarliestExpiry(a), db = daysLeftToEarliestExpiry(b);
  if (da !== db) return da - db;
  return String(a.cartNo||"").localeCompare(String(b.cartNo||""));
}
function scrollToFirstNonCompliantCard() {
  const indices = round.carts.map((_, i) => i);
  indices.sort((ia, ib) => sortByHighestRiskFirst(round.carts[ia], round.carts[ib]));
  const first = indices.find(i => riskSortScore(round.carts[i]) === 0);
  if (first === undefined) return;
  setTimeout(() => {
    const el = cartList?.querySelector(`.cartCard[data-index="${first}"]`);
    if (el) scrollToEl(el);
  }, 80);
}

/* NEW: AT RISK scroll (anything riskScore < 3) */
function scrollToFirstAtRiskCard() {
  const indices = round.carts.map((_, i) => i);
  indices.sort((ia, ib) => sortByHighestRiskFirst(round.carts[ia], round.carts[ib]));
  const first = indices.find(i => riskSortScore(round.carts[i]) < 3);
  if (first === undefined) { showToast("All carts compliant."); return; }
  setTimeout(() => {
    const el = cartList?.querySelector(`.cartCard[data-index="${first}"]`);
    if (el) {
      scrollToEl(el);
      showToast("At-risk cart surfaced.");
    }
  }, 80);
}

/* Render meta */
function renderWindowMeta() {
  if (!windowMeta) return;
  const opened = round.verificationWindowOpenedAt ? `Started ${formatTimeHM(round.verificationWindowOpenedAt)}` : "";
  const closed = round.verificationWindowClosedAt ? `Ended ${formatTimeHM(round.verificationWindowClosedAt)}` : "";
  const openState = isWindowOpen() ? "Active" : "";
  const eventType = round.verificationEventType || "";
  const parts = [eventType, opened, closed, openState].filter(Boolean);
  windowMeta.textContent = parts.join(" • ");
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

function openVerificationWindowIfNeeded() {
  if (isWindowOpen()) return;
  round.verificationWindowOpenedAt = new Date().toISOString();
  round.verificationWindowClosedAt = null;
  round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);
  readyToggle.checked = true;
}

/* CRUD */
function addCart(cartNo) {
  const cleaned = String(cartNo).trim();
  if (!cleaned) { showToast("Enter a Cart ID first."); cartNumberInput.focus(); return; }

  const dup = round.carts.some(c => c.cartNo === cleaned && c.department === round.department && c.cartType === round.cartType);
  if (dup) { cartNumberInput.value=""; cartNumberInput.placeholder="Duplicate — already added"; showToast("Duplicate ID detected."); return; }

  if (round.carts.length === 0) openVerificationWindowIfNeeded();

  round.carts.push(newCart(cleaned));
  currentCartIndex = round.carts.length - 1;

  cartNumberInput.value = "";
  cartNumberInput.placeholder = "Enter cart ID (numbers)";

  saveTechToLocal();
  renderTechAll();

  setTimeout(() => {
    const el = cartList.querySelector(`.cartCard[data-index="${currentCartIndex}"]`);
    if (el) scrollToEl(el);
  }, 60);

  showToast("Cart added ✔︎");
}

function removeCart(index) {
  round.carts.splice(index, 1);
  currentCartIndex = round.carts.length ? Math.min(currentCartIndex, round.carts.length-1) : -1;
  saveTechToLocal();
  renderTechAll();
}

/* Card HTML (HAS badge spans) */
function cartCardHTML(cart, index, isCurrent=false) {
  const status = computeVerificationPill(cart);
  return `
    <div class="cartCard ${isCurrent?"current":""}" data-index="${index}">
      <div class="cartHeader">
        <div>
          <div class="cartTitle">Cart # ${escapeHtml(cart.cartNo)}</div>
          <div class="cartSub">${escapeHtml(cart.cartType)} • ${escapeHtml(cart.department)} • ${escapeHtml(status.pill)}</div>
        </div>
        <div class="cartActions noPrint">
          <button class="iconBtn removeBtn" type="button" title="Remove">✕</button>
        </div>
      </div>

      <section class="sticker sticker--lime">
        <div class="stickerHeaderRow">
          <div class="sticker__title">Crash Cart Check</div>
          <span class="expBadge supplyRiskBadge">—</span>
        </div>
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
          <input class="issueNoteInput" maxlength="80" placeholder="Add note (optional)" value="${escapeHtml(cart.issueNote||"")}" />
        </div>
      </section>

      <section class="sticker sticker--orange">
        <div class="stickerHeaderRow">
          <div class="sticker__titleSmall">Crash Cart Check</div>
          <span class="expBadge drugRiskBadge">—</span>
        </div>
        <div class="sticker__rule"></div>

        <div class="formRow">
          <div class="label">Earliest medication expiration:</div>
          <input class="underline drugExp" type="date" value="${escapeHtml(cart.drugExp)}" />
        </div>
        <div class="formRow">
          <div class="label">Medication name:</div>
          <input class="underline drugName" placeholder="Medication" type="text" value="${escapeHtml(cart.drugName)}" />
        </div>

        <div class="stickerFooter">
          <button type="button" class="saveStickerBtn">VERIFI</button>
        </div>
      </section>
    </div>
  `;
}

/* Render cards with sort toggle */
function renderCartCards() {
  const indices = round.carts.map((_, i) => i);
  if (cartSortMode === "risk") indices.sort((ia, ib) => sortByHighestRiskFirst(round.carts[ia], round.carts[ib]));

  cartList.innerHTML = indices.map(i => cartCardHTML(round.carts[i], i, i===currentCartIndex)).join("");

  cartList.querySelectorAll(".cartCard").forEach(cardEl => {
    const idx = Number(cardEl.getAttribute("data-index"));
    const cart = round.carts[idx];

    updateStickerBadges(cardEl, cart);

    cardEl.querySelector(".removeBtn")?.addEventListener("click", () => removeCart(idx));

    const supplyName = cardEl.querySelector(".supplyName");
    const supplyExp  = cardEl.querySelector(".supplyExp");
    const checkDate  = cardEl.querySelector(".checkDate");
    const checkedBy  = cardEl.querySelector(".checkedBy");
    const drugExp    = cardEl.querySelector(".drugExp");
    const drugName   = cardEl.querySelector(".drugName");
    const issueChk   = cardEl.querySelector(".issueCheckbox");
    const issueNote  = cardEl.querySelector(".issueNoteInput");
    const shiftBtns  = cardEl.querySelectorAll(".shiftBtn");

    supplyName.addEventListener("input", ()=>{ cart.supplyName=supplyName.value; stampEdit(cart); updateStickerBadges(cardEl, cart); saveTechToLocal(); });
    supplyExp.addEventListener("change", ()=>{ cart.supplyExp=supplyExp.value; stampEdit(cart); updateStickerBadges(cardEl, cart); saveTechToLocal(); renderTechNursingLog(); renderImpactMetrics(); });
    checkDate.addEventListener("change", ()=>{ cart.checkDate=checkDate.value; stampEdit(cart); saveTechToLocal(); renderTechNursingLog(); renderImpactMetrics(); });
    checkedBy.addEventListener("input", ()=>{ cart.checkedBy=checkedBy.value; stampEdit(cart); saveTechToLocal(); renderTechNursingLog(); renderImpactMetrics(); });
    drugExp.addEventListener("change", ()=>{ cart.drugExp=drugExp.value; stampEdit(cart); updateStickerBadges(cardEl, cart); saveTechToLocal(); renderTechNursingLog(); renderImpactMetrics(); });
    drugName.addEventListener("input", ()=>{ cart.drugName=drugName.value; stampEdit(cart); saveTechToLocal(); renderTechNursingLog(); renderImpactMetrics(); });

    shiftBtns.forEach(btn=>{
      btn.addEventListener("click", ()=>{
        cart.shift = btn.getAttribute("data-shift") || "";
        stampEdit(cart);
        shiftBtns.forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        saveTechToLocal();
        renderTechNursingLog();
        renderImpactMetrics();
      });
      if (cart.shift && btn.getAttribute("data-shift")===cart.shift) btn.classList.add("active");
    });

    issueChk.addEventListener("change", ()=>{
      cart.issue = issueChk.checked;
      stampEdit(cart);
      if (!cart.issue) { cart.issueNote=""; issueNote.value=""; }
      saveTechToLocal();
      renderTechNursingLog();
      renderImpactMetrics();
    });

    issueNote.addEventListener("input", ()=>{
      cart.issueNote = issueNote.value;
      stampEdit(cart);
      saveTechToLocal();
      renderTechNursingLog();
      renderImpactMetrics();
    });

    cardEl.querySelector(".saveStickerBtn")?.addEventListener("click", ()=>{
      stampEdit(cart);
      saveTechToLocal();
      showToast("VERIFIED ✓");
      setTimeout(()=>{
        scrollToEl(setupPanel);
        setTimeout(()=>cartNumberInput.focus(), 200);
      }, 60);
    });
  });
}

/* Summary sorting */
function groupByDepartment(rows) {
  const map = new Map();
  rows.forEach(r=>{
    const dept = r.department || "Unassigned";
    if (!map.has(dept)) map.set(dept, []);
    map.get(dept).push(r);
  });
  return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
}

function renderNursingTable(targetEl, rows) {
  if (!targetEl) return;
  if (rows.length===0) {
    targetEl.innerHTML = `<div style="color:rgba(234,242,247,.65); padding:10px;">No issues detected.</div>`;
    return;
  }
  const groups = groupByDepartment(rows);
  targetEl.innerHTML = groups.map(([dept, items])=>{
    const trs = items.map(cart=>{
      const supplyExp = cart.supplyExp || "—";
      const drugExp = cart.drugExp || "—";
      const checkedBy = cart.checkedBy || "—";
      const checkDate = cart.checkDate || "—";
      const shift = cart.shift || "—";
      const noteIcon = cart.issue && cart.issueNote ? " 📝" : "";
      const st = computeVerificationPill(cart);
      return `
        <tr>
          <td>${escapeHtml(cart.cartNo||"—")}</td>
          <td>${escapeHtml(supplyExp)}</td>
          <td>${escapeHtml(drugExp)}</td>
          <td>${escapeHtml(checkedBy)} • ${escapeHtml(checkDate)} • ${escapeHtml(shift)}${noteIcon}</td>
          <td><span class="statusPill ${escapeHtml(st.cls)}">${escapeHtml(st.pill)}</span></td>
        </tr>`;
    }).join("");
    return `
      <div class="groupHeader">${escapeHtml(dept)}</div>
      <table class="nurseTable">
        <thead><tr><th>Cart ID</th><th>Supply Exp</th><th>Medication Exp</th><th>Verification</th><th>Status</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>`;
  }).join("");
}

function renderTechNursingLog() {
  const scoped = round.carts.filter(c=>c.cartType===round.cartType);
  let rows = showAll ? scoped : scoped.filter(isException);
  rows = rows.slice().sort(sortByHighestRiskFirst);

  let meta = showAll ? "Showing all" : "Showing exceptions only";
  const openedAt = round.verificationWindowOpenedAt ? `Started ${formatTimeHM(round.verificationWindowOpenedAt)}` : "";
  const closedAt = round.verificationWindowClosedAt ? `Ended ${formatTimeHM(round.verificationWindowClosedAt)}` : "";
  const windowLine = [openedAt, closedAt].filter(Boolean).join(" • ");
  if (windowLine) meta += ` • ${windowLine}`;
  nursingMeta.textContent = meta;

  renderNursingTable(nursingLogContainer, rows);
}

function renderTechNursingLogForPrint() {
  $("printCartType").textContent = round.cartType;
  $("printGeneratedAt").textContent = new Date().toLocaleString();
  const scoped = round.carts.filter(c=>c.cartType===round.cartType);
  let rows = showAll ? scoped : scoped.filter(isException);
  rows = rows.slice().sort(sortByHighestRiskFirst);
  renderNursingTable(nursingLogPrintContainer, rows);
}

/* Impact */
function renderImpactMetrics() {
  if (!metricGaps || !metricPaper || !metricMoney) return;
  const all = round.carts;
  const verified = all.filter(isCartVerified);
  const gaps = all.filter(c => computeVerificationPill(c).level !== "verified").length;
  const paperAvoided = verified.reduce((sum, c)=>sum + pagesPerVerificationForCart(c), 0);
  const paperSavedDollars = paperAvoided * IMPACT.costPerPage;
  const laborSavedDollars = (verified.length * IMPACT.minutesSavedPerVerified / 60) * IMPACT.laborCostPerHour;
  metricGaps.textContent = String(gaps);
  metricPaper.textContent = String(paperAvoided);
  metricMoney.textContent = formatMoney(paperSavedDollars + laborSavedDollars);
}

/* Local save/load */
function migrateRound(parsed) {
  if (typeof parsed.verificationWindowOpenedAt === "undefined") parsed.verificationWindowOpenedAt = null;
  if (typeof parsed.verificationWindowClosedAt === "undefined") parsed.verificationWindowClosedAt = null;
  if (typeof parsed.verificationEventType === "undefined") parsed.verificationEventType = "Unspecified";
  return parsed;
}
function saveTechToLocal() {
  try { localStorage.setItem(LOCAL_KEY_TECH, JSON.stringify(round)); return true; }
  catch { showToast("⚠️ Auto-save failed (storage blocked)."); return false; }
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
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Main render */
function renderTechAll() {
  renderWindowMeta();
  renderDepartmentOptions();
  renderRoundMeta();
  renderCartCards();
  renderTechNursingLog();
  renderImpactMetrics();
}

/* Events */
cartTypeTabs?.addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-type]");
  if (!btn) return;
  round.cartType = btn.getAttribute("data-type");
  document.querySelectorAll("#cartTypeTabs .tab").forEach(t=>t.classList.remove("active"));
  btn.classList.add("active");
  renderDepartmentOptions();
  saveTechToLocal();
  renderTechAll();
});

departmentSelect?.addEventListener("change", ()=>{
  round.department = departmentSelect.value;
  saveTechToLocal();
  renderTechAll();
});

addCartBtn?.addEventListener("click", ()=> addCart(cartNumberInput.value));
cartNumberInput?.addEventListener("keydown", (e)=>{ if (e.key==="Enter") addCart(cartNumberInput.value); });

/* NEW: AT RISK button behavior (does not change your model) */
atRiskBtn?.addEventListener("click", ()=>{
  cartSortMode = "risk";
  sortRiskBtn?.classList.add("active");
  sortEntryBtn?.classList.remove("active");
  renderCartCards();
  scrollToFirstAtRiskCard();
});

clearRoundBtn?.addEventListener("click", ()=>{
  if (!confirm("Reset this verification? This clears all carts on this screen.")) return;
  round.carts = [];
  currentCartIndex = -1;
  saveTechToLocal();
  renderTechAll();
  showToast("Cleared.");
});

exportJsonBtn?.addEventListener("click", ()=>{
  if (!requireClosedWindowOrConfirm("export")) return;
  const all = round.carts;
  const verified = all.filter(isCartVerified);
  const exportRecord = {
    ...round,
    impact: {
      scope:"GLOBAL",
      gapsSurfaced: all.filter(c => computeVerificationPill(c).level !== "verified").length,
      paperAvoidedPages: verified.reduce((sum,c)=>sum+pagesPerVerificationForCart(c),0),
      assumptions:{ ...IMPACT }
    }
  };
  downloadJSON(exportRecord, "verifi_GLOBAL_verification_record.json");
  showToast("Exported JSON.");
});

showAllToggle?.addEventListener("change", ()=>{
  showAll = showAllToggle.checked;
  renderTechNursingLog();
});

printPdfBtn?.addEventListener("click", ()=>{
  if (!requireClosedWindowOrConfirm("export/print")) return;
  renderTechNursingLogForPrint();
  window.print();
});

readyToggle?.addEventListener("change", ()=>{
  const open = readyToggle.checked;
  if (open) {
    round.verificationWindowOpenedAt = new Date().toISOString();
    round.verificationWindowClosedAt = null;
    round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);
    saveTechToLocal();
    renderTechAll();
    showToast("Window opened.");
  } else {
    round.verificationWindowClosedAt = new Date().toISOString();
    saveTechToLocal();
    renderTechAll();
    showToast("Window closed.");
  }
});

/* Sort toggle + auto-scroll to NON-COMPLIANT */
sortEntryBtn?.addEventListener("click", ()=>{
  cartSortMode = "entry";
  sortEntryBtn.classList.add("active");
  sortRiskBtn.classList.remove("active");
  renderCartCards();
});
sortRiskBtn?.addEventListener("click", ()=>{
  cartSortMode = "risk";
  sortRiskBtn.classList.add("active");
  sortEntryBtn.classList.remove("active");
  renderCartCards();
  scrollToFirstNonCompliantCard();
});

/* Nursing module (unchanged) */
const nurseUnitName = $("nurseUnitName");
const nurseMonth = $("nurseMonth");
const nurseAddRowBtn = $("nurseAddRowBtn");
const nurseSaveBtn = $("nurseSaveBtn");
const nursePrintBtn = $("nursePrintBtn");
const nurseClearBtn = $("nurseClearBtn");
const nurseTableWrap = $("nurseTableWrap");
const nursePrintTableWrap = $("nursePrintTableWrap");
const nursePaperMeta = $("nursePaperMeta");

let nurseLog = { unitName:"", month:"", rows:[] };

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

function todayDayOfMonth(){ return String(new Date().getDate()); }
function newNurseRow(day){
  return { day:day||todayDayOfMonth(), lockNo:"", sealed:false, plugged:false, defib:false, supplyExpPresent:false, medExpPresent:false, contents:false, suction:false, o2:false, signature:"" };
}
function saveNurseToLocal(){
  nurseLog.unitName = nurseUnitName?.value || "";
  nurseLog.month = nurseMonth?.value || "";
  try { localStorage.setItem(LOCAL_KEY_NURSE, JSON.stringify(nurseLog)); } catch {}
  if (nursePaperMeta) nursePaperMeta.textContent = `Saved • ${nurseLog.rows.length} row(s)`;
}
function loadNurseFromLocal(){
  try {
    const raw = localStorage.getItem(LOCAL_KEY_NURSE);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return false;
    nurseLog = parsed;
    return true;
  } catch { return false; }
}
function renderNurseTable(targetEl, rows, isPrint=false){
  if (!targetEl) return;
  const th = NURSE_COLS.map(c=>`<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows.map((r,idx)=>{
    const tds = NURSE_COLS.map(col=>{
      if (col.key==="day"){
        return isPrint ? `<td>${escapeHtml(r.day)}</td>` : `<td><input class="paperInput" data-i="${idx}" data-k="day" value="${escapeHtml(r.day)}" /></td>`;
      }
      if (col.key==="lockNo" || col.key==="signature"){
        return isPrint ? `<td>${escapeHtml(r[col.key]||"")}</td>` : `<td><input class="paperInput" data-i="${idx}" data-k="${col.key}" value="${escapeHtml(r[col.key]||"")}" /></td>`;
      }
      return isPrint ? `<td>${r[col.key]?"Y":""}</td>` : `<td><input class="paperChk" type="checkbox" data-i="${idx}" data-k="${col.key}" ${r[col.key]?"checked":""} /></td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  targetEl.innerHTML = `<table class="paperTable"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;

  if (isPrint) return;

  targetEl.querySelectorAll("input.paperInput").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      const i = Number(inp.getAttribute("data-i"));
      const k = inp.getAttribute("data-k");
      nurseLog.rows[i][k] = inp.value;
      saveNurseToLocal();
    });
  });
  targetEl.querySelectorAll("input.paperChk").forEach(chk=>{
    chk.addEventListener("change", ()=>{
      const i = Number(chk.getAttribute("data-i"));
      const k = chk.getAttribute("data-k");
      nurseLog.rows[i][k] = chk.checked;
      saveNurseToLocal();
    });
  });
}
function renderNurseAll(){
  if (nurseUnitName) nurseUnitName.value = nurseLog.unitName || "";
  if (nurseMonth) nurseMonth.value = nurseLog.month || "";
  renderNurseTable(nurseTableWrap, nurseLog.rows, false);
}
nurseAddRowBtn?.addEventListener("click", ()=>{ nurseLog.rows.unshift(newNurseRow(todayDayOfMonth())); saveNurseToLocal(); renderNurseAll(); });
nurseSaveBtn?.addEventListener("click", ()=>{ saveNurseToLocal(); showToast("Nursing log saved."); });
nurseClearBtn?.addEventListener("click", ()=>{ if(!confirm("Reset this month? This clears all rows."))return; nurseLog.rows=[]; saveNurseToLocal(); renderNurseAll(); showToast("Month cleared."); });
nursePrintBtn?.addEventListener("click", ()=>{
  if (!requireClosedWindowOrConfirm("print")) return;
  $("nursePrintUnit").textContent = nurseUnitName?.value || "—";
  $("nursePrintMonth").textContent = nurseMonth?.value || "—";
  renderNurseTable(nursePrintTableWrap, nurseLog.rows, true);
  window.print();
});

/* Escape */
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* INIT */
(function init(){
  loadTechFromLocal();
  renderDepartmentOptions();

  if (!round.department) round.department = (DEPARTMENTS[round.cartType] || [])[0] || "";
  departmentSelect.value = round.department;

  const isOpen = isWindowOpen();
  readyToggle.checked = isOpen;

  if (round.verificationWindowOpenedAt && (!round.verificationEventType || round.verificationEventType==="Unspecified")) {
    round.verificationEventType = inferVerificationEventType(round.verificationWindowOpenedAt);
  }

  renderTechAll();

  loadNurseFromLocal();
  if (!nurseLog.month) {
    const now = new Date();
    const mm = String(now.getMonth()+1).padStart(2,"0");
    nurseLog.month = `${now.getFullYear()}-${mm}`;
  }
  renderNurseAll();

  showScreen("tech");
})();
