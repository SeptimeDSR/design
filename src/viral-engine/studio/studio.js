"use strict";

// Studio Septim : fabriquer, regarder, publier avec « OUI #ref ».
// Aucune donnée n'entre dans le HTML : tout passe par textContent. Toutes les requêtes passent par api().

const TOKEN_KEY = "septim-token";
const STATUS = { rendered: "Rendue", notified: "À valider", publishing: "Publication en cours", published: "Publiée", rejected: "Jetée", failed: "Ratée" };
const TASK_STATUS = { queued: "En file d'attente", running: "En fabrication", done: "Prête", failed: "Ratée" };
const TEMPLATES = { story: "Histoire", maths: "Maths", film: "Film" };
const SOURCES = { claude: "écrit par Claude", ollama: "écrit par Ollama", fallback: "script de secours" };
const VOICES = { piper: "Piper", kokoro: "Kokoro", silent: "silencieuse" };
const CLIENTS = [
  ["claude-code", "Claude Code"],
  ["claude-desktop", "Claude Desktop"],
  ["cursor", "Cursor"],
  ["vscode", "VS Code"],
  ["windsurf", "Windsurf"],
  ["codex", "Codex"],
  ["gemini", "Gemini CLI"],
];
const FILTER_EMPTY = {
  all: "Aucune vidéo pour l'instant. Donne un sujet dans Fabriquer et lance le rendu.",
  notified: "Aucune vidéo à valider.",
  published: "Aucune vidéo publiée.",
  rejected: "Aucune vidéo jetée.",
};

const $ = (id) => document.getElementById(id);
// replaceChildren(null) écrirait « null » : on filtre les absents.
const fill = (el, ...children) => el.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
const state = {
  token: "",
  locked: false,
  videos: [],
  cards: new Map(),
  filter: "all",
  tasks: new Map(),
  armed: null,
  publishMode: "manual",
};

// ---------- Outils ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

const seconds = (ms) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const when = (iso) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "");
const percent = (x) => `${Math.round(x * 100)} %`;

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function saveToken(value) {
  state.token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible (navigation privée) : le token vit le temps de la page
  }
}

let announceTimer;
function announce(text, tone = "info") {
  const box = $("announce");
  clearTimeout(announceTimer);
  box.textContent = "";
  box.dataset.tone = tone;
  requestAnimationFrame(() => {
    box.textContent = text;
  });
  announceTimer = setTimeout(() => (box.textContent = ""), tone === "error" ? 12000 : 6000);
}

function apiUrl(route, params = {}, query = {}) {
  const path = route.replace(/^(GET|POST) /, "").replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key]));
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") qs.set(key, value);
  const tail = qs.toString();
  return tail ? `${path}?${tail}` : path;
}

class ApiError extends Error {
  constructor(status, error) {
    super(error?.message || `Erreur ${status}.`);
    this.status = status;
    this.code = error?.code;
    this.details = error?.details;
  }
}

async function api(route, { params, query, body } = {}) {
  const method = route.split(" ")[0];
  const headers = { Accept: "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (method === "POST") headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(apiUrl(route, params, query), { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  } catch {
    throw new ApiError(0, { code: "network", message: "L'usine ne répond pas. Vérifie qu'elle tourne (septim studio ou septim start)." });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) lock();
    throw new ApiError(res.status, data?.error);
  }
  return data;
}

async function copyText(text, field) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http hors localhost : pas de presse-papiers asynchrone, on passe par une sélection
  }
  const temp = field ?? h("textarea", { class: "visually-hidden", "aria-hidden": "true", readonly: true });
  if (!field) {
    temp.value = text;
    document.body.append(temp);
  }
  temp.focus();
  temp.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  if (!field) temp.remove();
  return ok;
}

function lock() {
  if (state.locked) return;
  state.locked = true;
  renderAccess();
  announce("Cette usine est protégée par un token : colle-le dans Brancher.", "error");
}

// ---------- En-tête : état de l'usine ----------

