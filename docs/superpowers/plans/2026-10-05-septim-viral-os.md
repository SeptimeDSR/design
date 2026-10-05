# SEPTIM-VIRAL-OS + site rétention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une usine locale qui fabrique, toutes les 6 h, une vidéo 9:16 virale gratuite, l'envoie sur WhatsApp et la publie partout sur « OUI », plus un site que personne n'a envie de quitter.

**Architecture:** Modules TypeScript purs et testés (`src/viral-engine/`) reliés à des outils existants (Ollama, Piper/Kokoro, Remotion, whatsapp-web.js, Postiz CLI) par de minces adaptateurs ; un démon `node-cron` + un CLI ; trois compositions Remotion 9:16 ; un plugin `septim-viral` ; le site Next.js refait avec les principes de rétention.

**Tech Stack:** Node 22, TypeScript, tsx, vitest, Remotion 4 (`@remotion/bundler`, `@remotion/renderer`), ollama, kokoro-js, Piper (python `piper-tts`), whatsapp-web.js, qrcode-terminal, node-cron, pm2, Postiz CLI, Next.js 16, GSAP, Lenis, Motion.

**Spec:** `docs/superpowers/specs/2026-10-05-septim-viral-os-design.md`

## Global Constraints

- Hook ≤ 3 s parlé à vitesse 1,1 ; base 2,5 mots/s (FR) et 2,8 mots/s (EN) ; pause de 250 ms par `.`, `?`, `!`.
- Beat ≤ 3,5 s ; payoff commence à ≥ 80 % de la durée ; durée cible 20–60 s.
- CTA par défaut FR : « Garde ça, tu vas en avoir besoin demain. » ; EN : « Save this, you'll need it tomorrow. »
- Vidéo 1080×1920, 30 fps, h264, CRF 23 ; compositions `viral-story`, `viral-maths`, `viral-film`.
- Aucune publication sans réponse `publish` ; aucun crédit PRO dépensé par le démon.
- Tout état local dans `VIRAL_HOME` (défaut `.septim-viral/`), ignoré par git ; secrets uniquement dans `.env`.
- Fichiers `src/remotion/**` : imports relatifs uniquement (pas d'alias `@/`).
- Tout texte visible en français par défaut.

## Review Focus

1. Ollama absent, lent ou qui renvoie du texte non-JSON → le job doit quand même sortir (repli déterministe), jamais planter.
2. Aucun moteur TTS installé → rendu avec piste silencieuse et avertissement, pas d'exception.
3. Réponse WhatsApp ambiguë (« oui mais non », emoji, majuscules, message du bot lui-même) → ne publie que sur une intention claire, ignore ses propres messages.
4. Toutes les sources de tendances en échec (pas de réseau, pas de clé) → sujet de secours, le cycle continue.
5. Postiz non configuré → mode `manual`, le message WhatsApp contient tout pour poster à la main.

---

### Task 1: Socle de test + types + checklist

**Files:**
- Create: `src/viral-engine/types.ts`, `src/viral-engine/viral-checklist.json`, `src/viral-engine/checklist.ts`, `vitest.config.ts`
- Test: `src/viral-engine/__tests__/checklist.test.ts`
- Modify: `package.json` (scripts `test`, `viral`, `viral:daemon`, `viral:ambient` ; devDeps `vitest`, `tsx`)

**Interfaces — Produces:**
- `types.ts` : `Lang = "fr"|"en"`, `TemplateId = "story"|"maths"|"film"`, `HookFormula = "question"|"choc"|"secret"|"contre-intuitif"`, `Beat {text; emphasis?}`, `ViralScript {topic; lang; template; formula; hook; beats: Beat[]; payoff; cta; caption; hashtags: string[]}`, `Segment {kind: "hook"|"beat"|"payoff"|"cta"; text; startMs; endMs}`, `Timeline {segments; durationMs}`, `CaptionWord {text; startMs; endMs}`, `LintIssue {rule; message}`.
- `checklist.ts` : `RULES` (typé) lu depuis le JSON : `hookMaxSeconds 3`, `wordsPerSecond {fr 2.5, en 2.8}`, `voiceSpeed 1.1`, `beatMaxSeconds 3.5`, `payoffMinRatio 0.8`, `targetSeconds [20, 60]`, `cta {fr, en}`.

- [ ] Test : `RULES.payoffMinRatio === 0.8`, `RULES.hookMaxSeconds === 3`, le JSON contient les 8 clés du prompt utilisateur (`hook_first_3_sec` … `site_sticky_rules`).
- [ ] Run `npx vitest run src/viral-engine/__tests__/checklist.test.ts` → FAIL (module absent).
- [ ] Implémenter, re-run → PASS. Commit.

### Task 2: Hooks H.E.A.T + linter

**Files:** Create `src/viral-engine/heat.ts` · Test `__tests__/heat.test.ts`

**Interfaces — Produces:**
- `estimateSpokenMs(text: string, lang: Lang, speed?: number): number`
- `lintHook(hook: string, lang: Lang): LintIssue[]` — règles `hook.empty`, `hook.too_long`, `hook.no_viewer` (FR `tu|toi|ton|ta|tes|t'|vous|votre` ; EN `you|your`), `hook.no_gap` (finit par `?` ou `…` ou contient un marqueur : FR `pourquoi|personne|jamais|secret|faux|et si|vraiment|arrête` ; EN `why|nobody|never|secret|wrong|what if|stop`).
- `buildHeatPrompt(input: {topic; lang; formula; template; trend?: string}): string` — exige une réponse JSON aux clés de `ViralScript` sauf `lang/template/formula/topic`.
- `parseHeatResponse(raw: string): Partial<ViralScript> | null` — accepte JSON brut ou entouré de ``` ; `null` si invalide.
- `fallbackScript(input: {topic; lang; formula; template}): ViralScript` — 4 formules × 2 langues, toujours conforme au linter.

- [ ] Tests : `estimateSpokenMs("Et si ta clé ne rentrait plus chez toi ?","fr",1.1)` ≤ 3000 ; hook de 20 mots → contient `hook.too_long` ; « La clé est importante. » → `hook.no_viewer` et `hook.no_gap` ; `parseHeatResponse("```json\n{\"hook\":\"x\"}\n```")?.hook === "x"` ; `parseHeatResponse("pas du json") === null` ; pour chaque formule et langue, `lintHook(fallbackScript(...).hook)` est vide.
- [ ] FAIL → implémenter → PASS → commit.

### Task 3: Structure du script, timeline, captions

**Files:** Create `src/viral-engine/story.ts`, `src/viral-engine/captions.ts` · Test `__tests__/story.test.ts`, `__tests__/captions.test.ts`

**Interfaces — Produces:**
- `normalizeBeats(beats: Beat[], lang: Lang, speed?: number): Beat[]` — coupe tout beat > 3,5 s à la ponctuation, sinon au milieu des mots.
- `buildTimeline(script: ViralScript, durationsMs?: number[]): Timeline` — ordre hook, beats…, payoff, cta ; `durationsMs` (réelles, issues du TTS) sinon estimées.
- `lintScript(script: ViralScript, timeline: Timeline): LintIssue[]` — inclut `lintHook`, `beat.too_long`, `payoff.too_early` (début payoff / durée < 0,8), `cta.missing` (FR `garde|sauvegarde|enregistre` ; EN `save|bookmark`), `duration.out_of_range`.
- `wordTimings(text: string, startMs: number, endMs: number): CaptionWord[]` — poids = longueur du mot + 2 par ponctuation finale ; somme exacte = intervalle.
- `pageCaptions(words: CaptionWord[], maxWords?: number /*3*/): CaptionWord[][]` — coupe après ponctuation ou à `maxWords`.

- [ ] Tests : beat de 30 mots → découpé, chaque morceau ≤ 3500 ms ; timeline contiguë (`seg[i].endMs === seg[i+1].startMs`) ; script dont payoff démarre à 50 % → `payoff.too_early` ; `fallbackScript` + `buildTimeline` → `lintScript` vide ; `wordTimings("a bb ccc",0,900)` couvre exactement 0→900, croissant ; `pageCaptions` jamais > 3 mots, coupe après « ? ».
- [ ] FAIL → implémenter → PASS → commit.

### Task 4: Bandit d'auto-amélioration + réponses WhatsApp + mode de publication

**Files:** Create `src/viral-engine/bandit.ts`, `src/viral-engine/approval.ts`, `src/viral-engine/publish-plan.ts` · Tests associés

**Interfaces — Produces:**
- `mulberry32(seed: number): () => number`
- `type BanditState = Record<string, {alpha: number; beta: number}>`
- `armKey(t: TemplateId, f: HookFormula): string` → `"story:question"`
- `allArms(): string[]` (12 bras)
- `chooseArm(state: BanditState, arms: string[], rng: () => number): string` — Thompson sampling, Beta(α, β) via deux tirages Gamma (Marsaglia-Tsang) ; prior Beta(1,1).
- `updateArm(state, arm, reward: 0|1): BanditState` (immuable)
- `rewardFromViews(views: number, history: number[]): 0|1` — 1 si `views ≥ médiane(history)` (historique vide → 1 si views > 0).
- `parseReply(text: string): {intent: "publish"|"reject"|"redo"|"pro"|"unknown"; jobRef?: string}` — premier mot normalisé (minuscules, sans accents/emoji) ; publish = `oui|ok|go|yes|publie|vas-y|👍` ; reject = `non|no|stop` ; redo = `refais|redo|encore` ; pro = `pro` ; `#abcd` capturé en `jobRef`.
- `resolvePublishMode(env: Record<string,string|undefined>, hasPostizCredentials: boolean): "manual"|"postiz-cloud"|"postiz-self"`
- `postizSettings(platform: "tiktok"|"youtube"|"instagram"|"facebook", mode, script: ViralScript, tiktokMethod?: "DIRECT_POST"|"UPLOAD"): Record<string, unknown>` — TikTok : `DIRECT_POST`, `PUBLIC_TO_EVERYONE` en cloud, `SELF_ONLY` en self ; YouTube : `{title, type}` public en cloud, private en self ; Instagram : `{post_type: "post"}` ; Facebook : `{}`.

- [ ] Tests : après 200 récompenses 1 sur `story:question` et 0 ailleurs, `chooseArm` (seed fixe) choisit `story:question` ≥ 90 % sur 100 tirages ; `updateArm` ne mute pas l'entrée ; `rewardFromViews(10,[1,5,20]) === 1`, `(4,[1,5,20]) === 0` ; `parseReply("OUI publie")` → publish ; `"Oui mais non"` → publish (premier mot) ; `"non"` → reject ; `"🎬 Septim · Vidéo prête"` → unknown ; `"oui #a1b2"` → jobRef `a1b2` ; `resolvePublishMode({}, false) === "manual"` ; avec `POSTIZ_API_KEY` → `postiz-cloud` ; avec `POSTIZ_API_URL=https://moi.local` → `postiz-self` ; TikTok self → `SELF_ONLY`.
- [ ] FAIL → implémenter → PASS → commit.

### Task 5: Audio — WAV, lit ambiant, TTS

**Files:** Create `src/viral-engine/wav.ts`, `src/viral-engine/ambient.ts`, `src/viral-engine/tts.ts` · Tests `wav.test.ts`, `ambient.test.ts`, `tts.test.ts`

**Interfaces — Produces:**
- `encodeWav(samples: Float32Array, sampleRate: number): Buffer` (PCM 16 bits mono) ; `wavDurationMs(buf: Buffer): number`
- `ambientSamples(seconds: number, sampleRate: number, seed: number): Float32Array` — accords lents (Am7–Fmaj7–Cmaj7–G6), passe-bas, crépitement vinyle ; crête ≤ 0,5.
- `writeAmbient(outPath: string, seconds: number, seed?: number): Promise<string>`
- `type TtsEngine = "piper"|"kokoro"|"silent"` ; `detectEngine(lang: Lang, pref?: string): Promise<TtsEngine>`
- `synthesize(text: string, opts: {lang: Lang; outPath: string; speed?: number; engine?: TtsEngine}): Promise<{path: string; durationMs: number; engine: TtsEngine}>` — Piper : `python3 -m piper -m $VIRAL_PIPER_VOICE(fr_FR-tom-medium) --length-scale 1/speed -f out` (texte sur stdin) ; Kokoro : `kokoro-js` voix `am_michael`, `device: "cpu"` ; silent : WAV de la durée estimée.

- [ ] Tests : `wavDurationMs(encodeWav(new Float32Array(48000),48000)) === 1000` ; `ambientSamples(2,22050,1)` longueur 44100, crête ∈ ]0 ; 0,5], même seed → même sortie ; `synthesize(...,{engine:"silent"})` → fichier existant et durée ≈ `estimateSpokenMs`.
- [ ] FAIL → implémenter → PASS → commit.

