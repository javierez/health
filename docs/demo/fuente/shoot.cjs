// The guide's screenshots after the 18-oct redesign. Real app on localhost:3100;
// nothing is sent to the chat. «Piel» is shot with whatever is on it.
const { createRequire } = require("module");
const { execSync } = require("child_process");
const puppeteer = createRequire("/Users/javierperezgarcia/Desktop/health/package.json")("puppeteer-core");
const OUT = "/Users/javierperezgarcia/Desktop/health/docs/demo/shots/";
const BASE = "http://localhost:3100";
const DB = "postgresql://javierperezgarcia@localhost:5432/health";
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (q) => execSync(`psql ${DB} -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const done = [];
const rectJs = (js) => `(() => { const e = ${js}; if (!e) return null; e.scrollIntoView({block:"center"}); const b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`;
const exact = (tag, text) => `[...document.querySelectorAll("${tag}")].find((e) => e.textContent.trim() === ${JSON.stringify(text)})`;
const card = (h) => `${exact("h2", h)}?.closest("[class*='rounded-2xl']")`;
const openBtn = (t) => `[...document.querySelectorAll("button, a")].find((e) => !e.closest("dialog") && e.textContent.trim().startsWith(${JSON.stringify(t)}))`;
const dlgBtn = (t) => `[...document.querySelectorAll("dialog[open] button")].find((e) => e.textContent.trim() === ${JSON.stringify(t)})`;
const DIALOG = `document.querySelector("dialog[open]")`;
const want = (n) => !ONLY || ONLY.test(n);
async function shot(p, name, js, { maxH = 2400, pad = 12 } = {}) {
  if (!want(name)) return;
  try {
    if (js) {
      const r = await p.evaluate(rectJs(js));
      if (!r) throw new Error("no element");
      await wait(300);
      const b = await p.evaluate(rectJs(js));
      await p.screenshot({ path: OUT + name + ".png", clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.w + pad * 2, height: Math.min(b.h, maxH) + pad * 2 }, captureBeyondViewport: true });
    } else await p.screenshot({ path: OUT + name + ".png" });
    done.push(name); console.log("✓", name);
  } catch (e) { console.log("✗", name, e.message.slice(0, 160)); }
}
async function full(p, name) { if (!want(name)) return; await p.screenshot({ path: OUT + name + ".png", fullPage: true }); done.push(name); console.log("✓", name); }
async function click(p, js, ms = 900) { const ok = await p.evaluate(`(() => { const e = ${js}; if (!e) return false; e.click(); return true; })()`); await wait(ms); if (!ok) console.log("  (no click:", js.slice(0, 90), ")"); return ok; }
async function esc(p) { await p.keyboard.press("Escape"); await wait(500); }
async function dlgScroll(p, y) { await p.evaluate((y) => { const d = document.querySelector("dialog[open]"); if (d) { const s = [...d.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== "visible") ?? d; s.scrollTop = y; } }, y); await wait(500); }
// Next's dev badge («N», bottom left) is not part of the app.
const hideBadge = (pg) => pg.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(s); }));
const loginCard = async (p, name) => { if (!want(name)) return; const r = await p.$eval("main .max-w-md", (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }); await p.screenshot({ path: OUT + name + ".png", clip: { x: r.x - 32, y: r.y - 24, width: r.w + 64, height: r.h + 48 } }); done.push(name); console.log("✓", name); };

(async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    const p = await b.newPage();
    await hideBadge(p);
    await p.setViewport({ width: 1280, height: 860, deviceScaleFactor: 2 });

    // ── Login
    await p.goto(BASE + "/?ver=panel", { waitUntil: "networkidle0" });
    await wait(600);
    await p.type("#email", process.env.AUTH_EMAIL);
    await p.type("#password", "no-es-esta-1");
    await p.click("button[type=submit]");
    await wait(1800);
    await loginCard(p, "02-login-error");
    await p.reload({ waitUntil: "domcontentloaded" });
    await wait(800);
    await p.type("#email", process.env.AUTH_EMAIL);
    await p.type("#password", process.env.AUTH_PASSWORD);
    await loginCard(p, "03-login-relleno");
    await p.click("button[type=submit]");
    await p.waitForFunction(() => location.search.includes("ver=panel") && document.querySelectorAll("h2").length > 3, { timeout: 180000 });
    await wait(2500);

    // ── Panel
    await shot(p, "10-panel");
    await full(p, "11-panel-entero");
    await p.evaluate(() => scrollTo(0, 0));
    await shot(p, "12-cabecera", `document.querySelector("header")`, { pad: 16 });
    await click(p, `document.querySelector("button[aria-label=Cuenta]")`, 1500);
    await shot(p, "13-cuenta", DIALOG, { pad: 0 });
    await esc(p);

    // ── Lo urgente + historial médico
    await shot(p, "20-urgente", card("Lo urgente"));
    await click(p, openBtn("Pedir cita de la punción"));
    await shot(p, "21-urgente-paaf");
    await shot(p, "22-urgente-paaf-cerca", DIALOG, { pad: 0 });
    await esc(p);
    await click(p, openBtn("PET-TAC"));
    await shot(p, "23-urgente-pettac", DIALOG, { pad: 0 });
    await esc(p);
    await click(p, openBtn("Historial médico"));
    await shot(p, "24-historial");
    await dlgScroll(p, 700); await shot(p, "25-historial-orina");
    await dlgScroll(p, 1400); await shot(p, "26-historial-antecedentes");
    await dlgScroll(p, 0);
    await click(p, `[...document.querySelectorAll("dialog[open] summary")].find((e) => e.textContent.includes("TAC de cuello"))`);
    await p.evaluate(() => [...document.querySelectorAll("dialog[open] summary")].find((e) => e.textContent.includes("TAC de cuello"))?.scrollIntoView({ block: "start" }));
    await wait(400);
    await shot(p, "27-historial-tac");
    await click(p, `[...document.querySelectorAll("dialog[open] button")].find((e) => e.textContent.trim() === "Añadir a mano")`);
    await p.evaluate(() => document.querySelector("dialog[open] form")?.scrollIntoView({ block: "center" }));
    await wait(400);
    await shot(p, "28-historial-anadir");
    await esc(p);

    // ── Hoy
    await shot(p, "30-hoy", card("Hoy"));
    await click(p, openBtn("A la cama"));
    await shot(p, "31-hoy-por-que", DIALOG, { pad: 0 });
    await esc(p);
    await click(p, openBtn("Pastilla"));
    await shot(p, "32-hoy-pastilla", DIALOG, { pad: 0 });
    await esc(p);
    await click(p, openBtn("Duerme 7 h"));
    await shot(p, "33-hoy-haz", DIALOG, { pad: 0 });
    await esc(p);

    // ── Esta semana
    await shot(p, "40-semana", card("Esta semana"));
    for (const [i, t] of ["Gimnasio", "Correr o bici", "Pastilla", "Dormir"].entries()) {
      const ok = await click(p, `[...${card("Esta semana")}.querySelectorAll("button")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(t)}))`);
      if (ok) { await shot(p, `4${1 + i}-semana-${["gimnasio", "correr", "pastilla", "dormir"][i]}`, DIALOG, { pad: 0 }); await esc(p); }
    }

    // ── Entrenos on the panel
    await shot(p, "34-entrenos", card("Entrenos"));

    // ── Comida: today's meals, the first opened food by food
    await shot(p, "48-comida", card("Comida"));
    if (want("49-comida-detalle") && (await click(p, `${card("Comida")}?.querySelector("li button")`, 1200))) {
      await shot(p, "49-comida-detalle", DIALOG, { pad: 0 });
      await esc(p);
    }

    // ── Piel: one cream opened; a supplement, opened from «Comida»
    await shot(p, "51-productos", card("Piel"));
    for (const [area, name, where] of [["piel", "52-producto-piel", "Piel"], ["suplemento", "53-producto-suplemento", "Comida"]]) {
      const first = psql(`select name from products where retired_at is null and area = '${area}' order by id limit 1`);
      if (!first || !want(name)) continue;
      await click(p, `[...${card(where)}.querySelectorAll("button")].find((e) => e.textContent.includes(${JSON.stringify(first)}))`, 1200);
      await shot(p, name, DIALOG, { pad: 0 });
      await esc(p);
    }

    // ── Lo que te hace bien y mal
    await shot(p, "55-hallazgos", card("Lo que te hace bien y mal"));
    await click(p, openBtn("Acostarte antes"), 1200);
    await shot(p, "56-hallazgo", DIALOG, { pad: 0 });
    await esc(p);

    // ── Datos
    await click(p, openBtn("Datos"), 1500);
    await shot(p, "60-datos", DIALOG, { pad: 0, maxH: 1400 });
    await dlgScroll(p, 900); await shot(p, "61-datos-abajo");
    await click(p, dlgBtn("Día a día"), 1200);
    for (const [i, c] of ["Todo", "Sueño", "Entreno", "Comidas", "Trabajo", "Vida", "WhatsApp", "Médico"].entries()) {
      await click(p, dlgBtn(c));
      await dlgScroll(p, 0);
      await shot(p, `${62 + i}-dia-${c.normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase()}`);
      if (c === "WhatsApp") {
        await shot(p, "68-whatsapp-temas", `[...document.querySelectorAll("dialog[open] p, dialog[open] h3")].find((e) => e.textContent.includes("Qué temas te tensan"))?.closest("[class*='rounded']")`, { pad: 8 });
      }
    }
    await click(p, dlgBtn("Lo que apuntas"), 1200);
    await dlgScroll(p, 0);
    await shot(p, "59-lo-que-apuntas", DIALOG, { pad: 0, maxH: 1400 });
    await esc(p);

    // ── Efectos (?ver=efectos)
    await p.goto(BASE + "/?ver=efectos", { waitUntil: "networkidle0", timeout: 180000 });
    await wait(1500);
    await full(p, "58-efectos-entero");

    // ── Entrenos (?ver=entrenos): the whole view, then one exercise opened
    await p.goto(BASE + "/?ver=entrenos", { waitUntil: "networkidle0", timeout: 180000 });
    await wait(1500);
    await full(p, "35-entrenos-vista");
    await click(p, `(() => { const h = ${exact("h2", "Cuánto levantas")}; return h && [...document.querySelectorAll("button")].find((b) => h.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); })()`, 1200);
    await shot(p, "36-entrenos-ejercicio", DIALOG, { pad: 0 });
    await esc(p);

    // ── Chat (nothing is sent)
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await wait(1800);
    await shot(p, "70-chat");
    await p.evaluate(() => { const s = [...document.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible"); (s ?? document.scrollingElement).scrollTop = 0; });
    await wait(600);
    await shot(p, "72-chat-arriba");
    const ta = await p.$("textarea");
    if (ta) { await ta.type("Esta noche he dormido fatal, ¿qué hago hoy con el gimnasio?"); await wait(400); }
    await shot(p, "73-chat-escribiendo");
    await shot(p, "74-chat-barra", `document.querySelector("textarea")?.closest("form") ?? document.querySelector("textarea")?.parentElement`, { pad: 12 });

    // ── Mobile
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await wait(1500);
    await shot(p, "81-movil-chat");
    await p.goto(BASE + "/?ver=panel", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.querySelectorAll("h2").length > 3, { timeout: 180000 });
    await wait(2000);
    await shot(p, "82-movil-panel");
    await click(p, openBtn("Pedir cita de la punción"));
    await shot(p, "83-movil-urgente");
    await esc(p);
    await p.evaluate(`${exact("h2", "Hoy")}?.scrollIntoView({block:"start"})`); await wait(500);
    await shot(p, "84-movil-hoy");
    await p.evaluate(`${exact("h2", "Esta semana")}?.scrollIntoView({block:"start"})`); await wait(500);
    await shot(p, "85-movil-semana");
    await p.evaluate(`${exact("h2", "Piel")}?.scrollIntoView({block:"start"})`); await wait(500);
    await shot(p, "86-movil-productos");
    await p.evaluate(() => scrollTo(0, 0)); await wait(300);
    await click(p, openBtn("Datos"), 1500);
    await shot(p, "87-movil-datos");
    await esc(p);
    await full(p, "88-movil-panel-entero");

    const ctx = await b.createBrowserContext();
    const q = await ctx.newPage();
    await hideBadge(q);
    await q.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await q.goto(BASE + "/", { waitUntil: "networkidle0" });
    await wait(600);
    await shot(q, "80-movil-login");
    await click(q, `[...document.querySelectorAll("button")].find((e) => e.textContent.trim().startsWith("¿Olvidaste"))`, 600);
    await shot(q, "89-movil-recuperar");
  } finally {
    await b.close();
  }
  console.log(done.length, "capturas");
})().catch((e) => { console.error(e); process.exit(1); });
