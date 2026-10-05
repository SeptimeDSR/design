import { fallbackScript } from "../../viral-engine/heat";
import { buildTimeline, normalizeBeats } from "../../viral-engine/story";
import type { TemplateId } from "../../viral-engine/types";
import type { ViralProps } from "./props";

// Props de démonstration : le Studio et le site affichent un vrai script sans aucun fichier audio.
export function sampleProps(template: TemplateId, topic = "le mobile money"): ViralProps {
  const raw = fallbackScript({ topic, lang: "fr", formula: "secret", template });
  const script = { ...raw, beats: normalizeBeats(raw.beats, "fr") };
  return { script, timeline: buildTimeline(script), audio: { segments: [] } };
}
