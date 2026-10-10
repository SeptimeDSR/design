import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFeatures, FEATURE_IDS } from "../features";
import { createInstalls, type StepRunner } from "../installs";
import { fakeComfy, WAN22_FILES } from "./fixtures/fake-comfy";

const mk = (envIn: Record<string, string | undefined> = {}, fetchImpl?: typeof fetch, run?: StepRunner) => {
  const home = mkdtempSync(join(tmpdir(), "septim-feat-"));
  const env: Record<string, string | undefined> = { VIRAL_HOME: home, ...envIn };
  const installs = createInstalls({ home, env, run: run ?? (async () => 0), fetchImpl });
  const features = createFeatures({ home, env, installs, fetchImpl: fetchImpl ?? ((async () => new Response("{}", { status: 404 })) as unknown as typeof fetch) });
  return { home, env, installs, features };
};
const fakePython = (home: string, pkg: string) => {
  mkdirSync(join(home, "venv", "lib", "python3.11", "site-packages", pkg), { recursive: true });
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fonctions : la liste, l'état, les interrupteurs", () => {
  it("liste les 11 fonctions dans l'ordre, chacune avec titre, aide, groupe, état ; jamais la valeur d'une clé", async () => {
    const { features } = mk({ PEXELS_API_KEY: "secret-pexels-1234" });
    const list = await features.list();
    expect(list.map((f) => f.id)).toEqual([...FEATURE_IDS]);
    expect(FEATURE_IDS).toHaveLength(11);
    for (const f of list) {
      expect(f.title && f.help && f.group, f.id).toBeTruthy();
      expect(["actif", "coupe", "a-installer", "installation", "echec", "cle-manquante", "adresse-manquante", "a-lier", "injoignable", "dossier-vide", "modeles-manquants"]).toContain(f.status);
    }
    expect(JSON.stringify(list)).not.toContain("secret-pexels-1234");
    const pexels = list.find((f) => f.id === "pexels")!;
    expect(pexels.fields[0]).toMatchObject({ var: "PEXELS_API_KEY", secret: true, source: "env" });
    expect(pexels.fields[0].value).toBeUndefined();
    expect(pexels.status).toBe("actif");
  });

  it("une clé absente → « cle-manquante » ; la coller depuis le Studio la rend active et la met dans l'environnement", async () => {
    const { features, env, home } = mk();
    expect((await features.list()).find((f) => f.id === "pexels")!.status).toBe("cle-manquante");
    const view = await features.update("pexels", { values: { PEXELS_API_KEY: "  abc123  " } });
    expect(view.status).toBe("actif");
    expect(view.fields[0].source).toBe("studio");
    expect(env.PEXELS_API_KEY).toBe("abc123");
    // Le fichier garde la clé en 0600 et la liste ne la montre jamais.
    const file = join(home, "settings.json");
    expect(JSON.parse(readFileSync(file, "utf8")).values.PEXELS_API_KEY).toBe("abc123");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(await features.list())).not.toContain("abc123");
  });

  it("décocher coupe la fonction même si la clé est dans .env ; recocher la rend", async () => {
    const { features, env } = mk({ PEXELS_API_KEY: "k", YOUTUBE_API_KEY: "y" });
    const off = await features.update("pexels", { enabled: false });
    expect(off.status).toBe("coupe");
    expect(off.enabled).toBe(false);
    expect(env.PEXELS_API_KEY).toBeUndefined();
    expect(env.YOUTUBE_API_KEY).toBe("y");
    const on = await features.update("pexels", { enabled: true });
    expect(on.status).toBe("actif");
    expect(env.PEXELS_API_KEY).toBe("k");
  });

  it("les réglages survivent à un redémarrage : une nouvelle instance relit le fichier et réapplique", async () => {
    const a = mk({ PEXELS_API_KEY: "k" });
    await a.features.update("pexels", { enabled: false });
    await a.features.update("apify", { values: { APIFY_TOKEN: "tok" } });
    const env2: Record<string, string | undefined> = { VIRAL_HOME: a.home, PEXELS_API_KEY: "k" };
    const b = createFeatures({ home: a.home, env: env2, installs: createInstalls({ home: a.home, env: env2, run: async () => 0 }), fetchImpl: (async () => json({})) as unknown as typeof fetch });
    expect(env2.PEXELS_API_KEY).toBeUndefined();
    expect(env2.APIFY_TOKEN).toBe("tok");
    expect((await b.list()).find((f) => f.id === "pexels")!.status).toBe("coupe");
  });

  it("refuse ce qui n'est pas une variable de cette fonction, une valeur à retour de ligne, un id inconnu", async () => {
    const { features } = mk();
    await expect(features.update("pexels", { values: { OLLAMA_HOST: "x" } })).rejects.toMatchObject({ code: "bad_request" });
    await expect(features.update("pexels", { values: { PEXELS_API_KEY: "a\nb" } })).rejects.toMatchObject({ code: "bad_request" });
    await expect(features.update("pexels", { values: { PEXELS_API_KEY: "x".repeat(600) } })).rejects.toMatchObject({ code: "bad_request" });
    await expect(features.update("nope" as never, { enabled: true })).rejects.toMatchObject({ code: "not_found" });
    await expect(features.update("pexels", { enabled: "oui" as never })).rejects.toMatchObject({ code: "bad_request" });
  });

  it("vider le champ efface la clé du Studio (la clé de .env revient)", async () => {
    const { features, env } = mk({ PEXELS_API_KEY: "env-key" });
    await features.update("pexels", { values: { PEXELS_API_KEY: "studio-key" } });
    expect(env.PEXELS_API_KEY).toBe("studio-key");
    const v = await features.update("pexels", { values: { PEXELS_API_KEY: "" } });
    expect(env.PEXELS_API_KEY).toBe("env-key");
    expect(v.fields[0].source).toBe("env");
  });
});

