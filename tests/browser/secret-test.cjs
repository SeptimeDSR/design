const { chromium } = require(process.env.PW ?? "playwright");
const SITE = process.env.SITE_URL ?? "http://localhost:3123";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const counts = [];
  for (let run = 0; run < 6; run++) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(SITE, { waitUntil: "networkidle" });
    for (let i = 0; i < 70; i++) { await p.mouse.wheel(0, 500); await p.waitForTimeout(60); }
    await p.waitForTimeout(800);
    counts.push(await p.evaluate(() => document.querySelectorAll("aside").length));
    await p.close();
  }
  console.log(JSON.stringify({ counts, mean: counts.reduce((a, b) => a + b, 0) / counts.length, expected: 5 * 0.55 }));
  await b.close();
})();
