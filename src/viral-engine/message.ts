import type { PublishMode } from "./publish-plan";
import type { Job } from "./store";

export const BOT_PREFIX = "🎬 Septim";

export const jobRef = (job: Pick<Job, "id">) => job.id.slice(0, 4);

export function postText(job: Job): string {
  return [job.script.caption, job.script.hashtags.join(" ")].filter(Boolean).join("\n\n");
}

export function formatReadyMessage(job: Job, mode: PublishMode): string {
  const sound = job.trend?.sound ? `\n🎵 Son tendance à ajouter dans l'app : ${job.trend.sound}` : "";
  const action =
    mode === "manual"
      ? "Réponds OUI et je te renvoie la légende prête à coller (tu postes depuis ton téléphone avec le son tendance)."
      : "Réponds OUI pour publier sur TikTok, YouTube, Facebook, Instagram.";
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
