import { connect } from "node:tls";

// Pourquoi un téléchargement échoue avec « certificate verify failed » : ton antivirus, ton pare-feu ou ta box lit le HTTPS
// en remplaçant le certificat du site par le sien. Ce fichier dit QUI, et comment le conteneur peut lui faire confiance.
export type TlsState = "ok" | "intercepte" | "injoignable";
export type TlsCheck = { host: string; purpose?: string; state: TlsState; code?: string; issuer?: string; org?: string };

const TRUST_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "CERT_UNTRUSTED",
]);
export const isTrustError = (code?: string) => !!code && TRUST_CODES.has(code);

type Name = { CN?: string; O?: string } | undefined;
const pickName = (n: Name) => n?.CN || n?.O;

function handshake(host: string, port: number, o: { ca?: string; verify: boolean; timeoutMs: number }): Promise<{ authorized: boolean; code?: string; issuer?: string; org?: string; reached: boolean }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: Parameters<typeof resolve>[0] extends infer R ? R : never) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(v);
    };
    const socket = connect({ host, port, servername: /^[\d.]+$/.test(host) ? undefined : host, rejectUnauthorized: o.verify, ...(o.ca ? { ca: o.ca } : {}), timeout: o.timeoutMs });
    socket.once("secureConnect", () => {
      // Aucune donnée n'est envoyée : on lit le certificat, puis on coupe.
      const leaf = socket.getPeerCertificate();
      finish({ reached: true, authorized: socket.authorized, issuer: pickName(leaf?.issuer as Name), org: (leaf?.issuer as Name)?.O });
    });
    socket.once("timeout", () => finish({ reached: false, authorized: false, code: "ETIMEDOUT" }));
    socket.once("error", (error: NodeJS.ErrnoException) => finish({ reached: false, authorized: false, code: error.code }));
  });
}

export async function checkTls(host: string, port = 443, opts: { ca?: string; timeoutMs?: number } = {}): Promise<TlsCheck> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const first = await handshake(host, port, { ca: opts.ca, verify: true, timeoutMs });
  if (first.authorized) return { host, state: "ok", issuer: first.issuer };
  if (!isTrustError(first.code)) return { host, state: "injoignable", code: first.code };
  // Certificat refusé : une seconde connexion, sans vérification, UNIQUEMENT pour lire l'émetteur du certificat et le nommer.
  const peek = await handshake(host, port, { ca: opts.ca, verify: false, timeoutMs });
  return { host, state: "intercepte", code: first.code, issuer: peek.issuer, org: peek.org };
}

export function explainNetworkError(host: string, code?: string): string {
  if (isTrustError(code)) return `Ton réseau remplace le certificat de ${host} (antivirus, pare-feu ou box qui lit le HTTPS) et le conteneur ne lui fait pas confiance. Lance « septim reseau » pour voir qui, puis ajoute son certificat (GUIDE : « Réseau qui intercepte le HTTPS »).`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `${host} ne se résout pas (DNS) : vérifie la connexion internet et le DNS de Docker.`;
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "UND_ERR_CONNECT_TIMEOUT") return `${host} ne répond pas (délai dépassé) : un pare-feu le bloque peut-être.`;
  return `${host} ne répond pas : vérifie la connexion internet de l'usine (« septim reseau » détaille site par site).`;
}

// Le code d'erreur réseau d'un fetch Node (il est dans error.cause).
export const networkCode = (error: unknown): string | undefined => ((error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code) || undefined;

const clean = (name: string) => name.replace(/["'`$]/g, "").replace(/[[\]]/g, "?").trim();

// La commande PowerShell qui exporte le certificat de CET émetteur, au format PEM, dans le dossier « certificats ».
export function powershellExport(issuer: string): string {
  const name = clean(issuer);
  return [
    `$c = Get-ChildItem Cert:\\LocalMachine\\Root, Cert:\\CurrentUser\\Root | Where-Object { $_.Subject -like "*${name}*" } | Select-Object -First 1`,
    `if (-not $c) { Write-Host "Introuvable : ouvre certmgr.msc et cherche ${name}" } else {`,
    "  New-Item -ItemType Directory -Force certificats | Out-Null",
    `  ("-----BEGIN CERTIFICATE-----" + [Environment]::NewLine + [Convert]::ToBase64String($c.RawData, 'InsertLineBreaks') + [Environment]::NewLine + "-----END CERTIFICATE-----") | Set-Content certificats\\reseau.crt -Encoding ascii`,
    '  Write-Host "OK : certificats\\reseau.crt"',
    "}",
  ].join("\n");
}

export const NET_HOSTS: { host: string; purpose: string }[] = [
  { host: "huggingface.co", purpose: "voix Piper (téléchargement de la voix)" },
  { host: "pypi.org", purpose: "paquets Python (Piper, Chatterbox)" },
  { host: "files.pythonhosted.org", purpose: "paquets Python (fichiers)" },
  { host: "api.pexels.com", purpose: "vrais plans vidéo Pexels" },
  { host: "pixabay.com", purpose: "vrais plans vidéo Pixabay" },
  { host: "www.googleapis.com", purpose: "tendances YouTube" },
  { host: "api.apify.com", purpose: "tendances TikTok (Apify)" },
];

export function formatNetReport(checks: (TlsCheck & { purpose?: string })[]): string {
  const lines = checks.map((c) => {
    const what = c.purpose ? ` (${c.purpose})` : "";
    if (c.state === "ok") return `✓ ${c.host}${what}`;
    if (c.state === "intercepte") return `✗ ${c.host}${what} : certificat remplacé par « ${c.issuer ?? "émetteur inconnu"} »`;
    return `✗ ${c.host}${what} : injoignable (${c.code ?? "pas de réponse"})`;
  });
  const intercepted = checks.filter((c) => c.state === "intercepte");
  const unreachable = checks.filter((c) => c.state === "injoignable");
  lines.push("");
  if (!intercepted.length && !unreachable.length) {
    lines.push("Tout passe : aucun site n'est intercepté ni bloqué.");
    return lines.join("\n");
  }
  if (intercepted.length) {
    const issuers = [...new Set(intercepted.map((c) => c.issuer).filter((x): x is string => !!x))];
    lines.push(
      `${intercepted.length} site${intercepted.length > 1 ? "s ont" : " a"} un certificat remplacé : un logiciel de ton PC ou de ton réseau (antivirus, pare-feu, proxy d'entreprise) lit le HTTPS. Le conteneur ne connaît pas son certificat racine.`,
      "Solution : donner ce certificat au conteneur.",
      "  1. Dans PowerShell, dans le dossier septim, cette commande l'exporte au bon format :",
      "",
      ...(issuers.length ? [powershellExport(issuers[0]).split("\n").map((l) => `     ${l}`).join("\n")] : ["     (émetteur non lu : cherche le certificat racine de ton antivirus dans certmgr.msc, exporte-le en Base-64 (.cer) et renomme-le certificats\\reseau.crt)"]),
      "",
      "  2. Puis : docker compose up -d      (l'usine relit le dossier certificats)",
      "  3. Puis : septim reseau             (les sites doivent passer au vert)",
      "Autre solution : dans ton antivirus, désactive le « scan HTTPS » pour Docker, ou ajoute les sites ci-dessus aux exceptions.",
    );
  }
  if (unreachable.length) lines.push("", `${unreachable.length} site${unreachable.length > 1 ? "s sont" : " est"} injoignable${unreachable.length > 1 ? "s" : ""} : vérifie la connexion internet, le DNS de Docker, ou un pare-feu qui bloque ces adresses.`);
  return lines.join("\n");
}
