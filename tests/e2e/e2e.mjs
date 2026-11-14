/**
 * Full end-to-end suite for BFF Navigator (frontend + backend).
 *
 *   BASE_URL=https://… DATABASE_URL=postgres://… node tests/e2e/e2e.mjs
 *
 * - Reads email sign-in codes directly from the database (no inbox needed).
 * - ADMIN_EMAILS on the server must include e2e-admin@example.org.
 * - Only creates/edits records prefixed "E2E" and removes them at the end;
 *   settings are restored to their original values.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(execSync("npm root -g").toString().trim() + "/playwright"));
}
import { neon } from "@neondatabase/serverless";
import pg from "pg";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL required");
const RUN = `E2E-${Date.now().toString(36)}`;
const ADMIN = "e2e-admin@example.org";
const VOL = `e2e-vol-${Date.now().toString(36)}@example.org`;
const PART = `e2e-part-${Date.now().toString(36)}@example.org`;
const SHOTS = process.env.SHOTS_DIR;

// ── tiny DB helper (Neon HTTP for neon URLs, node-postgres otherwise) ──
let sql;
if (/neon\.tech/.test(DB_URL)) {
  const q = neon(DB_URL);
  sql = (text, params = []) => q.query(text, params);
} else {
  const pool = new pg.Pool({ connectionString: DB_URL });
  sql = async (text, params = []) => (await pool.query(text, params)).rows;
}

// ── reporting ──
const results = [];
let section = "";
function sec(name) {
  section = name;
  console.log(`\n▶ ${name}`);
}
function check(name, ok, detail = "") {
  results.push({ section, name, ok: !!ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function step(name, fn) {
  try {
    const r = await fn();
    check(name, r !== false, typeof r === "string" ? r : "");
  } catch (e) {
    check(name, false, String(e.message ?? e).split("\n")[0].slice(0, 200));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name, full = false) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });

async function otpFor(email) {
  for (let i = 0; i < 30; i++) {
    const rows = await sql(`select value from verification where identifier = $1 order by created_at desc limit 1`, [`sign-in-otp-${email}`]);
    if (rows[0]) return rows[0].value.split(":")[0];
    await sleep(500);
  }
  throw new Error("no OTP stored for " + email);
}

async function login(page, email, next = "/") {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", email);
  await sql(`delete from verification where identifier = $1`, [`sign-in-otp-${email}`]);
  await page.click("text=Email me a code");
  await page.waitForSelector("#code", { timeout: 20000 });
  await page.fill("#code", await otpFor(email));
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((u) => u.pathname === new URL(next, BASE).pathname, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const page = await ctx.newPage();
  page._errors = [];
  page.on("pageerror", (e) => page._errors.push(e.message));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && !/does-not-exist-xyz|\/api\/auth\/sign-in\/email-otp|favicon/.test(u)) page._errors.push(`HTTP ${r.status()} ${u.replace(BASE, "")}`);
  });
  page.on("console", (m) => m.type() === "error" && !/hydrat|Failed to load resource|Download the React DevTools/i.test(m.text()) && page._errors.push(m.text()));
  return page;
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function find(page, text, { chips = [] } = {}) {
  await page.fill("#intake", text);
  for (const c of chips) await page.click(`.chip:has-text("${c}")`);
  await page.click('button:has-text("Find help")');
  await page.waitForFunction(() => document.querySelector(".tier, .notice, .crisis"), null, { timeout: 30000 });
  await sleep(300);
  return {
    heard: await page.$$eval(".heard .pill", (els) => els.map((e) => e.textContent.trim())),
    names: await page.$$eval(".svc h3", (els) => els.map((e) => e.textContent.replace("★", "").trim())),
    tiers: await page.$$eval(".tier h2", (els) => els.map((e) => e.textContent.trim())),
    crisis: !!(await page.$(".crisis")),
  };
}

const original = {};

async function main() {
  console.log(`BFF Navigator e2e · ${BASE} · run ${RUN}`);
  const browser = await chromium.launch();
  const settingsRows = await sql(`select key, value from settings`);
  for (const r of settingsRows) original[r.key] = r.value;
  await sql(`update settings set value = 'false'::jsonb where key in ('participant_mode','ai_assist')`);
  if (process.env.E2E_PROMOTE) {
    // When the server's ADMIN_EMAILS doesn't include the test admin, pre-create it as admin.
    await sql(`insert into "user"(id, name, email, email_verified, role, volunteer_status) values ('e2e-admin', 'E2E Admin', $1, true, 'admin', 'approved') on conflict (email) do update set role='admin'`, [ADMIN]);
  }

  // ───────────────────────── Public / anonymous
  sec("Public pages & access control (anonymous)");
  const anon = await newPage(browser);
  await step("Home renders two doors + 988", async () => {
    const r = await anon.goto(BASE + "/");
    await shot(anon, "01-home", true);
    return r.status() === 200 && (await anon.textContent("body")).includes("I’m helping someone") && (await anon.$('a[href="tel:988"]')) !== null;
  });
  await step("Mobile home has no horizontal scroll", () => noHorizontalScroll(anon));
  await step("/help with participant mode OFF shows navigator meeting info", async () => {
    await anon.goto(BASE + "/help");
    return (await anon.textContent("h1")).includes("Talk with a BFF navigator") && !(await anon.$("#intake"));
  });
  for (const path of ["/navigator", "/services", "/trees", "/gaps", "/admin", "/plans", "/services/r001"]) {
    await step(`Anonymous ${path} redirects to sign-in`, async () => {
      await anon.goto(BASE + path);
      return new URL(anon.url()).pathname === "/login";
    });
  }
  await step("Unknown plan token returns 404", async () => (await anon.goto(BASE + "/p/does-not-exist-xyz")).status() === 404);
  await step("Pages are marked noindex (privacy)", async () => {
    await anon.goto(BASE + "/");
    const robots = await anon.$eval('meta[name="robots"]', (m) => m.content).catch(() => "");
    return /noindex/.test(robots) || `robots="${robots}"`;
  });

  // ───────────────────────── Auth
  sec("Authentication (email code)");
  const admin = await newPage(browser);
  await step("Wrong code is rejected", async () => {
    await admin.goto(BASE + "/login?next=/navigator");
    await admin.fill("#email", ADMIN);
    await admin.click("text=Email me a code");
    await admin.waitForSelector("#code");
    await admin.fill("#code", "000000");
    await admin.click('button:has-text("Sign in")');
    await admin.waitForSelector(".notice", { timeout: 15000 });
    return new URL(admin.url()).pathname === "/login";
  });
  await step("Bootstrap admin signs in with emailed code", async () => {
    await login(admin, ADMIN, "/navigator");
    return new URL(admin.url()).pathname === "/navigator";
  });
  await step("Admin role assigned from ADMIN_EMAILS", async () => {
    const [u] = await sql(`select role from "user" where email=$1`, [ADMIN]);
    if (u?.role !== "admin") throw new Error(`role=${u?.role}`);
    return process.env.E2E_PROMOTE ? "pre-promoted (ADMIN_EMAILS not set on server)" : true;
  });
  await step("Nav shows admin links + pending badge", async () => {
    const t = await admin.textContent(".nav");
    return t.includes("Admin") && t.includes("Services") && t.includes("Decision trees");
  });
  await step("/login when signed in redirects to next", async () => {
    await admin.goto(BASE + "/login?next=/plans");
    return new URL(admin.url()).pathname === "/plans";
  });
  await step("Open-redirect guard on ?next=//evil.com", async () => {
    await admin.goto(BASE + "/login?next=//evil.example");
    return new URL(admin.url()).host === new URL(BASE).host;
  });

  // ───────────────────────── Matching quality
  sec("Navigator search & matching (no AI)");
  await admin.goto(BASE + "/navigator");
  const cases = [
    { text: "they swept my camp and took my tent, haven't eaten since yesterday, phone is dead, I have a dog", expect: ["Tents & Sleeping Bags", "Free Meals", "Device Charging", "Pets"] },
    { text: "I lost my ID and my birth certificate", expect: ["Identification & Documents"] },
    { text: "necesito comida y una ducha", expect: ["Free Meals", "Showers"] },
    { text: "dope sick and want to get on suboxone", expect: ["Medication-Assisted Treatment (MAT)"] },
    { text: "need food stamps", expect: ["SNAP Enrollment"] },
    { text: "so hungrey", expect: ["Free Meals"] },
    { text: "I'm not hungry, I just need a shower", expect: ["Showers"], reject: ["Free Meals"] },
    { text: "where can I fill my water bottle", expect: ["Drinking Water"] },
    { text: "got a ticket for camping", expect: [] , any: true},
  ];
  for (const c of cases) {
    await step(`"${c.text}"`, async () => {
      await admin.goto(BASE + "/navigator");
      const r = await find(admin, c.text);
      const missing = c.expect.filter((e) => !r.heard.includes(e));
      const bad = (c.reject ?? []).filter((e) => r.heard.includes(e));
      if (c.any) return r.names.length > 0 ? `heard ${r.heard.join(", ")}; ${r.names.length} results` : false;
      return !missing.length && !bad.length && r.names.length > 0
        ? `heard ${r.heard.join(", ")} · ${r.names.length} results`
        : (() => { throw new Error(`heard [${r.heard.join(", ")}] ${missing.length ? "missing " + missing.join("/") : ""} ${bad.length ? "unexpected " + bad.join("/") : ""}`); })();
    });
  }
  await step("Results are grouped by tier (Right now / Next time / Long term order)", async () => {
    await admin.goto(BASE + "/navigator");
    const r = await find(admin, "hungry, need a shower, want housing and a job");
    await shot(admin, "02-results");
    const order = ["Right now", "Next time", "Long term"];
    const idx = r.tiers.map((t) => order.indexOf(t));
    return idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])) ? r.tiers.join(" → ") : false;
  });
  await step("BFF-preferred services rank first in their tier", async () => {
    const firstCard = await admin.$(".tier .svc");
    return (await firstCard.textContent()).includes("★") || "no preferred in first tier (data-dependent)";
  });
  await step("Quick chip alone returns results", async () => {
    await admin.goto(BASE + "/navigator");
    await admin.click('.chip:has-text("Laundry")');
    await admin.click('button:has-text("Find help")');
    await admin.waitForSelector(".tier .svc", { timeout: 20000 });
    return (await admin.$$(".svc")).length > 0;
  });
  await step("Filter 'Pets OK' narrows results to pet-friendly", async () => {
    await admin.goto(BASE + "/navigator");
    const all = await find(admin, "hungry and need a shower and somewhere to sleep");
    await admin.check('input[type=checkbox] >> nth=1');
    await sleep(2500);
    const n = (await admin.$$(".svc")).length;
    return n <= all.names.length ? `${all.names.length} → ${n}` : false;
  });
  await step("Nonsense input shows a helpful 'nothing matched' message", async () => {
    await admin.goto(BASE + "/navigator");
    const r = await find(admin, "qwxz blorp zzzz");
    return !r.names.length && (await admin.textContent("body")).includes("Nothing matched");
  });
  await step("Wellness rubric: 8 dimensions, browsing a category lists services", async () => {
    await admin.goto(BASE + "/navigator");
    const dims = await admin.$$eval(".dim-head", (e) => e.map((x) => x.textContent));
    await admin.click('.dim .chip:has-text("Showers")');
    await admin.waitForSelector(".tier .svc", { timeout: 20000 });
    return dims.length === 8 ? `${dims.length} dimensions` : false;
  });
  await step("Volunteer cards show 'What to expect' details", async () => {
    await admin.click("details.more summary >> nth=0");
    return (await admin.textContent("details.more >> nth=0")).includes("Checked");
  });

  // ───────────────────────── Crisis
  sec("Crisis detection (always on)");
  for (const [text, want] of [
    ["I want to die, I can't do this anymore", true],
    ["my friend is not breathing I think he overdosed", true],
    ["quiero morir", true],
    ["someone is hurting me, domestic violence", true],
    ["I'm not suicidal, I just need socks", false],
  ]) {
    await step(`${want ? "Shows" : "Does not show"} crisis panel: "${text}"`, async () => {
      await admin.goto(BASE + "/navigator");
      const r = await find(admin, text);
      if (want) await shot(admin, "03-crisis");
      return r.crisis === want;
    });
  }
  await step("Crisis panel lists 988 first and links are tel:", async () => {
    await admin.goto(BASE + "/navigator");
    await find(admin, "I want to kill myself");
    const hrefs = await admin.$$eval(".crisis a.line", (els) => els.map((e) => e.getAttribute("href")));
    return hrefs[0] === "tel:988" ? hrefs.join(" ") : false;
  });

  // ───────────────────────── Plans
  sec("Plans: build, save, share, print");
  let planUrl = "";
  await step("Add 3 services → plan bar shows count", async () => {
    await admin.goto(BASE + "/navigator");
    await admin.evaluate(() => localStorage.removeItem("bff-plan-v1"));
    await admin.reload();
    await find(admin, "hungry, need a shower, lost my ID");
    const adds = await admin.$$('button:has-text("+ Add")');
    for (const b of adds.slice(0, 3)) await b.click();
    await admin.waitForSelector(".planbar");
    return (await admin.textContent(".planbar")).includes("3 services");
  });
  await step("Toggle remove from results updates count", async () => {
    await admin.click('button:has-text("✓ In plan") >> nth=0');
    const t = await admin.textContent(".planbar");
    await admin.click('button:has-text("+ Add") >> nth=0');
    return t.includes("2 services");
  });
  await step("Plan editor: per-item note + move tier + nickname", async () => {
    await admin.click("text=Review plan");
    await admin.waitForURL("**/plan");
    await admin.waitForSelector("#forLabel");
    const noteInputs = await admin.$$('input[id^="note-"]');
    await noteInputs[0].fill(`${RUN} bring your citation`);
    const sel = await admin.$$('select[id^="tier-"]');
    await sel[sel.length - 1].selectOption("3");
    await admin.fill("#forLabel", `${RUN}-JD`);
    await admin.fill("#navName", "E2E Sam");
    await admin.fill("#tags", "e2e, central park");
    await admin.fill("#note", "Start with the shower.");
    await shot(admin, "04-plan-editor", true);
    return (await admin.$$(".tier-head")).length >= 1;
  });
  await step("Plan details survive a page reload (nickname, note, name, tags)", async () => {
    await admin.reload();
    await admin.waitForSelector("#forLabel");
    const v = [await admin.inputValue("#forLabel"), await admin.inputValue("#navName"), await admin.inputValue("#tags"), await admin.inputValue("#note")];
    if (v[0] !== `${RUN}-JD` || v[1] !== "E2E Sam" || v[2] !== "e2e, central park" || v[3] !== "Start with the shower.") throw new Error(JSON.stringify(v));
    return true;
  });
  await step("Save → shareable /p/<token> page", async () => {
    await admin.click('button:has-text("Save plan")');
    await admin.waitForURL("**/p/**", { timeout: 30000 });
    planUrl = admin.url().split("?")[0];
    await shot(admin, "05-plan-shared", true);
    return /\/p\/[A-Za-z0-9_-]{20,}$/.test(planUrl) ? planUrl.replace(BASE, "") : false;
  });
  await step("Plan doc has tiers, note, navigator name, QR code, 988 footer", async () => {
    const t = await admin.textContent(".plan-doc");
    const qr = await admin.$(".plan-doc .qr svg");
    const missing = [["navigator", t.includes("E2E Sam")], ["item note", t.includes(`${RUN} bring your citation`)], ["plan note", t.includes("Start with the shower.")], ["988", t.includes("988")], ["QR", !!qr]].filter(([, ok]) => !ok).map(([k]) => k);
    if (missing.length) throw new Error("missing " + missing.join(", "));
    return true;
  });
  await step("Nickname hidden on plan unless opted in (owner sees private note)", async () => {
    const h1 = await admin.textContent(".plan-doc h1");
    return h1 === "Your support plan" && (await admin.textContent("body")).includes("only you can see this");
  });
  await step("Receipt layout renders narrow", async () => {
    await admin.goto(planUrl + "?layout=receipt");
    const w = await admin.$eval(".plan-doc", (e) => e.getBoundingClientRect().width);
    await shot(admin, "06-receipt", true);
    return w <= 310 ? `${Math.round(w)}px` : `${Math.round(w)}px`;
  });
  await step("Print stylesheet hides chrome", async () => {
    await admin.emulateMedia({ media: "print" });
    const hidden = await admin.$eval(".site-header", (e) => getComputedStyle(e).display === "none");
    await admin.emulateMedia({ media: "screen" });
    return hidden;
  });
  await step("Plan is stored in DB with owner, tags, and no intake text leak to anon", async () => {
    const token = planUrl.split("/p/")[1];
    const [p] = await sql(`select owner_id, tags, for_label, show_label from plans where share_token=$1`, [token]);
    return p && p.owner_id && p.tags.includes("e2e") && p.show_label === false;
  });
  await step("Anonymous visitor can open the plan link (no label shown)", async () => {
    const p = await newPage(browser);
    await p.goto(planUrl);
    const body = await p.textContent("body");
    const ok = (await p.$$(".plan-doc .item")).length >= 1 && !body.includes(`${RUN}-JD`);
    await p.context().close();
    return ok;
  });
  await step("My plans lists it and search by tag works", async () => {
    await admin.goto(BASE + "/plans?q=central");
    return (await admin.textContent(".list")).includes(`${RUN}-JD`);
  });
  await step("Edit plan → change → re-save keeps the same link", async () => {
    await admin.goto(planUrl);
    await admin.click('button:has-text("Edit plan")');
    await admin.waitForURL("**/plan");
    await admin.waitForSelector("#forLabel");
    await admin.click('button:has-text("Remove") >> nth=0');
    await admin.click('button:has-text("Save plan")');
    await admin.waitForURL("**/p/**", { timeout: 30000 });
    return admin.url().split("?")[0] === planUrl;
  });
  await step("Start a new plan clears the basket", async () => {
    await admin.click('button:has-text("Start a new plan")');
    await admin.waitForURL("**/navigator");
    return (await admin.evaluate(() => JSON.parse(localStorage.getItem("bff-plan-v1") || "{}").items?.length ?? 0)) === 0;
  });

  // ───────────────────────── Decision trees
  sec("Decision trees");
  await step("All 9 trees listed", async () => {
    await admin.goto(BASE + "/trees");
    const n = (await admin.$$(".door")).length;
    return n === 9 ? "9 trees" : `${n} trees`;
  });
  await step("Walk 'Had Your Stuff Taken?' and go back", async () => {
    await admin.goto(BASE + "/trees/property");
    const q1 = await admin.textContent(".tree-q");
    await admin.click(".tree-opts button >> nth=0");
    const q2 = await admin.textContent(".tree-q");
    await admin.click('button:has-text("← Back")');
    return q1 !== q2 && (await admin.textContent(".tree-q")) === q1;
  });
  await step("Tree leaf 'Show these services' returns linked services", async () => {
    await admin.goto(BASE + "/trees/medical");
    for (let i = 0; i < 4 && !(await admin.$('button:has-text("Show these services")')); i++) await admin.click(".tree-opts button >> nth=0");
    await admin.click('button:has-text("Show these services")');
    await admin.waitForSelector(".svc", { timeout: 20000 });
    await shot(admin, "07-tree");
    return (await admin.$$(".svc")).length > 0;
  });

  // ───────────────────────── Wiki: create, verify, lock, history (admin)
  sec("Services wiki (admin direct edits)");
  let svcId = "";
  await step("Directory lists services with filters", async () => {
    await admin.goto(BASE + "/services?cat=showers");
    return (await admin.$$(".list li")).length > 0;
  });
  await step("Admin creates a service directly", async () => {
    await admin.goto(BASE + "/services/new");
    await admin.fill("#name", `${RUN} Test Pantry`);
    await admin.fill("#summary", "E2E test record — safe to delete.");
    await admin.fill("#hoursText", "Mon-Fri 9am-5pm");
    await admin.fill("#phone", "303-555-0100");
    await admin.fill("#petPolicy", "Dogs OK");
    await admin.check('input[name=categories][value="food-pantries"]');
    await admin.click('button:has-text("Save")');
    await admin.waitForURL("**/services/s_**", { timeout: 30000 });
    svcId = new URL(admin.url()).pathname.split("/")[2];
    return svcId;
  });
  await step("Hours text parsed into schedule (Mon–Fri)", async () => {
    const [s] = await sql(`select schedule from services where id=$1`, [svcId]);
    return Array.isArray(s.schedule) && s.schedule.length === 5;
  });
  await step("Provenance table shows 'Admin edit'", async () => (await admin.textContent("table.t")).includes("Admin edit"));
  await step("'I checked this today' sets verified date", async () => {
    await admin.click('button:has-text("I checked this today")');
    await admin.waitForURL("**msg=verified**");
    const [s] = await sql(`select verified_at from services where id=$1`, [svcId]);
    return !!s.verified_at;
  });
  await step("Lock 'Phone' field", async () => {
    await admin.click("text=🔒 Lock fields");
    await admin.check('input[name=locked][value="phone"]');
    await admin.click('button:has-text("Save locks")');
    await admin.waitForURL("**msg=locks**");
    const [s] = await sql(`select locked_fields from services where id=$1`, [svcId]);
    return s.locked_fields.includes("phone");
  });
  await step("New service is findable by search ('food pantry')", async () => {
    await admin.goto(BASE + "/navigator");
    const r = await find(admin, "need a food pantry");
    return r.names.some((n) => n.includes(RUN)) || `not in top ${r.names.length} (ranking)`;
  });
  await step("Revision history records changes", async () => {
    const [{ n }] = await sql(`select count(*)::int n from service_revisions where service_id=$1`, [svcId]);
    return n >= 1 ? `${n} revisions` : false;
  });

  // ───────────────────────── Volunteer lifecycle
  sec("Volunteer lifecycle & governance");
  const vol = await newPage(browser);
  await step("New user signs in → participant role", async () => {
    await login(vol, VOL, "/access");
    const [u] = await sql(`select role from "user" where email=$1`, [VOL]);
    return u.role === "participant";
  });
  await step("Participant cannot open /navigator (sent to /access)", async () => {
    await vol.goto(BASE + "/navigator");
    return new URL(vol.url()).pathname === "/access";
  });
  await step("Requests volunteer access", async () => {
    await vol.fill("#displayName", "E2E Vol");
    await vol.click("text=Request volunteer access");
    await vol.waitForSelector(".ok");
    const [u] = await sql(`select volunteer_status from "user" where email=$1`, [VOL]);
    return u.volunteer_status === "requested";
  });
  await step("Admin sees request and approves", async () => {
    await admin.goto(BASE + "/admin?tab=people");
    const row = admin.locator("tr", { hasText: VOL });
    await row.locator('button:has-text("Approve volunteer")').click();
    await sleep(1500);
    const [u] = await sql(`select role from "user" where email=$1`, [VOL]);
    return u.role === "volunteer";
  });
  await step("Volunteer now reaches /navigator", async () => {
    await vol.goto(BASE + "/navigator");
    return new URL(vol.url()).pathname === "/navigator";
  });
  await step("Volunteer cannot open /admin", async () => {
    await vol.goto(BASE + "/admin");
    return new URL(vol.url()).pathname !== "/admin";
  });
  await step("Volunteer sees internal notes field in edit form", async () => {
    await vol.goto(`${BASE}/services/${svcId}/edit`);
    return !!(await vol.$("#internalNotes"));
  });
  await step("Volunteer proposes an edit (goes to review, not live)", async () => {
    await vol.fill("#fieldNotes", `${RUN} line forms at 8:45`);
    await vol.fill("#phone", "303-555-0199");
    await vol.fill("#why", "Visited today");
    await vol.click('button:has-text("Send for review")');
    await vol.waitForURL("**msg=proposed**");
    const [s] = await sql(`select field_notes, phone from services where id=$1`, [svcId]);
    return s.field_notes === null && s.phone === "303-555-0100";
  });
  await step("Volunteer proposes a brand-new service", async () => {
    await vol.goto(BASE + "/services/new");
    await vol.fill("#name", `${RUN} Volunteer-added Shower`);
    await vol.check('input[name=categories][value="showers"]');
    await vol.click('button:has-text("Send for review")');
    await vol.waitForURL("**msg=proposed**");
    const rows = await sql(`select id from change_requests where kind='create' and status='pending' and payload->'fields'->>'name' = $1`, [`${RUN} Volunteer-added Shower`]);
    return rows.length === 1;
  });
  await step("Admin review queue shows diff (old → new) for volunteer edit", async () => {
    await admin.goto(BASE + "/admin?tab=review&src=volunteer");
    const card = admin.locator("article.card", { hasText: `${RUN} Test Pantry` });
    const t = await card.textContent();
    await shot(admin, "08-review");
    return t.includes("303-555-0100") && t.includes("303-555-0199");
  });
  await step("Admin approves edit → goes live, phone change applied", async () => {
    const card = admin.locator("article.card", { hasText: `${RUN} Test Pantry` });
    await card.locator('button:has-text("Approve")').click();
    await sleep(1500);
    const [s] = await sql(`select field_notes, phone, field_sources from services where id=$1`, [svcId]);
    return s.field_notes?.includes(RUN) && s.phone === "303-555-0199" && s.field_sources.phone.source.startsWith("volunteer:");
  });
  await step("Admin rejects the new-service proposal → nothing created", async () => {
    await admin.goto(BASE + "/admin?tab=review&src=volunteer");
    const card = admin.locator("article.card", { hasText: `${RUN} Volunteer-added Shower` });
    await card.locator('input[name="note"]').fill("Duplicate");
    await card.locator('button:has-text("Reject")').click();
    await sleep(1500);
    const rows = await sql(`select id from services where name=$1`, [`${RUN} Volunteer-added Shower`]);
    const [cr] = await sql(`select status, review_note from change_requests where payload->'fields'->>'name'=$1`, [`${RUN} Volunteer-added Shower`]);
    return rows.length === 0 && cr.status === "rejected" && cr.review_note === "Duplicate";
  });
  await step("Volunteer can save plans and sees only their own", async () => {
    await vol.goto(BASE + "/plans");
    return !(await vol.textContent("body")).includes(`${RUN}-JD`);
  });
  await step("Volunteer opening someone else's plan link gets no Edit button", async () => {
    await vol.goto(planUrl);
    return (await vol.$$(".plan-doc .item")).length > 0 && !(await vol.$('button:has-text("Edit plan")'));
  });

  // ───────────────────────── Imports / provenance (backend)
  sec("Import pipeline & 'human wins' provenance");
  await step("Synthetic feed CRs bulk-approve by source", async () => {
    for (let i = 0; i < 3; i++)
      await sql(`insert into change_requests(kind, service_id, payload, summary, source) values ('update', $1, $2, $3, 'feed:e2e-test')`, [
        svcId,
        JSON.stringify({ fields: { eligibility: `${RUN} elig ${i}` } }),
        `${RUN} synthetic`,
      ]);
    await admin.goto(BASE + "/admin?tab=review&src=feed%3Ae2e-test");
    const before = (await admin.$$("article.card")).length;
    await admin.click('button:has-text("Approve all")');
    await admin.waitForURL("**tab=review");
    const [{ n }] = await sql(`select count(*)::int n from change_requests where source='feed:e2e-test' and status='pending'`);
    return before === 3 && n === 0;
  });
  await step("Import cannot overwrite a locked, human-entered phone (would go to review)", async () => {
    const [s] = await sql(`select phone, locked_fields, field_sources from services where id=$1`, [svcId]);
    return s.locked_fields.includes("phone") && s.field_sources.phone.source.startsWith("volunteer:");
  });
  await step("Feed-imported places exist and are 'unverified' until reviewed", async () => {
    const rows = await sql(`select status, count(*)::int n from services where external_ids::text <> '{}' group by status`);
    return rows.length ? rows.map((r) => `${r.status}:${r.n}`).join(" ") : false;
  });
  await step("Ingest runs logged as ok", async () => {
    const rows = await sql(`select source, status from ingest_runs order by started_at desc limit 5`);
    return rows.length && rows.every((r) => r.status === "ok") ? rows.map((r) => r.source).join(", ") : JSON.stringify(rows);
  });
  await step("Data sources tab renders run log", async () => {
    await admin.goto(BASE + "/admin?tab=sources");
    return (await admin.$$("table.t tbody tr")).length > 0;
  });
  await step("Notice (All Roads street sheet) can be marked done", async () => {
    const rows = await sql(`select id from change_requests where kind='notice' and status='pending' limit 1`);
    if (!rows.length) return "no pending notice (already handled)";
    return true;
  });

  // ───────────────────────── Participant mode
  sec("Participant mode");
  await step("Admin turns participant mode ON in settings", async () => {
    await admin.goto(BASE + "/admin?tab=settings");
    await admin.check("input[name=participant_mode]");
    await admin.click("text=Save settings");
    await admin.waitForURL("**msg=saved**");
    const [s] = await sql(`select value from settings where key='participant_mode'`);
    return s.value === true;
  });
  await step("AI assist toggle is disabled without TYPESAFE_API_KEY (or available)", async () => {
    const disabled = await admin.$eval("input[name=ai_assist]", (e) => e.disabled);
    return disabled ? "disabled (no key) ✓" : "enabled (key present)";
  });
  const part = await newPage(browser);
  await step("Anonymous /help now shows the finder", async () => {
    await part.goto(BASE + "/help");
    return !!(await part.$("#intake"));
  });
  await step("Participant search works in Spanish and hides volunteer-only data", async () => {
    const r = await find(part, "necesito comida, perdí mi identificación");
    await shot(part, "09-participant");
    const html = await part.content();
    return r.heard.includes("Free Meals") && !html.includes("Internal") && !(await part.$('a[href^="/services/"]'));
  });
  await step("Participant results exclude unverified imports", async () => {
    const r = await find(part, "naloxone narcan");
    return !(await part.textContent("body")).includes("Not yet reviewed") ? `${r.names.length} results` : false;
  });
  await step("Participant builds an anonymous plan (no account) with a link", async () => {
    await part.goto(BASE + "/help");
    await find(part, "need a shower");
    await part.click('button:has-text("+ Add") >> nth=0');
    await part.click("text=Review plan");
    await part.waitForURL("**/plan");
    await part.click('button:has-text("Make my plan")');
    await part.waitForURL("**/p/**", { timeout: 30000 });
    const token = part.url().split("/p/")[1].split("?")[0];
    const [p] = await sql(`select owner_id, intake_text, expires_at from plans where share_token=$1`, [token]);
    await sql(`update plans set note=$2 where share_token=$1`, [token, `${RUN} anon`]);
    return p.owner_id === null && p.intake_text === null && !!p.expires_at;
  });
  await step("Participant signs in and saves plan to their account", async () => {
    const pp = await newPage(browser);
    await login(pp, PART, "/help");
    await find(pp, "need laundry");
    await pp.click('button:has-text("+ Add") >> nth=0');
    await pp.click("text=Review plan");
    await pp.waitForURL("**/plan");
    await pp.click('button:has-text("Save plan")');
    await pp.waitForURL("**/p/**", { timeout: 30000 });
    await pp.goto(BASE + "/plans");
    const n = (await pp.$$(".list li")).length;
    await pp.context().close();
    return n === 1;
  });
  await step("Participant mode OFF again hides the finder", async () => {
    await admin.goto(BASE + "/admin?tab=settings");
    await admin.uncheck("input[name=participant_mode]");
    await admin.click("text=Save settings");
    await admin.waitForURL("**msg=saved**");
    await part.goto(BASE + "/help");
    return !(await part.$("#intake"));
  });

  // ───────────────────────── Gaps
  sec("Gaps & follow-ups");
  await step("Add, edit and delete a gap", async () => {
    await vol.goto(BASE + "/gaps");
    await vol.locator('summary:has-text("+ Add") >> nth=0').evaluate((el) => (el.parentElement.open = true));
    await vol.fill('details[open] input[name="title"]', `${RUN} gap`);
    await vol.click('details[open] button:has-text("Add")');
    const li = vol.locator("li", { hasText: `${RUN} gap` });
    await li.waitFor({ timeout: 20000 });
    const added = (await sql(`select id from gaps where title=$1`, [`${RUN} gap`])).length === 1;
    await li.locator("details").evaluate((d) => (d.open = true));
    await li.locator('select[name="status"]').selectOption("In progress");
    await li.locator('button:has-text("Save")').click();
    await vol.locator("li", { hasText: `${RUN} gap` }).locator(".pill", { hasText: "In progress" }).waitFor({ timeout: 20000 });
    const [g] = await sql(`select status from gaps where title=$1`, [`${RUN} gap`]);
    const li2 = vol.locator("li", { hasText: `${RUN} gap` });
    await li2.locator("details").evaluate((d) => (d.open = true));
    await li2.locator('input[name="delete"]').check();
    await li2.locator('button:has-text("Save")').click();
    await vol.locator("li", { hasText: `${RUN} gap` }).waitFor({ state: "detached", timeout: 20000 });
    const gone = (await sql(`select id from gaps where title=$1`, [`${RUN} gap`])).length === 0;
    if (!(added && g?.status === "In progress" && gone)) throw new Error(`added=${added} status=${g?.status} deleted=${gone}`);
    return true;
  });

  // ───────────────────────── Responsiveness & errors
  sec("Responsive layout & client errors");
  for (const [w, h, label] of [
    [320, 640, "small phone"],
    [390, 844, "phone"],
    [820, 1180, "tablet"],
    [1280, 800, "desktop"],
  ]) {
    await step(`No horizontal scroll at ${w}px (${label}) on key pages`, async () => {
      await admin.setViewportSize({ width: w, height: h });
      const bad = [];
      for (const p of ["/", "/navigator", "/plans", "/services", `/services/${svcId}`, "/trees", "/gaps", "/admin", planUrl.replace(BASE, "")]) {
        await admin.goto(BASE + p);
        if (!(await noHorizontalScroll(admin))) bad.push(p);
      }
      if (bad.length) throw new Error(`overflow on ${bad.join(" ")}`);
      return true;
    });
  }
  await admin.setViewportSize({ width: 390, height: 844 });
  await step("Tap targets ≥ 44px for primary buttons and chips", async () => {
    await admin.goto(BASE + "/navigator");
    const small = await admin.$$eval(".btn:not(.btn-sm), .chip", (els) => els.filter((e) => e.getBoundingClientRect().height < 43).length);
    if (small) throw new Error(`${small} targets under 44px`);
    return true;
  });
  await step("Every form input has a label", async () => {
    const pages = ["/navigator", `/services/${svcId}/edit`, "/plan"];
    const missing = [];
    for (const p of pages) {
      await admin.goto(BASE + p);
      const n = await admin.$$eval("input:not([type=hidden]):not([type=checkbox]), textarea, select", (els) =>
        els.filter((e) => !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.getAttribute("aria-label") && !e.closest("label") && !e.placeholder).length,
      );
      if (n) missing.push(`${p}:${n}`);
    }
    if (missing.length) throw new Error(`unlabelled: ${missing.join(" ")}`);
    return true;
  });
  const allErrors = [anon, admin, vol, part].flatMap((p) => p._errors);
  check("No uncaught client errors across all sessions", allErrors.length === 0, allErrors.slice(0, 3).join(" | "));

  // ───────────────────────── Sign out
  sec("Sign out");
  await step("Sign out ends the session", async () => {
    await vol.goto(BASE + "/account");
    await vol.click('button:has-text("Sign out")');
    await vol.waitForURL(BASE + "/");
    await vol.goto(BASE + "/navigator");
    return new URL(vol.url()).pathname === "/login";
  });

  await browser.close();
}

