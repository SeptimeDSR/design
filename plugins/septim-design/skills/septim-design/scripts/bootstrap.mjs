#!/usr/bin/env node
// Septim Design — installe la stack design dans le projet courant.
//
//   node bootstrap.mjs --check      état de la stack, ne modifie rien (sortie JSON)
//   node bootstrap.mjs              installe ce qui manque
//   node bootstrap.mjs --no-skills  sans les agent skills GSAP / Remotion
//
// Ne remplace jamais un fichier existant.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");
const cwd = process.cwd();
const templates = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

const DEPS = [
  "lenis", "gsap", "@gsap/react", "motion",
  "three", "@react-three/fiber", "@react-three/drei",
  "@splinetool/react-spline", "@splinetool/runtime",
  "remotion", "@remotion/player",
];
const DEV_DEPS = ["@remotion/cli"];
const SCRIPTS = {
  "video:studio": "remotion studio {remotion}/index.ts",
  "video:render": "remotion render {remotion}/index.ts hero-shot public/videos/hero-shot.mp4",
  "video:dolly": "remotion render {remotion}/index.ts cinematic-dolly public/videos/cinematic-dolly.mp4",
};
const ENV_EXAMPLE = `
# --- Septim Design : assets PRO (optionnels). Vide => la version FREE s'affiche. ---
NEXT_PUBLIC_SPLINE_SCENE=
NEXT_PUBLIC_HERO_VIDEO_URL=
`;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd });

function packageManager() {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return { name: "pnpm", add: "pnpm add", dev: "pnpm add -D" };
  if (existsSync(join(cwd, "yarn.lock"))) return { name: "yarn", add: "yarn add", dev: "yarn add -D" };
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return { name: "bun", add: "bun add", dev: "bun add -d" };
  return { name: "npm", add: "npm install", dev: "npm install -D" };
}

function framework(pkg) {
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  if (all.next) return "next";
  if (all.vite && all.react) return "vite-react";
  if (all.react) return "react";
  if (all.astro) return "astro";
  if (all.vue || all.nuxt) return "vue";
  if (all.svelte || all["@sveltejs/kit"]) return "svelte";
  return "other";
}

function copyTree(from, to, created) {
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    const dest = join(to, entry);
    if (statSync(src).isDirectory()) {
      copyTree(src, dest, created);
    } else if (!existsSync(dest)) {
      if (!CHECK) {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
      }
      created.push(relative(cwd, dest));
    }
  }
}

const pkgPath = join(cwd, "package.json");
if (!existsSync(pkgPath)) {
  console.log(JSON.stringify({ project: "none", hint: "Pas de package.json : créer le projet d'abord (ex. npx create-next-app@latest)." }, null, 2));
  process.exit(CHECK ? 0 : 1);
}

const pkg = readJson(pkgPath);
const fw = framework(pkg);
const react = ["next", "vite-react", "react"].includes(fw);
const installed = { ...pkg.dependencies, ...pkg.devDependencies };
const missingDeps = react ? DEPS.filter((d) => !installed[d]) : DEPS.filter((d) => ["lenis", "gsap"].includes(d) && !installed[d]);
const missingDev = react ? DEV_DEPS.filter((d) => !installed[d]) : [];
const srcDir = existsSync(join(cwd, "src")) ? "src" : ".";
const remotionDir = join(srcDir, "remotion").replace(/^\.\//, "");
const skillsDir = join(cwd, ".claude", "skills");
const hasSkill = (name) => existsSync(join(skillsDir, name));
const missingSkills = [
  !hasSkill("gsap-react") && "greensock/gsap-skills",
  react && !hasSkill("remotion-best-practices") && "remotion",
].filter(Boolean);

const created = [];
if (react) {
  copyTree(join(templates, "components"), join(cwd, srcDir, "components", "septim"), created);
  copyTree(join(templates, "remotion"), join(cwd, remotionDir), created);
}

const report = {
  framework: fw,
  packageManager: packageManager().name,
  missingDeps,
  missingDevDeps: missingDev,
  missingSkills,
  templates: created,
  memory: existsSync(join(cwd, ".septim", "PROJECT.md")) ? ".septim/PROJECT.md" : "absent",
};

if (CHECK) {
  report.ready = !missingDeps.length && !missingDev.length && !missingSkills.length && !created.length;
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pm = packageManager();
if (missingDeps.length) run(`${pm.add} ${missingDeps.join(" ")}`);
if (missingDev.length) run(`${pm.dev} ${missingDev.join(" ")}`);

if (react) {
  const fresh = readJson(pkgPath);
  fresh.scripts ??= {};
  for (const [name, cmd] of Object.entries(SCRIPTS)) fresh.scripts[name] ??= cmd.replace("{remotion}", remotionDir);
  writeFileSync(pkgPath, JSON.stringify(fresh, null, 2) + "\n");

  const envPath = join(cwd, ".env.example");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (!env.includes("NEXT_PUBLIC_HERO_VIDEO_URL")) writeFileSync(envPath, env + ENV_EXAMPLE);
}

if (!args.has("--no-skills")) {
  // Skills officielles, récupérées à la source pour rester à jour.
  if (missingSkills.includes("greensock/gsap-skills")) run("npx -y skills add greensock/gsap-skills --agent claude-code -y");
  if (missingSkills.includes("remotion")) run("npx -y remotion skills add");
}

// Les skills Remotion embarquent des exemples .tsx qui cassent tsc : on les exclut.
const warnings = [];
const tsconfigPath = join(cwd, "tsconfig.json");
if (existsSync(join(cwd, ".agents")) && existsSync(tsconfigPath)) {
  try {
    const ts = readJson(tsconfigPath);
    ts.exclude ??= ["node_modules"];
    for (const dir of [".agents", ".claude"]) if (!ts.exclude.includes(dir)) ts.exclude.push(dir);
    writeFileSync(tsconfigPath, JSON.stringify(ts, null, 2) + "\n");
  } catch {
    warnings.push('tsconfig.json non modifiable automatiquement (commentaires ?) : ajouter ".agents" et ".claude" à "exclude".');
  }
  const eslintPath = ["eslint.config.mjs", "eslint.config.js", "eslint.config.ts"].map((f) => join(cwd, f)).find(existsSync);
  const eslint = eslintPath ? readFileSync(eslintPath, "utf8") : "";
  if (eslint.includes("globalIgnores([") && !eslint.includes('".agents/**"')) {
    writeFileSync(eslintPath, eslint.replace("globalIgnores([", 'globalIgnores([\n    // Agent skills : exemples hors de l\'app.\n    ".agents/**",\n    ".claude/**",'));
  } else if (eslintPath && !eslint.includes('".agents/**"')) {
    warnings.push('Ajouter ".agents/**" et ".claude/**" aux ignores ESLint.');
  }
}

console.log(JSON.stringify({ ...report, warnings, done: true }, null, 2));
