import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { detectComfy, discoverComfy, type ComfyInfo, type ComfyProfile } from "./comfy";
import type { Env } from "./config";
import { FactoryError } from "./errors";
import { INSTALL_IDS, type InstallId, type InstallState, type Installs } from "./installs";

// Les fonctions de l'usine que l'humain coche, décoche, installe et teste depuis le Studio.
// Les clés collées dans le Studio vivent dans <home>/settings.json (0600) ; celles de .env restent dans .env.
export const FEATURE_IDS = ["ollama", "voix", "voix-hd", "whatsapp", "publication", "youtube", "apify", "pexels", "pixabay", "comfyui", "musique"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeatureStatus = "modeles-manquants" | "actif" | "coupe" | "a-installer" | "installation" | "echec" | "cle-manquante" | "adresse-manquante" | "a-lier" | "injoignable" | "dossier-vide";
type Needs = "install" | "key" | "url" | "link" | "folder";
type Field = { var: string; label: string; secret: boolean; placeholder?: string };
type Choice = { var: string; label: string; options: { value: string; label: string }[] };
type Def = { title: string; help: string; group: string; needs: Needs; fields: Field[]; choices?: Choice[] };

const PLATFORM_OPTIONS = [
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube Shorts" },
  { value: "instagram", label: "Instagram Reels" },
  { value: "facebook", label: "Facebook" },
];

const DEFS: Record<FeatureId, Def> = {
  ollama: {
    title: "Écrivain de scripts (Ollama)",
    help: "Écrit le script de chaque vidéo, gratuitement, sur ta machine. Coupé : script de secours générique.",
    group: "Écriture",
    needs: "install",
    fields: [{ var: "VIRAL_OLLAMA_MODEL", label: "Modèle", secret: false, placeholder: "qwen2.5:3b" }],
  },
  voix: { title: "Voix française (Piper)", help: "Voix gratuite et locale. Coupée : vidéo muette avec sous-titres.", group: "Voix", needs: "install", fields: [] },
  "voix-hd": { title: "Voix HD (Chatterbox)", help: "Voix expressive, plus lente à produire ; une carte graphique aide.", group: "Voix", needs: "install", fields: [] },
  whatsapp: {
    title: "WhatsApp",
    help: "Reçois « vidéo prête » et réponds OUI #ref. Lie ton téléphone une fois avec le QR code.",
    group: "Messages",
    needs: "link",
    fields: [{ var: "VIRAL_WHATSAPP_TO", label: "Numéro (vide : toi-même)", secret: false, placeholder: "2376XXXXXXXX" }],
  },
  publication: {
    title: "Publication automatique (Postiz)",
    help: "Publie sur tes comptes après ton OUI #ref. Coupée : légende prête à coller.",
    group: "Publication",
    needs: "key",
    fields: [
      { var: "POSTIZ_API_KEY", label: "Clé API Postiz", secret: true },
      { var: "POSTIZ_API_URL", label: "Adresse de ton Postiz", secret: false, placeholder: "http://host.docker.internal:4007/api" },
    ],
    choices: [{ var: "VIRAL_PLATFORMS", label: "Publier sur", options: PLATFORM_OPTIONS }],
  },
  youtube: { title: "Tendances YouTube", help: "Les sujets qui montent au Cameroun. Clé gratuite Google.", group: "Tendances", needs: "key", fields: [{ var: "YOUTUBE_API_KEY", label: "Clé API YouTube", secret: true }] },
  apify: { title: "Tendances TikTok (Apify)", help: "Creative Center de TikTok, offre gratuite Apify.", group: "Tendances", needs: "key", fields: [{ var: "APIFY_TOKEN", label: "Token Apify", secret: true }] },
  pexels: { title: "Vrais plans vidéo (Pexels)", help: "Des plans filmés en rapport avec le sujet, gratuits. Coupé : fonds animés.", group: "Images", needs: "key", fields: [{ var: "PEXELS_API_KEY", label: "Clé API Pexels", secret: true }] },
  pixabay: { title: "Vrais plans vidéo (Pixabay)", help: "Même idée, deuxième banque libre.", group: "Images", needs: "key", fields: [{ var: "PIXABAY_API_KEY", label: "Clé API Pixabay", secret: true }] },
  comfyui: {
    title: "Vidéo IA locale (ComfyUI)",
    help: "Génère les plans avec ta carte NVIDIA (Wan 2.2). Lent : plusieurs minutes par plan.",
    group: "Images",
    needs: "url",
    fields: [{ var: "COMFYUI_URL", label: "Adresse de ComfyUI", secret: false, placeholder: "http://host.docker.internal:8188" }],
  },
  musique: {
    title: "Musique sous la voix",
    help: "Tes pistes (mp3, wav…) sous la voix. Sans piste : nappe lo-fi générée.",
    group: "Musique",
    needs: "folder",
    fields: [{ var: "VIRAL_MUSIC_DIR", label: "Dossier de musique", secret: false, placeholder: "/data/music" }],
  },
};

export type FeatureView = {
  id: FeatureId;
  title: string;
  help: string;
  group: string;
  enabled: boolean;
  ready: boolean;
  status: FeatureStatus;
  needs: Needs;
  fields: { var: string; label: string; secret: boolean; placeholder?: string; source: "studio" | "env" | null; value?: string }[];
  choices?: { var: string; label: string; options: { value: string; label: string; checked: boolean }[] }[];
  detail?: string;
  install?: { status: InstallState["status"]; step?: string; progress?: number; log: string[]; error?: string };
  link?: { state: string; qr?: string; error?: string };
  // ComfyUI : ce que ton PC a installé, lu par l'usine ; l'adresse trouvée quand aucune n'est réglée.
  comfy?: { profile?: ComfyProfile; gpu?: string; vramGb?: number; version?: string; detected: ComfyInfo["models"]; missing: string[] };
  suggestion?: string;
  // Ollama : les modèles installés sur ton PC, à choisir d'un clic (les modèles « cloud » passent par ton compte Ollama).
  ollamaModels?: { name: string; cloud: boolean }[];
};

type Settings = { enabled: Partial<Record<FeatureId, boolean>>; values: Record<string, string> };
type Hub = () => { state: string; qr?: string; error?: string } | undefined;
export type FeatureTest = { ok: boolean; message: string };

const AUDIO = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const MANAGED = ["VIRAL_OLLAMA", "VIRAL_OLLAMA_MODEL", "VIRAL_TTS", "VIRAL_NOTIFIER", "VIRAL_WHATSAPP_TO", "VIRAL_PUBLISH_MODE", "POSTIZ_API_KEY", "POSTIZ_API_URL", "VIRAL_PLATFORMS", "YOUTUBE_API_KEY", "APIFY_TOKEN", "PEXELS_API_KEY", "PIXABAY_API_KEY", "COMFYUI_URL", "VIRAL_MUSIC_DIR"];
const NETWORK_TTL_MS = 8000;

const isFeature = (id: string): id is FeatureId => (FEATURE_IDS as readonly string[]).includes(id);
const bad = (message: string) => new FactoryError("bad_request", message);
const installable = (id: string): id is InstallId => (INSTALL_IDS as string[]).includes(id);

// Un paquet Python installé dans le venv de l'usine, sans lancer Python (importer torch prend des secondes).
export function pythonPackageInstalled(home: string, pkg: string): boolean {
  const venv = join(home, "venv");
  const roots = [join(venv, "Lib", "site-packages")];
  const lib = join(venv, "lib");
  if (existsSync(lib)) for (const d of readdirSync(lib)) if (d.startsWith("python")) roots.push(join(lib, d, "site-packages"));
  return roots.some((r) => existsSync(join(r, pkg)));
}

export function createFeatures(o: { home: string; env: Env; installs: Installs; fetchImpl?: typeof fetch; hub?: Hub }) {
  const doFetch = o.fetchImpl ?? fetch;
  const env = o.env;
  const file = join(o.home, "settings.json");
  const base: Env = {};
  for (const k of MANAGED) base[k] = env[k];
  // Ce que l'humain a fixé lui-même dans .env passe avant la détection de ComfyUI.
  const comfyBase: Env = {};
  for (const k of ["COMFYUI_PROFILE", "COMFYUI_WAN_MODEL", "COMFYUI_WAN_CLIP", "COMFYUI_WAN_VAE"]) comfyBase[k] = env[k];
  const listeners = new Set<() => void>();
  const cache = new Map<string, { at: number; value: unknown }>();

  const load = (): Settings => {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<Settings>;
      return { enabled: raw.enabled ?? {}, values: raw.values ?? {} };
    } catch {
      return { enabled: {}, values: {} };
    }
  };
  const save = (s: Settings) => {
    mkdirSync(o.home, { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
    renameSync(tmp, file);
  };

  const defaultEnabled = (id: FeatureId): boolean => {
    switch (id) {
      case "ollama":
        return base.VIRAL_OLLAMA !== "off";
      case "voix":
        return base.VIRAL_TTS !== "silent";
      case "voix-hd":
        return base.VIRAL_TTS === "chatterbox";
      case "whatsapp":
        return base.VIRAL_NOTIFIER !== "console";
      case "publication":
        return base.VIRAL_PUBLISH_MODE !== "manual";
      default:
        return true;
    }
  };
  const isOn = (s: Settings, id: FeatureId) => s.enabled[id] ?? defaultEnabled(id);
  // La valeur du Studio passe avant celle de .env ; vide = pas de valeur du Studio.
  const value = (s: Settings, key: string) => s.values[key]?.trim() || base[key]?.trim() || undefined;
  const source = (s: Settings, key: string): "studio" | "env" | null => (s.values[key]?.trim() ? "studio" : base[key]?.trim() ? "env" : null);

  const voiceName = () => env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium";
  const piperInstalled = () => pythonPackageInstalled(o.home, "piper") && existsSync(join(env.VIRAL_PIPER_DIR ?? join(o.home, "voices"), `${voiceName()}.onnx`));
  const chatterboxInstalled = () => pythonPackageInstalled(o.home, "chatterbox");

  // Recalcule les variables que l'usine lit (process.env) à partir de .env + réglages du Studio.
  function apply(s = load()) {
    const set = (k: string, v: string | undefined) => {
      if (v === undefined) delete env[k];
      else env[k] = v;
    };
    set("VIRAL_OLLAMA", isOn(s, "ollama") ? undefined : "off");
    set("VIRAL_OLLAMA_MODEL", value(s, "VIRAL_OLLAMA_MODEL"));
    const hd = isOn(s, "voix-hd") && chatterboxInstalled();
    const baseTts = base.VIRAL_TTS && !["silent", "chatterbox"].includes(base.VIRAL_TTS) ? base.VIRAL_TTS : "auto";
    set("VIRAL_TTS", hd ? "chatterbox" : isOn(s, "voix") ? baseTts : "silent");
    set("VIRAL_NOTIFIER", isOn(s, "whatsapp") ? "whatsapp" : "console");
    set("VIRAL_WHATSAPP_TO", value(s, "VIRAL_WHATSAPP_TO"));
    set("VIRAL_PUBLISH_MODE", isOn(s, "publication") ? base.VIRAL_PUBLISH_MODE : "manual");
    set("POSTIZ_API_KEY", value(s, "POSTIZ_API_KEY"));
    set("POSTIZ_API_URL", value(s, "POSTIZ_API_URL"));
    set("VIRAL_PLATFORMS", value(s, "VIRAL_PLATFORMS"));
    const gated: [FeatureId, string][] = [["youtube", "YOUTUBE_API_KEY"], ["apify", "APIFY_TOKEN"], ["pexels", "PEXELS_API_KEY"], ["pixabay", "PIXABAY_API_KEY"], ["comfyui", "COMFYUI_URL"], ["musique", "VIRAL_MUSIC_DIR"]];
    for (const [id, key] of gated) set(key, isOn(s, id) ? value(s, key) : undefined);
  }
  apply();

  const emit = () => {
    cache.clear();
    for (const l of listeners) {
      try {
        l();
      } catch (error) {
        console.error("[réglages]", error);
      }
    }
  };
  o.installs.onChange((st) => {
    if (st.status === "done" || st.status === "failed") {
      apply();
      emit();
    }
  });

  async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < NETWORK_TTL_MS) return hit.value as T;
    const v = await fn();
    cache.set(key, { at: Date.now(), value: v });
    return v;
  }

  const trimUrl = (u: string) => u.replace(/\/+$/, "");
  const ollamaHost = () => trimUrl(env.OLLAMA_HOST ?? "http://127.0.0.1:11434");
  const ollamaModel = (s: Settings) => value(s, "VIRAL_OLLAMA_MODEL") ?? "qwen2.5:7b";

  async function ollamaState(s: Settings): Promise<{ reachable: boolean; present: boolean; names: string[] }> {
    return cached("ollama", async () => {
      try {
        const res = await doFetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return { reachable: false, present: false, names: [] };
        const names = ((await res.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? [];
        const want = ollamaModel(s);
        return { reachable: true, present: names.some((n) => n === want || n === `${want}:latest`), names };
      } catch {
        return { reachable: false, present: false, names: [] };
      }
    });
  }
  const PROFILE_LABEL: Record<ComfyProfile, string> = { "wan22-5b": "Wan 2.2 5B", "wan21-t2v": "Wan 2.1 texte→vidéo" };
  // ComfyUI : ce qui est installé (cache court), et l'usine reçoit les vrais noms de fichiers du PC.
  async function comfyState(s: Settings): Promise<{ info?: ComfyInfo; suggestion?: string }> {
    const url = value(s, "COMFYUI_URL");
    return cached("comfyui", async () => {
      if (!url) return { suggestion: await discoverComfy(doFetch) };
      const info = await detectComfy(url, doFetch);
      if (info.profile && info.picked) {
        const fix = (k: string, v: string) => {
          if (!comfyBase[k]) env[k] = v;
        };
        fix("COMFYUI_PROFILE", info.profile);
        fix("COMFYUI_WAN_MODEL", info.picked.unet);
        fix("COMFYUI_WAN_CLIP", info.picked.clip);
        fix("COMFYUI_WAN_VAE", info.picked.vae);
      }
      return { info };
    });
  }
  const tracks = (dir: string | undefined) => (dir && existsSync(dir) ? readdirSync(dir).filter((f) => AUDIO.test(f)).length : 0);

  async function view(id: FeatureId, s: Settings): Promise<FeatureView> {
    const def = DEFS[id];
    const enabled = isOn(s, id);
    let ready = false;
    let detail: string | undefined;
    let unreachable = false;
    let link: FeatureView["link"];
    let comfy: FeatureView["comfy"];
    let suggestion: string | undefined;
    let modelsMissing = false;
    let ollamaModels: FeatureView["ollamaModels"];
    switch (id) {
      case "ollama": {
        const st = await ollamaState(s);
        ready = st.present;
        unreachable = !st.reachable;
        const count = st.names.length ? ` · ${st.names.length} ${st.names.length > 1 ? "modèles installés" : "modèle installé"}` : "";
        ollamaModels = [...st.names.filter((n) => !/cloud/i.test(n)), ...st.names.filter((n) => /cloud/i.test(n))].map((name) => ({ name, cloud: /cloud/i.test(name) }));
        detail = st.present ? `Modèle ${ollamaModel(s)} prêt${count}` : st.reachable ? `Modèle ${ollamaModel(s)} à télécharger${count}` : `Pas de réponse sur ${ollamaHost()}`;
        break;
      }
      case "voix":
        ready = piperInstalled();
        break;
      case "voix-hd":
        ready = chatterboxInstalled();
        break;
      case "whatsapp": {
        const hub = o.hub?.();
        const linked = existsSync(join(o.home, "wa"));
        ready = hub ? hub.state === "ready" : linked;
        link = hub ? { state: hub.state, ...(hub.qr ? { qr: hub.qr } : {}), ...(hub.error ? { error: hub.error } : {}) } : { state: linked ? "ready" : "off" };
        break;
      }
      case "publication":
        ready = !!value(s, "POSTIZ_API_KEY") || existsSync(join(homedir(), ".postiz", "credentials.json"));
        break;
      case "youtube":
      case "apify":
      case "pexels":
      case "pixabay":
        ready = !!value(s, def.fields[0].var);
        break;
      case "comfyui": {
        const st = await comfyState(s);
        suggestion = st.suggestion;
        const info = st.info;
        if (info?.reachable) {
          ready = !!info.profile;
          modelsMissing = !info.profile;
          comfy = { ...(info.profile ? { profile: info.profile } : {}), ...(info.gpu ? { gpu: info.gpu } : {}), ...(info.vramGb ? { vramGb: info.vramGb } : {}), ...(info.version ? { version: info.version } : {}), detected: info.models, missing: info.missing };
          const card = [info.gpu, info.vramGb ? `${info.vramGb} Go` : ""].filter(Boolean).join(" ");
          detail = info.profile ? `${PROFILE_LABEL[info.profile]} prêt${card ? ` · ${card}` : ""}` : "ComfyUI répond, mais il manque des modèles";
        } else {
          unreachable = !!value(s, "COMFYUI_URL");
          if (suggestion) detail = `ComfyUI trouvé sur ${suggestion}`;
        }
        break;
      }
      case "musique": {
        const n = tracks(value(s, "VIRAL_MUSIC_DIR"));
        ready = n > 0;
        detail = n > 0 ? `${n} ${n > 1 ? "pistes" : "piste"}` : value(s, "VIRAL_MUSIC_DIR") ? `Aucune piste dans ${value(s, "VIRAL_MUSIC_DIR")}` : undefined;
        break;
      }
    }
    const inst = installable(id) ? o.installs.get(id) : undefined;
    let status: FeatureStatus;
    if (!enabled) status = "coupe";
    else if (inst?.status === "running") status = "installation";
    else if (ready) status = "actif";
    else if (unreachable) status = "injoignable";
    else if (modelsMissing) status = "modeles-manquants";
    else if (def.needs === "install") status = inst?.status === "failed" ? "echec" : "a-installer";
    else if (def.needs === "key") status = "cle-manquante";
    else if (def.needs === "url") status = "adresse-manquante";
    else if (def.needs === "link") status = "a-lier";
    else status = "dossier-vide";

    const current = (s.values.VIRAL_PLATFORMS?.trim() || base.VIRAL_PLATFORMS?.trim() || PLATFORM_OPTIONS.map((p) => p.value).join(",")).split(",").map((x) => x.trim());
    return {
      id,
      title: def.title,
      help: def.help,
      group: def.group,
      enabled,
      ready,
      status,
      needs: def.needs,
      fields: def.fields.map((f) => ({ var: f.var, label: f.label, secret: f.secret, ...(f.placeholder ? { placeholder: f.placeholder } : {}), source: source(s, f.var), ...(f.secret ? {} : { value: value(s, f.var) }) })),
      ...(def.choices ? { choices: def.choices.map((c) => ({ var: c.var, label: c.label, options: c.options.map((opt) => ({ ...opt, checked: current.includes(opt.value) })) })) } : {}),
      ...(detail ? { detail } : {}),
      ...(inst && inst.status !== "idle" ? { install: { status: inst.status, ...(inst.step ? { step: inst.step } : {}), ...(inst.progress !== undefined ? { progress: inst.progress } : {}), log: inst.log.slice(-30), ...(inst.error ? { error: inst.error } : {}) } } : {}),
      ...(link ? { link } : {}),
      ...(comfy ? { comfy } : {}),
      ...(suggestion ? { suggestion } : {}),
      ...(ollamaModels?.length ? { ollamaModels } : {}),
    };
  }

  const check = (id: string): FeatureId => {
    if (!isFeature(id)) throw new FactoryError("not_found", `Fonction inconnue : « ${id} ». Choix : ${FEATURE_IDS.join(", ")}.`);
    return id;
  };

  function validate(id: FeatureId, values: Record<string, unknown>): Record<string, string> {
    const def = DEFS[id];
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(values)) {
      const field = def.fields.find((f) => f.var === key);
      const choice = def.choices?.find((c) => c.var === key);
      if (!field && !choice) throw bad(`« ${key} » ne se règle pas ici. Variables de cette fonction : ${[...def.fields, ...(def.choices ?? [])].map((f) => f.var).join(", ") || "aucune"}.`);
      if (typeof raw !== "string") throw bad(`${key} doit être un texte.`);
      const v = raw.trim();
      if (/[\r\n]/.test(v)) throw bad(`${key} ne doit pas contenir de retour à la ligne.`);
      if (v.length > 500) throw bad(`${key} est trop long (${v.length} caractères, 500 maximum).`);
      if (choice && v) {
        const allowed = choice.options.map((x) => x.value);
        const wrong = v.split(",").map((x) => x.trim()).filter((x) => !allowed.includes(x));
        if (wrong.length) throw bad(`${key} : « ${wrong.join(", ")} » inconnu. Choix : ${allowed.join(", ")}.`);
      }
      out[key] = v;
    }
    return out;
  }

  function startInstall(id: string): InstallState {
    if (!isFeature(id) || !installable(id)) throw new FactoryError("bad_request", `Rien à installer pour « ${id} » : cette fonction n'a besoin que d'une clé, d'une adresse ou d'un dossier.`);
    const st = o.installs.start(id);
    emit();
    return st;
  }

  async function update(idIn: string, patch: { enabled?: boolean; values?: Record<string, unknown> }): Promise<FeatureView> {
    const id = check(idIn);
    if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") throw bad("enabled doit valoir true ou false.");
    const values = patch.values ? validate(id, patch.values) : {};
    const s = load();
    if (patch.enabled !== undefined) s.enabled[id] = patch.enabled;
    for (const [k, v] of Object.entries(values)) {
      if (v) s.values[k] = v;
      else delete s.values[k];
    }
    save(s);
    apply(s);
    emit();
    // Cocher quelque chose qui n'est pas installé l'installe : c'est ce que l'humain demande en cochant.
    if (patch.enabled === true && DEFS[id].needs === "install" && installable(id) && !o.installs.isRunning(id)) {
      const v = await view(id, s);
      if (!v.ready && v.status !== "injoignable") startInstall(id);
    }
    return view(id, s);
  }

  async function http(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown } | undefined> {
    try {
      const res = await doFetch(url, { headers, signal: AbortSignal.timeout(8000) });
      const body = await res.json().catch(() => undefined);
      return { status: res.status, body };
    } catch {
      return undefined;
    }
  }

  async function test(idIn: string): Promise<FeatureTest> {
    const id = check(idIn);
    const s = load();
    const keyTest = async (name: string, key: string | undefined, run: (k: string) => Promise<{ status: number; body: unknown } | undefined>, okMessage: (b: unknown) => string, host: string): Promise<FeatureTest> => {
      if (!key) return { ok: false, message: `Mets d'abord la clé ${name} (le champ ci-dessus, ou dans le fichier .env).` };
      const r = await run(key);
      if (!r) return { ok: false, message: `${host} ne répond pas : vérifie la connexion internet de l'usine.` };
      if (r.status >= 200 && r.status < 300) return { ok: true, message: okMessage(r.body) };
      return { ok: false, message: `Clé ${name} refusée (${r.status}). Vérifie qu'elle est copiée en entier.` };
    };
    switch (id) {
      case "pexels":
        return keyTest("Pexels", value(s, "PEXELS_API_KEY"), (k) => http("https://api.pexels.com/v1/search?query=nature&per_page=1", { Authorization: k }), () => "Clé Pexels acceptée.", "Pexels");
      case "pixabay":
        return keyTest("Pixabay", value(s, "PIXABAY_API_KEY"), (k) => http(`https://pixabay.com/api/videos/?key=${encodeURIComponent(k)}&q=nature&per_page=3`), () => "Clé Pixabay acceptée.", "Pixabay");
      case "youtube":
        return keyTest("YouTube", value(s, "YOUTUBE_API_KEY"), (k) => http(`https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&maxResults=1&regionCode=CM&key=${encodeURIComponent(k)}`), () => "Clé YouTube acceptée.", "YouTube");
      case "apify":
        return keyTest("Apify", value(s, "APIFY_TOKEN"), (k) => http(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(k)}`), (b) => `Token Apify accepté (compte ${(b as { data?: { username?: string } })?.data?.username ?? "?"}).`, "Apify");
      case "publication": {
        const key = value(s, "POSTIZ_API_KEY");
        const url = trimUrl(value(s, "POSTIZ_API_URL") ?? "https://api.postiz.com");
        if (!key) return { ok: false, message: "Mets d'abord la clé API Postiz (Postiz > Paramètres > Public API), puis l'adresse de ton Postiz." };
        const r = await http(`${url}/public/v1/integrations`, { Authorization: key });
        if (!r) return { ok: false, message: `Postiz ne répond pas sur ${url}. Depuis Docker, ton PC s'appelle host.docker.internal (pas localhost) : par exemple http://host.docker.internal:4007/api` };
        if (r.status < 200 || r.status >= 300) return { ok: false, message: `Postiz a refusé la clé (${r.status}) sur ${url}. Vérifie la clé et l'adresse (elle se termine par /api sur un Postiz auto-hébergé).` };
        const list = (Array.isArray(r.body) ? r.body : []) as { identifier?: string; disabled?: boolean }[];
        const live = list.filter((i) => !i.disabled);
        const names = [...new Set(live.map((i) => i.identifier).filter(Boolean))];
        return live.length
          ? { ok: true, message: `Postiz répond : ${live.length} ${live.length > 1 ? "chaînes reliées" : "chaîne reliée"} (${names.join(", ")}).` }
          : { ok: true, message: "Postiz répond, mais aucune chaîne n'est reliée : ajoute TikTok, YouTube… dans Postiz." };
      }
      case "comfyui": {
        cache.delete("comfyui");
        const url = value(s, "COMFYUI_URL");
        if (!url) {
          const found = await discoverComfy(doFetch);
          return { ok: false, message: found ? `Indique l'adresse de ComfyUI : il répond sur ${found}.` : "Indique l'adresse de ComfyUI (par exemple http://host.docker.internal:8188)." };
        }
        const info = await detectComfy(url, doFetch);
        if (!info.reachable) return { ok: false, message: `ComfyUI ne répond pas sur ${url}. Vérifie le port (8188 pour la version portable, 8000 pour l'application Desktop) et qu'il écoute sur 0.0.0.0 : option --listen (portable) ou Paramètres > Configuration du serveur > Hôte 0.0.0.0 (Desktop), car Docker n'atteint pas 127.0.0.1.` };
        const total = info.models.diffusion.length + info.models.checkpoints.length;
        if (!info.profile) return { ok: false, message: `ComfyUI répond (${total} modèle${total > 1 ? "s" : ""} trouvé${total > 1 ? "s" : ""}) mais aucun ne convient aux plans vidéo. Ajoute :\n${info.missing.map((m) => `• ${m}`).join("\n")}\nAstuce : dans ComfyUI, Modèles > « Wan2.2 5B » propose de les télécharger.` };
        const card = [info.gpu, info.vramGb ? `${info.vramGb} Go` : ""].filter(Boolean).join(", ");
        return { ok: true, message: `ComfyUI prêt : ${PROFILE_LABEL[info.profile]}${card ? ` (${card})` : ""}. ${total} modèle${total > 1 ? "s" : ""} trouvé${total > 1 ? "s" : ""}.` };
      }
      case "ollama": {
        cache.delete("ollama");
        const st = await ollamaState(s);
        if (!st.reachable) return { ok: false, message: `Ollama ne répond pas sur ${ollamaHost()}.` };
        return st.present ? { ok: true, message: `Ollama répond, le modèle ${ollamaModel(s)} est prêt.` } : { ok: false, message: `Ollama répond, mais le modèle ${ollamaModel(s)} n'est pas téléchargé : clique Installer.` };
      }
      case "voix":
        return piperInstalled() ? { ok: true, message: `Voix ${voiceName()} installée.` } : { ok: false, message: "Pas encore installée : clique Installer (quelques minutes, téléchargement de la voix)." };
      case "voix-hd":
        return chatterboxInstalled() ? { ok: true, message: "Chatterbox installé." } : { ok: false, message: "Pas encore installée : clique Installer (plusieurs Go, une carte graphique aide)." };
      case "whatsapp": {
        const hub = o.hub?.();
        return hub?.state === "ready" || (!hub && existsSync(join(o.home, "wa"))) ? { ok: true, message: "WhatsApp est lié." } : { ok: false, message: "Pas encore lié : scanne le QR code avec WhatsApp > Appareils connectés." };
      }
      case "musique": {
        const dir = value(s, "VIRAL_MUSIC_DIR");
        const n = tracks(dir);
        return n ? { ok: true, message: `${n} ${n > 1 ? "pistes trouvées" : "piste trouvée"}.` } : { ok: false, message: dir ? `Aucune piste (mp3, wav, ogg, m4a, flac) dans ${dir}.` : "Indique un dossier de musique." };
      }
    }
  }

  return {
    async list(): Promise<FeatureView[]> {
      const s = load();
      return Promise.all(FEATURE_IDS.map((id) => view(id, s)));
    },
    update,
    test,
    install: startInstall,
    // Au démarrage de l'usine : installe ce qui est coché et manquant (voix, modèle), sans rien lancer deux fois.
    autoInstall(ids: string[]) {
      const s = load();
      for (const id of ids) {
        if (!isFeature(id) || !installable(id) || !isOn(s, id) || o.installs.isRunning(id)) continue;
        void view(id, s).then((v) => {
          if (!v.ready && v.status !== "injoignable") startInstall(id);
        });
      }
    },
    apply: () => apply(),
    onChange(handler: () => void) {
      listeners.add(handler);
      return () => void listeners.delete(handler);
    },
  };
}

export type Features = ReturnType<typeof createFeatures>;
