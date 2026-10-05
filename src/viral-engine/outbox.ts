import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

type OutboxMessage = { text: string; mediaPath?: string };

// Le CLI dépose ici ; le démon, seul propriétaire de la session WhatsApp, envoie et vide.
export function enqueueOutbox(home: string, msg: OutboxMessage): string {
  const dir = join(home, "outbox");
  mkdirSync(dir, { recursive: true });
  // Horloge monotone : deux messages de la même milliseconde restent dans l'ordre d'envoi.
  const order = process.hrtime.bigint().toString().padStart(20, "0");
  const name = `${String(Date.now()).padStart(15, "0")}-${order}-${randomBytes(3).toString("hex")}.json`;
  const tmp = join(dir, `.${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(msg));
  renameSync(tmp, join(dir, name));
  return join(dir, name);
}

export async function flushOutbox(home: string, send: (text: string, mediaPath?: string) => Promise<void>): Promise<void> {
  const dir = join(home, "outbox");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const path = join(dir, name);
    const msg = JSON.parse(readFileSync(path, "utf8")) as OutboxMessage;
    await send(msg.text, msg.mediaPath);
    rmSync(path);
  }
}
