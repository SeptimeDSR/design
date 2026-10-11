import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { envCatalog, formatEnvList, isSecret, maskValue, readEnv, setEnvVars, unsetEnvVar, validateEnvName } from "../envfile";

const EXAMPLE = join(__dirname, "..", "..", "..", ".env.example");
const tmp = () => mkdtempSync(join(tmpdir(), "septim-env-"));

describe(".env : le catalogue vient de .env.example (une seule source de vérité)", () => {
  it("reconnaît les variables actives et les lignes commentées, avec leur indication", () => {
    const c = envCatalog(EXAMPLE);
    const byName = Object.fromEntries(c.map((v) => [v.name, v]));
    expect(byName.PEXELS_API_KEY).toBeTruthy();
    expect(byName.VIRAL_MUSIC_DIR).toBeTruthy();
    expect(byName.SEPTIM_BIND).toBeTruthy();
    expect(byName.COMFYUI_URL.hint).toMatch(/ComfyUI/);
    expect(new Set(c.map((v) => v.name)).size).toBe(c.length);
  });

  it("clés, tokens et mots de passe sont secrets ; les adresses et dossiers non", () => {
    for (const n of ["PEXELS_API_KEY", "APIFY_TOKEN", "SEPTIM_TOKEN", "VIRAL_WEBHOOK_SECRET", "POSTIZ_API_KEY"]) expect(isSecret(n), n).toBe(true);
    for (const n of ["COMFYUI_URL", "VIRAL_MUSIC_DIR", "POSTIZ_API_URL", "VIRAL_NOTIFIER"]) expect(isSecret(n), n).toBe(false);
  });

  it("un nom inconnu est refusé avec la bonne suggestion ; un nom mal écrit aussi", () => {
    const c = envCatalog(EXAMPLE);
    expect(validateEnvName("PEXELS_API_KEY", c)).toBeUndefined();
    expect(validateEnvName("PEXEL_API_KEY", c)).toMatch(/PEXELS_API_KEY/);
    expect(validateEnvName("pexels", c)).toMatch(/MAJUSCULES|majuscules/);
    expect(validateEnvName("N_IMPORTE_QUOI_XYZ", c)).toMatch(/inconnue/);
  });
});