async function loadDoctor() {
  const box = $("state");
  try {
    const d = await api("GET /api/v1/doctor");
    state.publishMode = d.publishMode;
    const values = {
      voice: d.voice === "silent" ? "silencieuse" : `${VOICES[d.voice] ?? d.voice} (gratuite)`,
      llm: d.llm === "ollama" ? "Ollama, en local" : "de secours",
      publishMode: d.publishMode === "postiz" ? "Postiz" : "manuelle, légende à coller",
      notify: d.notify === "whatsapp" ? "WhatsApp" : "console",
    };
    for (const [key, text] of Object.entries(values)) box.querySelector(`[data-state="${key}"]`).textContent = text;
    const fixes = $("fixes");
    $("fixes-list").replaceChildren(
      ...d.fixes.map((f) => h("li", {}, h("p", { text: f.label }), ...f.commands.map((c) => h("code", { text: c })))),
    );
    $("fixes-summary").textContent = d.fixes.length === 1 ? "1 chose à installer pour aller plus loin" : `${d.fixes.length} choses à installer pour aller plus loin`;
    fixes.hidden = d.fixes.length === 0;
  } catch (error) {
    if (error.status !== 401) for (const dd of box.querySelectorAll("dd")) dd.textContent = "inconnu";
  } finally {
    box.setAttribute("aria-busy", "false");
  }
}

// ---------- Fabriquer ----------

function readForm() {
  const form = $("make-form");
  const data = new FormData(form);
  const body = {};
  const topic = String(data.get("topic") ?? "").trim();
  if (topic) body.topic = topic;
  const template = String(data.get("template") ?? "");
  if (template) body.template = template;
  body.lang = String(data.get("lang") ?? "fr");
  const raw = $("script").value.trim();
  if (raw) {
    try {
      body.script = JSON.parse(raw);
    } catch (error) {
      throw new ApiError(400, { message: `Le script n'est pas du JSON valide : ${error.message}` });
    }
  }
  return body;
}

function showLint(result, problem) {
  const box = $("lint-result");
  if (problem) {
    box.dataset.tone = "error";
    fill(box, h("p", { text: problem.message }), issuesList(problem.details?.issues));
    return;
  }
  box.dataset.tone = result.ok ? "ok" : "error";
  const summary = `${seconds(result.durationMs)}, réponse à ${percent(result.payoffRatio)} de la vidéo.`;
  fill(box, h("p", { text: result.ok ? `Script conforme : ${summary}` : `À corriger avant le rendu : ${summary}` }), issuesList(result.issues));
}

function issuesList(issues) {
  if (!issues?.length) return null;
  return h("ul", {}, issues.map((i) => h("li", {}, h("span", { class: "rule", text: i.rule }), ` : ${i.message}`)));
}

async function lint() {
  const button = $("lint");
  button.disabled = true;
  try {
    const body = readForm();
    if (!body.script) {
      showLint(null, { message: "Colle d'abord un script JSON." });
      return;
    }
    showLint(await api("POST /api/v1/lint", { body: { script: body.script, topic: body.topic, template: body.template, lang: body.lang } }));
  } catch (error) {
    showLint(null, error);
  } finally {
    button.disabled = false;
  }
}

async function make(event) {
  event.preventDefault();
  const submit = $("make-submit");
  submit.disabled = true;
  try {
    const task = await api("POST /api/v1/videos", { body: readForm() });
    state.tasks.set(task.id, task);
    renderTasks();
    $("topic").value = "";
    $("lint-result").replaceChildren();
    announce("Vidéo en fabrication. Environ deux minutes ; tu peux fermer la page, le rendu continue.");
    schedulePoll(1500);
  } catch (error) {
    if (error.details?.issues) {
      $("script-box").open = true;
      showLint(null, error);
    }
    announce(error.message, "error");
  } finally {
    submit.disabled = false;
  }
}

// ---------- Tâches ----------

function renderTasks() {
  const list = $("tasks");
  const tasks = [...state.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  list.replaceChildren(
    ...tasks.map((t) => {
      const topic = t.request?.topic || "Tendance du jour";
      const template = t.request?.template ? TEMPLATES[t.request.template] : "template au choix";
      return h(
        "li",
        { class: "task", "data-status": t.status },
        h("div", { class: "task-top" }, h("span", { class: "task-topic", text: topic }), h("span", { class: "task-status", text: TASK_STATUS[t.status] ?? t.status })),
        h("span", { class: "hint", text: `${t.kind === "redo" ? "Nouvelle version" : template}, lancée le ${when(t.createdAt)}` }),
        t.status === "queued" || t.status === "running" ? h("div", { class: "progress", role: "presentation" }) : null,
        t.status === "done" && t.jobId ? h("a", { class: "task-link", href: `#video-${t.jobId}`, onclick: () => showVideo(t.jobId), text: `Voir la vidéo #${t.ref}` }) : null,
        t.status === "failed" ? h("p", { class: "task-error", text: t.error || "Le rendu a échoué." }) : null,
      );
    }),
  );
  $("tasks-empty").hidden = tasks.length > 0;
}

let pollTimer;
function schedulePoll(delay) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, delay);
}