### Task 6: Compositions Remotion 9:16 (story, maths, film)

**Files:** Create `src/remotion/viral/{props.ts, shared.tsx, ViralStory.tsx, ViralMaths.tsx, ViralFilm.tsx, sample.ts}` · Modify `src/remotion/Root.tsx`

**Interfaces:**
- Consumes : `ViralScript`, `Timeline`, `CaptionWord`, `fallbackScript`, `buildTimeline`, `wordTimings`, `pageCaptions` (via imports relatifs `../../viral-engine/...`).
- Produces : `ViralProps {script; timeline; audio: {segments: {src: string; startMs: number}[]; ambient?: string}; broll?: string[]}` ; compositions `viral-story|viral-maths|viral-film`, 1080×1920, 30 fps, durée via `calculateMetadata` = `ceil(timeline.durationMs/1000*30)` ; `sampleProps(template)` pour le Studio.
- Chaque template : sous-titres mot à mot (mot courant surligné), interruption visuelle à chaque segment (échelle/angle/couleur), barre de progression, payoff mis en scène, CTA « garde ça » ; branche `broll` commentée `// BESOIN CREDIT: Higgsfield Seedance pour ce plan. Alternative gratuite: fond procédural Remotion ici`.

- [ ] `npx tsc --noEmit` OK, `npx remotion still src/remotion/index.ts viral-story out.png --frame=60` produit une image lisible, idem maths et film (frame dans le payoff aussi).
- [ ] `npx remotion render ... viral-story` → MP4 lisible. Commit.

