const { createRequire } = require("module");
const puppeteer = createRequire("/Users/javierperezgarcia/Desktop/health/package.json")("puppeteer-core");
(async () => {
  const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  for (const id of process.argv.slice(3)) {
    await p.goto("http://localhost:3200/#" + id, { waitUntil: "networkidle0" });
    await p.evaluate(() => Promise.all([...document.querySelectorAll("img")].map((i) => { i.loading = "eager"; return i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }); })));
    await p.evaluate((id) => document.getElementById(id).scrollIntoView(), id);
    await new Promise((r) => setTimeout(r, 600));
    await p.screenshot({ path: `${process.argv[2]}/g-${id}.png` });
  }
  await b.close();
})();