describe("fonctions : effet des interrupteurs sur l'usine", () => {
  it("voix : décochée → piste silencieuse ; cochée avec Piper installé → auto ; voix HD installée et cochée → chatterbox", async () => {
    const { features, env, home } = mk();
    mkdirSync(join(home, "voices"), { recursive: true });
    writeFileSync(join(home, "voices", "fr_FR-tom-medium.onnx"), "");
    fakePython(home, "piper");
    await features.update("voix", { enabled: false });
    expect(env.VIRAL_TTS).toBe("silent");
    await features.update("voix", { enabled: true });
    expect(env.VIRAL_TTS).toBe("auto");
    fakePython(home, "chatterbox");
    await features.update("voix-hd", { enabled: true });
    expect(env.VIRAL_TTS).toBe("chatterbox");
    await features.update("voix-hd", { enabled: false });
    expect(env.VIRAL_TTS).toBe("auto");
  });

  it("WhatsApp : décoché → console ; coché → whatsapp (le démon bascule)", async () => {
    const { features, env } = mk({ VIRAL_NOTIFIER: "console" });
    expect((await features.list()).find((f) => f.id === "whatsapp")!.enabled).toBe(false);
    const seen: string[] = [];
    features.onChange(() => void seen.push(String(env.VIRAL_NOTIFIER)));
    await features.update("whatsapp", { enabled: true });
    expect(env.VIRAL_NOTIFIER).toBe("whatsapp");
    await features.update("whatsapp", { enabled: false });
    expect(env.VIRAL_NOTIFIER).toBe("console");
    expect(seen).toEqual(["whatsapp", "console"]);
  });

  it("publication : décochée → manual (la légende à coller) ; cochée → le mode de .env revient ; plateformes cochables", async () => {
    const { features, env } = mk({ POSTIZ_API_KEY: "pk", POSTIZ_API_URL: "http://host.docker.internal:4007/api" });
    expect((await features.list()).find((f) => f.id === "publication")!.status).toBe("actif");
    await features.update("publication", { enabled: false });
    expect(env.VIRAL_PUBLISH_MODE).toBe("manual");
    await features.update("publication", { enabled: true });
    expect(env.VIRAL_PUBLISH_MODE).toBeUndefined();
    const v = await features.update("publication", { values: { VIRAL_PLATFORMS: "tiktok,youtube" } });
    expect(env.VIRAL_PLATFORMS).toBe("tiktok,youtube");
    expect(v.choices![0].options.filter((o) => o.checked).map((o) => o.value)).toEqual(["tiktok", "youtube"]);
    await expect(features.update("publication", { values: { VIRAL_PLATFORMS: "tiktok,myspace" } })).rejects.toMatchObject({ code: "bad_request" });
  });

  it("écrivain de scripts : décoché → VIRAL_OLLAMA=off ; modèle choisi dans le Studio", async () => {
    const { features, env } = mk();
    await features.update("ollama", { enabled: false });
    expect(env.VIRAL_OLLAMA).toBe("off");
    await features.update("ollama", { enabled: true, values: { VIRAL_OLLAMA_MODEL: "qwen2.5:3b" } });
    expect(env.VIRAL_OLLAMA).toBeUndefined();
    expect(env.VIRAL_OLLAMA_MODEL).toBe("qwen2.5:3b");
  });

  it("musique : dossier vide → « dossier-vide », avec des pistes → actif et le nombre dans le détail ; décochée → plus de dossier", async () => {
    const { features, env, home } = mk();
    const dir = join(home, "music");
    mkdirSync(dir);
    await features.update("musique", { values: { VIRAL_MUSIC_DIR: dir } });
    expect((await features.list()).find((f) => f.id === "musique")!.status).toBe("dossier-vide");
    writeFileSync(join(dir, "a.mp3"), "");
    writeFileSync(join(dir, "b.wav"), "");
    writeFileSync(join(dir, "notes.txt"), "");
    const m = (await features.list()).find((f) => f.id === "musique")!;
    expect(m.status).toBe("actif");
    expect(m.detail).toMatch(/2 pistes/);
    await features.update("musique", { enabled: false });
    expect(env.VIRAL_MUSIC_DIR).toBeUndefined();
  });
});