describe(".env : écrire sans rien abîmer", () => {
  it("remplace la ligne active, garde les commentaires et les autres lignes", () => {
    const dir = tmp();
    const file = join(dir, ".env");
    writeFileSync(file, "# mes réglages\nPEXELS_API_KEY=ancienne # vieille clé\nVIRAL_LANG=fr\n\n# fin\n");
    setEnvVars(file, { PEXELS_API_KEY: "nouvelle" });
    expect(readFileSync(file, "utf8")).toBe("# mes réglages\nPEXELS_API_KEY=nouvelle\nVIRAL_LANG=fr\n\n# fin\n");
  });

  it("une ligne seulement commentée (l'exemple) : la ligne active est ajoutée juste dessous", () => {
    const dir = tmp();
    const file = join(dir, ".env");
    writeFileSync(file, "A=1\n# VIRAL_MUSIC_DIR=/ex   # pistes\nB=2\n");
    setEnvVars(file, { VIRAL_MUSIC_DIR: "/data/music" });
    expect(readFileSync(file, "utf8")).toBe("A=1\n# VIRAL_MUSIC_DIR=/ex   # pistes\nVIRAL_MUSIC_DIR=/data/music\nB=2\n");
  });

  it("variable absente : ajoutée à la fin ; fichier absent : créé avec un en-tête seulement (jamais les valeurs d'exemple, elles écraseraient les défauts de Docker)", () => {
    const dir = tmp();
    const file = join(dir, ".env");
    setEnvVars(file, { PEXELS_API_KEY: "abc" });
    const text = readFileSync(file, "utf8");
    expect(text).toMatch(/^# Réglages SEPTIM/);
    expect(text).toContain("PEXELS_API_KEY=abc");
    expect(text).not.toMatch(/^VIRAL_NOTIFIER=/m);
    expect(text).not.toMatch(/^VIRAL_OLLAMA_MODEL=/m);
    expect(readEnv(file)).toEqual({ PEXELS_API_KEY: "abc" });
    setEnvVars(file, { ZZ_TEST: "1" });
    expect(readFileSync(file, "utf8").trimEnd().endsWith("ZZ_TEST=1")).toBe(true);
  });

  it("valeur avec espace ou # → entre guillemets ; retour à la ligne refusé ; les deux sortes de guillemets refusées", () => {
    const dir = tmp();
    const file = join(dir, ".env");
    writeFileSync(file, "");
    setEnvVars(file, { A: "deux mots", B: "a#b", C: "simple" });
    expect(readFileSync(file, "utf8")).toBe('A="deux mots"\nB="a#b"\nC=simple\n');
    expect(readEnv(file)).toEqual({ A: "deux mots", B: "a#b", C: "simple" });
    expect(() => setEnvVars(file, { D: "a\nb" })).toThrow(/retour à la ligne/);
    expect(() => setEnvVars(file, { E: `a "b" 'c'` })).toThrow(/guillemets/);
  });

  it("écrit sur place : le même fichier (indispensable quand .env est monté dans un conteneur)", () => {
    const dir = tmp();
    const file = join(dir, ".env");
    writeFileSync(file, "A=1\n");
    const before = statSync(file).ino;
    setEnvVars(file, { A: "2" });
    expect(statSync(file).ino).toBe(before);
  });

  it("unset retire la ligne active et garde l'exemple commenté ; false si absente", () => {
    const dir = tmp();
    const file = join(dir, ".env");
    writeFileSync(file, "# PEXELS_API_KEY=ex\nPEXELS_API_KEY=abc\nB=2\n");
    expect(unsetEnvVar(file, "PEXELS_API_KEY")).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("# PEXELS_API_KEY=ex\nB=2\n");
    expect(unsetEnvVar(file, "PEXELS_API_KEY")).toBe(false);
  });
});

describe(".env : afficher sans jamais montrer une clé", () => {
  it("maskValue : secret → points et longueur ; reste → la valeur", () => {
    const m = maskValue("PEXELS_API_KEY", "abcdefghijklmnopqrstuvwxyz");
    expect(m).toBe("•••• (26 caractères)");
    expect(maskValue("COMFYUI_URL", "http://host.docker.internal:8188")).toBe("http://host.docker.internal:8188");
    expect(maskValue("COMFYUI_URL", "x".repeat(80)).length).toBeLessThanOrEqual(61);
  });

  it("formatEnvList : réglé / vide, les principales d'abord, aucune clé en clair", () => {
    const c = envCatalog(EXAMPLE);
    const text = formatEnvList(c, { PEXELS_API_KEY: "secretsecretsecret", COMFYUI_URL: "http://host.docker.internal:8188" }, { all: false });
    expect(text).not.toContain("secretsecretsecret");
    expect(text).toMatch(/PEXELS_API_KEY\s+réglé\s+•••• \(18 caractères\)/);
    expect(text).toMatch(/COMFYUI_URL\s+réglé\s+http:\/\/host\.docker\.internal:8188/);
    expect(text).toMatch(/YOUTUBE_API_KEY\s+vide/);
    expect(text.indexOf("PEXELS_API_KEY")).toBeLessThan(text.indexOf("SEPTIM_PORT") === -1 ? Infinity : text.indexOf("SEPTIM_PORT"));
    expect(formatEnvList(c, {}, { all: true }).split("\n").length).toBeGreaterThan(formatEnvList(c, {}, { all: false }).split("\n").length);
  });
});

describe(".env : des erreurs qui disent quoi faire", () => {
  it(".env est un dossier (Docker en crée un quand le fichier manque) → phrase claire avec la marche à suivre", () => {
    const dir = tmp();
    const file = join(dir, ".env");
    mkdirSync(file);
    expect(() => setEnvVars(file, { A: "1" })).toThrow(/dossier/);
    expect(() => setEnvVars(file, { A: "1" })).toThrow(/supprime/i);
  });

  it("explainWriteError : droits Linux (EACCES) → l'option -u de docker ; autre erreur → message d'origine", async () => {
    const { explainWriteError } = await import("../envfile");
    const eacces = Object.assign(new Error("EACCES: permission denied, open '/app/.env'"), { code: "EACCES" });
    const msg = explainWriteError(eacces, "/app/.env").message;
    expect(msg).toMatch(/droits/);
    expect(msg).toMatch(/-u/);
    expect(explainWriteError(new Error("autre"), "/app/.env").message).toBe("autre");
  });
});

