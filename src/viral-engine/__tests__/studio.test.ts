import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../server/routes";

const DIR = join(__dirname, "..", "studio");
const js = readFileSync(join(DIR, "studio.js"), "utf8");
const html = readFileSync(join(DIR, "index.html"), "utf8");
const known = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));

describe("Studio : contrat avec le serveur", () => {
  it("studio.js n'appelle que des routes de ROUTES", () => {
    const calls = [...js.matchAll(/\b(?:api|apiUrl)\(\s*"((?:GET|POST) [^"]+)"/g)].map((m) => m[1]);
    expect(new Set(calls).size).toBeGreaterThanOrEqual(10);
    for (const c of calls) expect(known.has(c), c).toBe(true);
    // Aucune autre façon d'appeler le réseau que le helper : le test ci-dessus voit tout.
    expect(js.match(/\bfetch\(/g) ?? []).toHaveLength(1);
  });

  it("aucune donnée injectée en HTML (textContent seulement)", () => {
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });

  it("index.html respecte la CSP du serveur : ni script ni style en ligne, ressources présentes", () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/<style\b/);
    for (const [, path] of html.matchAll(/(?:src|href)="\/studio\/([^"]+)"/g)) {
      if (path.startsWith("fonts/")) continue;
      expect(existsSync(join(DIR, path)), path).toBe(true);
    }
    expect(html).toMatch(/<html lang="fr">/);
  });

  it("Réglages : onglet, section, interrupteurs accessibles, QR en <img>, mêmes 4 routes que l'API", () => {
    expect(html).toMatch(/data-view="atelier"/);
    expect(html).toMatch(/data-view="settings"/);
    expect(html).toMatch(/<main[^>]*id="settings"[^>]*hidden/);
    expect(html).toMatch(/id="settings-groups"/);
    // Un vrai interrupteur (role=switch sur une case à cocher), jamais un <div> cliquable.
    expect(js).toMatch(/type: "checkbox"[^)]*role: "switch"|role: "switch"[^)]*type: "checkbox"/);
    expect(js).toMatch(/alt: "QR code WhatsApp/);
    for (const route of ["GET /api/v1/settings", "POST /api/v1/settings/:id", "POST /api/v1/settings/:id/install", "POST /api/v1/settings/:id/test"]) expect(js, route).toContain(`"${route}"`);
    // Chaque état renvoyé par le serveur a son libellé français.
    for (const status of ["actif", "coupe", "a-installer", "installation", "echec", "cle-manquante", "adresse-manquante", "a-lier", "injoignable", "dossier-vide", "modeles-manquants"]) expect(js, status).toMatch(new RegExp(`"?${status}"?:`));
  });
});