describe("fonctions : installation depuis l'interrupteur", () => {
  it("cocher la voix quand Piper manque lance l'installation ; l'état passe « installation » puis « actif » une fois les fichiers là", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { features, installs, home } = mk({}, undefined, async () => {
      await gate;
      return 0;
    });
    const v = await features.update("voix", { enabled: true });
    expect(v.status).toBe("installation");
    expect(v.install?.status).toBe("running");
    release();
    await installs.wait("voix");
    fakePython(home, "piper");
    mkdirSync(join(home, "voices"), { recursive: true });
    writeFileSync(join(home, "voices", "fr_FR-tom-medium.onnx"), "");
    expect((await features.list()).find((f) => f.id === "voix")!.status).toBe("actif");
  });

  it("une installation ratée se voit : « echec » avec la phrase, et le bouton Installer la relance", async () => {
    const { features, installs } = mk({}, undefined, async () => 1);
    features.install("voix");
    await installs.wait("voix");
    const v = (await features.list()).find((f) => f.id === "voix")!;
    expect(v.status).toBe("echec");
    expect(v.install?.error).toMatch(/Python/);
  });

  it("installer ce qui ne s'installe pas (une clé) est refusé", () => {
    const { features } = mk();
    expect(() => features.install("pexels")).toThrow(/rien à installer/i);
  });

  it("autoInstall : lance seulement ce qui est coché, manquant et pas déjà en cours", async () => {
    const started: string[] = [];
    const { features, installs } = mk({}, undefined, async (_c, args) => {
      started.push(args.join(" "));
      return 0;
    });
    await features.update("voix", { enabled: false });
    features.autoInstall(["voix", "voix-hd"]);
    await installs.wait("voix").catch(() => undefined);
    expect(started.join("|")).not.toContain("piper-tts");
  });
});

