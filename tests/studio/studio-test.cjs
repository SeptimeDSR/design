// Test navigateur du Studio : console propre, lecture vidéo, linter, publication en deux temps (souris puis clavier), 390 px.
const { chromium } = require(process.env.PW ?? `${require("node:child_process").execSync("npm root -g").toString().trim()}/playwright`);
const BASE = process.env.BASE ?? "http://127.0.0.1:4399";
const OUT = process.env.OUT ?? require("node:os").tmpdir();
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => !r.url().endsWith(".mp4") && !r.url().includes("/video") && errors.push(`requête ratée ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".video");
  check("2 vidéos listées", (await page.locator(".video").count()) === 2);
  await page.waitForFunction(() => document.querySelector('[data-state="voice"]').textContent !== "…", null, { timeout: 15000 });
  check("état de l'usine affiché", (await page.textContent('[data-state="voice"]')) !== "…", await page.textContent("#state"));

  const ready = await page.waitForFunction(() => [...document.querySelectorAll("video")].every((v) => v.readyState >= 2), null, { timeout: 15000 }).then(() => true, () => false);
  check("les vidéos se chargent (readyState ≥ 2)", ready);
  const played = await page.evaluate(async () => {
    const v = document.querySelector("video");
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 1200));
    v.pause();
    return v.currentTime;
  });
  check("la vidéo joue", played > 0.5, `${played.toFixed(2)} s`);

  // Linter : script refusé → règles affichées
  await page.click("#script-box summary");
  await page.fill("#script", JSON.stringify({ hook: "Un hook beaucoup trop long pour tenir dans les trois premières secondes de la vidéo, vraiment beaucoup trop long", beats: [{ text: "un" }], payoff: "deux" }));
  await page.click("#lint");
  await page.waitForSelector("#lint-result li");
  check("« Vérifier » affiche les règles enfreintes", (await page.locator("#lint-result li").count()) > 0, (await page.textContent("#lint-result")).slice(0, 120));
  await page.fill("#script", "{pas du json");
  await page.click("#lint");
  await page.waitForFunction(() => document.querySelector("#lint-result").textContent.includes("JSON"));
  check("JSON invalide expliqué", true, await page.textContent("#lint-result"));
  await page.fill("#script", "");

  const junk = await page.evaluate(() => /\b(null|undefined|NaN|\[object)/.exec(document.body.innerText)?.[0] ?? "");
  check("aucun « null », « undefined » ou « NaN » affiché", junk === "", junk);
  await page.screenshot({ path: `${OUT}/studio-1440.png`, fullPage: true });

  // Publication à la souris, en deux temps
  const first = page.locator("#video-7c1d9a40");
  await first.locator('[data-action="publish"]').click();
  const armedText = await first.locator('[data-action="publish"]').textContent();
  check("premier clic : le bouton demande « OUI #ref »", armedText === "Confirmer : OUI #7c1d", armedText);
  check("rien n'est publié après un seul clic", (await page.evaluate(async () => (await (await fetch("/api/v1/videos/7c1d")).json()).status)) === "notified");
  await page.screenshot({ path: `${OUT}/studio-armed.png`, clip: await first.boundingBox() });
  await first.locator('[data-action="publish"]').click();
  await page.waitForFunction(() => document.querySelector("#video-7c1d9a40 .status").textContent === "Publiée", null, { timeout: 10000 });
  check("second clic : statut Publiée", true);
  check("légende prête affichée", (await first.locator(".outcome").textContent()).includes("Colle la légende"), await first.locator(".outcome").textContent());
  await first.locator(".copy").click();
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check("« Copier la légende » copie la légende", clip.includes("#tontine"), clip.slice(0, 60));

  // Échap désarme
  const second = page.locator("#video-2e5b66e3");
  await second.locator('[data-action="reject"]').click();
  await page.keyboard.press("Escape");
  check("Échap annule l'action armée", (await second.locator('[data-action="reject"]').textContent()) === "Jeter");

  // Publication au clavier seulement
  await second.locator('[data-action="publish"]').focus();
  await page.keyboard.press("Enter");
  const focusedLabel = await page.evaluate(() => document.activeElement.textContent);
  check("clavier : Entrée arme et garde le focus", focusedLabel === "Confirmer : OUI #2e5b", focusedLabel);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#video-2e5b66e3 .status").textContent === "Publiée", null, { timeout: 10000 });
  check("clavier : publiée avec Entrée + Entrée", true);

  // Parcours Tab depuis le début : chaque élément focalisable a un focus visible
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".video");
  const seen = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        const style = getComputedStyle(el.closest("label") ?? el);
        return { tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || el.id || "").trim().slice(0, 30), outline: style.outlineStyle !== "none" && style.outlineWidth !== "0px" };
      }),
    );
  }
  const noOutline = seen.filter((s) => !s.outline && s.tag !== "VIDEO");
  check("focus visible sur tout le parcours Tab", noOutline.length === 0, noOutline.map((s) => `${s.tag}:${s.text}`).join(", "));
  check("le lien d'évitement vient en premier", seen[0].text === "Aller aux vidéos", seen[0].text);

  // Fabriquer : la tâche apparaît, passe à Prête, la vidéo arrive dans la liste
  await page.fill("#topic", "Le marché Mokolo à 5 h du matin ☀️");
  await page.click("#make-submit");
  await page.waitForSelector('.task[data-status="queued"], .task[data-status="running"]');
  check("tâche visible tout de suite", true, await page.textContent(".task"));
  await page.waitForSelector('.task[data-status="done"]', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".video").length === 3, null, { timeout: 10000 });
  check("tâche Prête et vidéo ajoutée, accents et emoji gardés", (await page.textContent(".task")).includes("Mokolo à 5 h du matin ☀️"));

  // Filtres
  await page.click('[data-filter="published"]');
  check("filtre Publiées", (await page.locator(".video").count()) === 2);
  await page.click('[data-filter="rejected"]');
  check("filtre Jetées vide, avec message", (await page.locator(".video").count()) === 0 && (await page.isVisible("#videos-empty")));
  await page.click('[data-filter="all"]');

  // ---------- Réglages ----------
  await page.goto(`${BASE}/#reglages`, { waitUntil: "networkidle" });
  await page.waitForSelector("#settings .feature");
  check("Réglages : 11 fonctions listées", (await page.locator(".feature").count()) === 11);
  check("onglet courant annoncé (aria-current)", (await page.getAttribute('.view-tab[data-view="settings"]', "aria-current")) === "page");
  check("l'atelier est masqué dans les Réglages", !(await page.isVisible("main.layout")));
  const pill = (id) => page.locator(`#feature-${id} .pill`);
  const waitPill = (id, text, timeout = 10000) => page.waitForFunction(([i, t]) => document.querySelector(`#feature-${i} .pill`)?.textContent === t, [id, text], { timeout });

  // WhatsApp : le QR code est une vraie image, avec un texte alternatif
  await page.waitForFunction(() => { const i = document.querySelector("#feature-whatsapp .qr"); return i && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
  check("WhatsApp : le QR code s'affiche (image chargée)", true, await page.getAttribute("#feature-whatsapp .qr", "alt"));
  check("WhatsApp : le mode d'emploi du scan est là", (await page.textContent("#feature-whatsapp .steps")).includes("Appareils connectés"));
  await page.screenshot({ path: `${OUT}/settings-1440.png`, fullPage: true });

  // Interrupteur au clavier : Espace coupe, Espace rallume
  await page.focus("#switch-pexels");
  await page.keyboard.press("Space");
  await waitPill("pexels", "Coupé");
  check("clavier : Espace coupe Pexels (« Coupé »)", !(await page.isChecked("#switch-pexels")));
  await page.keyboard.press("Space");
  await waitPill("pexels", "Clé manquante");
  check("clavier : Espace rallume, la clé manque toujours", await page.isChecked("#switch-pexels"));

  // Clé : refusée d'abord, puis acceptée ; jamais affichée
  await page.fill("#field-pexels-PEXELS_API_KEY", "mauvaise-cle-123");
  await page.click("#feature-pexels .feature-field button");
  await waitPill("pexels", "Actif");
  check("clé collée : la fonction passe à Actif", true);
  check("la clé n'est jamais réaffichée (champ vidé, texte absent)", (await page.inputValue("#field-pexels-PEXELS_API_KEY")) === "" && !(await page.evaluate(() => document.body.innerText)).includes("mauvaise-cle-123"));
  check("indication « enregistrée dans le Studio »", (await page.textContent("#feature-pexels .field-hint")).includes("enregistrée dans le Studio"));
  await page.click('#feature-pexels .feature-actions button:has-text("Tester")');
  await page.waitForFunction(() => document.querySelector("#feature-pexels .test-result").dataset.tone === "error");
  check("Tester : clé refusée, message clair sans la clé", (await page.textContent("#feature-pexels .test-result")).includes("refusée"), await page.textContent("#feature-pexels .test-result"));
  await page.fill("#field-pexels-PEXELS_API_KEY", "good-key");
  await page.click("#feature-pexels .feature-field button");
  await page.click('#feature-pexels .feature-actions button:has-text("Tester")');
  await page.waitForFunction(() => document.querySelector("#feature-pexels .test-result").dataset.tone === "ok");
  check("Tester : clé acceptée", true, await page.textContent("#feature-pexels .test-result"));

  // Installation d'un bouton : barre de progression, journal, puis Actif
  check("Voix : « À installer » au départ", (await pill("voix").textContent()) === "À installer");
  await page.click('#feature-voix button:has-text("Installer")');
  await page.waitForSelector("#feature-voix progress:not([hidden])");
  check("Installer : la barre d'avancement apparaît", true, await page.textContent("#feature-voix .install-step"));
  await waitPill("voix", "Actif", 25000);
  check("Installer : la voix passe à Actif toute seule", true);

  // ComfyUI : trouvé sur le PC, modèles détectés et montrés
  await waitPill("comfyui", "Adresse manquante");
  const useBtn = page.locator('#feature-comfyui button:has-text("Utiliser http://host.docker.internal:8188")');
  check("ComfyUI : l'adresse trouvée est proposée", await useBtn.isVisible());
  await useBtn.click();
  await waitPill("comfyui", "Actif");
  const comfyText = await page.textContent("#feature-comfyui .comfy-ok");
  check("ComfyUI : Wan 2.2 5B détecté avec la carte", comfyText.includes("Wan 2.2 5B") && comfyText.includes("RTX 3070"), comfyText);
  await page.click('#feature-comfyui summary:has-text("Modèles vidéo installés")');
  check("ComfyUI : la liste des modèles installés est montrée", (await page.textContent("#feature-comfyui .models")).includes("wan2.2_ti2v_5B_fp16.safetensors"));

  // Plateformes : décocher Instagram persiste après rechargement
  await page.uncheck('#feature-publication input[value="instagram"]');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#settings .feature");
  await page.waitForFunction(() => document.querySelector('#feature-publication input[value="tiktok"]') !== null);
  check("Plateformes : Instagram décoché persiste", !(await page.isChecked('#feature-publication input[value="instagram"]')) && (await page.isChecked('#feature-publication input[value="tiktok"]')));

  // Le badge de l'onglet compte ce qui reste à régler
  const expected = await page.evaluate(async () => {
    const { features } = await (await fetch("/api/v1/settings")).json();
    return features.filter((f) => f.enabled && ["a-installer", "echec", "cle-manquante", "adresse-manquante", "a-lier", "injoignable", "modeles-manquants"].includes(f.status)).length;
  });
  const badge = await page.evaluate(() => (document.querySelector("#settings-badge").hidden ? 0 : Number(document.querySelector("#settings-badge").textContent)));
  check("badge de l'onglet = fonctions cochées à régler", badge === expected, `${badge} / ${expected}`);

  // Focus visible sur chaque interrupteur (la case est invisible : c'est sa piste qui s'allume)
  const switches = await page.locator(".switch").count();
  let visible = 0;
  for (let i = 0; i < switches; i++) {
    await page.locator(".switch").nth(i).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    visible += await page.evaluate(() => { const ui = document.activeElement.nextElementSibling; return getComputedStyle(ui).outlineStyle !== "none" && getComputedStyle(ui).outlineWidth !== "0px" ? 1 : 0; });
  }
  check("focus visible sur les 11 interrupteurs", visible === switches && switches === 11, `${visible}/${switches}`);
  const junkSettings = await page.evaluate(() => /\b(null|undefined|NaN|\[object)/.exec(document.querySelector("#settings").innerText)?.[0] ?? "");
  check("Réglages : aucun « null », « undefined » ou « NaN »", junkSettings === "", junkSettings);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".video");

  // Mobile 390 px
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  m.on("console", (msg) => msg.type() === "error" && errors.push(`[390] ${msg.text()}`));
  await m.goto(BASE, { waitUntil: "networkidle" });
  await m.waitForSelector(".video");
  await m.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("390 px : aucun défilement horizontal", overflow <= 0, `${overflow} px`);
  const offenders = await m.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.className || el.tagName).slice(0, 5));
  check("390 px : aucun élément ne dépasse", offenders.length === 0, offenders.join(", "));
  const small = await m.evaluate(() => [...document.querySelectorAll("button, a, input, textarea, summary, label:has(input)")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !el.closest(".endpoints"); }).map((el) => `${el.tagName}:${(el.textContent || "").trim().slice(0, 20)}:${Math.round(el.getBoundingClientRect().height)}`));
  check("390 px : cibles tactiles ≥ 40 px", small.length === 0, small.join(" | "));
  await m.screenshot({ path: `${OUT}/studio-390.png`, fullPage: true });
  await m.goto(`${BASE}/#reglages`, { waitUntil: "networkidle" });
  await m.waitForSelector("#settings .feature");
  await m.waitForFunction(() => document.querySelector("#feature-whatsapp .qr")?.complete);
  await m.evaluate(() => { for (const d of document.querySelectorAll("#settings details")) d.open = true; });
  const sOverflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("390 px Réglages : aucun défilement horizontal", sOverflow <= 0, `${sOverflow} px`);
  const sOff = await m.evaluate(() => [...document.querySelectorAll("#settings *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.className || el.tagName).slice(0, 5));
  check("390 px Réglages : aucun élément ne dépasse", sOff.length === 0, sOff.join(", "));
  const sSmall = await m.evaluate(() => [...document.querySelectorAll("#settings button, #settings input[type=text], #settings input[type=password], #settings summary, #settings .feature-title, #settings label:has(input[type=checkbox]:not(.switch))")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).map((el) => `${el.tagName}:${(el.textContent || "").trim().slice(0, 20)}:${Math.round(el.getBoundingClientRect().height)}`));
  check("390 px Réglages : cibles tactiles ≥ 40 px", sSmall.length === 0, sSmall.join(" | "));
  await m.screenshot({ path: `${OUT}/settings-390.png`, fullPage: true });
  await m.goto(BASE, { waitUntil: "networkidle" });
  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const n = await narrow.newPage();
  await n.goto(BASE, { waitUntil: "networkidle" });
  await n.waitForSelector(".video");
  await n.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  const narrowOff = await n.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.className || el.tagName).slice(0, 5));
  check("390 px (sans isMobile, détails ouverts) : aucun élément ne dépasse", narrowOff.length === 0, narrowOff.join(", "));

  // Mouvement réduit : aucune animation active
  const reduced = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const r = await reduced.newPage();
  await r.goto(BASE, { waitUntil: "networkidle" });
  const anims = await r.evaluate(() => document.getAnimations().length);
  check("mouvement réduit : 0 animation", anims === 0, String(anims));
  await r.goto(`${BASE}/#reglages`, { waitUntil: "networkidle" });
  await r.waitForSelector("#settings .feature");
  await r.check("#switch-musique").catch(() => undefined);
  check("mouvement réduit, Réglages : 0 animation", (await r.evaluate(() => document.getAnimations().length)) === 0);

  check("0 erreur console", errors.length === 0, errors.join(" | "));
  await browser.close();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} vérifications OK`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
