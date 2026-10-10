import { createReadStream, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Le Studio vit à côté du code ; la police vient du paquet déjà installé pour le site.
export const studioRoot = (root: string) => resolve(root, "src/viral-engine/studio");
const FONT = "node_modules/@fontsource-variable/anybody/files/anybody-latin-wght-normal.woff2";

function send(res: ServerResponse, file: string): boolean {
  let size: number;
  try {
    const st = statSync(file);
    if (!st.isFile()) return false;
    size = st.size;
  } catch {
    return false;
  }
  const type = TYPES[extname(file).toLowerCase()];
  if (!type) return false;
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Cache-Control": "no-cache" });
  createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
  return true;
}

// Renvoie false quand le fichier n'existe pas ou sort du dossier du Studio : l'appelant répond 404.
export function serveStatic(pathname: string, res: ServerResponse, root: string): boolean {
  const base = studioRoot(root);
  if (pathname === "/" || pathname === "/index.html") return send(res, join(base, "index.html"));
  if (pathname === "/studio/fonts/anybody.woff2") return send(res, resolve(root, FONT));
  if (!pathname.startsWith("/studio/")) return false;
  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice("/studio/".length));
  } catch {
    return false;
  }
  if (rel.includes("\0")) return false;
  const file = resolve(base, rel);
  if (!file.startsWith(base + sep)) return false;
  return send(res, file);
}
