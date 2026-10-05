import { closeSync, openSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";

export class LockTimeout extends Error {
  constructor(path: string) {
    super(`Verrou occupé trop longtemps : ${path}`);
  }
}

// Verrou entre processus : la création exclusive d'un fichier est atomique sur tous les systèmes.
// Un verrou plus vieux que staleMs (processus mort) est repris.
export function tryLock(path: string, staleMs = 15 * 60_000): (() => void) | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      closeSync(fd);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        rmSync(path, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs <= staleMs) return null;
        rmSync(path, { force: true });
      } catch {
        // relâché entre-temps : on réessaie
      }
    }
  }
  return null;
}

export async function withLock<T>(path: string, fn: () => T | Promise<T>, opts: { waitMs?: number; staleMs?: number } = {}): Promise<T> {
  const deadline = Date.now() + (opts.waitMs ?? 5000);
  let release = tryLock(path, opts.staleMs ?? 30_000);
  while (!release) {
    if (Date.now() > deadline) throw new LockTimeout(path);
    await new Promise((r) => setTimeout(r, 25));
    release = tryLock(path, opts.staleMs ?? 30_000);
  }
  try {
    return await fn();
  } finally {
    release();
  }
}

// Un lecteur ne voit jamais un fichier à moitié écrit : on écrit à côté, puis on renomme.
export function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}
