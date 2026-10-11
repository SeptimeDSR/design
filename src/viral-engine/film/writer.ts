import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ollama } from "ollama";
import type { ViralConfig } from "../config";
import { GENRE_LABEL, type Genre } from "../duration";
import { writeJsonAtomic } from "../lock";
import type { Lang } from "../types";
import { GENRE_BRIEF } from "./genres";
import { planFilm, sceneCountsPerAct } from "./plan";
import { MOODS, normalizeFilm, type Character, type FilmScript, type Mood, type Scene, type Shot } from "./types";

export class FilmError extends Error {
  constructor(
    message: string,
    readonly code: "no_writer" | "unreadable" | "aborted" | "no_voice" | "no_space" | "no_ffmpeg" | "render" = "unreadable",
  ) {
    super(message);
  }
}

export type FilmLlm = { chat(prompt: string): Promise<string>; unload?(): Promise<void> };
export type Progress = { phase: string; done: number; total: number; message: string };

export type WriteOptions = {
  topic: string;
  lang: Lang;
  genre?: Genre;
  durationSec: number;
  dir: string;
  llm: FilmLlm;
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
  log?: (text: string) => void;
};

// L'écrivain du film : le modèle Ollama du PC (VIRAL_LONG_MODEL, sinon VIRAL_OLLAMA_MODEL).
export function filmOllama(cfg: ViralConfig, env: Record<string, string | undefined> = process.env): FilmLlm {
  const client = new Ollama({ host: cfg.ollama.host });
  const model = env.VIRAL_LONG_MODEL || cfg.ollama.model;
  const timeoutMs = Number(env.VIRAL_LONG_TIMEOUT_MS || 600_000);
  return {
    async chat(prompt) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("Ollama trop lent")), timeoutMs)));
      try {
        const res = await Promise.race([client.chat({ model, format: "json", messages: [{ role: "user", content: prompt }], options: { temperature: 0.8, num_ctx: 8192 } }), timeout]);
        return res.message.content;
      } finally {
        clearTimeout(timer);
      }
    },
    // Le GPU est rendu à ComfyUI (images, musique) avant la suite.
    async unload() {
      await client.generate({ model, prompt: "", keep_alive: 0 }).catch(() => undefined);
    },
  };
}

