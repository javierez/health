// The product book's clips: the real app on localhost:3100, logged in with the
// local test account, recorded with Puppeteer's screencast. Nothing is sent.
//   AUTH_EMAIL=… AUTH_PASSWORD=… node docs/libro/fuente/record.cjs
const { createRequire } = require("module");
const puppeteer = createRequire("/Users/javierperezgarcia/Desktop/health/package.json")("puppeteer-core");
const OUT = "/Users/javierperezgarcia/Desktop/health/docs/libro/clips/";
const BASE = "http://localhost:3100";
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DESK = { width: 1280, height: 800, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const exact = (tag, text) => `[...document.querySelectorAll("${tag}")].find((e) => e.textContent.trim() === ${JSON.stringify(text)})`;
const hideBadge = (pg) => pg.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(s); }));

// Eases the page (or the open dialog's scroller) to y over ms.
async function glide(p, y, ms) {
  await p.evaluate(async (y, ms) => {
    const d = document.querySelector("dialog[open]");
    const s = d ? ([...d.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== "visible") ?? d) : document.scrollingElement;
    const from = s.scrollTop, to = Math.min(y, s.scrollHeight - s.clientHeight), t0 = performance.now();
    await new Promise((done) => { const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; s.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(step) : done(); }; requestAnimationFrame(step); });
  }, y, ms);
}
const toEl = (p, js) => p.evaluate(`(() => { const e = ${js}; if (!e) return 0; return e.getBoundingClientRect().top + scrollY - 16; })()`);
async function click(p, js, ms = 900) { await p.evaluate(`(() => { const e = ${js}; e && e.click(); })()`); await wait(ms); }

async function clip(p, name, view, run) {
  if (ONLY && !ONLY.test(name)) return;
  await p.setViewport(view);
  const rec = await p.screencast({ path: OUT + name + ".webm" });
  try { await run(); } finally { await rec.stop(); }
  console.log("✓", name);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    const p = await b.newPage();
    await hideBadge(p);
    await p.setViewport(DESK);
    await p.goto(BASE + "/?ver=panel", { waitUntil: "networkidle0" });
    await p.type("#email", process.env.AUTH_EMAIL);
    await p.type("#password", process.env.AUTH_PASSWORD);
    await p.click("button[type=submit]");
    await p.waitForFunction(() => document.querySelectorAll("h2").length > 3, { timeout: 180000 });
    await wait(2500);

    // The panel, top to bottom: the entry animation, then a slow scroll.
    await clip(p, "panel", DESK, async () => {
      await p.reload({ waitUntil: "networkidle0" }); await wait(2200);
      await glide(p, 99999, 9000); await wait(1200);
      await glide(p, 0, 2500); await wait(800);
    });

    // «Datos»: the numbers behind the panel, tab by tab.
    await clip(p, "datos", DESK, async () => {
      await p.goto(BASE + "/?ver=panel", { waitUntil: "networkidle0" }); await wait(1500);
      await click(p, `[...document.querySelectorAll("button")].find((e) => e.textContent.trim().startsWith("Datos"))`, 1800);
      await glide(p, 900, 3000); await wait(600); await glide(p, 0, 1200);
      await click(p, `[...document.querySelectorAll("dialog[open] button")].find((e) => e.textContent.trim() === "Día a día")`, 1600);
      for (const t of ["Sueño", "Entreno", "WhatsApp", "Médico"]) await click(p, `[...document.querySelectorAll("dialog[open] button")].find((e) => e.textContent.trim() === ${JSON.stringify(t)})`, 1500);
    });

    // Entrenos on the phone: the body, then the routine with its mannequins moving.
    await clip(p, "entrenos-movil", PHONE, async () => {
      await p.goto(BASE + "/?ver=entrenos", { waitUntil: "networkidle0", timeout: 180000 }); await wait(2500);
      await glide(p, await toEl(p, exact("h2", "Rutinas")), 2500); await wait(5200);
      await glide(p, await toEl(p, exact("h2", "Sesiones")), 2000); await wait(1500);
    });

    // The panel on the phone, and one item opened.
    await clip(p, "panel-movil", PHONE, async () => {
      await p.goto(BASE + "/?ver=panel", { waitUntil: "networkidle0" }); await wait(2500);
      await glide(p, await toEl(p, exact("h2", "Hoy")), 1800); await wait(1200);
      await glide(p, await toEl(p, exact("h2", "Esta semana")), 2200); await wait(1500);
      await glide(p, await toEl(p, exact("h2", "Piel")), 2200); await wait(1200);
      await click(p, `[...(${exact("h2", "Piel")}?.closest("[class*='rounded-2xl']")?.querySelectorAll("button") ?? [])][0]`, 2500);
    });
  } finally {
    await b.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
