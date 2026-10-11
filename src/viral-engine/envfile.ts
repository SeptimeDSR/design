import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Le fichier .env, réglé depuis le terminal : jamais une clé affichée, jamais un commentaire perdu.
// La liste des variables vient de .env.example (une seule source de vérité, vérifiée par docs.test).
export type EnvVar = { name: string; secret: boolean; hint: string; example: string };

export const isSecret = (name: string) => /KEY|TOKEN|SECRET|PASSWORD/.test(name);

const LINE = /^\s*(#\s*)?([A-Z][A-Z0-9_]+)=(.*)$/;

export function envCatalog(examplePath: string): EnvVar[] {
  const seen = new Map<string, EnvVar>();
  for (const raw of readFileSync(examplePath, "utf8").split("\n")) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const [value, ...rest] = m[3].split(/\s+#\s*/);
    const name = m[2];
    if (!seen.has(name)) seen.set(name, { name, secret: isSecret(name), hint: rest.join(" # ").trim(), example: value.trim() });
  }
  return [...seen.values()];
}

function unquote(raw: string): string {
  const v = raw.trim();
  const q = v[0];
  if ((q === '"' || q === "'") && v.indexOf(q, 1) > 0) return v.slice(1, v.indexOf(q, 1));
  return v.split(/\s+#/)[0].trim();
}

export function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(raw);
    if (m) out[m[1]] = unquote(m[2]);
  }
  return out;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function validateEnvName(name: string, catalog: EnvVar[]): string | undefined {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return `« ${name} » : le nom d'une variable s'écrit en MAJUSCULES, chiffres et _ (par exemple PEXELS_API_KEY).`;
  if (catalog.some((v) => v.name === name)) return undefined;
  const close = [...catalog].sort((a, b) => distance(name, a.name) - distance(name, b.name))[0];
  const hint = close && distance(name, close.name) <= 4 ? ` Tu voulais dire ${close.name} ?` : "";
  return `Variable inconnue « ${name} ».${hint} La liste : septim env list --all`;
}

function encode(name: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${name} : la valeur ne doit pas contenir de retour à la ligne.`);
  if (!/[\s#"']/.test(value)) return `${name}=${value}`;
  if (!value.includes('"')) return `${name}="${value}"`;
  if (!value.includes("'")) return `${name}='${value}'`;
  throw new Error(`${name} : la valeur mélange les deux sortes de guillemets, ce que .env ne sait pas écrire. Évite l'un des deux.`);
}

// Les deux pièges de Docker : un dossier .env (créé par Docker quand le fichier manquait) et les droits Linux.
export function explainWriteError(error: unknown, file: string): Error {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "EISDIR") return new Error(`${file} est un dossier : Docker en crée un quand le fichier .env n'existe pas. Supprime ce dossier, relance (le fichier sera créé) et recommence.`);
  if (code === "EACCES" || code === "EPERM") return new Error(`L'usine n'a pas les droits d'écrire ${file} (le fichier appartient à un autre utilisateur). Sous Linux, ajoute -u "$(id -u):$(id -g)" à la commande docker compose run ; sous Windows et macOS, vérifie qu'il n'est pas en lecture seule.`);
  return error instanceof Error ? error : new Error(String(error));
}

function writeInPlace(file: string, text: string): void {
  try {
    writeFileSync(file, text);
  } catch (error) {
    throw explainWriteError(error, file);
  }
}

// Écriture « sur place » (même fichier) : un .env monté dans un conteneur ne supporte pas le remplacement par renommage.
// Un .env absent est créé avec un en-tête seulement : copier .env.example y mettrait des valeurs actives
// (VIRAL_NOTIFIER=whatsapp, modèle de 5 Go…) qui écraseraient les défauts de Docker.
const HEADER = "# Réglages SEPTIM : septim env init (assistant), septim env set CLE=valeur. La liste complète : .env.example\n";

export function setEnvVars(file: string, updates: Record<string, string>): void {
  if (!existsSync(file)) writeInPlace(file, HEADER);
  let original: string;
  try {
    original = readFileSync(file, "utf8");
  } catch (error) {
    throw explainWriteError(error, file);
  }
  const lines = original === "" ? [] : original.replace(/\n$/, "").split("\n");
  for (const [name, value] of Object.entries(updates)) {
    const line = encode(name, value);
    const active = lines.findIndex((l) => new RegExp(`^\\s*${name}=`).test(l));
    if (active >= 0) {
      lines[active] = line;
      continue;
    }
    const commented = lines.findIndex((l) => new RegExp(`^\\s*#\\s*${name}=`).test(l));
    if (commented >= 0) lines.splice(commented + 1, 0, line);
    else lines.push(line);
  }
  writeInPlace(file, `${lines.join("\n")}\n`);
}

export function unsetEnvVar(file: string, name: string): boolean {
  if (!existsSync(file)) return false;
  const lines = readFileSync(file, "utf8").replace(/\n$/, "").split("\n");
  const kept = lines.filter((l) => !new RegExp(`^\\s*${name}=`).test(l));
  if (kept.length === lines.length) return false;
  writeInPlace(file, `${kept.join("\n")}\n`);
  return true;
}

export function maskValue(name: string, value: string): string {
  if (isSecret(name)) return `•••• (${value.length} caractères)`;
  return value.length > 60 ? `${value.slice(0, 59)}…` : value;
}

// Les réglages qu'on touche en premier ; --all ajoute le reste.
export const MAIN_VARS = ["PEXELS_API_KEY", "PIXABAY_API_KEY", "YOUTUBE_API_KEY", "APIFY_TOKEN", "POSTIZ_API_URL", "POSTIZ_API_KEY", "COMFYUI_URL", "VIRAL_NOTIFIER", "VIRAL_MUSIC_DIR", "VIRAL_TTS", "VIRAL_OLLAMA_MODEL", "SEPTIM_TOKEN"];

export function formatEnvList(catalog: EnvVar[], values: Record<string, string>, opts: { all: boolean }): string {
  const byName = new Map(catalog.map((v) => [v.name, v]));
  const names = [...MAIN_VARS.filter((n) => byName.has(n)), ...(opts.all ? catalog.map((v) => v.name).filter((n) => !MAIN_VARS.includes(n)) : [])];
  const width = Math.max(...names.map((n) => n.length), 8) + 2;
  const rows = names.map((name) => {
    const value = values[name];
    const set = value !== undefined && value !== "";
    return `${name.padEnd(width)}${(set ? "réglé" : "vide").padEnd(7)}${set ? maskValue(name, value) : (byName.get(name)?.hint ?? "").slice(0, 70)}`;
  });
  return [`${"Variable".padEnd(width)}${"État".padEnd(7)}Valeur`, ...rows].join("\n");
}
