import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:tls";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkTls, explainNetworkError, formatNetReport, powershellExport } from "../net";
import { main } from "../septim";
import { Writable } from "node:stream";

// Un faux « antivirus » : un serveur TLS au certificat auto-signé, fabriqué à l'exécution (aucune clé privée dans le dépôt).
const hasOpenssl = spawnSync("openssl", ["version"]).status === 0;
let server: Server;
let port = 0;
let certPem = "";

beforeAll(async () => {
  if (!hasOpenssl) return;
  const dir = mkdtempSync(join(tmpdir(), "septim-tls-"));
  spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "30", "-subj", "/CN=Antivirus Test Root/O=Fournisseur Test", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
  certPem = readFileSync(join(dir, "c.pem"), "utf8");
  server = createServer({ key: readFileSync(join(dir, "k.pem")), cert: certPem }, (s) => s.end());
  server.on("tlsClientError", () => undefined);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  port = (server.address() as { port: number }).port;
});
afterAll(() => void server?.close());

describe.skipIf(!hasOpenssl)("réseau : qui remplace le certificat ?", () => {
  it("certificat auto-signé → « intercepté », avec l'émetteur lu dans le certificat (rien n'est envoyé)", async () => {
    const r = await checkTls("localhost", port);
    expect(r.state).toBe("intercepte");
    expect(r.issuer).toBe("Antivirus Test Root");
    expect(r.org).toBe("Fournisseur Test");
    expect(r.code).toMatch(/SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY/);
  });

  it("une fois le certificat ajouté (le dossier certificats), le même site passe : « ok »", async () => {
    const r = await checkTls("localhost", port, { ca: certPem });
    expect(r.state).toBe("ok");
  });

  it("port fermé → « injoignable » avec le code réseau, jamais « intercepté »", async () => {
    const r = await checkTls("127.0.0.1", 9);
    expect(r.state).toBe("injoignable");
    expect(r.code).toMatch(/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH/);
  });

  it("formatNetReport : une ligne par site, l'émetteur nommé, et la marche à suivre avec la commande PowerShell exacte", () => {
    const text = formatNetReport([
      { host: "pypi.org", purpose: "paquets Python", state: "ok" },
      { host: "huggingface.co", purpose: "voix Piper", state: "intercepte", issuer: "Kaspersky Anti-Virus Personal Root Certificate", code: "SELF_SIGNED_CERT_IN_CHAIN" },
      { host: "api.apify.com", purpose: "tendances TikTok", state: "injoignable", code: "ENOTFOUND" },
    ]);
    expect(text).toMatch(/✓ pypi\.org/);
    expect(text).toMatch(/✗ huggingface\.co.*Kaspersky Anti-Virus Personal Root Certificate/);
    expect(text).toMatch(/✗ api\.apify\.com.*ENOTFOUND/);
    expect(text).toContain("certificats");
    expect(text).toContain("BEGIN CERTIFICATE");
    expect(text).toContain("*Kaspersky Anti-Virus Personal Root Certificate*");
    expect(text).toContain("docker compose up -d");
  });

  it("tout est ok → un verdict simple, pas de marche à suivre", () => {
    const text = formatNetReport([{ host: "pypi.org", purpose: "paquets Python", state: "ok" }]);
    expect(text).toMatch(/Tout passe/);
    expect(text).not.toContain("Export");
  });
});

describe("réseau : messages qui expliquent la cause", () => {
  it("explainNetworkError : certificat, DNS, délai, refus", () => {
    expect(explainNetworkError("huggingface.co", "SELF_SIGNED_CERT_IN_CHAIN")).toMatch(/remplace le certificat de huggingface\.co/);
    expect(explainNetworkError("huggingface.co", "SELF_SIGNED_CERT_IN_CHAIN")).toMatch(/septim reseau/);
    expect(explainNetworkError("x.io", "UNABLE_TO_VERIFY_LEAF_SIGNATURE")).toMatch(/certificat/);
    expect(explainNetworkError("x.io", "ENOTFOUND")).toMatch(/DNS|ne se résout pas/);
    expect(explainNetworkError("x.io", "ETIMEDOUT")).toMatch(/délai/);
    expect(explainNetworkError("x.io", undefined)).toMatch(/ne répond pas/);
  });

  it("powershellExport : exporte le certificat de CET émetteur en PEM dans le dossier certificats, sans le deviner", () => {
    const cmd = powershellExport("Kaspersky Anti-Virus Personal Root Certificate");
    expect(cmd).toContain("Cert:\\LocalMachine\\Root");
    expect(cmd).toContain("Cert:\\CurrentUser\\Root");
    expect(cmd).toContain("*Kaspersky Anti-Virus Personal Root Certificate*");
    expect(cmd).toContain("InsertLineBreaks");
    expect(cmd).toContain("certificats");
    expect(cmd).not.toContain("\n\n\n");
    // Si le certificat n'est pas trouvé, la commande le dit au lieu de planter sur une valeur vide.
    expect(cmd).toMatch(/if \(-not \$c\)/);
    expect(cmd).toContain("certmgr.msc");
    // un émetteur qui contient des guillemets ne casse pas la commande
    expect(powershellExport('Nom "bizarre" \'x\'')).not.toMatch(/Nom "bizarre"/);
  });
});

describe.skipIf(!hasOpenssl)("septim reseau : la commande", () => {
  const capture = () => {
    let text = "";
    return { stream: new Writable({ write(c, _e, d) { text += c.toString(); d(); } }), get text() { return text; } };
  };

  it("sur des sites donnés : code 1 et l'émetteur nommé quand un certificat est remplacé, avec la marche à suivre", async () => {
    const out = capture();
    const err = capture();
    const code = await main(["reseau", `localhost:${port}`], { out: out.stream, err: err.stream });
    expect(code).toBe(1);
    expect(out.text).toContain("Antivirus Test Root");
    expect(out.text).toContain("certificats");
    expect(out.text).toContain("docker compose up -d");
  });

  it("septim aide cite reseau", async () => {
    const out = capture();
    await main(["aide"], { out: out.stream, err: capture().stream });
    expect(out.text).toMatch(/septim reseau/);
  });
});