describe("fonctions : état réseau (Ollama, ComfyUI) et lien WhatsApp", () => {
  it("Ollama : modèle présent → actif ; serveur muet → injoignable ; serveur sans le modèle → à installer", async () => {
    const tags = (names: string[]) => (async () => json({ models: names.map((name) => ({ name })) })) as unknown as typeof fetch;
    const present = mk({ OLLAMA_HOST: "http://ollama:11434", VIRAL_OLLAMA_MODEL: "qwen2.5:3b" }, tags(["qwen2.5:3b"]));
    expect((await present.features.list()).find((f) => f.id === "ollama")!.status).toBe("actif");
    const missing = mk({ OLLAMA_HOST: "http://ollama:11434", VIRAL_OLLAMA_MODEL: "qwen2.5:3b" }, tags(["llama3:8b"]));
    const m = (await missing.features.list()).find((f) => f.id === "ollama")!;
    expect(m.status).toBe("a-installer");
    expect(m.needs).toBe("install");
    const down = mk({ OLLAMA_HOST: "http://ollama:11434" }, (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch);
    expect((await down.features.list()).find((f) => f.id === "ollama")!.status).toBe("injoignable");
  });

  it("WhatsApp : sans démon → « a-lier » ; avec le démon et un QR → l'image du QR est fournie ; une fois lié → actif", async () => {
    const hub = { state: { state: "qr", qr: "data:image/svg+xml;base64,AAA" } as { state: string; qr?: string; error?: string } };
    const home = mkdtempSync(join(tmpdir(), "septim-feat-"));
    const env: Record<string, string | undefined> = { VIRAL_HOME: home, VIRAL_NOTIFIER: "whatsapp" };
    const features = createFeatures({ home, env, installs: createInstalls({ home, env, run: async () => 0 }), fetchImpl: (async () => json({})) as unknown as typeof fetch, hub: () => hub.state as never });
    let w = (await features.list()).find((f) => f.id === "whatsapp")!;
    expect(w.status).toBe("a-lier");
    expect(w.link).toEqual({ state: "qr", qr: "data:image/svg+xml;base64,AAA" });
    hub.state = { state: "ready" };
    w = (await features.list()).find((f) => f.id === "whatsapp")!;
    expect(w.status).toBe("actif");
    expect(w.link?.state).toBe("ready");
  });
});

describe("fonctions : tester une clé sans jamais l'afficher", () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const spy = (handler: (url: string) => Response | Promise<Response>) =>
    (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})) });
      return handler(String(url));
    }) as unknown as typeof fetch;

  it("Pexels : clé acceptée → ok ; refusée (401) → message clair, sans la clé", async () => {
    calls.length = 0;
    const good = mk({ PEXELS_API_KEY: "pk-123" }, spy(() => json({ photos: [] })));
    expect(await good.features.test("pexels")).toMatchObject({ ok: true });
    expect(calls[0].url).toContain("api.pexels.com");
    expect(calls[0].headers.Authorization).toBe("pk-123");
    const bad = mk({ PEXELS_API_KEY: "pk-123" }, spy(() => json({ error: "no" }, 401)));
    const r = await bad.features.test("pexels");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/refusée|401/);
    expect(r.message).not.toContain("pk-123");
  });

  it("Postiz : liste les chaînes reliées (self-hosted : <adresse>/public/v1/integrations, clé en Authorization)", async () => {
    calls.length = 0;
    const { features } = mk(
      { POSTIZ_API_KEY: "zz-key", POSTIZ_API_URL: "http://host.docker.internal:4007/api" },
      spy(() => json([{ id: "1", identifier: "tiktok", name: "Fauve" }, { id: "2", identifier: "youtube", name: "Fauve" }, { id: "3", identifier: "x", disabled: true }])),
    );
    const r = await features.test("publication");
    expect(calls[0].url).toBe("http://host.docker.internal:4007/api/public/v1/integrations");
    expect(calls[0].headers.Authorization).toBe("zz-key");
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/2 chaînes/);
    expect(r.message).toMatch(/tiktok/);
    expect(r.message).not.toContain("zz-key");
  });

  it("Postiz injoignable → dit l'adresse et la piste (host.docker.internal)", async () => {
    const { features } = mk({ POSTIZ_API_KEY: "k", POSTIZ_API_URL: "http://localhost:4007/api" }, (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch);
    const r = await features.test("publication");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("localhost:4007");
    expect(r.message).toMatch(/host\.docker\.internal/);
  });

  it("YouTube, Apify, Pixabay : bonne URL, résultat lisible", async () => {
    calls.length = 0;
    const f = mk(
      { YOUTUBE_API_KEY: "yk", APIFY_TOKEN: "at", PIXABAY_API_KEY: "xk" },
      spy((url) => (url.includes("apify") ? json({ data: { username: "fauve" } }) : json({ items: [], hits: [] }))),
    );
    expect((await f.features.test("youtube")).ok).toBe(true);
    const apify = await f.features.test("apify");
    expect(apify.ok).toBe(true);
    expect(apify.message).toContain("fauve");
    expect((await f.features.test("pixabay")).ok).toBe(true);
    const urls = calls.map((c) => c.url).join("\n");
    expect(urls).toContain("googleapis.com/youtube/v3/videos");
    expect(urls).toContain("api.apify.com/v2/users/me");
    expect(urls).toContain("pixabay.com/api/");
  });

  it("sans clé : « mets d'abord la clé » ; fonction sans test réseau : l'état en une phrase", async () => {
    const { features } = mk();
    const r = await features.test("pexels");
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toMatch(/clé/i);
    const v = await features.test("voix");
    expect(v.ok).toBe(false);
    expect(v.message).toMatch(/installe/i);
  });
});

