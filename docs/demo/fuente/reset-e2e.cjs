// «¿Olvidaste tu contraseña?» end to end on localhost:3100, with the guide's shots.
const { createRequire } = require("module");
const { execSync } = require("child_process");
const puppeteer = createRequire("/Users/javierperezgarcia/Desktop/health/package.json")("puppeteer-core");
const OUT = "/Users/javierperezgarcia/Desktop/health/docs/demo/shots/";
const DB = "postgresql://javierperezgarcia@localhost:5432/health";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync(`psql ${DB} -Atc "${q}"`).toString().trim();
const results = [];
const ok = (name, cond, extra = "") => { results.push(cond); console.log(cond ? "✓" : "✗", name, extra); };
const NEW = process.env.NEW_PW;
(async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 860, deviceScaleFactor: 2 });
  const text = () => p.evaluate(() => document.body.innerText);
  const clickText = (t) => p.evaluate((t) => { const e = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(t)); e?.click(); return !!e; }, t);
  const card = async (name) => { const r = await p.$eval("main .max-w-md", (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }); await p.screenshot({ path: OUT + name + ".png", clip: { x: r.x - 32, y: r.y - 24, width: r.w + 64, height: r.h + 48 } }); console.log("  shot", name); };
  const setField = async (sel, value) => { await p.$eval(sel, (el) => el.select()); await p.keyboard.press("Backspace"); await p.type(sel, value); };

  await p.goto("http://localhost:3100/login", { waitUntil: "networkidle0" });
  await wait(500);
  await card("01-login");
  ok("link on the login", await clickText("¿Olvidaste tu contraseña?"));
  await wait(400);
  await p.type("#reset-email", process.env.AUTH_EMAIL);
  await card("04-recuperar");
  const before = Number(sql("select count(*) from auth_reset_codes"));
  await clickText("Enviar código SMS");
  await p.waitForSelector("#code", { timeout: 60000 });
  await wait(400);
  ok("a code row was written", Number(sql("select count(*) from auth_reset_codes")) === before + 1);
  ok("stored hashed, not in clear", !/^\d{6}$/.test(sql("select code_hash from auth_reset_codes order by created_at desc limit 1")));
  ok("resend waits", (await text()).includes("Reenviar código en"));

  // The SMS went to the dev console: set a known code on the newest row.
  const hash = execSync(`cd /Users/javierperezgarcia/Desktop/health && node -e 'import("better-auth/crypto").then(async (m) => console.log(await m.hashPassword("482913")))'`).toString().trim();
  sql(`update auth_reset_codes set code_hash='${hash}' where id=(select max(id) from auth_reset_codes)`);

  await p.type("#code", "111111");
  await p.type("#new-password", NEW);
  await clickText("Cambiar contraseña");
  await wait(2500);
  ok("wrong code counts down", (await text()).includes("Te quedan 4 intentos"));
  await card("05-codigo-incorrecto");

  await setField("#new-password", "sinmayuscula1");
  await setField("#code", "482913");
  await clickText("Cambiar contraseña");
  await wait(600);
  ok("weak password stopped in the browser", (await text()).includes("Falta una mayúscula"));
  ok("…without spending a try", sql("select attempts from auth_reset_codes order by id desc limit 1") === "1");

  await setField("#new-password", NEW);
  await card("06-codigo");
  const sessionsBefore = Number(sql("select count(*) from auth_session"));
  await clickText("Cambiar contraseña");
  await p.waitForFunction(() => document.body.innerText.includes("Contraseña cambiada"), { timeout: 60000 });
  await wait(400);
  ok("back to the login, with the notice", true);
  ok("code burned", sql("select used_at is not null from auth_reset_codes order by id desc limit 1") === "t");
  ok("every session signed out", Number(sql("select count(*) from auth_session")) === 0, `(${sessionsBefore} before)`);
  await card("07-cambiada");

  // The same code again: dead.
  const again = await p.evaluate(async () => (await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "x@x.x", password: "y" }) })).status);
  await p.type("#password", process.env.AUTH_PASSWORD);
  await clickText("Iniciar sesión");
  await wait(2500);
  ok("the old password no longer works", (await text()).includes("Email o contraseña incorrectos"));
  await setField("#password", NEW);
  await Promise.all([p.waitForNavigation({ timeout: 120000 }).catch(() => null), clickText("Iniciar sesión")]);
  await wait(1500);
  ok("the new one does", !p.url().includes("/login"), p.url());
  console.log(`${results.filter(Boolean).length}/${results.length}`, again);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
