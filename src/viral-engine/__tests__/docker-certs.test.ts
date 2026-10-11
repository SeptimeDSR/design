import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WRAPPER = resolve(__dirname, "..", "..", "..", "docker", "septim");
const CERT = "-----BEGIN CERTIFICATE-----\nTUlJQ2VydGlmaWNhdFRlc3Q=\n-----END CERTIFICATE-----\n";

// Un faux `node` qui affiche les variables de confiance que le script de démarrage a posées.
function run(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "septim-certs-"));
  const bin = join(root, "bin");
  const certs = join(root, "certs");
  mkdirSync(bin);
  mkdirSync(certs);
  writeFileSync(join(bin, "node"), '#!/bin/sh\nfor v in SSL_CERT_FILE REQUESTS_CA_BUNDLE PIP_CERT CURL_CA_BUNDLE NODE_EXTRA_CA_CERTS; do eval "echo $v=\\${$v:-}"; done\n');
  chmodSync(join(bin, "node"), 0o755);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(certs, name), text);
  const r = spawnSync("sh", [WRAPPER, "version"], {
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, VIRAL_HOME: join(root, "data"), SEPTIM_TOKEN: "t", SEPTIM_CERTS_DIR: certs, SEPTIM_CA_BUNDLE: join(root, "bundle.crt"), SEPTIM_EXTRA_CA: join(root, "extra.crt"), NODE_ENV: "test" },
  });
  const env = Object.fromEntries(r.stdout.split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  return { env, root, status: r.status, stderr: r.stderr };
}

describe.skipIf(process.platform === "win32")("Docker : le dossier certificats rend un réseau qui lit le HTTPS compatible", () => {
  it("un .crt dans certificats → Python, pip, curl et Node le reçoivent (un lot système + le tien, et le tien seul pour Node)", () => {
    const r = run({ "reseau.crt": CERT });
    expect(r.status).toBe(0);
    for (const v of ["SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "PIP_CERT", "CURL_CA_BUNDLE"]) expect(r.env[v], v).toBe(join(r.root, "bundle.crt"));
    expect(readFileSync(join(r.root, "bundle.crt"), "utf8")).toContain("TUlJQ2VydGlmaWNhdFRlc3Q=");
    expect(r.env.NODE_EXTRA_CA_CERTS).toBe(join(r.root, "extra.crt"));
    expect(readFileSync(join(r.root, "extra.crt"), "utf8").trim()).toBe(CERT.trim());
  });

  it("les .pem sont pris aussi, plusieurs certificats s'additionnent", () => {
    const r = run({ "a.crt": CERT, "b.pem": CERT.replace("TUlJ", "QUJD") });
    const extra = readFileSync(join(r.root, "extra.crt"), "utf8");
    expect(extra).toContain("TUlJ");
    expect(extra).toContain("QUJD");
  });

  it("dossier vide ou fichier qui n'est pas un certificat → rien n'est changé (aucune variable posée)", () => {
    for (const files of [{}, { "notes.txt": "pas un certificat" }] as Record<string, string>[]) {
      const r = run(files);
      expect(r.status).toBe(0);
      for (const v of ["SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "PIP_CERT", "CURL_CA_BUNDLE", "NODE_EXTRA_CA_CERTS"]) expect(r.env[v], v).toBe("");
      expect(existsSync(join(r.root, "bundle.crt"))).toBe(false);
    }
  });

  it("un fichier .crt sans « BEGIN CERTIFICATE » est ignoré (on n'empoisonne pas le lot de confiance)", () => {
    const r = run({ "vide.crt": "n'importe quoi" });
    expect(r.env.SSL_CERT_FILE).toBe("");
  });
});

describe("Docker : compose et LANCER prévoient le dossier certificats", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", "..", p), "utf8");
  it("compose monte ./certificats en lecture seule ; LANCER.ps1 le crée ; .dockerignore ne copie jamais de certificat dans l'image", () => {
    expect(read("compose.yaml")).toMatch(/\.\/certificats:\/certs:ro/);
    expect(read("LANCER.ps1")).toMatch(/certificats/);
    expect(read(".dockerignore")).toMatch(/^certificats$/m);
  });
});