it("le fichier réglages n'est pas lisible par les autres même s'il existait avec d'autres droits", async () => {
  const { features, home } = mk();
  const file = join(home, "settings.json");
  writeFileSync(file, JSON.stringify({ enabled: {}, values: {} }));
  chmodSync(file, 0o644);
  await features.update("apify", { values: { APIFY_TOKEN: "t" } });
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(existsSync(`${file}.tmp`)).toBe(false);
});


describe("ComfyUI sur ton PC : détecté, montré, branché tout seul", () => {
  const url = "http://host.docker.internal:8188";

  it("modèles Wan 2.2 5B présents → actif, la liste de ce qui est installé est montrée, et l'usine reçoit les vrais noms de fichiers", async () => {
    const { features, env } = mk({ COMFYUI_URL: url }, fakeComfy(WAN22_FILES));
    const v = (await features.list()).find((f) => f.id === "comfyui")!;
    expect(v.status).toBe("actif");
    expect(v.comfy).toMatchObject({ profile: "wan22-5b", gpu: expect.stringMatching(/RTX 3070/), vramGb: 8, missing: [] });
    expect(v.comfy!.detected.diffusion).toEqual(["wan2.2_ti2v_5B_fp16.safetensors", "flux1-dev.safetensors"]);
    expect(v.detail).toMatch(/Wan 2\.2/);
    expect(env.COMFYUI_PROFILE).toBe("wan22-5b");
    expect(env.COMFYUI_WAN_MODEL).toBe("wan2.2_ti2v_5B_fp16.safetensors");
    expect(env.COMFYUI_WAN_CLIP).toBe("umt5_xxl_fp8_e4m3fn_scaled.safetensors");
    expect(env.COMFYUI_WAN_VAE).toBe("wan2.2_vae.safetensors");
  });

  it("ce que l'humain a fixé dans .env passe avant la détection", async () => {
    const { features, env } = mk({ COMFYUI_URL: url, COMFYUI_WAN_MODEL: "mon-modele.safetensors" }, fakeComfy(WAN22_FILES));
    await features.list();
    expect(env.COMFYUI_WAN_MODEL).toBe("mon-modele.safetensors");
  });

  it("ComfyUI répond mais les modèles manquent → « modeles-manquants » avec quoi télécharger et où, et ce qui est déjà là", async () => {
    const { features } = mk({ COMFYUI_URL: url }, fakeComfy({ unet: ["flux1-dev.safetensors"], clip: ["clip_l.safetensors"], vae: ["ae.safetensors"] }));
    const v = (await features.list()).find((f) => f.id === "comfyui")!;
    expect(v.status).toBe("modeles-manquants");
    expect(v.ready).toBe(false);
    expect(v.comfy!.missing.join("\n")).toContain("models/diffusion_models");
    expect(v.comfy!.detected.diffusion).toEqual(["flux1-dev.safetensors"]);
    const t = await features.test("comfyui");
    expect(t.ok).toBe(false);
    expect(t.message).toContain("wan2.2_ti2v_5B_fp16.safetensors");
  });

  it("pas d'adresse : l'usine cherche ComfyUI sur ton PC et propose l'adresse trouvée", async () => {
    const found = (async (u: string) => {
      if (String(u).startsWith("http://host.docker.internal:8188/system_stats")) return new Response("{}");
      throw new Error("refused");
    }) as unknown as typeof fetch;
    const { features } = mk({}, found);
    const v = (await features.list()).find((f) => f.id === "comfyui")!;
    expect(v.status).toBe("adresse-manquante");
    expect(v.suggestion).toBe("http://host.docker.internal:8188");
  });

  it("introuvable : l'aide dit d'écouter sur 0.0.0.0 (Docker n'atteint pas 127.0.0.1) et de vérifier le port", async () => {
    const { features } = mk({ COMFYUI_URL: url }, fakeComfy({ down: true }));
    const v = (await features.list()).find((f) => f.id === "comfyui")!;
    expect(v.status).toBe("injoignable");
    const t = await features.test("comfyui");
    expect(t.message).toMatch(/0\.0\.0\.0/);
    expect(t.message).toMatch(/8000|8188/);
  });

  it("test : résume le profil, la carte et le nombre de modèles trouvés", async () => {
    const { features } = mk({ COMFYUI_URL: url }, fakeComfy(WAN22_FILES));
    const t = await features.test("comfyui");
    expect(t.ok).toBe(true);
    expect(t.message).toMatch(/Wan 2\.2/);
    expect(t.message).toMatch(/RTX 3070/);
  });
});

