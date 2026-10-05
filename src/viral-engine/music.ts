import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const AUDIO = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;

// Musique gratuite (D25) : tes pistes (ACE-Step en local, bibliothèques libres de droits) dans VIRAL_MUSIC_DIR.
// Le choix dépend du job : stable si on refait le rendu, varié d'une vidéo à l'autre.
export function pickTrack(dir: string | undefined, jobId: string): string | undefined {
  if (!dir || !existsSync(dir)) return undefined;
  const tracks = readdirSync(dir).filter((f) => AUDIO.test(f)).sort();
  if (!tracks.length) return undefined;
  const n = createHash("sha256").update(jobId).digest().readUInt32BE(0);
  return join(dir, tracks[n % tracks.length]);
}