### Task 7: Tendances + LLM + rendu + pipeline + CLI

**Files:** Create `src/viral-engine/{trends.ts, llm.ts, render.ts, store.ts, pipeline.ts, cli.ts, config.ts}` · Tests `trends.test.ts`, `pipeline.test.ts`, fixtures `__tests__/fixtures/{google-trends.xml, youtube-popular.json}`

**Interfaces — Produces:**
- `Trend {title; source: "youtube"|"google"|"tiktok"|"fallback"; region?; sound?; score: number}`
- `parseGoogleTrendsRss(xml: string, region: string): Trend[]` ; `parseYouTubePopular(json: unknown, region: string): Trend[]` ; `parseApifyTikTok(items: unknown[]): Trend[]`
- `fetchTrends(cfg: ViralConfig): Promise<Trend[]>` (timeouts 10 s, échecs ignorés, jamais vide grâce à `EVERGREEN_TOPICS`)
- `pickTrend(trends: Trend[], recentTitles: string[]): Trend`
- `generateScript(input: {topic; lang; formula; template; trend?}, cfg): Promise<{script: ViralScript; source: "ollama"|"fallback"}>` — 3 essais lint, puis repli.
- `Job {id; createdAt; status: "rendered"|"notified"|"published"|"rejected"|"failed"; request; script; arm; trend?; videoPath?; publishMode?; postIds?: string[]; views?: number}` ; `store` : `loadState()`, `saveState()`, `saveJob()`, `getJob()`, `latestJob(status?)`.
- `renderJob(job, props: ViralProps): Promise<string>` → `renders/<id>.mp4`
- `runJob(req: {topic?; template?; lang?}, deps?: Partial<PipelineDeps>): Promise<Job>` — deps injectables (`render`, `notify`, `tts`, `trends`, `llm`).
- CLI : `npm run viral -- "je veux une histoire sur…" [--template story|maths|film] [--lang fr|en] [--no-notify]`

