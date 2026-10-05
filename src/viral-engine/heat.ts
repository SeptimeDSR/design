import { RULES } from "./checklist";
import type { Beat, HookFormula, Lang, LintIssue, TemplateId, ViralScript } from "./types";

const PAUSE_MS = 250;

const VIEWER: Record<Lang, RegExp> = {
  fr: /\b(tu|toi|ton|ta|tes|vous|votre|vos)\b|\bt['’]/i,
  en: /\b(you|your|yours)\b/i,
};

const GAP_MARKERS: Record<Lang, RegExp> = {
  fr: /\b(pourquoi|personne|jamais|secret|faux|et si|vraiment|arr[eê]te)\b/i,
  en: /\b(why|nobody|never|secret|wrong|what if|stop)\b/i,
};

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function estimateSpokenMs(text: string, lang: Lang, speed: number = RULES.voiceSpeed): number {
  const wordsMs = (countWords(text) / (RULES.wordsPerSecond[lang] * speed)) * 1000;
  const pauses = (text.match(/[.?!…]+/g) ?? []).length;
  return Math.round(wordsMs + pauses * PAUSE_MS);
}

export function lintHook(hook: string, lang: Lang): LintIssue[] {
  const text = hook.trim();
  if (!text) return [{ rule: "hook.empty", message: "Le hook est vide." }];

  const issues: LintIssue[] = [];
  const ms = estimateSpokenMs(text, lang);
  if (ms > RULES.hookMaxSeconds * 1000) {
    issues.push({ rule: "hook.too_long", message: `Hook de ${ms} ms, maximum ${RULES.hookMaxSeconds * 1000} ms.` });
  }
  if (!VIEWER[lang].test(text)) {
    issues.push({ rule: "hook.no_viewer", message: "Le hook doit impliquer le viewer (tu / you)." });
  }
  if (!/(\?|…|\.\.\.)\s*$/.test(text) && !GAP_MARKERS[lang].test(text)) {
    issues.push({ rule: "hook.no_gap", message: "Le hook doit ouvrir une boucle : question, suspension ou mot-clé de curiosité." });
  }
  return issues;
}

type HeatInput = { topic: string; lang: Lang; formula: HookFormula; template: TemplateId; trend?: string };

const FORMULA_BRIEF: Record<HookFormula, string> = {
  question: "une question personnelle qui met le viewer dans la situation",
  choc: "une affirmation choc sur une erreur que le viewer commet",
  secret: "un secret que personne ne lui a jamais dit",
  "contre-intuitif": "un ordre qui contredit ce que tout le monde croit",
};

export function buildHeatPrompt(input: HeatInput): string {
  const language = input.lang === "fr" ? "français" : "anglais";
  return [
    `Tu écris le script d'une vidéo verticale virale de 25 à 45 secondes, en ${language}.`,
    `Sujet : ${input.topic}`,
    input.trend ? `Tendance du moment à exploiter : ${input.trend}` : "",
    `Template visuel : ${input.template}.`,
    "",
    "Formule H.E.A.T obligatoire :",
    `- H (Hit emotion) : le hook est ${FORMULA_BRIEF[input.formula]}. 9 mots maximum, tutoiement, finit par « ? » ou « … ».`,
    "- E (Curiosity gap) : commence au milieu de l'histoire, jamais au début.",
    "- A (Tension) : montre ce que le viewer risque de perdre.",
    "- T (Transition) : avance vite, une idée par beat.",
    "",
    "Règles :",
    "- 8 à 12 beats, chacun lisible en moins de 3 secondes (8 mots maximum).",
    "- Ne donne PAS la réponse avant le payoff : le payoff arrive en dernier, en une phrase courte.",
    "- Glisse une petite récompense surprise vers le milieu (un chiffre, un détail inattendu).",
    "",
    "Réponds UNIQUEMENT avec ce JSON :",
    '{"hook": "...", "beats": [{"text": "...", "emphasis": "mot clé"}], "payoff": "...", "caption": "légende courte pour le post", "hashtags": ["#..."]}',
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function parseHeatResponse(raw: string): Partial<ViralScript> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!candidate.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? (parsed as Partial<ViralScript>) : null;
  } catch {
    return null;
  }
}

const FALLBACK_HOOKS: Record<Lang, Record<HookFormula, string>> = {
  fr: {
    question: "Et si tout ce que tu crois était faux ?",
    choc: "Tu fais cette erreur tous les jours…",
    secret: "Personne ne t'a jamais dit ça…",
    "contre-intuitif": "Arrête. Tu le fais à l'envers.",
  },
  en: {
    question: "What if everything you know is wrong?",
    choc: "You make this mistake every single day…",
    secret: "Nobody ever told you this…",
    "contre-intuitif": "Stop. You're doing it backwards.",
  },
};

const FALLBACK_BEATS: Record<Lang, (topic: string) => Beat[]> = {
  fr: (topic) => [
    { text: `On est déjà en plein dedans : ${topic}.`, emphasis: topic },
    { text: "Tout le monde regarde au mauvais endroit.", emphasis: "mauvais" },
    { text: "Et ça coûte plus cher que tu crois.", emphasis: "cher" },
    { text: "Le détail qui change tout est juste là.", emphasis: "détail" },
    { text: "Neuf personnes sur dix passent à côté.", emphasis: "Neuf" },
    { text: "Toi, tu vas le voir dans un instant.", emphasis: "Toi" },
    { text: "Mais d'abord, regarde bien ça.", emphasis: "regarde" },
    { text: "C'est là que tout se joue.", emphasis: "tout" },
  ],
  en: (topic) => [
    { text: `We're already in the middle of it: ${topic}.`, emphasis: topic },
    { text: "Everyone is looking in the wrong place.", emphasis: "wrong" },
    { text: "And it costs more than you think.", emphasis: "costs" },
    { text: "The detail that changes everything is right here.", emphasis: "detail" },
    { text: "Nine people out of ten miss it.", emphasis: "Nine" },
    { text: "You're about to see it.", emphasis: "You" },
    { text: "But first, look closely.", emphasis: "look" },
    { text: "This is where it all happens.", emphasis: "all" },
  ],
};

export function fallbackScript(input: HeatInput): ViralScript {
  const { topic, lang, formula, template } = input;
  return {
    topic,
    lang,
    template,
    formula,
    hook: FALLBACK_HOOKS[lang][formula],
    beats: FALLBACK_BEATS[lang](topic),
    payoff:
      lang === "fr"
        ? `La réponse : avec ${topic}, tout se joue sur le détail que personne ne regarde.`
        : `The answer: with ${topic}, it all comes down to the detail nobody looks at.`,
    cta: RULES.cta[lang],
    caption: lang === "fr" ? `Ce que personne ne te dit sur ${topic}.` : `What nobody tells you about ${topic}.`,
    hashtags: lang === "fr" ? ["#lesaviezvous", "#apprendre", "#fyp"] : ["#didyouknow", "#learn", "#fyp"],
  };
}
