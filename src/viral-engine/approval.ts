export type ReplyIntent = "publish" | "reject" | "redo" | "pro" | "unknown";

const INTENTS: Record<Exclude<ReplyIntent, "unknown">, string[]> = {
  publish: ["oui", "ok", "go", "yes", "publie", "publier", "vas-y", "vasy", "valide"],
  reject: ["non", "no", "stop", "jette", "annule"],
  redo: ["refais", "redo", "encore", "autre"],
  pro: ["pro"],
};

// Seul le premier mot compte : « oui mais non » reste un oui, un message du bot (🎬 …) n'est jamais un ordre.
export function parseReply(text: string): { intent: ReplyIntent; jobRef?: string } {
  const trimmed = text.trim();
  const jobRef = trimmed.match(/#([a-z0-9]{4,})/i)?.[1]?.toLowerCase();
  const withRef = (intent: ReplyIntent) => (jobRef ? { intent, jobRef } : { intent });

  if (trimmed.startsWith("👍")) return withRef("publish");
  const first = trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[\s,.!?]+/)[0];

  for (const [intent, words] of Object.entries(INTENTS)) {
    if (words.includes(first)) return withRef(intent as ReplyIntent);
  }
  return withRef("unknown");
}