async function poll() {
  let active = false;
  try {
    active = await loadTasks();
  } catch {
    // erreur déjà annoncée (token) ou usine arrêtée : on réessaie plus tard
  }
  schedulePoll(active ? 2000 : 15000);
}

async function loadTasks() {
  const { tasks } = await api("GET /api/v1/tasks");
  let finished = false;
  for (const t of tasks) {
    const before = state.tasks.get(t.id);
    const wasActive = before && (before.status === "queued" || before.status === "running");
    if (wasActive && t.status === "done") {
      finished = true;
      announce(`Vidéo #${t.ref} prête : regarde-la, puis publie ou jette.`);
    } else if (wasActive && t.status === "failed") {
      finished = true;
      announce(`Rendu raté : ${t.error || "erreur inconnue"}.`, "error");
    }
    state.tasks.set(t.id, t);
  }
  renderTasks();
  if (finished) await loadVideos();
  return tasks.some((t) => t.status === "queued" || t.status === "running");
}

// ---------- Vidéos ----------

async function loadVideos() {
  const { videos } = await api("GET /api/v1/videos", { query: { limit: 100 } });
  state.videos = videos;
  await Promise.all(
    videos.map(async (v) => {
      const card = state.cards.get(v.id);
      if (card && card.detail.status === v.status && card.detail.hasVideo === v.hasVideo) return;
      const detail = await api("GET /api/v1/videos/:ref", { params: { ref: v.id } });
      if (card) updateCard(card, detail);
      else state.cards.set(v.id, buildCard(detail));
    }),
  );
  renderVideos();
}

function renderVideos() {
  const counts = { all: state.videos.length, notified: 0, published: 0, rejected: 0 };
  for (const v of state.videos) if (v.status in counts) counts[v.status]++;
  for (const el of document.querySelectorAll("[data-count]")) el.textContent = String(counts[el.dataset.count]);
  for (const b of document.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === state.filter));

  const shown = state.videos.filter((v) => state.filter === "all" || v.status === state.filter).map((v) => state.cards.get(v.id)?.el).filter(Boolean);
  const list = $("video-list");
  // On déplace les cartes existantes au lieu de les recréer : une vidéo en lecture continue de jouer.
  shown.forEach((el, i) => {
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
  });
  while (list.children.length > shown.length) list.lastElementChild.remove();
  const empty = $("videos-empty");
  empty.textContent = FILTER_EMPTY[state.filter];
  empty.hidden = shown.length > 0;
}

function videoSrc(detail) {
  return apiUrl("GET /api/v1/videos/:ref/video", { ref: detail.id }, { token: state.token || undefined });
}

function buildCard(detail) {
  const status = h("dd", { class: "status" });
  const parts = {
    frame: h("div", { class: "frame" }),
    ref: h("p", { class: "ref" }),
    hook: h("h3", { class: "hook" }),
    status,
    facts: h("dl", { class: "facts" }),
    caption: h("textarea", { readonly: true, rows: 4, id: `caption-${detail.id}` }),
    actions: h("div", { class: "actions" }),
    outcome: h("div", { class: "outcome", hidden: true }),
    error: h("p", { class: "video-error", hidden: true }),
  };
  const copy = h("button", {
    type: "button",
    class: "button quiet copy",
    text: "Copier la légende",
    onclick: async () => announce((await copyText(parts.caption.value, parts.caption)) ? "Légende copiée." : "Sélectionne la légende et copie-la.", "info"),
  });
  const el = h(
    "li",
    { class: "video", id: `video-${detail.id}`, tabindex: "-1" },
    parts.frame,
    h(
      "div",
      { class: "video-body" },
      h("div", { class: "video-title" }, parts.ref, parts.hook),
      parts.facts,
      parts.error,
      h("div", { class: "caption" }, h("label", { for: `caption-${detail.id}`, text: "Légende et hashtags" }), parts.caption, copy),
      parts.actions,
      parts.outcome,
    ),
  );
  const card = { el, parts, detail };
  updateCard(card, detail, true);
  return card;
}