describe("Ollama de ton PC : tes modèles, à choisir d'un clic", () => {
  const tags = (names: string[]) => (async () => json({ models: names.map((name) => ({ name })) })) as unknown as typeof fetch;
  const INSTALLED = ["qwen2.5:3b", "qwen2.5:1.5b", "deepseek-r1:latest", "llama3.2:latest", "qwen3.5:cloud", "kimi-k2.5:cloud"];

  it("liste les modèles installés (locaux d'abord, les modèles « cloud » repérés)", async () => {
    const { features } = mk({ OLLAMA_HOST: "http://host.docker.internal:11434", VIRAL_OLLAMA_MODEL: "qwen2.5:3b" }, tags(INSTALLED));
    const v = (await features.list()).find((f) => f.id === "ollama")!;
    expect(v.status).toBe("actif");
    expect(v.ollamaModels!.map((m) => m.name)).toEqual(["qwen2.5:3b", "qwen2.5:1.5b", "deepseek-r1:latest", "llama3.2:latest", "qwen3.5:cloud", "kimi-k2.5:cloud"]);
    expect(v.ollamaModels!.filter((m) => m.cloud).map((m) => m.name)).toEqual(["qwen3.5:cloud", "kimi-k2.5:cloud"]);
    expect(v.detail).toMatch(/6 modèles/);
  });

  it("choisir un autre modèle installé le rend actif tout de suite ; un modèle absent → « à installer »", async () => {
    const { features, env } = mk({ OLLAMA_HOST: "http://host.docker.internal:11434", VIRAL_OLLAMA_MODEL: "qwen2.5:7b" }, tags(INSTALLED));
    expect((await features.list()).find((f) => f.id === "ollama")!.status).toBe("a-installer");
    const v = await features.update("ollama", { values: { VIRAL_OLLAMA_MODEL: "llama3.2:latest" } });
    expect(v.status).toBe("actif");
    expect(env.VIRAL_OLLAMA_MODEL).toBe("llama3.2:latest");
    // « llama3.2 » sans étiquette = « llama3.2:latest » pour Ollama
    expect((await features.update("ollama", { values: { VIRAL_OLLAMA_MODEL: "llama3.2" } })).status).toBe("actif");
  });
});

describe("ComfyUI : tous les modèles, pas seulement ceux de la vidéo", () => {
  it("LoRA, upscalers, ControlNet et CLIP vision sont listés aussi", async () => {
    const { detectComfy } = await import("../comfy");
    const fetchImpl = (async (url: string) => {
      const path = new URL(String(url)).pathname;
      if (path === "/system_stats") return new Response(JSON.stringify({ system: {}, devices: [] }));
      const extra: Record<string, [string, string]> = {
        LoraLoader: ["lora_name", "style-afrique.safetensors"],
        UpscaleModelLoader: ["model_name", "4x-UltraSharp.pth"],
        ControlNetLoader: ["control_net_name", "canny.safetensors"],
        CLIPVisionLoader: ["clip_name", "clip_vision_h.safetensors"],
      };
      const name = path.replace("/object_info/", "");
      if (!extra[name]) return new Response("{}");
      return new Response(JSON.stringify({ [name]: { input: { required: { [extra[name][0]]: [[extra[name][1]]] } } } }));
    }) as unknown as typeof fetch;
    const r = await detectComfy("http://c:8188", fetchImpl);
    expect(r.models.loras).toEqual(["style-afrique.safetensors"]);
    expect(r.models.upscalers).toEqual(["4x-UltraSharp.pth"]);
    expect(r.models.controlnets).toEqual(["canny.safetensors"]);
    expect(r.models.clipVision).toEqual(["clip_vision_h.safetensors"]);
  });
});

