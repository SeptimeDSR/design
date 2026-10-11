import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAss, creditsAss, titleAss, wrap } from "../film/ass";
import {
  cardImageArgs,
  cardSegmentArgs,
  chapterLines,
  chapterMetadata,
  concatArgs,
  concatListText,
  hasFfmpeg,
  motionFilter,
  motionFor,
  MOTIONS,
  prepareImageArgs,
  probeSeconds,
  runFfmpeg,
  sceneRenderArgs,
} from "../film/ffmpeg";
import { encodeWav } from "../wav";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "film-ffmpeg-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const frame = { width: 320, height: 180, fps: 12, crf: 30 };

describe("filtres de mouvement", () => {
  it("chaque mouvement fixe la durée en images, la taille et le débit", () => {
    for (const m of MOTIONS) {
      const f = motionFilter(m, frame, 36);
      expect(f).toContain("d=36");
      expect(f).toContain("s=320x180");
      expect(f).toContain("fps=12");
    }
  });

  it("deux plans qui se suivent ne bougent jamais pareil, et c'est stable d'un rendu à l'autre", () => {
    for (let s = 0; s < 4; s++) for (let k = 0; k < 20; k++) expect(motionFor(s, k)).not.toBe(motionFor(s, k + 1));
    expect(motionFor(3, 5)).toBe(motionFor(3, 5));
  });

  it("l'image préparée fait deux fois la taille de la vidéo (zoom net), au même format", () => {
    const args = prepareImageArgs("in.jpg", "out.jpg", { width: 1280, height: 720, fps: 24, crf: 27 });
    expect(args.join(" ")).toContain("scale=2560:1440");
    expect(args.join(" ")).toContain("crop=2560:1440");
    const hd = prepareImageArgs("in.jpg", "out.jpg", { width: 1920, height: 1080, fps: 24, crf: 24 });
    expect(hd.join(" ")).toContain("scale=3000:1688");
  });
});

describe("sceneRenderArgs", () => {
  const spec = {
    frame,
    shots: [
      { image: "a.jpg", motion: "zoom-in" as const, frames: 24 },
      { image: "b.jpg", motion: "pan-left" as const, frames: 36 },
    ],
    voice: "v.wav",
    durationSec: 5,
    music: "m.mp3",
    musicVolume: 0.13,
    ass: "s.ass",
    out: "scene.mp4",
    fadeSec: 0.5,
  };

  it("une entrée par image, la voix, la musique en boucle ; sous-titres, fondus et mélange dans un seul graphe", () => {
    const args = sceneRenderArgs(spec);
    const text = args.join(" ");
    expect(args.filter((a) => a === "-i")).toHaveLength(4);
    expect(text).toContain("-stream_loop -1 -i m.mp3");
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("concat=n=2:v=1:a=0");
    expect(graph).toContain("ass=s.ass");
    expect(graph).toContain("fade=t=in");
    expect(graph).toContain("amix=inputs=2:duration=first");
    expect(graph).toContain("alimiter");
    expect(args.at(-1)).toBe("scene.mp4");
    expect(text).toContain("-t 5.000");
  });

  it("sans musique ni sous-titres : plus de mélange, pas de filtre ass", () => {
    const graph = (() => {
      const args = sceneRenderArgs({ ...spec, music: undefined, ass: undefined });
      return args[args.indexOf("-filter_complex") + 1];
    })();
    expect(graph).not.toContain("amix");
    expect(graph).not.toContain("ass=");
  });
});

describe("chapitres et collage", () => {
  it("métadonnées de chapitres : millisecondes, caractères réservés protégés", () => {
    const meta = chapterMetadata("Titre = test", [
      { title: "Le courrier", startMs: 0, endMs: 61000 },
      { title: "La nuit; la peur", startMs: 61000, endMs: 150000 },
    ]);
    expect(meta.startsWith(";FFMETADATA1")).toBe(true);
    expect(meta).toContain("title=Titre \\= test");
    expect(meta).toContain("START=61000");
    expect(meta).toContain("title=La nuit\\; la peur");
  });

  it("description YouTube : 00:00 en tête, heures au-delà d'une heure", () => {
    expect(chapterLines([{ title: "A", startMs: 0, endMs: 1 }, { title: "B", startMs: 125000, endMs: 2 }, { title: "C", startMs: 3725000, endMs: 3 }])).toBe("00:00 A\n02:05 B\n1:02:05 C");
  });

  it("liste de collage : les apostrophes sont protégées", () => {
    expect(concatListText(["/a/b.mp4", "/c/l'été.mp4"])).toBe("file '/a/b.mp4'\nfile '/c/l'\\''été.mp4'\n");
    expect(concatArgs("l.txt", "m.txt", "o.mp4").join(" ")).toContain("-c copy");
  });
});

