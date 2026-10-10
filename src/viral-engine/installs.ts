import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Env } from "./config";
import { FactoryError } from "./errors";
import { voiceHdSteps, voiceSteps } from "./setup";

// Les installations que le Studio sait lancer d'un bouton : voix Piper, voix HD Chatterbox, modèle Ollama.
export type InstallId = "voix" | "voix-hd" | "ollama";
export const INSTALL_IDS: InstallId[] = ["voix", "voix-hd", "ollama"];

export type InstallState = {
  id: InstallId;
  status: "idle" | "running" | "done" | "failed";
  step?: string;
  progress?: number;
  log: string[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type StepRunner = (cmd: string, args: string[], onLine: (line: string) => void) => Promise<number>;

const MAX_LOG = 200;

export const spawnRunner: StepRunner = (cmd, args, onLine) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on("line", (l) => l.trim() && onLine(l.trim()));
    child.on("error", (error) => {
      onLine(`${cmd} : ${error.message}`);
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });

export function createInstalls(o: { home: string; env: Env; run?: StepRunner; fetchImpl?: typeof fetch }) {
  const dir = join(o.home, "installs");
  const run = o.run ?? spawnRunner;
  const doFetch = o.fetchImpl ?? fetch;
  const states = new Map<InstallId, InstallState>();
  const running = new Map<InstallId, Promise<void>>();
  const listeners = new Set<(s: InstallState) => void>();

  const file = (id: InstallId) => join(dir, `${id}.json`);
  const persist = (s: InstallState) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file(s.id), JSON.stringify(s));
  };
  const update = (id: InstallId, patch: Partial<InstallState>, save = false) => {
    const next = { ...states.get(id)!, ...patch };
    states.set(id, next);
    if (save || next.status !== "running") persist(next);
    for (const l of listeners) l(next);
    return next;
  };
  const note = (id: InstallId, line: string) => update(id, { log: [...states.get(id)!.log, line].slice(-MAX_LOG) });

  function load(id: InstallId): InstallState {
    try {
      const saved = JSON.parse(readFileSync(file(id), "utf8")) as InstallState;
      // Un « running » sans processus de ce côté : l'usine s'est arrêtée pendant l'installation.
      if (saved.status === "running") {
        const failed: InstallState = { ...saved, status: "failed", error: "Installation interrompue (l'usine s'est arrêtée) : relance-la.", finishedAt: new Date().toISOString() };
        persist(failed);
        return failed;
      }
      return saved;
    } catch {
      return { id, status: "idle", log: [] };
    }
  }

  const known = (id: string): id is InstallId => (INSTALL_IDS as string[]).includes(id);

  async function pythonSteps(id: InstallId, steps: ReturnType<typeof voiceSteps>) {
    for (const [i, step] of steps.entries()) {
      update(id, { step: step.label, progress: i / steps.length });
      note(id, `▶ ${step.label}`);
      const code = await run(step.cmd, step.args, (l) => note(id, l));
      if (code !== 0) throw new Error(step.hint.replace(/^Impossible/, "Impossible"));
    }
    update(id, { progress: 1 });
  }

  async function pull(id: InstallId) {
    const host = (o.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = o.env.VIRAL_OLLAMA_MODEL ?? "qwen2.5:7b";
    update(id, { step: `Modèle ${model}`, progress: 0 });
    let res: Response;
    try {
      res = await doFetch(`${host}/api/pull`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: model, stream: true }) });
    } catch {
      throw new Error(`Ollama ne répond pas sur ${host}. Vérifie qu'il tourne (docker compose ps, ou ollama serve) puis relance.`);
    }
    if (!res.ok || !res.body) throw new Error(`Ollama a répondu ${res.status} sur ${host} : le modèle ${model} n'a pas été téléchargé.`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let last = "";
    let ok = false;
    const handle = (line: string) => {
      if (!line.trim()) return;
      const msg = JSON.parse(line) as { status?: string; error?: string; total?: number; completed?: number };
      if (msg.error) throw new Error(`Ollama : ${msg.error}`);
      if (msg.status && msg.status !== last) {
        last = msg.status;
        note(id, msg.status);
      }
      if (msg.total && msg.completed !== undefined) update(id, { progress: Math.min(0.99, msg.completed / msg.total) });
      if (msg.status === "success") ok = true;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(buffer);
    if (!ok) throw new Error(`Le téléchargement du modèle ${model} s'est arrêté avant la fin : relance-le.`);
    update(id, { progress: 1 });
  }

  function start(id: InstallId): InstallState {
    if (!known(id)) throw new FactoryError("bad_request", `Rien à installer sous « ${id} ». Choix : ${INSTALL_IDS.join(", ")}.`);
    if (running.has(id)) return states.get(id)!;
    states.set(id, { id, status: "running", log: [], startedAt: new Date().toISOString(), progress: 0 });
    persist(states.get(id)!);
    const job = (async () => {
      try {
        if (id === "voix") await pythonSteps(id, voiceSteps(o.home, o.env.VIRAL_PIPER_VOICE ?? "fr_FR-tom-medium"));
        else if (id === "voix-hd") await pythonSteps(id, voiceHdSteps(o.home));
        else await pull(id);
        update(id, { status: "done", finishedAt: new Date().toISOString() });
      } catch (error) {
        update(id, { status: "failed", error: (error as Error).message, finishedAt: new Date().toISOString() });
      } finally {
        running.delete(id);
      }
    })();
    running.set(id, job);
    return states.get(id)!;
  }

  return {
    start,
    get(id: InstallId): InstallState {
      if (!known(id)) throw new FactoryError("bad_request", `Rien à installer sous « ${id} ».`);
      if (!states.has(id)) states.set(id, load(id));
      return states.get(id)!;
    },
    wait: async (id: InstallId) => void (await running.get(id)),
    isRunning: (id: InstallId) => running.has(id),
    onChange(handler: (s: InstallState) => void) {
      listeners.add(handler);
      return () => void listeners.delete(handler);
    },
  };
}

export type Installs = ReturnType<typeof createInstalls>;
