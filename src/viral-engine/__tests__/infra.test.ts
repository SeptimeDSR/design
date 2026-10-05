import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDotEnv } from "../config";
import { enqueueOutbox, flushOutbox } from "../outbox";

const tmp = () => mkdtempSync(join(tmpdir(), "septim-infra-"));

describe("loadDotEnv", () => {
  it("charge le .env (sans écraser ce qui est déjà défini)", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".env"), "SEPTIM_TEST_KEY=depuis-le-fichier\nSEPTIM_TEST_KEEP=fichier\n");
    process.env.SEPTIM_TEST_KEEP = "shell";
    loadDotEnv(join(dir, ".env"));
    expect(process.env.SEPTIM_TEST_KEY).toBe("depuis-le-fichier");
    expect(process.env.SEPTIM_TEST_KEEP).toBe("shell");
  });

  it("ne plante pas sans .env", () => {
    expect(() => loadDotEnv(join(tmp(), "absent.env"))).not.toThrow();
  });
});

describe("boîte d'envoi (le CLI ne parle jamais à WhatsApp)", () => {
  it("le démon envoie les messages dans l'ordre puis les retire", async () => {
    const home = tmp();
    enqueueOutbox(home, { text: "un", mediaPath: "/v1.mp4" });
    enqueueOutbox(home, { text: "deux" });
    const sent: [string, string | undefined][] = [];
    await flushOutbox(home, async (t, m) => void sent.push([t, m]));
    expect(sent).toEqual([["un", "/v1.mp4"], ["deux", undefined]]);
    expect(readdirSync(join(home, "outbox"))).toEqual([]);
  });

  it("un envoi raté reste dans la boîte pour la prochaine fois", async () => {
    const home = tmp();
    enqueueOutbox(home, { text: "un" });
    await flushOutbox(home, async () => {
      throw new Error("WhatsApp déconnecté");
    }).catch(() => undefined);
    expect(readdirSync(join(home, "outbox"))).toHaveLength(1);
  });

  it("boîte vide ou absente : rien ne se passe", async () => {
    await expect(flushOutbox(tmp(), async () => undefined)).resolves.toBeUndefined();
  });
});
