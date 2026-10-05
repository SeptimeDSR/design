import type { Platform, PublishMode } from "./publish-plan";
import type { Job } from "./store";

export const BOT_PREFIX = "🎬 Septim";

export const jobRef = (job: Pick<Job, "id">) => job.id.slice(0, 4);

export function postText(job: Job): string {
  return [job.script.caption, job.script.hashtags.join(" ")].filter(Boolean).join("\n\n");
}

const NAMES: Record<Platform, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };

export function formatReadyMessage(job: Job, mode: PublishMode, platforms: Platform[]): string {
  const sound = job.trend?.sound ? `\n🎵 Son tendance à ajouter dans l'app : ${job.trend.sound}` : "";
  const ref = `OUI #${jobRef(job)}`;
  const names = platforms.map((p) => NAMES[p]).join(", ");
  const privateNote =
    mode === "postiz-self" && platforms.some((p) => p === "tiktok" || p === "youtube")
      ? " (TikTok et YouTube en privé tant que tes apps Postiz ne sont pas auditées)"
      : "";
  const action =
    mode === "manual"
      ? `Réponds ${ref} et je te renvoie la légende prête à coller (tu postes depuis ton téléphone avec le son tendance).`
      : `Réponds ${ref} pour publier sur ${names}${privateNote}.`;
  return [
    `${BOT_PREFIX} · Vidéo prête boss #${jobRef(job)}`,
    "",
    `« ${job.script.hook} »`,
    `Template ${job.script.template} · ${Math.round(job.timeline.durationMs / 1000)} s · voix ${job.ttsEngine}${job.source === "fallback" ? " · script de secours" : ""}`,
    "",
    postText(job) + sound,
    "",
    action,
    "NON pour jeter · REFAIS pour une autre version.",
  ].join("\n");
}

export function formatFailedMessage(job: Job): string {
  return `${BOT_PREFIX} · Rendu raté #${jobRef(job)} sur « ${job.script.topic} » : ${job.error ?? "erreur inconnue"}. Je réessaie au prochain cycle.`;
}
