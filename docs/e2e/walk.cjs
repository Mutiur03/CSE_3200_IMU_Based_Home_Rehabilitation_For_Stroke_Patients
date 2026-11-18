// Headless UI walk. Run from web/: node ../docs/e2e/walk.cjs  (env: SEED_PASSWORD)
const { chromium } = require("playwright");
const path = require("path");
const OUT = path.resolve(__dirname), BASE = "http://127.0.0.1:3400", PW = process.env.SEED_PASSWORD;
const VPS = { d: { width: 1440, height: 900 }, m: { width: 375, height: 812 } };
const BAD = /\b(NaN|undefined|null|Infinity)\b/;
const findings = [];
async function login(ctx, email) { const r = await ctx.request.post(BASE + "/api/auth/login", { data: { email, password: PW } }); if (!r.ok()) throw new Error("login " + email); }
async function shot(page, name, vp, opts = {}) {
  const logs = [], fails = [], reqs = [];
  const onc = (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); };
  const onr = (r) => { if (r.url().includes("/api/") && r.status() >= 400) fails.push(r.status() + " " + r.url().replace(BASE, "")); };
  const onq = (r) => { if (r.url().includes("/api/")) reqs.push(r.url().replace(BASE, "")); };
  page.on("console", onc); page.on("response", onr); page.on("request", onq);
  await page.setViewportSize(VPS[vp]);
  if (opts.url) await page.goto(BASE + opts.url, { waitUntil: "networkidle" });
  if (opts.act) await opts.act(page);
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, txt: document.body.innerText, h: document.documentElement.scrollHeight }));
  const file = `${name}-${vp}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  const dup = reqs.filter((u, i) => reqs.indexOf(u) !== i);
  const f = { name: file, overflow: m.sw > m.iw ? `${m.sw}>${m.iw}` : null, bad: (m.txt.match(BAD) || [])[0] || null, console: logs, failed: fails, dupReqs: opts.dupCheck ? dup : undefined, retry: /retry/i.test(m.txt) };
  findings.push(f); console.log(JSON.stringify(f));
  page.off("console", onc); page.off("response", onr); page.off("request", onq);
}
(async () => {
  const b = await chromium.launch();
  for (const vp of ["d", "m"]) {
    let ctx = await b.newContext({ viewport: VPS[vp] }); let page = await ctx.newPage();
    await shot(page, "login", vp, { url: "/login" });
    // real UI login as patient
    await page.fill('input[type=email], input[name=email]', "patient@demo"); await page.fill('input[type=password]', PW);
    await page.click('button[type=submit]'); await page.waitForURL(/\/patient/, { timeout: 8000 }).catch(() => findings.push({ name: "ui-login-patient-" + vp, error: "no redirect" }));
    for (const [n, u] of [["patient", "/patient"], ["patient-play", "/patient/play"], ["patient-progress", "/patient/progress"], ["patient-messages", "/patient/messages"]]) await shot(page, n, vp, { url: u });
    await ctx.close();
    ctx = await b.newContext({ viewport: VPS[vp] }); await login(ctx, "doctor@demo"); page = await ctx.newPage();
    await shot(page, "doctor", vp, { url: "/doctor" });
    await shot(page, "doctor-patient-overview", vp, { url: "/doctor/patients/3" });
    for (const t of ["sessions", "marking", "plan", "messages"]) await shot(page, "doctor-patient-" + t, vp, { act: async (p) => { await p.getByRole("tab", { name: new RegExp("^" + t, "i") }).click(); } });
    await shot(page, "doctor-session8", vp, { url: "/doctor/sessions/8" });
    await shot(page, "doctor-session3", vp, { url: "/doctor/sessions/3" });
    await shot(page, "doctor-report", vp, { url: "/doctor/patients/3/report" });
    await page.emulateMedia({ media: "print" }); await shot(page, "doctor-report-print", vp, {}); await page.emulateMedia({ media: "screen" });
    await shot(page, "doctor-patient-999", vp, { url: "/doctor/patients/999", dupCheck: true });
    await shot(page, "doctor-session-999", vp, { url: "/doctor/sessions/999", dupCheck: true });
    await ctx.close();
    ctx = await b.newContext({ viewport: VPS[vp] }); await login(ctx, "admin@demo"); page = await ctx.newPage();
    await shot(page, "admin", vp, { url: "/admin" });
    await shot(page, "admin-create-user", vp, { act: async (p) => { await p.getByRole("button", { name: "Create user" }).first().click(); } });
    await page.keyboard.press("Escape");
    await shot(page, "admin-register-device", vp, { act: async (p) => { await p.getByRole("button", { name: "Register device" }).first().click(); } });
    await ctx.close();
  }
  require("fs").writeFileSync(path.join(OUT, "walk-results.json"), JSON.stringify(findings, null, 1));
  await b.close();
})();