describe("sous-titres ASS", () => {
  it("coupe aux espaces sans dépasser la largeur", () => {
    expect(wrap("un deux trois quatre cinq six sept huit", 12)).toEqual(["un deux", "trois quatre", "cinq six", "sept huit"]);
    expect(wrap("", 10)).toEqual([]);
  });

  it("un évènement par groupe de deux lignes, calé dans le plan ; le dialogue est coloré", () => {
    const ass = buildAss({
      width: 1280,
      height: 720,
      shots: [
        { text: "Il pleuvait sur la ville depuis trois jours et personne ne sortait plus de chez soi, sauf le facteur qui montait la colline avec une lettre.", startMs: 1000, endMs: 9000 },
        { text: "Je ne signerai pas.", startMs: 9000, endMs: 11000, speaker: "Mireille" },
      ],
    });
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0]).toContain("0:00:01.00");
    expect(events.at(-1)).toContain("0:00:11.00");
    expect(events.at(-1)).toContain("\\c&H66E0FF&");
    expect(ass).toContain("PlayResX: 1280");
  });

  it("vertical : texte plus gros et lignes plus courtes ; les accolades du texte ne cassent pas le format", () => {
    const v = buildAss({ width: 720, height: 1280, shots: [{ text: "Texte {avec} accolades \\ et antislash", startMs: 0, endMs: 2000 }] });
    expect(v).not.toMatch(/Dialogue:.*\{avec\}/);
    expect(titleAss({ width: 1280, height: 720, title: "La dette", subtitle: "Drame", seconds: 4 })).toContain("La dette");
    expect(creditsAss({ width: 1280, height: 720, lines: ["Images : Pexels", "Photo : Ana"], seconds: 5 })).toContain("Images : Pexels\\NPhoto : Ana");
  });
});

describe.skipIf(!hasFfmpeg())("rendu réel avec ffmpeg", () => {
  it("une scène de 4 s puis un titre de 2 s : durées, taille, audio et chapitres tiennent", async () => {
    const dir = tmp();
    const jpg = (n: number) => join(dir, `img${n}.jpg`);
    for (const n of [0, 1]) await runFfmpeg(cardImageArgs(jpg(n), frame, n));
    await runFfmpeg([...prepareImageArgs(jpg(0), join(dir, "p0.jpg"), frame)]);
    writeFileSync(join(dir, "voice.wav"), encodeWav(new Float32Array(22050 * 4).map((_, i) => 0.2 * Math.sin(i / 20)), 22050));
    writeFileSync(join(dir, "music.wav"), encodeWav(new Float32Array(22050).map((_, i) => 0.3 * Math.sin(i / 7)), 22050));
    writeFileSync(join(dir, "s.ass"), buildAss({ width: 320, height: 180, shots: [{ text: "Bonjour tout le monde", startMs: 0, endMs: 4000 }] }));
    await runFfmpeg(
      sceneRenderArgs({
        frame,
        shots: [
          { image: jpg(0), motion: "zoom-in", frames: 24 },
          { image: jpg(1), motion: "pan-right", frames: 24 },
        ],
        voice: join(dir, "voice.wav"),
        durationSec: 4,
        music: join(dir, "music.wav"),
        musicVolume: 0.13,
        ass: "s.ass",
        out: join(dir, "scene.mp4"),
        fadeSec: 0.4,
      }),
      { cwd: dir },
    );
    const scene = probeSeconds(join(dir, "scene.mp4"))!;
    expect(scene).toBeGreaterThan(3.8);
    expect(scene).toBeLessThan(4.3);

    writeFileSync(join(dir, "t.ass"), titleAss({ width: 320, height: 180, title: "La dette", seconds: 2 }));
    await runFfmpeg(cardSegmentArgs({ frame, image: jpg(1), ass: "t.ass", seconds: 2, out: join(dir, "title.mp4") }), { cwd: dir });
    writeFileSync(join(dir, "list.txt"), concatListText([join(dir, "title.mp4"), join(dir, "scene.mp4")]));
    writeFileSync(join(dir, "meta.txt"), chapterMetadata("La dette", [{ title: "Titre", startMs: 0, endMs: 2000 }, { title: "Scène 1", startMs: 2000, endMs: 6000 }]));
    await runFfmpeg(concatArgs(join(dir, "list.txt"), join(dir, "meta.txt"), join(dir, "film.mp4")));
    const total = probeSeconds(join(dir, "film.mp4"))!;
    expect(Math.abs(total - (scene + 2))).toBeLessThan(0.3);
    const info = spawnSync("ffprobe", ["-v", "error", "-show_chapters", "-show_streams", "-of", "json", join(dir, "film.mp4")], { encoding: "utf8" });
    const json = JSON.parse(info.stdout);
    expect(json.chapters).toHaveLength(2);
    expect(json.chapters[1].tags.title).toBe("Scène 1");
    const video = json.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    expect([video.width, video.height]).toEqual([320, 180]);
    expect(json.streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
  }, 60_000);

  it("une erreur ffmpeg remonte avec la fin de son message", async () => {
    await expect(runFfmpeg(["-i", "/nulle/part.mp4", "/tmp/x.mp4"])).rejects.toThrow(/ffmpeg a échoué/);
  });
});
