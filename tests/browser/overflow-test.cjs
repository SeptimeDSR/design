const { chromium } = require(process.env.PW ?? "playwright");
const SITE = process.env.SITE_URL ?? "http://localhost:3123";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const out = {};
  for (const w of [1440, 1024, 768, 390]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 900 } })).newPage();
    await p.goto(SITE, { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    out[w] = await p.evaluate(() =>
      [...document.querySelectorAll("#interruptions li")].map((li) => {
        const h = li.querySelector("h3");
        const r = document.createRange();
        r.selectNodeContents(h);
        const t = r.getBoundingClientRect();
        const c = li.getBoundingClientRect();
        return Math.round(Math.max(0, t.right - (c.right - 16)));
      }).filter((x) => x > 0),
    );
  }
  console.log(JSON.stringify(out));
  await b.close();
})();
