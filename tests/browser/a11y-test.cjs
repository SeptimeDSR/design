const { chromium } = require(process.env.PW ?? "playwright");
const SITE = process.env.SITE_URL ?? "http://localhost:3123";

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const results = {};

  // I6 + I7 (compte à rebours) : sans JavaScript
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto(SITE);
    await p.waitForTimeout(1200);
    results.noJsHeroVisible = await p.evaluate(() => {
      const h1 = document.querySelector("h1");
      const cta = [...document.querySelectorAll("a")].find((a) => a.textContent.includes("Écrire sur WhatsApp") && a.closest("section"));
      const visible = (el) => {
        let n = el;
        while (n && n !== document.body) {
          if (parseFloat(getComputedStyle(n).opacity) < 0.95) return false;
          n = n.parentElement;
        }
        return true;
      };
      return visible(h1) && visible(cta);
    });
    results.noJsNumeralsHidden = await p.evaluate(() =>
      [...document.querySelectorAll("[data-n]")].every((n) => getComputedStyle(n).opacity === "0" || getComputedStyle(n).display === "none"),
    );
    await ctx.close();
  }

  // I7 (rail) + I8 : mouvement réduit, desktop
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.goto(SITE, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    const last = p.locator("#interruptions li").last();
    // Défilement vertical uniquement, comme un humain (pas de scroll programmatique du conteneur).
    await last.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100));
    await p.waitForTimeout(800);
    results.reducedLastCardReachable = await last.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2));
      const y = Math.min(innerHeight - 2, Math.max(1, r.top + r.height / 2));
      const hit = document.elementFromPoint(x, y);
      return r.right <= innerWidth + 1 && r.left >= -1 && !!hit && el.contains(hit);
    });
    await p.locator("#top section").first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(1500);
    results.reducedPlayersPaused = await p.evaluate(() => {
      const frames = [...document.querySelectorAll("[data-viral-phone]")].map((el) => el.getAttribute("data-playing"));
      return frames.length > 0 && frames.every((f) => f === "false");
    });
    results.pauseButtons = await p.locator("[data-viral-phone] button").count();
    await ctx.close();
  }

  console.log(JSON.stringify(results));
  await b.close();
})();