- [ ] Tests : fixture RSS → titres + score décroissant ; fixture YouTube → titres ; `fetchTrends` sans réseau → au moins 1 tendance `fallback` ; `runJob` avec deps factices → job `notified`, script conforme au linter, bras enregistré ; `runJob` avec LLM qui renvoie du texte non-JSON → source `fallback`, pas d'exception.
- [ ] Rendu réel de bout en bout avec TTS `silent` → MP4 dans `renders/`. Commit.

### Task 8: WhatsApp, Postiz, démon

**Files:** Create `src/viral-engine/{notify.ts, publish.ts, daemon.ts}`, `ecosystem.config.cjs` · Test `notify.test.ts`

**Interfaces — Produces:**
- `formatReadyMessage(job: Job, publishMode): string` — préfixe `🎬 Septim`, titre/hook, légende + hashtags, son tendance si connu, ref `#id4`, consigne « Réponds OUI pour publier sur TikTok, YouTube, Facebook, Instagram · NON pour jeter · REFAIS pour une autre version » (en mode manual : « Réponds OUI et je te renvoie la légende prête à coller »).
- `Notifier {start(): Promise<void>; send(text: string, mediaPath?: string): Promise<void>; onMessage(h: (text: string) => void): void}` ; `createNotifier(kind: "whatsapp"|"console")` — WhatsApp : `LocalAuth` dans `VIRAL_HOME/wa`, QR dans le terminal, destinataire `VIRAL_WHATSAPP_TO` sinon soi-même, ignore les messages commençant par `🎬 Septim`.
- `publishJob(job, mode): Promise<string[]>` — Postiz : `postiz upload` → `posts:create` par plateforme avec `postizSettings` ; manual : renvoie la légende.
- `daemon.ts` : `cron.schedule("0 */6 * * *", runJob)`, écoute des réponses (`parseReply` → job référencé ou dernier `notified`), analytics `"0 9 * * *"` → `rewardFromViews` → `updateArm`, écrit `LESSONS.md`.