const NO_WRITER = (host: string) =>
  `Aucun écrivain pour le film : Ollama ne répond pas (${host}). Démarre Ollama (ollama serve) et prends un modèle déjà téléchargé (Réglages > Écrivain), ou fais écrire le film par Claude Code puis lance : septim video --script film.json`;

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)).trim();
  if (!candidate.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type Bible = { title: string; logline: string; characters: Character[]; acts: { title: string; summary: string }[]; caption: string; hashtags: string[] };
type PlannedScene = { title: string; summary: string; location: string; mood: Mood };

const LANGUAGE: Record<Lang, string> = { fr: "français", en: "anglais" };

function bibleSchema(acts: number): string {
  return `{"title": "titre du film", "logline": "l'histoire en une phrase", "characters": [{"name": "Prénom", "gender": "femme|homme", "description": "qui il est, son âge, ce qu'il veut"}], "acts": [${Array.from({ length: acts }, (_, i) => `{"title": "Acte ${i + 1}", "summary": "ce qui se passe"}`).join(", ")}], "caption": "légende courte pour le post", "hashtags": ["#..."]}`;
}

export async function writeFilm(o: WriteOptions): Promise<FilmScript> {
  const plan = planFilm(o.durationSec, o.lang);
  const story = join(o.dir, "story");
  mkdirSync(story, { recursive: true });
  const language = LANGUAGE[o.lang];
  const genre = o.genre ?? "drame";
  const total = 1 + plan.acts + plan.scenes;
  let done = 0;
  const tick = (message: string) => o.onProgress?.({ phase: "ecriture", done: ++done, total, message });
  const checkAbort = () => {
    if (o.signal?.aborted) throw new FilmError("Fabrication annulée.", "aborted");
  };
  const read = <T>(file: string): T | undefined => {
    const path = join(story, file);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return undefined;
    }
  };

  // Un appel au modèle : JSON exigé, trois essais, Ollama absent = arrêt tout de suite.
  async function ask<T>(prompt: string, accept: (json: Record<string, unknown>) => T | null, what: string): Promise<T> {
    let extra = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      checkAbort();
      let raw: string;
      try {
        raw = await o.llm.chat(prompt + extra);
      } catch (error) {
        const message = (error as Error).message;
        if (/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN/i.test(message)) throw new FilmError(NO_WRITER("l'adresse Ollama réglée"), "no_writer");
        o.log?.(`[film] ${what}, essai ${attempt} : ${message}`);
        if (/not found|try pulling/i.test(message)) throw new FilmError(`Le modèle Ollama est introuvable : ${message}. Choisis un modèle déjà téléchargé (ollama list).`, "no_writer");
        extra = "";
        continue;
      }
      const json = parseJsonObject(raw);
      const value = json && accept(json);
      if (value) return value;
      extra = "\n\nRéponds UNIQUEMENT avec le JSON demandé, sans texte autour.";
      o.log?.(`[film] ${what} : réponse illisible (essai ${attempt}).`);
    }
    throw new FilmError(`L'écrivain a rendu une réponse illisible (JSON attendu) pour : ${what}. Essaie un modèle plus gros (VIRAL_LONG_MODEL) ou écris le film avec Claude Code (--script film.json).`, "unreadable");
  }

  // 1. La bible : titre, personnages, actes.
  let bible = read<Bible>("bible.json");
  if (!bible) {
    const prompt = [
      `Tu es scénariste. Tu prépares un film de ${Math.round(o.durationSec / 60)} minutes en ${language}.`,
      `Sujet : ${o.topic || "libre, une histoire originale"}`,
      `Genre : ${GENRE_LABEL[genre]} — ${GENRE_BRIEF[genre]}.`,
      `Le film a ${plan.acts} actes et ${plan.scenes} scènes. Invente un titre fort, 2 à 5 personnages avec un prénom (pas de célébrités), et le résumé de chaque acte.`,
      "Chaque acte doit finir sur une tension ou une question qui donne envie de voir la suite.",
      "",
      "Réponds UNIQUEMENT avec ce JSON :",
      bibleSchema(plan.acts),
    ].join("\n");
    bible = await ask<Bible>(
      prompt,
      (j) => {
        const characters = normalizeFilm({ title: "x", scenes: [{ title: "x", shots: ["x"] }], characters: j.characters }, { lang: o.lang })?.characters ?? [];
        const acts = (Array.isArray(j.acts) ? j.acts : []).map((a) => ({ title: str((a as Record<string, unknown>)?.title), summary: str((a as Record<string, unknown>)?.summary) })).filter((a) => a.title || a.summary);
        if (!str(j.title) || !acts.length) return null;
        while (acts.length < plan.acts) acts.push({ title: `Acte ${acts.length + 1}`, summary: acts.at(-1)!.summary });
        return { title: str(j.title), logline: str(j.logline), characters, acts: acts.slice(0, plan.acts), caption: str(j.caption) || str(j.logline), hashtags: Array.isArray(j.hashtags) ? j.hashtags.filter((h): h is string => typeof h === "string") : [] };
      },
      "la bible du film",
    );
    writeJsonAtomic(join(story, "bible.json"), bible);
  }
  tick("Titre, personnages et actes");

  // 2. Le plan des scènes, acte par acte.
  const counts = sceneCountsPerAct(plan.scenes, plan.acts);
  let planned = read<PlannedScene[]>("plan.json") ?? [];
  const actIndexOfScene: number[] = counts.flatMap((c, a) => Array<number>(c).fill(a));
  if (planned.length < plan.scenes) {
    const done_: PlannedScene[] = [];
    for (let a = 0; a < plan.acts; a++) {
      const want = counts[a];
      const cached = read<PlannedScene[]>(`plan-act-${a}.json`);
      let list = cached;
      if (!list) {
        const act = bible.acts[a];
        const prompt = [
          `Film « ${bible.title} » (${GENRE_LABEL[genre]}), en ${language}. ${bible.logline}`,
          `Personnages : ${bible.characters.map((c) => `${c.name}${c.description ? ` (${c.description})` : ""}`).join(" ; ") || "à inventer"}`,
          `Acte ${a + 1}/${plan.acts} : ${act.title} — ${act.summary}`,
          done_.length ? `Scènes déjà prévues avant : ${done_.slice(-4).map((s) => s.title).join(" ; ")}` : "",
          `Découpe cet acte en EXACTEMENT ${want} scènes qui s'enchaînent, chacune avec un événement précis. Une scène = un lieu et un moment.`,
          "location : le lieu en anglais, 2 à 5 mots, concret (ex. old kitchen at night). mood : calme, tension, tristesse, joie, mystere ou action.",
          "",
          "Réponds UNIQUEMENT avec ce JSON :",
          '{"scenes": [{"title": "titre court", "summary": "ce qui se passe, 1 à 2 phrases", "location": "place in english", "mood": "tension"}]}',
        ]
          .filter(Boolean)
          .join("\n");
        list = await ask<PlannedScene[]>(
          prompt,
          (j) => {
            const raw = Array.isArray(j.scenes) ? j.scenes : [];
            const out = raw
              .map((s): PlannedScene | null => {
                const x = (s ?? {}) as Record<string, unknown>;
                if (!str(x.title) && !str(x.summary)) return null;
                return { title: str(x.title) || str(x.summary).slice(0, 40), summary: str(x.summary), location: str(x.location), mood: MOODS.find((m) => m === str(x.mood).toLowerCase()) ?? "calme" };
              })
              .filter((s): s is PlannedScene => !!s);
            return out.length ? out : null;
          },
          `les scènes de l'acte ${a + 1}`,
        );
        // Le modèle en rend parfois moins : on comble avec la suite de l'acte, la durée demandée reste tenue.
        while (list.length < want) list.push({ title: `${bible.acts[a].title} (suite ${list.length + 1})`, summary: bible.acts[a].summary, location: list.at(-1)?.location ?? "", mood: list.at(-1)?.mood ?? "calme" });
        list = list.slice(0, want);
        writeJsonAtomic(join(story, `plan-act-${a}.json`), list);
      }
      done_.push(...list);
      tick(`Plan de l'acte ${a + 1}/${plan.acts}`);
    }
    planned = done_;
    writeJsonAtomic(join(story, "plan.json"), planned);
  } else {
    for (let a = 0; a < plan.acts; a++) tick(`Plan de l'acte ${a + 1}/${plan.acts}`);
  }

  // 3. Les scènes, une par une, avec le fil de ce qui précède.
  const scenes: Scene[] = [];
  const target = plan.wordsPerScene;
  const cast = bible.characters.map((c) => `${c.name} (${c.gender === "f" ? "femme" : c.gender === "h" ? "homme" : "?"}${c.description ? `, ${c.description}` : ""})`).join(" ; ") || "aucun personnage nommé : un narrateur seul";
  for (let i = 0; i < plan.scenes; i++) {
    const file = `scene-${String(i).padStart(2, "0")}.json`;
    const cached = read<Scene>(file);
    if (cached) {
      scenes.push(cached);
      tick(`Scène ${i + 1}/${plan.scenes} (déjà écrite)`);
      continue;
    }
    checkAbort();
    const p = planned[i];
    const act = bible.acts[actIndexOfScene[i]];
    const previous = planned.slice(Math.max(0, i - 3), i).map((s) => s.summary || s.title);
    const next = planned[i + 1];
    const lastLine = scenes.at(-1)?.shots.at(-1)?.narration;
    const base = [
      `Tu écris la scène ${i + 1}/${plan.scenes} du film « ${bible.title} » (${GENRE_LABEL[genre]}), en ${language}.`,
      `Histoire : ${bible.logline}`,
      `Personnages : ${cast}`,
      `Acte : ${act.title} — ${act.summary}`,
      previous.length ? `Ce qui vient de se passer : ${previous.join(" / ")}` : "C'est la première scène : accroche tout de suite, commence au cœur de l'action.",
      lastLine ? `Dernière phrase de la scène d'avant : « ${lastLine} »` : "",
      `CETTE scène : ${p.title}. ${p.summary} Lieu : ${p.location || "à choisir"}. Ambiance : ${p.mood}.`,
      next ? `La scène d'après : ${next.summary || next.title}. Termine celle-ci de façon à y mener.` : "C'est la dernière scène : la fin doit résoudre l'histoire et laisser une émotion forte.",
      i === plan.scenes - 1 || i === 0 ? "" : "Finis sur une tension, une révélation ou une question qui donne envie de continuer.",
      "",
      `Écris environ ${target} mots de narration (${Math.round(plan.sceneSec / 60 * 10) / 10} minutes à voix haute), découpés en ${plan.shotsPerScene} plans environ. Chaque plan : 1 à 3 phrases courtes, 45 mots maximum, concrètes, sensorielles.`,
      "Alterne narration et dialogues : pour un dialogue, mets le prénom exact du personnage dans speaker et sa réplique dans narration (au discours direct, sans guillemets). Pour la narration, speaker reste vide.",
      "visual : ce qu'on VOIT pendant ce plan, en anglais, 4 à 9 mots, concret et photographiable (jamais de noms propres, jamais de texte à l'écran).",
    ]
      .filter(Boolean)
      .join("\n");
    const schema = '\nRéponds UNIQUEMENT avec ce JSON :\n{"shots": [{"narration": "...", "speaker": "", "visual": "old woman reading a letter by a window"}]}';
    const shotsOf = (j: Record<string, unknown>): Shot[] | null => {
      const film = normalizeFilm({ title: "x", scenes: [{ title: "x", shots: j.shots }] }, { lang: o.lang });
      return film?.scenes[0].shots ?? null;
    };
    let shots = await ask<Shot[]>(base + schema, shotsOf, `la scène ${i + 1}`);
    const wordsOf = (s: Shot[]) => s.reduce((n, x) => n + x.narration.split(/\s+/).filter(Boolean).length, 0);
    // Un petit modèle écrit court : on lui demande la suite (deux fois au plus) plutôt que de livrer un film trop bref.
    for (let more = 0; more < 2 && wordsOf(shots) < target * 0.7; more++) {
      const missing = target - wordsOf(shots);
      const tail = shots.slice(-3).map((s) => s.narration).join(" ");
      const cont = [
        base,
        `Voici déjà le début de la scène (${wordsOf(shots)} mots). Sa fin actuelle : « ${tail} »`,
        `Écris la SUITE uniquement, environ ${missing} mots de plus, sans répéter ce qui précède, dans la même ambiance, jusqu'à la fin de la scène.`,
      ].join("\n");
      const extra = await ask<Shot[]>(cont + schema, shotsOf, `la suite de la scène ${i + 1}`);
      shots = [...shots, ...extra];
    }
    const scene: Scene = { title: p.title, summary: p.summary, location: p.location, mood: p.mood, shots };
    writeJsonAtomic(join(story, file), scene);
    scenes.push(scene);
    tick(`Scène ${i + 1}/${plan.scenes}`);
  }

  await o.llm.unload?.();
  const film = normalizeFilm(
    { title: bible.title, logline: bible.logline, characters: bible.characters, scenes, caption: bible.caption, hashtags: bible.hashtags },
    { lang: o.lang, genre },
  );
  if (!film) throw new FilmError("Le film écrit est vide.", "unreadable");
  return film;
}
