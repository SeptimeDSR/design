const { chromium } = require(process.env.PW ?? "playwright");
const SITE = process.env.SITE_URL ?? "http://localhost:3123";
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(SITE, { waitUntil: "networkidle" });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1500);
  const first = await p.evaluate(() => document.querySelectorAll("#top ul li").length);
  for (let i = 0; i < 5; i++) { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(700); }
  const after = await p.evaluate(() => document.querySelectorAll("#top ul li").length);
  console.log(JSON.stringify({ first, after, grows: after > first }));
  await b.close();
})();
