#!/usr/bin/env node
// septim : une seule commande pour toute l'usine, utilisable depuis n'importe quel dossier.
// Elle se place dans le dossier du repo (pour .env, .septim-viral et src/remotion), puis charge le TypeScript avec tsx.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.env.SEPTIM_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), ".."));
process.env.SEPTIM_ROOT = root;
// Les chemins tapés par l'humain (--script, --broll, design init) se lisent depuis là où il a tapé la commande.
process.env.SEPTIM_CWD ??= process.cwd();
process.chdir(root);

const require = createRequire(import.meta.url);
// Le repo est en CommonJS : tsx charge l'entrée en CJS, et ses hooks ESM servent aux import() dynamiques.
// (tsx/esm seul échoue : « Cannot require() ES Module … in a cycle ».)
require("tsx/cjs/api").register();
(await import("tsx/esm/api")).register();

const { main } = require("../src/viral-engine/septim.ts");
const code = await main(process.argv.slice(2));
if (typeof code === "number") process.exit(code);
