const { chromium } = require(process.env.PW ?? "playwright");
const SITE = process.env.SITE_URL ?? "http://localhost:3123";
const SP = process.env.SP ?? require("node:os").tmpdir();

const countAudio = () => {
  window.__audioCtx = 0;
  const Orig = window.AudioContext;
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a);
      window.__audioCtx++;
    }
  };
};

async function run(name, viewport, opts = {}) {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({ viewport, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  const p = await ctx.newPage();
  await p.addInitScript(countAudio);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  await p.goto(SITE, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${SP}/site-${name}-0.png`, timeout: 60000 });

  const report = { name };
  report.overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  report.h1Visible = await p.evaluate(() => {
    const h = document.querySelector("h1");
    const r = h.getBoundingClientRect();
    return getComputedStyle(h.parentElement).opacity === "1" && r.top >= 0 && r.bottom <= innerHeight;
  });
  report.hud0 = await p.evaluate(() => document.querySelector(".fixed.bottom-0 p")?.textContent);

  const hudSeen = new Set();
  let shot = 1;
  const steps = opts.reduced ? 30 : 90;
  for (let i = 0; i < steps; i++) {
    await p.mouse.wheel(0, 400);
    await p.waitForTimeout(90);
    if (i % 6 === 5) hudSeen.add(await p.evaluate(() => document.querySelector(".fixed.bottom-0 p")?.textContent));
    if (!opts.reduced && i % 15 === 14) {
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${SP}/site-${name}-${shot++}.png`, timeout: 60000 });
    }
  }
  report.hudStates = [...hudSeen];
  report.audioBeforeClick = await p.evaluate(() => window.__audioCtx);

  const before = await p.evaluate(() => document.querySelectorAll("#top ul li").length);
  for (let i = 0; i < 40; i++) {
    await p.mouse.wheel(0, 1200);
    await p.waitForTimeout(80);
  }
  await p.waitForTimeout(800);
  report.feedBefore = before;
  report.feedAfter = await p.evaluate(() => document.querySelectorAll("#top ul li").length);
  report.secrets = await p.evaluate(() => [...document.querySelectorAll("aside")].length);
  report.stretch = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--stretch"));

  await p.getByRole("button", { name: /Activer le son/ }).first().click();
  await p.waitForTimeout(300);
  report.audioAfterClick = await p.evaluate(() => window.__audioCtx);
  report.errors = errors;
  console.log(JSON.stringify(report));
  await b.close();
}

(async () => {
  await run("desktop", { width: 1440, height: 900 });
  await run("mobile", { width: 390, height: 844 });
  await run("reduced", { width: 1440, height: 900 }, { reduced: true });
})();
