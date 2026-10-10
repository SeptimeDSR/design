import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInstalls, type StepRunner } from "../installs";
import { voiceHdSteps, voiceSteps } from "../setup";

const home = () => mkdtempSync(join(tmpdir(), "septim-inst-"));
const settle = async (inst: ReturnType<typeof createInstalls>, id: Parameters<typeof inst.start>[0]) => {
  inst.start(id);
  await inst.wait(id);
  return inst.get(id);
};

describe("étapes d'installation partagées (septim setup et boutons du Studio)", () => {
  it("voiceSteps : venv, piper-tts, puis la voix dans <home>/voices", () => {
    const steps = voiceSteps("/data", "fr_FR-tom-medium");
    expect(steps.map((s) => s.args.join(" "))).toEqual([
      "-m venv /data/venv",
      "-m pip install --upgrade piper-tts",
      "-m piper.download_voices fr_FR-tom-medium --data-dir /data/voices",
    ]);
    expect(steps[0].cmd).toBe("python3");
    expect(steps[1].cmd).toBe("/data/venv/bin/python");
    expect(steps.every((s) => s.label && s.hint)).toBe(true);
  });

  it("voiceHdSteps : venv puis chatterbox-tts", () => {
    expect(voiceHdSteps("/data").map((s) => s.args.join(" "))).toEqual(["-m venv /data/venv", "-m pip install --upgrade chatterbox-tts"]);
  });
});

describe("installations lancées depuis le Studio", () => {
  it("voix : lance les étapes dans l'ordre, garde le journal, finit « done », écrit l'état sur disque", async () => {
    const calls: string[] = [];
    const run: StepRunner = async (cmd, args, onLine) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      onLine(`sortie de ${args[1] ?? args[0]}`);
      return 0;
    };
    const h = home();
    const inst = createInstalls({ home: h, env: {}, run });
    const state = await settle(inst, "voix");
    expect(state.status).toBe("done");
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain("piper.download_voices fr_FR-tom-medium");
    expect(state.log.join("\n")).toContain("sortie de");
    expect(state.progress).toBe(1);
    expect(JSON.parse(readFileSync(join(h, "installs", "voix.json"), "utf8")).status).toBe("done");
  });

  it("une étape qui échoue arrête tout : « failed », l'étape et l'indice sont nommés, rien d'autre n'est lancé", async () => {
    const calls: string[] = [];
    const run: StepRunner = async (cmd, args) => {
      calls.push(args.join(" "));
      return args.includes("pip") ? 1 : 0;
    };
    const inst = createInstalls({ home: home(), env: {}, run });
    const state = await settle(inst, "voix");
    expect(state.status).toBe("failed");
    expect(state.error).toMatch(/piper-tts/);
    expect(state.error).toMatch(/réseau/);
    expect(calls).toHaveLength(2);
  });

  it("deux clics : la même installation, jamais deux processus", async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run: StepRunner = async () => {
      started++;
      await gate;
      return 0;
    };
    const inst = createInstalls({ home: home(), env: {}, run });
    const a = inst.start("voix-hd");
    const b = inst.start("voix-hd");
    expect(a.status).toBe("running");
    expect(b.status).toBe("running");
    await new Promise((r) => setTimeout(r, 20));
    expect(started).toBe(1);
    release();
    await inst.wait("voix-hd");
    expect(inst.get("voix-hd").status).toBe("done");
  });

  it("ollama : tire le modèle par l'API, la progression suit total/completed, « success » termine", async () => {
    const lines = [
      { status: "pulling manifest" },
      { status: "pulling abc", total: 200, completed: 50 },
      { status: "pulling abc", total: 200, completed: 150 },
      { status: "success" },
    ];
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(String(url)).toBe("http://ollama:11434/api/pull");
      body = JSON.parse(String(init.body));
      return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { status: 200 });
    }) as unknown as typeof fetch;
    const inst = createInstalls({ home: home(), env: { OLLAMA_HOST: "http://ollama:11434", VIRAL_OLLAMA_MODEL: "qwen2.5:3b" }, fetchImpl });
    const state = await settle(inst, "ollama");
    expect(body).toMatchObject({ name: "qwen2.5:3b", stream: true });
    expect(state.status).toBe("done");
    expect(state.progress).toBe(1);
    expect(state.log.join("\n")).toContain("pulling manifest");
  });

  it("ollama injoignable → « failed » avec une phrase claire", async () => {
    const fetchImpl = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const inst = createInstalls({ home: home(), env: { OLLAMA_HOST: "http://ollama:11434" }, fetchImpl });
    const state = await settle(inst, "ollama");
    expect(state.status).toBe("failed");
    expect(state.error).toMatch(/Ollama/);
    expect(state.error).toMatch(/ollama:11434/);
  });

  it("un état « running » trouvé au démarrage (processus mort) devient « failed : interrompue »", () => {
    const h = home();
    mkdirSync(join(h, "installs"), { recursive: true });
    writeFileSync(join(h, "installs", "voix.json"), JSON.stringify({ id: "voix", status: "running", log: ["…"], step: "pip" }));
    const inst = createInstalls({ home: h, env: {}, run: async () => 0 });
    const state = inst.get("voix");
    expect(state.status).toBe("failed");
    expect(state.error).toMatch(/interrompue/);
    expect(existsSync(join(h, "installs", "voix.json"))).toBe(true);
  });

  it("un id inconnu est refusé", () => {
    const inst = createInstalls({ home: home(), env: {}, run: async () => 0 });
    expect(() => inst.start("nope" as never)).toThrow(/installer/i);
  });
});
