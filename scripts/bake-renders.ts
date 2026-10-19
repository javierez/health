/**
 * Bakes the aluminium objects of `scripts/renders/objects.js` into
 * `public/renders/<key>.webp`: the panel shows images, so no page ships
 * WebGL. Run `pnpm renders` after changing an object.
 *
 * Uses the Chrome installed on the laptop (puppeteer-core downloads nothing).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = process.cwd();
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript" };

// Only what the page needs: the bake page, the objects and three.
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!));
  if (!path.startsWith("/scripts/renders/") && !path.startsWith("/node_modules/three/")) return res.writeHead(404).end();
  try {
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(join(ROOT, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const port = (server.address() as { port: number }).port;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page:", e));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.goto(`http://127.0.0.1:${port}/scripts/renders/bake.html`);
  await page.waitForFunction("window.ready === true", { timeout: 20_000 });
  const images = await page.evaluate(() => (window as unknown as { bake: () => Record<string, string> }).bake());
  const dir = join(ROOT, "public/renders");
  await mkdir(dir, { recursive: true });
  for (const [key, url] of Object.entries(images)) await writeFile(join(dir, `${key}.webp`), Buffer.from(url.split(",")[1]!, "base64"));
  console.log(`${Object.keys(images).length} → ${dir}`);
  const spins = await page.evaluate(() => (window as unknown as { spins: Record<string, number> }).spins);
  for (const [key, frames] of Object.entries(spins)) {
    const url = await page.evaluate((k, n) => (window as unknown as { spin: (k: string, n: number) => string }).spin(k, n), key, frames);
    await writeFile(join(dir, `${key}-spin.webp`), Buffer.from(url.split(",")[1]!, "base64"));
    console.log(`${key}-spin: ${frames} frames`);
  }
} finally {
  await browser.close();
  server.close();
}
