import { formatDuration, GENRE_LABEL, type Genre } from "../duration";
import { BOT_PREFIX, postText } from "../message";
import type { Platform, PublishMode } from "../publish-plan";
import type { Job } from "../store";
import { platformsForDuration } from "./platforms";

const NAMES: Record<Platform, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };

export function formatFilmReadyMessage(job: Job, mode: PublishMode, platforms: Platform[], ref: string): string {
  const seconds = Math.round(job.timeline.durationMs / 1000);
  const yes = `OUI #${ref}`;
  const where = platformsForDuration(seconds, platforms);
  const names = where.map((p) => NAMES[p]).join(", ");
  const skipped = platforms.filter((p) => !where.includes(p));
  const genre = job.film?.genre ? ` ${GENRE_LABEL[job.film.genre as Genre] ?? job.film.genre}` : "";
  const action =
    mode === "manual"
      ? `Réponds ${yes} et je te renvoie la description prête à coller (avec les chapitres).`
      : `Réponds ${yes} pour publier sur ${names || "aucune plateforme (film trop long pour elles)"}${skipped.length ? ` (pas ${skipped.map((p) => NAMES[p]).join(" ni ")} : trop long pour elles)` : ""}.`;
  return [
    `${BOT_PREFIX} · Film prêt boss #${ref}`,
    "",
    `« ${job.script.hook} »`,
    `Film${genre} · ${formatDuration(seconds)} · voix ${job.ttsEngine} · images ${job.film?.imageSource ?? "?"} · ${job.film?.scenes ?? "?"} scènes`,
    "",
    `Trop lourd pour WhatsApp : regarde-le dans le Studio (ou le fichier ${job.videoPath}).`,
    "",
    postText(job),
    "",
    action,
    "NON pour jeter · REFAIS pour reprendre ou refaire.",
  ].join("\n");
}
