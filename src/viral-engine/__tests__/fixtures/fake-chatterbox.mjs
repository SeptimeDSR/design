// Faux worker Chatterbox : même protocole que py/chatterbox_tts.py (une ligne JSON par phrase), sans torch.
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

const wav = (seconds) => {
  const rate = 24000;
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
};
if (process.env.FAKE_CHATTERBOX_SILENT_START) setInterval(() => undefined, 1000);
else process.stdout.write(JSON.stringify({ ready: true, device: "cpu" }) + "\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const job = JSON.parse(line);
  const reply = (r) => process.stdout.write(JSON.stringify({ id: job.id, ...r }) + "\n");
  if (job.text.includes("PANNE")) return reply({ ok: false, error: "modèle en panne" });
  // LENT : ne répond jamais (le délai de l'usine doit couper). PARASITE : une réponse d'une autre phrase arrive d'abord.
  if (job.text.includes("LENT")) return;
  if (job.text.includes("PARASITE")) process.stdout.write(JSON.stringify({ id: "autre", ok: false, error: "pas pour toi" }) + "\n");
  writeFileSync(job.out, wav(job.text.split(/\s+/).length * 0.3));
  reply({ ok: true, lang: job.lang, voice: job.voice ?? null });
});
