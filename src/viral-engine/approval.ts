export type ReplyIntent = "publish" | "reject" | "redo" | "pro" | "unknown";

// Le message entier doit être un accord net : « ok je regarde ce soir » ou « Oui ? » ne publient jamais.
const PHRASES: Record<Exclude<ReplyIntent, "unknown">, string[]> = {
  publish: ["oui", "ok", "okay", "go", "yes", "publie", "publier", "vas-y", "vasy", "valide", "oui publie", "oui vas-y", "oui go", "ok publie", "oui valide", "👍"],
  reject: ["non", "no", "stop", "jette", "jette-la", "annule", "non merci"],
  redo: ["refais", "redo", "refais-la", "refais la", "une autre", "fais-en une autre"],
  pro: ["pro", "version pro"],
};

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/#[a-z0-9]+/g, " ")
    .replace(/[!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function parseReply(text: string): { intent: ReplyIntent; jobRef?: string; looksLikeApproval?: boolean } {
  const jobRef = text.match(/#([a-z0-9]{4,})/i)?.[1]?.toLowerCase();
  const withRef = <T extends object>(r: T) => (jobRef ? { ...r, jobRef } : r);
  const clean = normalize(text);

  if (clean && !clean.includes("?")) {
    for (const [intent, phrases] of Object.entries(PHRASES)) {
      if (phrases.includes(clean)) return withRef({ intent: intent as ReplyIntent });
    }
  }
  const first = clean.split(" ")[0] ?? "";
  const looksLikeApproval = PHRASES.publish.includes(first.replace(/\?+$/, "")) || clean.startsWith("👍");
  return withRef({ intent: "unknown" as const, looksLikeApproval });
}