- [ ] Tests : message contient `#` + 4 caractères de l'id, « OUI », la légende ; mode manual → mention de coller la légende ; `createNotifier("console")` renvoie les messages via `onMessage`.
- [ ] `npm run viral -- "test" --no-notify` sort un MP4. Commit.

### Task 9: Plugin `septim-viral`

**Files:** Create `plugins/septim-viral/.claude-plugin/plugin.json`, `plugins/septim-viral/skills/viral/SKILL.md`, `plugins/septim-viral/skills/viral/references/{setup.md, heat.md}`, `plugins/septim-viral/.mcp.json` (Apify `@apify/actors-mcp-server`, token `APIFY_TOKEN`) · Modify `.claude-plugin/marketplace.json`

- [ ] `claude plugin validate --strict plugins/septim-viral` et `.` → passed ; installation locale → enabled, skill `viral` listé. Commit.

### Task 10: Site rétention

**Files:** Modify `src/app/page.tsx`, `src/app/globals.css` · Create `src/components/retention/{chapter-hud.tsx, sound-toggle.tsx, secret-drops.tsx, endless-feed.tsx, open-loop.tsx, chapters.ts}`, `src/components/video/viral-preview.tsx`

**Interfaces:** `CHAPTERS: {id; title; kicker}[]` (7 chapitres) ; `useChapter()` via IntersectionObserver ; `SoundToggle` (Web Audio, opt-in, tic au changement de chapitre) ; `SecretDrops` (positions tirées au hasard par session) ; `EndlessFeed` (sentinelle → recharge sans fin) ; `ViralPreview` (Player Remotion `ViralStory` en 9:16).

- [ ] typecheck, lint, build OK ; navigateur 1440 et 390 : 0 erreur console, 0 débordement, HUD qui avance, feed qui se recharge, son jamais lancé sans clic, `prefers-reduced-motion` respecté. Reporter les composants génériques dans les templates du plugin `septim-design`. Commit.

### Task 11: Tests des skills par sous-agents

- [ ] Scénarios RED (sans skill) puis GREEN (avec skill) pour `septim-design` (invocation nue ; pression « vite, utilise Higgsfield ») et `septim-viral` (« fais une vidéo et publie-la » sans OUI). Corriger les skills, re-tester. Commit.

### Task 12: Robustesse + livraison

**Files:** Create `.claude/hooks/septim-cloud-setup.sh` · Modify `.claude/settings.json`, `.gitignore`, `README.md`, `.claude/INVENTAIRE-DESIGN-2026.md`, `CLAUDE.md`

- [ ] Hook `SessionStart` : si `CLAUDE_CODE_REMOTE=true`, ajoute le marketplace local et installe `septim-design@septim` + `septim-viral@septim` (idempotent, sortie silencieuse, exit 0 toujours). Test : exécuter le script deux fois → 2ᵉ passage sans erreur.
- [ ] `git bundle` + archive envoyés via SendUserFile ; tentative de push ; commit final.