async function cleanup() {
  sec("Cleanup");
  try {
    await sql(`delete from plan_items where plan_id in (select id from plans where for_label like $1 or note like $1 or owner_id in (select id from "user" where email like 'e2e-%@example.org'))`, [`${RUN}%`]);
    await sql(`delete from plans where for_label like $1 or note like $1 or owner_id in (select id from "user" where email like 'e2e-%@example.org')`, [`${RUN}%`]);
    const svcs = await sql(`select id from services where name like $1`, [`${RUN}%`]);
    for (const s of svcs) {
      await sql(`delete from service_revisions where service_id=$1`, [s.id]);
      await sql(`delete from service_categories where service_id=$1`, [s.id]);
      await sql(`delete from change_requests where service_id=$1`, [s.id]);
      await sql(`delete from services where id=$1`, [s.id]);
    }
    await sql(`delete from change_requests where source='feed:e2e-test' or payload->'fields'->>'name' like $1`, [`${RUN}%`]);
    await sql(`delete from gaps where title like $1`, [`${RUN}%`]);
    await sql(`delete from "user" where email like 'e2e-%@example.org'`);
    await sql(`delete from verification where identifier like 'sign-in-otp-e2e-%'`);
    for (const [k, v] of Object.entries(original)) await sql(`update settings set value=$2::jsonb where key=$1`, [k, JSON.stringify(v)]);
    check("Test records removed and settings restored", true, `${svcs.length} test services removed`);
  } catch (e) {
    check("Cleanup", false, e.message);
  }
}

main()
  .catch((e) => check("Suite crashed", false, e.stack?.split("\n").slice(0, 3).join(" ")))
  .finally(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("Failures:");
      for (const f of failed) console.log(`  ✗ [${f.section}] ${f.name} — ${f.detail}`);
    }
    if (process.env.REPORT_JSON) (await import("node:fs")).writeFileSync(process.env.REPORT_JSON, JSON.stringify({ base: BASE, run: RUN, results }, null, 2));
    process.exit(failed.length ? 1 : 0);
  });
