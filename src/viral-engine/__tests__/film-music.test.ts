import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMusicSession, sceneMusic, type MusicGenerator } from "../film/music";
import { normalizeFilm } from "../film/types";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "film-music-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const film = normalizeFilm(
  {
    title: "T",
    scenes: [
      { title: "A", mood: "calme", shots: ["a"] },
      { title: "B", mood: "tension", shots: ["b"] },
      { title: "C", mood: "calme", shots: ["c"] },
    ],
  },
  { lang: "fr" },
)!;

describe("sceneMusic : la musique suit l'ambiance de chaque scène", () => {
  it("sans rien : un lit d'ambiance procédural, le même pour tout le film, très bas", async () => {
    const dir = tmp();
    const session = createMusicSession();
    const a = await sceneMusic({ film, sceneIndex: 0, dir, env: {}, session, ambientSeconds: 4 });
    const b = await sceneMusic({ film, sceneIndex: 1, dir, env: {}, session, ambientSeconds: 4 });
    expect(a).toBeDefined();
    expect(existsSync(a!.path)).toBe(true);
    expect(b!.path).toBe(a!.path);
    expect(a!.volume).toBeLessThanOrEqual(0.12);
    expect(a!.source).toBe("procedural");
  });

  it("ta musique (VIRAL_MUSIC_DIR) : la même piste pour la même ambiance, jamais plus fort que la voix", async () => {
    const dir = tmp();
    const music = join(dir, "zik");
    mkdirSync(music);
    for (const n of ["a.mp3", "b.mp3", "c.wav"]) writeFileSync(join(music, n), "x");
    writeFileSync(join(music, "notes.txt"), "pas de la musique");
    const session = createMusicSession();
    const env = { VIRAL_MUSIC_DIR: music };
    const [s0, s1, s2] = await Promise.all([0, 1, 2].map((i) => sceneMusic({ film, sceneIndex: i, dir, env, session })));
    expect(s0!.path).toBe(s2!.path); // deux scènes calmes : même piste
    expect(s0!.source).toBe("dossier");
    expect(s0!.volume).toBeLessThanOrEqual(0.18);
    expect(s1!.path).toMatch(/\.(mp3|wav)$/);
  });

  it("dossier vide ou absent : on retombe sur l'ambiance, sans erreur", async () => {
    const r = await sceneMusic({ film, sceneIndex: 0, dir: tmp(), env: { VIRAL_MUSIC_DIR: "/nulle/part" }, session: createMusicSession(), ambientSeconds: 3 });
    expect(r!.source).toBe("procedural");
  });

  it("ACE-Step (ComfyUI) : une boucle par ambiance, créée une seule fois, avec le bon style", async () => {
    const dir = tmp();
    const prompts: string[] = [];
    const generator: MusicGenerator = {
      ready: async () => true,
      generate: async (prompt) => {
        prompts.push(prompt);
        return { bytes: new Uint8Array([1, 2, 3]), ext: "mp3" };
      },
    };
    const session = createMusicSession();
    const [a, b, c] = await Promise.all([0, 1, 2].map((i) => sceneMusic({ film, sceneIndex: i, dir, env: {}, session, generator })));
    expect(prompts).toHaveLength(2); // calme + tension, pas trois
    expect(prompts[0]).toMatch(/instrumental/i);
    expect(prompts.some((p) => /tense/i.test(p))).toBe(true);
    expect(a!.path).toBe(c!.path);
    expect(a!.path).not.toBe(b!.path);
    expect(a!.source).toBe("comfyui");
  });

  it("ACE-Step en panne : l'ambiance prend le relais pour toutes les scènes, sans réessayer à chaque scène", async () => {
    let calls = 0;
    const generator: MusicGenerator = {
      ready: async () => true,
      generate: async () => {
        calls++;
        throw new Error("ComfyUI a planté");
      },
    };
    const session = createMusicSession();
    const dir = tmp();
    const r = await sceneMusic({ film, sceneIndex: 0, dir, env: {}, session, generator, ambientSeconds: 3 });
    await sceneMusic({ film, sceneIndex: 1, dir, env: {}, session, generator, ambientSeconds: 3 });
    expect(r!.source).toBe("procedural");
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("VIRAL_FILM_MUSIC=off : pas de musique du tout", async () => {
    expect(await sceneMusic({ film, sceneIndex: 0, dir: tmp(), env: { VIRAL_FILM_MUSIC: "off" }, session: createMusicSession() })).toBeUndefined();
  });
});