function updateCard(card, detail, first = false) {
  const { parts, el } = card;
  const before = card.detail;
  card.detail = detail;
  el.dataset.status = detail.status;

  if (first || before.hasVideo !== detail.hasVideo) {
    parts.frame.replaceChildren(
      detail.hasVideo
        ? h("video", { controls: true, playsinline: true, preload: "metadata", src: videoSrc(detail), "aria-label": `Vidéo #${detail.ref}` })
        : h("div", { class: "frame-empty", text: "Le fichier vidéo n'est plus sur le disque." }),
    );
  }
  parts.ref.textContent = `#${detail.ref}`;
  parts.hook.textContent = `« ${detail.hook} »`;
  parts.status.textContent = STATUS[detail.status] ?? detail.status;
  parts.status.dataset.status = detail.status;
  parts.facts.replaceChildren(
    ...[
      ["Statut", parts.status],
      ["Durée", seconds(detail.durationMs)],
      ["Template", TEMPLATES[detail.template] ?? detail.template],
      ["Voix", VOICES[detail.voice] ?? detail.voice],
      ["Script", SOURCES[detail.source] ?? detail.source],
      [detail.publishedAt ? "Publiée le" : "Créée le", when(detail.publishedAt ?? detail.createdAt)],
    ].map(([label, value]) => h("div", {}, h("dt", { text: label }), value instanceof Node ? value : h("dd", { text: value }))),
  );
  parts.caption.value = [detail.caption, (detail.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n");
  parts.error.hidden = !detail.error;
  parts.error.textContent = detail.error ?? "";
  renderActions(card);
}

const ACTIONS = {
  notified: ["publish", "reject", "redo"],
  rendered: ["publish", "reject", "redo"],
  failed: ["redo"],
  rejected: ["redo"],
  publishing: [],
  published: [],
};

function renderActions(card) {
  const { detail, parts } = card;
  const focused = parts.actions.contains(document.activeElement) ? document.activeElement.dataset.action : undefined;
  const armed = state.armed?.id === detail.id ? state.armed.action : undefined;
  const ref = detail.ref;
  const label = {
    publish: [`Publier #${ref}`, `Confirmer : OUI #${ref}`],
    reject: ["Jeter", `Oui, jeter #${ref}`],
    redo: [detail.status === "notified" || detail.status === "rendered" ? "Refaire" : "Refaire une version", `Oui, refaire #${ref}`],
  };
  const available = (ACTIONS[detail.status] ?? []).filter((a) => a !== "publish" || detail.hasVideo);
  const buttons = available.map((action) =>
    h("button", {
      type: "button",
      class: action === "publish" ? "button publish" : "button quiet danger",
      "data-action": action,
      "data-armed": armed === action ? true : undefined,
      "aria-describedby": armed === action ? `armed-${detail.id}` : undefined,
      text: label[action][armed === action ? 1 : 0],
      onclick: () => (armed === action ? act(card, action) : arm(card, action)),
    }),
  );
  const extra = [];
  if (armed) {
    extra.push(h("button", { type: "button", class: "button quiet", "data-action": "cancel", text: "Annuler", onclick: () => disarm(card, armed) }));
  }
  const hints = {
    publish: state.publishMode === "postiz" ? "Publie sur tes réseaux via Postiz. Rien ne part sans ce clic." : "Mode manuel : l'usine marque la vidéo publiée et te donne la légende à coller avec le son tendance.",
    reject: "Elle ne sera jamais publiée.",
    redo: "Celle-ci est jetée, une nouvelle version sur le même sujet part en fabrication.",
  };
  fill(
    parts.actions,
    ...buttons,
    ...extra,
    detail.status === "publishing" ? h("p", { class: "hint", text: "Publication en cours…" }) : null,
    armed ? h("p", { class: "hint", id: `armed-${detail.id}`, text: hints[armed] }) : null,
  );
  const target = focused && parts.actions.querySelector(`[data-action="${focused}"]`);
  if (target) target.focus();
}

function arm(card, action) {
  const previous = state.armed && state.cards.get(state.armed.id);
  state.armed = { id: card.detail.id, action };
  if (previous && previous !== card) renderActions(previous);
  renderActions(card);
  card.parts.actions.querySelector(`[data-action="${action}"]`)?.focus();
}

function disarm(card, action) {
  state.armed = null;
  renderActions(card);
  card.parts.actions.querySelector(`[data-action="${action}"]`)?.focus();
}

async function act(card, action) {
  const { detail } = card;
  state.armed = null;
  for (const b of card.parts.actions.querySelectorAll("button")) b.disabled = true;
  try {
    if (action === "publish") {
      const r = await api("POST /api/v1/videos/:ref/publish", { params: { ref: detail.id }, body: { confirm: `OUI #${detail.id}` } });
      card.parts.outcome.hidden = false;
      card.parts.outcome.replaceChildren(
        h("p", { text: r.manualText ? `Publiée #${r.ref}. Colle la légende ci-dessus dans l'app, avec le son tendance.` : r.message }),
      );
      announce(`Publiée : #${r.ref}.`);
    } else if (action === "reject") {
      await api("POST /api/v1/videos/:ref/reject", { params: { ref: detail.id } });
      announce(`Jetée : #${detail.ref}.`);
    } else {
      const task = await api("POST /api/v1/videos/:ref/redo", { params: { ref: detail.id } });
      state.tasks.set(task.id, task);
      renderTasks();
      schedulePoll(1500);
      announce(`Nouvelle version de #${detail.ref} en fabrication.`);
    }
  } catch (error) {
    announce(error.message, "error");
  }
  const fresh = await api("GET /api/v1/videos/:ref", { params: { ref: detail.id } }).catch(() => detail);
  updateCard(card, fresh);
  await loadVideos().catch(() => undefined);
  card.el.focus();
}

function showVideo(id) {
  if (state.filter !== "all") {
    state.filter = "all";
    renderVideos();
  }
  requestAnimationFrame(() => state.cards.get(id)?.el.focus());
}

// ---------- Ce qui marche ----------

async function loadLessons() {
  const { text, arms } = await api("GET /api/v1/lessons");
  $("arms").replaceChildren(
    ...arms.map((a) => {
      const [template, formula] = a.arm.split(":");
      const bar = h("span");
      bar.style.width = `${Math.round(a.mean * 100)}%`;
      const trials = Math.max(0, Math.round(a.alpha + a.beta - 2));
      return h(
        "li",
        { class: "arm" },
        h("span", { text: `${TEMPLATES[template] ?? template}, hook ${formula}` }),
        h("span", { class: "arm-score", text: `${percent(a.mean)} sur ${trials} vidéo${trials > 1 ? "s" : ""}` }),
        h("span", { class: "arm-bar", "aria-hidden": "true" }, bar),
      );
    }),
  );
  $("lessons-empty").hidden = arms.length > 0;
  $("lessons-text").textContent = text;
  $("lessons-text-box").hidden = !text.trim();
}

// ---------- Brancher ----------

function renderAccess() {
  $("access").textContent = state.locked
    ? "Protégée par un token : colle-le ci-dessous."
    : state.token
      ? "Protégée par un token, enregistré sur cet appareil."
      : "Ouverte sur cet ordinateur seulement, sans token.";
}

function renderConnect() {
  $("api-url").textContent = `${location.origin}/api/v1`;
  $("mcp-url").textContent = `${location.origin}/mcp`;
  $("commands").replaceChildren(
    ...CLIENTS.map(([id, name]) => {
      // claude-code lance « claude mcp add » ; les autres écrivent leur fichier de config (sans toucher aux autres serveurs).
      const command = id === "claude-code" ? "septim connect claude-code" : `septim connect ${id} --write`;
      return h(
        "li",
        { class: "command" },
        h("span", {}, h("small", { text: name }), h("code", { text: command })),
        h("button", {
          type: "button",
          class: "button quiet copy",
          "aria-label": `Copier la commande pour ${name}`,
          text: "Copier",
          onclick: async () => announce((await copyText(command)) ? `Commande copiée : ${command}` : `Tape : ${command}`),
        }),
      );
    }),
  );
  renderAccess();
}

async function refreshAll() {
  await Promise.allSettled([loadDoctor(), loadVideos(), loadLessons(), poll()]);
}

// ---------- Démarrage ----------

function init() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("token");
  if (fromUrl) {
    saveToken(fromUrl);
    params.delete("token");
    const qs = params.toString();
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  } else {
    state.token = readToken();
  }

  $("make-form").addEventListener("submit", make);
  $("lint").addEventListener("click", lint);
  $("filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    renderVideos();
  });
  $("token-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = $("token").value.trim();
    if (!value) return;
    saveToken(value);
    $("token").value = "";
    state.locked = false;
    renderConnect();
    for (const card of state.cards.values()) updateCard(card, card.detail, true);
    announce("Token enregistré sur cet appareil.");
    void refreshAll();
  });
  $("token-forget").addEventListener("click", () => {
    saveToken("");
    renderAccess();
    announce("Token oublié sur cet appareil.");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.armed) return;
    const card = state.cards.get(state.armed.id);
    if (card) disarm(card, state.armed.action);
  });

  renderConnect();
  renderTasks();
  void refreshAll();
}

init();
