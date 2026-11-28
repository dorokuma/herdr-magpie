// Routing, live: magpie's Routing stage as a Herdr mod.
// A magpie carries each request from its agent through the gap between
// the columns to the account routing picked, lets it go while it answers,
// and another brings the answer back — the motion language of magpie's
// internal/gui/assets/plugins/routing (fly()/pose(), FLIER, .pkt), laid
// out for a narrow stage: no hub node, the bird flies the whole way.

import { View, div, svg, image, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { theme, exec, settings, appHome, readTextFile, notify, setShared, window as herdrWindow } from "herdr";
// `window` here is gpui-shell's global window object (its paint_path is an
// element constructor), not herdr's window() — a function that only reports
// metadata. Importing the herdr one shadows the global and breaks render.

// Default connection target; overridden dynamically by mods/routing/config.json
// or auto-detected from ~/.config/magpie/providers.json.
const DEFAULT_BASE_URL = "http://127.0.0.1:3425";
// Updates: Herdr has no package manager for a third-party mod, so this one
// looks for its own releases. The look is one HEAD request that follows
// github.com's releases/latest redirect -- no API token, no REST rate limit.
const UPDATE_REPO = "dorokuma/herdr-magpie";
const UPDATE_EVERY = 6 * 60 * 60 * 1000;   // the routine look, by the wall clock
const UPDATE_ASKED = 10 * 60 * 1000;       // the floor between looks a person causes
const UPDATE_RETRY = [2, 10, 30, 60].map((m) => m * 60 * 1000); // after a failed look
const SEMVER = /^\d+\.\d+\.\d+$/;
const FRAME = 33;          // ms between animation frames (~30 FPS) when animating
const MAX_AGENTS = 4;      // the stage's four, as in magpie
const MAX_ACCOUNTS = 6;
const STAGE_STYLES = ["minimal", "stream", "magpie"];
const STAGE_STYLE_LABELS = { minimal: "Minimal", stream: "Stream", magpie: "Magpie" };

const PAD = 18, ROW_H = 28, ROW_GAP = 8;

const PALETTE = ["#d97757", "#bd8638", "#a59234", "#849e4a", "#5aa66c", "#25a98f",
  "#00a6b0", "#2e9fc9", "#5e95d7", "#858ad7", "#a47fca", "#bb77b1"];
const HUES = { claude: 0, codex: 9, gemini: 7, copilot: 10, cursor: 5, opencode: 2, crush: 11, goose: 3, pi: 4, omp: 11, omo: 10, dsh: 6 };

const BUILTIN_ICONS = {
  claude: "claudecode-color", "claude-code": "claudecode-color", anthropic: "claude-color",
  codex: "codex-color", openai: "openai", gemini: "geminicli-color",
  "gemini-web": "gemini-color", "ai-studio": "google-color", aistudio: "google-color",
  google: "google-color", vertexai: "vertexai-color", pi: "pi", "pi-desktop": "pi",
  pig: "pig", omp: "omp", omo: "omo", opencode: "opencode", goose: "goose",
  cursor: "cursor", windsurf: "windsurf", trae: "trae", cline: "cline", roocode: "roocode",
  kiro: "kiro-color", githubcopilot: "githubcopilot", copilot: "copilot-color",
  github: "github", kimi: "kimi", moonshot: "moonshot", agy: "antigravity-color",
  "agy-cli": "antigravity-color", antigravity: "antigravity-color", crush: "crush",
  alma: "alma-color", magpie: "magpie", "remote-magpie": "magpie", workbuddy: "workbuddy-color",
  "workbuddy-ai": "workbuddy-color", codebuddy: "codebuddy-color", devin: "devin",
  stepfun: "stepfun-color", arkapi: "arkapi", volcengine: "volcengine-color",
  doubao: "doubao-color", deepseek: "deepseek-color", qwen: "qwen-color",
  alibabacloud: "alibabacloud-color", bailian: "bailian-color", zhipu: "zhipu-color",
  chatglm: "chatglm-color", minimax: "minimax-color", mistral: "mistral-color",
  meta: "meta-color", grok: "grok", xai: "xai", groq: "groq", ollama: "ollama",
  openrouter: "openrouter", siliconcloud: "siliconcloud-color",
  cloudflare: "cloudflare-color", workersai: "workersai-color",
  perplexity: "perplexity-color", together: "together-color", fireworks: "fireworks-color",
  deepinfra: "deepinfra-color", hyperbolic: "hyperbolic-color", happycoding: "hyperbolic-color",
  submodel: "submodel-color", "agentrouter-github": "submodel-color",
  "agentrouter-linuxdo": "submodel-color", newapi: "newapi-color", aihubmix: "aihubmix-color",
  ppio: "ppio-color", qiniu: "qiniu-color", baidu: "baidu-color", hunyuan: "hunyuan-color",
  tencent: "tencent-color", spark: "spark-color", sensenova: "sensenova-color",
  baichuan: "baichuan-color", yi: "yi", zeroone: "zeroone", cohere: "cohere-color",
  cerebras: "cerebras", sambanova: "sambanova-color", novita: "novita-color",
  chutes: "chutes", lambda: "lambda", baseten: "baseten", replicate: "replicate",
  huggingface: "huggingface-color", vercel: "vercel", aws: "aws", bedrock: "bedrock-color",
  azure: "azure-color", nvidia: "nvidia-color", poe: "poe", monica: "monica-color", coze: "coze",
  "cline-pass": "cline", "stepfun-cn": "stepfun-color", "~keys": "magpie",
};

// UTF-8 string -> Base64, in plain ECMAScript: this mod runs inside Herdr's
// QuickJS, where neither Buffer nor unescape/encodeURI tricks can be counted
// on. An unpaired surrogate encodes as the replacement character, the way
// TextEncoder does.
function utf8ToBase64(str) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) { bytes.push(c); continue; }
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00); i++; }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], d = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (d ?? 0);
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63]
      + (b === undefined ? "=" : alphabet[(n >> 6) & 63])
      + (d === undefined ? "=" : alphabet[n & 63]);
  }
  return out;
}

const ICON_PATTERNS = [
  [/workbuddy/, "workbuddy-color"], [/codebuddy/, "codebuddy-color"], [/cline/, "cline"],
  [/ai-?studio|google/, "google-color"], [/gemini/, "gemini-color"],
  [/alma/, "alma-color"], [/agy|antigravity/, "antigravity-color"], [/claude|anthropic/, "claude-color"],
  [/codex/, "codex-color"], [/openai|gpt/, "openai"], [/deepseek/, "deepseek-color"],
  [/qwen|bailian|alibaba/, "qwen-color"], [/glm|zhipu/, "zhipu-color"],
  [/minimax/, "minimax-color"], [/step/, "stepfun-color"], [/devin/, "devin"],
  [/cursor/, "cursor"], [/kimi|moonshot/, "kimi"], [/grok|xai/, "grok"],
  [/doubao/, "doubao-color"], [/volc|ark/, "volcengine-color"],
  [/silicon/, "siliconcloud-color"], [/openrouter/, "openrouter"],
  [/cloudflare|workers/, "cloudflare-color"], [/ollama/, "ollama"],
  [/copilot/, "copilot-color"], [/github/, "github"], [/mistral/, "mistral-color"],
  [/hunyuan|tencent/, "hunyuan-color"], [/hyperbolic|happycoding/, "hyperbolic-color"],
  [/agentrouter|submodel/, "submodel-color"], [/newapi|oneapi/, "newapi-color"],
];

const PNG_ICONS = new Set([
  "pig", "crush", "arkapi", "aihubmix-color", "alibabacloud-color", "alma-color", "antigravity-color",
  "azure-color", "baichuan-color", "baidu-color", "bailian-color", "bedrock-color",
  "chatglm-color", "claude-color", "claudecode-color", "cloudflare-color", "codebuddy-color",
  "codex-color", "cohere-color", "copilot-color", "deepinfra-color", "deepseek-color",
  "doubao-color", "fireworks-color", "gemini-color", "geminicli-color", "google-color",
  "huggingface-color", "hunyuan-color", "hyperbolic-color", "kiro-color", "meta-color",
  "minimax-color", "mistral-color", "monica-color", "newapi-color", "novita-color",
  "nvidia-color", "perplexity-color", "ppio-color", "qiniu-color", "qwen-color",
  "sambanova-color", "sensenova-color", "siliconcloud-color", "spark-color", "stepfun-color",
  "submodel-color", "tencent-color", "together-color", "vertexai-color", "volcengine-color",
  "workbuddy-color", "workersai-color", "zhipu-color",
]);

const MONO_SVGS = new Set([
  "aws", "baseten", "cerebras", "chutes", "cline", "coze", "cursor", "devin",
  "generic", "github", "githubcopilot", "goose", "grok", "groq", "kimi", "lambda",
  "magpie", "moonshot", "ollama", "omo", "omp", "openai", "opencode", "openrouter",
  "pi", "poe", "replicate", "roocode", "trae", "vercel", "windsurf", "xai", "yi", "zeroone",
]);

const resolveIconName = (rawId, customMap) => {
  const s = String(rawId || "").toLowerCase().replace(/^remote-magpie\//, "");
  const mapped = customMap?.get(s) || customMap?.get(rawId);
  if (mapped && (PNG_ICONS.has(mapped) || MONO_SVGS.has(mapped))) return mapped;
  if (BUILTIN_ICONS[s]) return BUILTIN_ICONS[s];
  for (const [re, ic] of ICON_PATTERNS) if (re.test(s)) return ic;
  return "generic";
};

const iconNamed = (n, size, color) => {
  if (PNG_ICONS.has(n)) return image(`mods/routing/icons/${n}.png`).size(size).flex_none();
  return svg(`mods/routing/icons/${n}.svg`).size(size).flex_none().text_color(color);
};
const iconEl = (id, size, color, customMap) => iconNamed(resolveIconName(id, customMap), size, color);

// A provider's name as drawn. The gateway appends how it reaches a provider
// ("Antigravity (local agy CLI)"); in a row that also has to hold the readings
// that note only pushes the name into an ellipsis. A parenthesis that tells two
// providers apart ("StepFun (China)") is left alone.
const provLabel = (name) => String(name ?? "").replace(/\s*\(local\b[^)]*\)\s*$/i, "") || String(name ?? "");

const AGENT_LABELS = Object.assign(Object.create(null), {
  claude: "Claude", "claude-code": "Claude",
  codex: "Codex", alma: "Alma",
  magpie: "Magpie", "remote-magpie": "Magpie",
  gemini: "Gemini", "gemini-cli": "Gemini",
  cursor: "Cursor", opencode: "OpenCode",
  workbuddy: "WorkBuddy", "workbuddy-ai": "WorkBuddy",
  codebuddy: "CodeBuddy", windsurf: "Windsurf",
  roocode: "RooCode", cline: "Cline",
  copilot: "Copilot", githubcopilot: "Copilot",
  kiro: "Kiro", devin: "Devin", crush: "Crush",
  goose: "Goose", trae: "Trae",
  agy: "Agy", "agy-cli": "Agy", antigravity: "Antigravity",
  pi: "Pi", "pi-desktop": "Pi", pig: "Pig",
  omp: "OMP", omo: "OMO", dsh: "DSH",
});

const agentLabel = (id) => {
  const raw = String(id || "");
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (Object.hasOwn(AGENT_LABELS, lower)) return AGENT_LABELS[lower];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

// Exact canonical agent IDs accepted by `magpie <agent>` / `magpie models <agent>`.
const CLI_AGENT_ALIASES = Object.assign(Object.create(null), {
  "claude-code": "claude", claudecode: "claude", cc: "claude",
  "gemini-cli": "gemini", "agy-cli": "agy", "pi-desktop": "pi",
  githubcopilot: "copilot", oc: "opencode",
});

const CLI_AGENTS = new Set([
  "agy", "aionui", "air", "air-ide", "alma", "ante", "antigravity", "aside",
  "astrbot", "atomcode", "avibe", "cherrystudio", "cindy", "claude",
  "claude-desktop", "claude-science", "cline", "codebuddy", "codex",
  "commandcode", "copilot", "copilot-jetbrains", "craft-agents", "crush",
  "cursor", "cursor-local", "deveco", "devin", "dim", "droid", "ds-bot",
  "dsh", "empryo", "fx", "gemini", "goose", "grok", "grok-app", "hanako",
  "hermes", "jcode", "kigi", "kimi", "kirocrew", "kun", "liveagent", "lody",
  "mimocode", "minimax-code", "miniq", "morph", "mothx", "mu", "muse",
  "nanobot", "newmax", "nowledge-mem", "obsidian", "omo", "omp",
  "open-code-review", "openbot", "openchamber", "openclaw", "opencode",
  "openmausbot", "openpencil", "paimon", "paseo", "pencil", "penguin", "pi",
  "prime-agent", "qoder", "qoder-cn", "qwen", "qwenpaw", "raycast", "reasonix",
  "shelley", "snow", "stepcode", "t3code", "tuanjie-cowork", "vibe", "vscode",
  "vscode-insiders", "vscodium", "workbuddy", "workbuddy-ai", "zcode", "zed",
  "zoo-code",
]);

const resolveCliAgent = (id) => {
  const raw = String(id || "").trim().toLowerCase();
  if (!raw) return "";
  const canonical = Object.hasOwn(CLI_AGENT_ALIASES, raw) ? CLI_AGENT_ALIASES[raw] : raw;
  return CLI_AGENTS.has(canonical) ? canonical : "";
};

const shortQuotaError = (err, masked) => {
  const raw = String(err || "").trim();
  if (!raw) return "";
  if (!masked) return raw;
  const code = /\b([45]\d{2})\b/.exec(raw)?.[1];
  return code ? `Error (${code})` : "Error (masked)";
};

const shortModelName = (model, provider, acct) => {
  const m = String(model || "").trim();
  if (!m) return "";
  const slash = m.indexOf("/");
  if (slash > 0) {
    const prefix = m.slice(0, slash).toLowerCase();
    const rest = m.slice(slash + 1);
    if (rest && (prefix === String(provider || "").toLowerCase() || prefix === String(acct || "").toLowerCase())) {
      return rest;
    }
  }
  return m;
};

const HTTP_REASONS = Object.assign(Object.create(null), {
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
  408: "Timeout", 429: "Rate Limit", 500: "Server Error", 502: "Bad Gateway",
  503: "Unavailable", 504: "Gateway Timeout", 529: "Overloaded",
});

const PROMPT_PART_COLORS = Object.assign(Object.create(null), {
  system: "#64748b", tools: "#8b5cf6", skills: "#06b6d4",
  memory: "#10b981", results: "#f59e0b", chat: "#3b82f6",
});

const PROMPT_PART_NAMES = Object.assign(Object.create(null), {
  system: "sys", tools: "tools", skills: "skills",
  memory: "mem", results: "results", chat: "chat",
});

const stripAnsi = (s) => String(s ?? "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
const shellQuote = (s) => `'${String(s ?? "").replace(/'/g, "'\\''")}'`;

const parseAgentStatus = (stdout) => {
  for (const raw of stripAnsi(stdout).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.startsWith("  ") || /^\s*(magpie:|20\d\d\/|!)/.test(line)) continue;
    const effortMatch = /·\s*effort\s+([a-z0-9_-]+)/i.exec(line);
    const cols = line.trim().split(/\s{2,}/);
    const modelRaw = cols[1] && cols[1] !== "—" && !cols[1].startsWith("http") ? cols[1].trim() : "";
    return {
      model: modelRaw.replace(/^magpie\//, ""),
      effort: effortMatch ? effortMatch[1].toLowerCase() : "",
    };
  }
  return { model: "", effort: "" };
};

const parseAgentModels = (stdout) => {
  const models = [];
  const seen = new Set();
  for (const raw of stripAnsi(stdout).split(/\r?\n/)) {
    if (/^\s+\S+\s+is shown\b/i.test(raw) || /:\s+\d+\s+more models/i.test(raw)) break;
    const m = /^\s{2}([a-zA-Z0-9._:@-]+\/[a-zA-Z0-9._:@/-]+)\s{2,}(.+?)(?:\s{2,}((?:[a-z0-9-]+\/)+[a-z0-9-]+))?\s*$/.exec(raw);
    if (!m) continue;
    const id = m[1].trim();
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      label: m[2].trim(),
      efforts: m[3] ? m[3].trim().split("/") : [],
    });
  }
  return models;
};

const parseProfiles = (stdout) => {
  const out = [];
  for (const raw of stripAnsi(stdout).split(/\r?\n/)) {
    if (!/^\s{2}[^\s]/.test(raw)) continue;
    if (/^\s*(magpie:|20\d\d\/|\+|!)/.test(raw)) continue;
    const m = /^\s{2}([^\s:]+)\s{2,}(.+)$/.exec(raw);
    if (m) out.push({ name: m[1].trim(), summary: m[2].trim() });
  }
  return out;
};

const computeTimingPhases = (r) => {
  if (!r?.done || !(r.ms > 0)) return [];
  const total = Math.round(r.ms);
  const tr = r.tries?.[r.tries.length - 1];
  const mask = Math.max(0, Math.round(r.masking || 0));
  const netObj = tr?.net;
  const tlsAndConn = netObj ? ((netObj.pool || ((netObj.dns || 0) + (netObj.connect || 0) + (netObj.tls || 0))) + (netObj.send || 0) + (netObj.wait || 0)) : 0;
  let net = Math.max(0, Math.round(tlsAndConn));
  let think = (r.firstReasoning != null && r.firstText != null && r.firstText > r.firstReasoning)
    ? Math.round(r.firstText - r.firstReasoning)
    : Math.max(0, Math.round(r.reasoning || 0));
  let stream = r.flow > 0 ? Math.round(r.flow) : 0;
  if (!net && !think && !stream && r.ttft != null) {
    net = Math.max(0, Math.round(r.ttft - mask));
    stream = Math.max(0, Math.round(total - r.ttft));
  } else if (!stream && r.ttft != null && total > r.ttft + think) {
    stream = Math.max(0, Math.round(total - r.ttft - think));
  }
  const raw = [
    mask >= 20 ? { label: "Mask", ms: mask, color: "#8b5cf6" } : null,
    net >= 20 ? { label: "Net", ms: net, color: "#06b6d4" } : null,
    think >= 20 ? { label: "Think", ms: think, color: "#f59e0b" } : null,
    stream >= 20 ? { label: "Stream", ms: stream, color: "#10b981" } : null,
  ].filter(Boolean);
  if (!raw.length) return [];
  const sum = raw.reduce((s, p) => s + p.ms, 0);
  if (sum <= 0) return [];
  return raw;
};

const hueOf = (id) => {
  const s = String(id || "");
  if (HUES[s] !== undefined) return PALETTE[HUES[s]];
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
// eased in and out, as a bird glides to land — client.js frame()
const easeIO = (k) => (1 - Math.cos(Math.PI * k)) / 2;
const rgba = (hex, a) => {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(a) ? a : 0));
  return `#${hex.slice(1)}${Math.round(clamped * 255).toString(16).padStart(2, "0")}`;
};

export default class Routing extends View {
  init(_props, cx) {
    this.routes = new Map();
    this.seq = 0;
    this.loaded = false;
    this.offline = "Connecting to Magpie…";
    this.remote = null;
    this.remoteLabel = "localhost · 127.0.0.1:3425";
    this.baseUrl = DEFAULT_BASE_URL;
    this.configReady = false;
    this.configError = false; // config.json exists but does not parse: never fall back to default-local CLI control
    this.providerIcons = new Map();
    this.totals = { requests: 0, rerouted: 0, errors: 0 };
    this.agents = [];   // [{id, color}]
    this.accounts = []; // [{key, name, model}]
    this.flights = new Map(); // route id -> flight
    this.shakes = new Map();
    this.ticks = new Map();
    this.size = { width: 336, height: 200 };
    this.hoveredAgent = null;
    this.hoveredAcct = null;
    this.selectedAgent = null;
    this.selectedAcct = null;
    this.expandedRouteId = null;
    this.masked = true; // magpie's Hide-accounts switch: every page hides them
    this.quotas = {};
    this.quotasAt = 0;
    this.quotaOpen = false;
    this.quotaBusy = false;
    this.expandedProviders = new Set();
    this.expandedAccounts = new Set();
    this.providerOrder = [];
    this.accountOrder = {};
    this.dragProvider = null;
    this.overProvider = null;
    this.dragAcct = null;
    this.overAcct = null;
    this.loadQuotaPrefs();
    this.traceBusy = false;
    this.lastSecTick = 0;
    this.modVersion = "";    // mods/routing/VERSION, shipped beside main.js
    // what the last look found and when, kept across reloads so a restart
    // shows a known update at once and does not ask GitHub again
    this.upd = { latest: "", checkedAt: 0, triedAt: 0, fails: 0, seen: "" };
    this.updateChecking = false;
    this.updateBusy = false;
    this.updateError = "";
    this.loadUpdateState();
    this.stageStyle = "minimal";
    this.stageHovered = false;
    this.loadStagePrefs();
    this.statusFilter = null; // null | "active" | "error"
    this.agentMenu = null;    // { agent, rowIndex, loading, busy, error, currentModel, currentEffort, models }
    this.profileMenuOpen = false;
    this.hoveredQuotaProv = null;
    this.profiles = [];
    this.profilesLoaded = false;
    this.profilesInFlight = null;
    this.profileBusy = "";
    this.activeProfile = "";
    this.agentMenuGen = 0;
    this.agentWrites = new Map();
    this.agentWriteSeq = 0;
    this.agentWriteDoneSeq = new Map();
    this.traceGen = 0;
    this.traceInFlight = null;
    // when the newest failed request of this generation finished, kept even
    // after its route row falls off the 60-entry history — the red dot in
    // the tab bar measures real time, not how many rows are still buffered
    this.lastErrorDoneAt = 0;
    this.quotaFetchSeq = 0;
    this.quotaInFlight = null;
    this.quotaHistory = new Map();
    this.alertsEnabled = true;
    this.alertCooldowns = new Map();
    this.prevQuotaLeft = new Map();
    this.prevQuotaTier = new Map();
    this.notifiedErrors = new Set();
    this._lastSharedSig = "";
    this.loadAlertPrefs();
    this.demo = false; // config.json's "demo": renders mods/routing/demo.json, asks no gateway
    this._estWCache = new Map();
    this._fitCache = new Map();
    this._flatCache = new Map();
    this._curveCache = new Map();

    cx.spawn(async (cx) => {
      await this.initTarget(cx);
      if (this.demo) return; // a demo stage is still: no polling, no frame timer
      cx.spawn(async (cx2) => this.poll(cx2));
      cx.spawn(async (cx2) => this.pollQuota(cx2));
    });
    // once a minute, against the wall clock rather than a long sleep: a laptop
    // that slept through the night is overdue the moment it wakes
    cx.timer.every(60000, (cx) => {
      this.maybeCheckUpdate(cx, "routine");
      if (this.syncSharedStatus()) cx.notify();
    });
    cx.timer.every(FRAME, (cx) => {
      if (this.demo) return;
      const now = Date.now();
      let changed = false;
      let goneAny = false;
      for (const [id, f] of this.flights) {
        const prevState = f.state;
        const prevPhase = f.phase;
        this.advance(f, now);
        if (f.state !== prevState || f.phase !== prevPhase) changed = true;
        if (f.state === "gone") { this.flights.delete(id); changed = true; goneAny = true; }
      }
      if (goneAny) {
        this.trimRoutes();
        this.recompute();
      }
      for (const [k, t0] of this.shakes) if (now - t0 > 450) { this.shakes.delete(k); changed = true; }
      for (const [k, t0] of this.ticks) if (now - t0 > 400) { this.ticks.delete(k); changed = true; }
      const inFlightAny = [...this.routes.values()].some((r) => !r.done);
      const needsFlow = inFlightAny && this.stageStyle !== "minimal";
      const needsFly = this.stageStyle !== "minimal" && [...this.flights.values()].some((f) => f.state === "fly");
      const animating = needsFlow || needsFly || this.shakes.size > 0 || this.ticks.size > 0;
      const secTick = inFlightAny && (now - this.lastSecTick >= 1000);
      if (secTick) this.lastSecTick = now;
      if (animating || changed || secTick) cx.notify();
    });
  }

  execOpts(timeout = 30000) {
    return this.remote ? { on: this.remote, timeout } : { timeout };
  }

  cliControlState() {
    if (this.demo) return { targetOk: false, writable: false, reason: "Disabled in demo mode" };
    if (!this.configReady) return { targetOk: false, writable: false, reason: "Loading configuration…" };
    if (this.configError) return { targetOk: false, writable: false, reason: "config.json is invalid — CLI controls disabled" };
    if (this.remote) return { targetOk: false, writable: false, reason: "CLI controls unavailable for remote gateway" };
    const norm = String(this.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "").toLowerCase();
    const def = DEFAULT_BASE_URL.replace(/\/$/, "").toLowerCase();
    const localhostAlias = def.replace("127.0.0.1", "localhost");
    const ipv6Alias = def.replace("127.0.0.1", "[::1]");
    if (norm !== def && norm !== localhostAlias && norm !== ipv6Alias) {
      return { targetOk: false, writable: false, reason: `CLI controls target local ${DEFAULT_BASE_URL} only` };
    }
    if (this.offline) return { targetOk: true, writable: false, reason: "Gateway offline — CLI controls disabled" };
    return { targetOk: true, writable: true, reason: "" };
  }

  async initTarget(cx) {
    let cfg = null;
    let rawCfg = null;
    try {
      rawCfg = await readTextFile(`${appHome()}/mods/routing/config.json`);
    } catch (_) { rawCfg = null; /* no config.json: the default local gateway, as before */ }
    if (rawCfg) {
      try {
        // a config written by Windows PowerShell 5.1 carries a UTF-8 BOM,
        // which JSON.parse rejects outright — strip the BOM, never the data
        cfg = JSON.parse(String(rawCfg).replace(/^\uFEFF/, ""));
        if (cfg.remote !== undefined) this.remote = cfg.remote || null;
        if (cfg.baseUrl) this.baseUrl = String(cfg.baseUrl).replace(/\/$/, "");
        if (cfg.label) this.remoteLabel = String(cfg.label);
        else if (this.remote) this.remoteLabel = `${this.remote} · ${this.baseUrl.replace(/^https?:\/\//, "")}`;
        if (cfg.stageStyle && STAGE_STYLES.includes(cfg.stageStyle)) this.stageStyle = cfg.stageStyle;
      } catch (_) {
        // the file is there but does not parse: that is a broken install,
        // not an unconfigured one. Refusing CLI control beats silently
        // treating the gateway as the default local one and writing into
        // the wrong magpie's agent configs.
        this.configError = true;
      }
    }
    if (cfg?.demo) {
      this.demo = true;
      await this.loadDemo(cx);
      if (cfg.stageStyle && STAGE_STYLES.includes(cfg.stageStyle)) this.stageStyle = cfg.stageStyle;
      cx.notify();
      return;
    }
    this.configReady = true;
    this.discoverProviders().then(() => cx.notify()).catch(() => {});
    this.loadProfiles(cx).catch(() => {});
    this.readModVersion().then(() => {
      this.announceVersion();
      cx.notify();
      this.maybeCheckUpdate(cx, "routine"); // asks GitHub only if the kept answer is stale
    }).catch(() => {});
    cx.notify();
  }

  // demo.json is a still of the stage — fake agents, accounts, flights and
  // allowances — for screenshots and for trying the mod before a gateway
  // exists. Times in it are relative (`ago`, `resetsIn`, seconds) so a shot
  // taken months later still reads as now.
  async loadDemo(cx) {
    const now = Date.now();
    let d = null;
    try {
      const raw = await readTextFile(`${appHome()}/mods/routing/demo.json`);
      d = JSON.parse(raw || "{}");
    } catch (e) {
      this.offline = `demo.json: ${String(e).slice(0, 160)}`;
      cx.notify();
      return;
    }
    if (d.label) this.remoteLabel = String(d.label);
    this.pid = d.pid ?? null;
    this.totals = { requests: 0, rerouted: 0, errors: 0, ...(d.totals || {}) };
    this.agents = (d.agents || []).map((a) => ({ id: String(a.id || a), color: hueOf(a.id || a) }));
    this.accounts = (d.accounts || []).map((a) => ({
      key: a.key, name: a.name || a.key, who: a.who || "", model: a.model || "",
    }));
    this.routes.clear();
    for (const r of d.routes || []) {
      const route = {
        ...r,
        time: new Date(now - (r.ago ?? 0) * 1000).toISOString(),
        tries: (r.tries || []).map((tr) => ({ ...tr })),
      };
      this.routes.set(route.id, route);
    }
    this.flights.clear();
    for (const f of d.flights || []) {
      this.flights.set(f.id, {
        id: f.id, agent: f.agent, color: hueOf(f.agent), seat: f.seat,
        state: "held", phase: f.phase || "out", tryIndex: 0, bird: null, err: Boolean(f.err),
      });
    }
    const rawQuotas = [];
    if (Array.isArray(d.quotas)) {
      for (const q of d.quotas) rawQuotas.push(q);
    } else {
      for (const [id, q] of Object.entries(d.quotas || {})) {
        if (Array.isArray(q?.accounts)) {
          for (const a of q.accounts) rawQuotas.push({ provider: q.provider || id, name: q.name || id, ...a });
        } else {
          rawQuotas.push({ provider: q?.provider || id, name: q?.name || id, ...(q || {}) });
        }
      }
    }
    this.quotas = this.groupQuotaEntries(rawQuotas, now);
    this.quotasAt = now - (d.quotasAgo ?? 60) * 1000;
    this.expandedRouteId = d.expandedRouteId ?? null;
    this.quotaOpen = Boolean(d.quotaOpen);
    // what is unfolded and in which order is the fixture's to say, so the stage
    // looks the same on every machine whatever was folded there before
    this.expandedProviders = new Set((d.expandedProviders || []).map(String));
    this.expandedAccounts = new Set((d.expandedAccounts || []).map(String));
    this.providerOrder = [];
    this.accountOrder = {};
    this.masked = d.masked !== false;
    this.loaded = true;
    this.configReady = true;
    this.offline = "";
    cx.notify();
  }

  // herdr's window() is a function that reports metadata; during `herdr-app
  // check` (no window exists) it answers null. Anything but "windows" --
  // including not knowing -- means the Unix path, which is what a remote
  // Linux host reached through herdr-core needs too.
  isWindows() {
    try { return herdrWindow?.()?.platform === "windows"; } catch (_) { return false; }
  }

  async discoverProviders() {
    try {
      // magpie's providers.json sits next to the rest of its config: under
      // XDG_CONFIG_HOME when that is set (absolute paths only), else in the
      // profile's .config. On Windows neither /bin/sh nor ~/ exists, so the
      // same probe is phrased for PowerShell; a remote host always gets the
      // shell form, whatever the panel's own platform is.
      let r;
      if (!this.remote && this.isWindows()) {
        // magpie's appdir rules, phrased for PowerShell: an XDG_CONFIG_HOME
        // that is a full path (a drive one, or a UNC share spelled either
        // way -- \\\\server\\share and //server/share both count, a lone
        // leading \\foo or /foo does not -- and a drive-relative C:x does
        // not count either, IsPathRooted mistakes it for absolute) is the
        // ONLY config root then; when the file is not there there is no
        // falling back to the profile's copy. Only an unset or non-absolute
        // XDG_CONFIG_HOME reads the profile one.
        const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
          + "$xdg = [string]$env:XDG_CONFIG_HOME;"
          + "$p = $null;"
          + "if ($xdg -match '^[A-Za-z]:[\\\\/]|^[\\\\/]{2}') { $p = Join-Path (Join-Path $xdg 'magpie') 'providers.json' }"
          + "elseif (-not [string]::IsNullOrEmpty($env:USERPROFILE)) { $p = Join-Path (Join-Path (Join-Path $env:USERPROFILE '.config') 'magpie') 'providers.json' };"
          + "if ($p -and (Test-Path -LiteralPath $p)) { Get-Content -Raw -Encoding UTF8 -LiteralPath $p }";
        r = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], this.execOpts(10000));
      } else {
        const sh = 'if [ -n "$XDG_CONFIG_HOME" ] && [ "${XDG_CONFIG_HOME#/}" != "$XDG_CONFIG_HOME" ]; then'
          + ' cat "$XDG_CONFIG_HOME/magpie/providers.json" 2>/dev/null;'
          + ' else cat ~/.config/magpie/providers.json 2>/dev/null; fi || true';
        r = await exec("sh", ["-c", sh], this.execOpts(10000));
      }
      if (!r.stdout) return;
      const d = JSON.parse(r.stdout);
      for (const p of d.providers || []) {
        if (p.id && p.icon && !String(p.icon).startsWith("file:")) {
          this.providerIcons.set(String(p.id).toLowerCase(), String(p.icon));
        }
      }
    } catch (_) { /* optional discovery */ }
  }

  // sentAfter/sentPid/sentGen are read off the live state when the request
  // goes out, not when the answer comes back: a gateway restart in between
  // is exactly what they are for. A snapshot of a process that no longer
  // exists must never roll seq or routes back; a snapshot of a new process
  // starts a new generation exactly once, however many in-flight requests
  // of the old generation report it.
  applyTraceSnapshot(d, cx, { sentAfter = this.seq, sentPid = this.pid, sentGen = this.traceGen, fromPoll = false } = {}) {
    if (!d || d.object !== "trace") throw new Error(d?.error?.message || "not a trace");
    // A generation change after the request went out plus a reply pid that
    // is not the process now in charge: the answer comes from the dead one,
    // and applying it would roll seq back over the new gateway's routes.
    // The second in-flight answer of the NEW process passes this test
    // (its pid IS this.pid) and is applied without a second clear below.
    if (sentGen !== this.traceGen && d.pid !== this.pid) return false;
    const newProcess = d.pid != null && this.pid != null && d.pid !== this.pid;
    if (!newProcess && sentAfter !== this.seq && d.seq <= this.seq) return false;
    if (d.seq < this.seq || newProcess) {
      this.routes.clear();
      this.flights.clear();
      this.notifiedErrors.clear();
      this.lastErrorDoneAt = 0;
      this.traceGen += 1;
    }
    this.seq = d.seq;
    this.totals = d.totals || this.totals;
    this.pid = d.pid ?? this.pid;
    const first = !this.loaded;
    const toStart = [];
    for (const r of Array.isArray(d.routes) ? d.routes : []) {
      for (const o of r.order || []) {
        if (o.id && o.icon && !String(o.icon).startsWith("file:")) {
          this.providerIcons.set(String(o.id).toLowerCase(), String(o.icon));
        }
        if (o.provider && o.icon && !String(o.icon).startsWith("file:")) {
          this.providerIcons.set(String(o.provider).toLowerCase(), String(o.icon));
        }
      }
      const prev = this.routes.get(r.id);
      const isNew = !prev;
      this.routes.set(r.id, r);
      if (isNew && (!first || !r.done)) toStart.push(r);
      if (r.done && r.status >= 400) {
        const startedAt = r.time ? Date.parse(r.time) : NaN;
        const finishedAt = Number.isFinite(startedAt) ? startedAt + Math.max(0, Number(r.ms) || 0) : NaN;
        if (Number.isFinite(finishedAt) && finishedAt > (this.lastErrorDoneAt || 0)) this.lastErrorDoneAt = finishedAt;
        if (first) this.notifiedErrors.add(r.id);
        else if (!prev?.done) this.maybeAlertError(r);
      }
    }
    this.trimRoutes(d.ids);
    this.loaded = true;
    this.failCount = 0;
    const reconnected = Boolean(this.offline);
    if (reconnected && fromPoll) this.maybeCheckUpdate(cx, "online");
    this.offline = "";
    this.recompute();
    for (const r of toStart) if (this.routes.has(r.id)) this.start(r);
    if ((reconnected || !this.profilesLoaded) && this.cliControlState().targetOk) {
      this.loadProfiles(cx).catch(() => {});
    }
    cx?.notify();
    return true;
  }

  async poll(cx) {
    for (;;) {
      try {
        const sentAfter = this.seq;
        const sentPid = this.pid;
        const sentGen = this.traceGen;
        const url = `${this.baseUrl}/v1/magpie/trace?after=${sentAfter}${this.loaded ? "&wait=1" : ""}`;
        const r = await exec("curl", ["-sS", "--max-time", "35", url], this.execOpts(40000));
        const d = JSON.parse(r.stdout);
        this.applyTraceSnapshot(d, cx, { sentAfter, sentPid, sentGen, fromPoll: true });
      } catch (e) {
        this.failCount = (this.failCount || 0) + 1;
        if (!this.routes.size || this.failCount >= 3) {
          this.offline = `Remote trace error: ${String(e).slice(0, 240)}`;
          this.loaded = false;
          this.profilesLoaded = false;
          this.closeMenus(cx);
          this.syncSharedStatus();
          cx.notify();
        }
        await cx.sleep(4000);
      }
    }
  }

  // The account label a masked panel may show. An alias that contains an
  // account address (@), or that is nothing but the address spelled again
  // (alias === user), leaks exactly what masked mode exists to hide: it is
  // refused and the caller falls back to "Account N". A real chosen name
  // (Ultra, Pro, Spare 1) carries no address and stays visible.
  safeAcctAlias(q) {
    const alias = String(q?.alias || "").trim();
    if (!alias) return "";
    if (!this.masked) return alias;
    if (alias.includes("@")) return "";
    if (alias === String(q?.user || "").trim()) return "";
    return alias;
  }

  winLeft(w) {
    if (w?.unlimited) return 100;
    if (w?.remaining != null) return w.remaining;
    if (w?.used != null) return Math.max(0, 100 - w.used);
    return 100;
  }

  // How long a window runs, in hours, read off its name ("5 hours", "7 days",
  // "Gemini · 7 days", "weekly"); null when the name is not a span of time.
  winSpan(name) {
    const tail = String(name || "").split("·").pop().trim().toLowerCase();
    const word = { hourly: 1, daily: 24, weekly: 168, monthly: 720 }[tail];
    if (word) return word;
    const m = /^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|month|months)$/.exec(tail);
    if (!m) return null;
    const unit = m[2][0] === "h" ? 1 : m[2][0] === "d" ? 24 : m[2][0] === "w" ? 168 : m[2].startsWith("mo") ? 720 : 1 / 60;
    return Number(m[1]) * unit;
  }

  // What one account has left, one answer per allowance. Windows that stack on
  // the same allowance (5 hours inside 7 days) are never averaged: the longest
  // one is the allowance (`long`), the shortest only paces it (`pace`). The
  // allowance is spent as soon as any of its windows is -- back when the last
  // spent one resets -- so `left` is 0 then, however full the others report.
  // `state` says which: "spent" when the longest window is empty, "paused"
  // when only a shorter one is. Windows that are not spans of time (one per
  // model, one per meter) each stand alone.
  allowances(windows) {
    const stacks = new Map(), out = [];
    for (const w of windows) {
      const span = this.winSpan(w.name);
      if (span == null) {
        const left = this.winLeft(w);
        out.push({ label: `w:${String(w.name || "").toLowerCase()}`, left, resetsAt: w.resetsAt || "",
          long: null, pace: null, state: !w.unlimited && Math.round(left) <= 0 ? "spent" : "ok" });
        continue;
      }
      const key = (w.pool || (w.name.includes("·") ? w.name.split("·")[0] : "")).trim().toLowerCase();
      if (!stacks.has(key)) stacks.set(key, []);
      stacks.get(key).push({ w, span });
    }
    for (const [key, stack] of stacks) {
      const longest = stack.reduce((a, b) => (b.span > a.span ? b : a));
      const shortest = stack.reduce((a, b) => (b.span < a.span ? b : a));
      const part = (s) => ({ left: this.winLeft(s.w), resetsAt: s.w.resetsAt || "" });
      const isSpent = (s) => !s.w.unlimited && Math.round(this.winLeft(s.w)) <= 0;
      const spent = stack.filter(isSpent);
      const resets = spent.map((s) => s.w.resetsAt).filter(Boolean).sort();
      out.push({
        label: `s:${key}`,
        left: spent.length ? 0 : this.winLeft(longest.w),
        resetsAt: spent.length ? (resets[resets.length - 1] || "") : (longest.w.resetsAt || ""),
        long: part(longest),
        pace: shortest === longest ? null : part(shortest),
        state: isSpent(longest) ? "spent" : spent.length ? "paused" : "ok",
      });
    }
    return out;
  }

  // The folded reading of a set of allowances, as coloured pieces of text:
  // percentages only, the short window first and the long one after it, the
  // same for every provider.
  //  - one window:                  "75%"
  //  - 5 hours inside 7 days:       "71% · 96%" -- each in its own
  //    traffic-light colour
  //  - only the short window empty: "0% · 80%"
  //  - several allowances (one per model pool): each column shows its
  //    tightest pool, so a pool running out is never averaged away
  //  - nothing left to call (every allowance's long window is empty):
  //    "Exhausted", however full the short windows report
  // `compact` is the one-number form for the summary strip.
  quotaRead(allows, compact = false) {
    const RED = "#e26a6a", GOLD = "#d4b06a", GREEN = "#34d399";
    const tone = (v) => (v < 10 ? RED : v < 30 ? GOLD : GREEN);
    const pct = (v) => Math.max(0, Math.round(v));
    if (!allows?.length) return null;
    if (allows.every((a) => a.state === "spent")) {
      return { segs: [{ text: compact ? "0%" : "Exhausted", color: RED, strong: true }] };
    }
    const long = Math.min(...allows.map((a) => pct(a.long ? a.long.left : a.left)));
    const paces = allows.filter((a) => a.pace).map((a) => pct(a.pace.left));
    const pace = paces.length ? Math.min(...paces) : null;
    if (pace == null || compact) {
      const v = pace === 0 ? 0 : long; // a spent short window blocks calls too
      return { segs: [{ text: `${v}%`, color: tone(v), strong: true }] };
    }
    return { segs: [
      { text: `${pace}%`, color: tone(pace), strong: true },
      { text: "·", color: null, sep: true },
      { text: `${long}%`, color: tone(long), strong: true },
    ] };
  }

  // An account can hold several model families at once (Antigravity: a Gemini
  // allowance and a Claude & GPT one, each a 5 hours inside a 7 days). One pair
  // cannot stand for both: its tightest 5 hours and its tightest 7 days may
  // belong to different families. So such an account reads as one quotaRead per
  // family, each led by the family's own icon:
  //     [gemini] 97% · 87%   [claude] 100% · 10%
  // Pools that share an icon are one family (Gemini and a single Gemini model's
  // weekly cap), read by the tightest of each column as any set of pools is.
  // Returns [{ icon, allows }] in a fixed order, or null when there is nothing
  // to tell apart: fewer than two families, a pool with no icon of its own to
  // go by, allowances that are not pools, or nothing left anywhere (that is
  // just "Exhausted").
  quotaFamilies(allows) {
    if (!allows || allows.length < 2) return null;
    if (allows.every((a) => a.state === "spent")) return null;
    const fams = new Map();
    for (const a of allows) {
      const pool = String(a.label || "").startsWith("s:") ? a.label.slice(2) : "";
      const hit = pool ? ICON_PATTERNS.find(([re]) => re.test(pool)) : null;
      if (!hit) return null;
      if (!fams.has(hit[1])) fams.set(hit[1], []);
      fams.get(hit[1]).push(a);
    }
    if (fams.size < 2) return null;
    const rank = (icon) => (/gemini/.test(icon) ? 0 : /claude/.test(icon) ? 1 : 2);
    return [...fams].map(([icon, list]) => ({ icon, allows: list }))
      .sort((a, b) => rank(a.icon) - rank(b.icon) || a.icon.localeCompare(b.icon));
  }

  normalizeQuotaItem(p, now = Date.now()) {
    const provider = String(p?.provider || p?.id || "unknown");
    const baseProvider = provider.replace(/^remote-magpie\//, "");
    const windows = (p?.windows || []).map((w) => ({
      name: w.name || "",
      remaining: w.remaining,
      used: w.used,
      resetsAt: w.resetsIn != null ? new Date(now + w.resetsIn * 1000).toISOString() : (w.resetsAt || ""),
      pool: w.pool || "",
      text: Boolean(w.text),
      display: w.display || "",
      amount: w.amount,
      limit: w.limit,
      unit: w.unit || "",
      unlimited: Boolean(w.unlimited),
    }));
    const totalExact = windows.find((w) => w.name === "Total" && !w.text);
    const totalCredits = windows.find((w) => /^total\s+credits$/i.test(w.name) && !w.text);
    const total = totalExact || totalCredits;
    const groups = new Map();
    for (const w of windows) {
      if (w.name === "Total" || w.text) continue;
      const cleanName = w.pool ? w.name : w.name.replace(/\s*\((high|medium|low)\)|-tiered$/i, "");
      let key;
      if (w.pool) {
        key = `pool:${w.pool}|${w.resetsAt || cleanName}`;
      } else if (w.amount != null || w.limit != null || w.unit) {
        key = `meter:${cleanName.toLowerCase()}`;
      } else if (cleanName.includes("·")) {
        const prefix = cleanName.split("·")[0].trim().toLowerCase();
        key = `group:${prefix}|${w.resetsAt || cleanName}`;
      } else {
        const pctKey = Math.round(this.winLeft(w) * 10);
        key = w.resetsAt ? `at:${w.resetsAt}|${pctKey}` : `no:${cleanName}`;
      }
      const cur = groups.get(key);
      if (!cur) { groups.set(key, { ...w, name: cleanName }); continue; }
      if (w.pool && !cur.pool) groups.set(key, { ...w, name: cleanName });
    }
    let shown = [...groups.values()];
    if (baseProvider === "cursor" && shown.some((w) => /grok/i.test(w.name))) {
      shown = shown.filter((w) => /grok/i.test(w.name));
    }
    const hadText = Boolean(p?.hadText) || windows.some((w) => w.text);
    const nonTotal = shown.filter((w) => !/^total\s+credits$/i.test(w.name));
    const avgSource = nonTotal.length ? nonTotal : shown;
    const reported = p?.left !== undefined && p?.left !== null && !(p?.windows || []).length;
    const byTotal = !reported && baseProvider !== "cursor" && Boolean(total);
    const single = (left, resetsAt) => [{ label: "s:", left, resetsAt: resetsAt || "", long: null, pace: null,
      state: Math.round(left) <= 0 ? "spent" : "ok" }];
    const held = reported || byTotal ? [] : this.allowances(avgSource);
    const allow = reported ? single(Number(p.left)) : byTotal ? single(this.winLeft(total), total.resetsAt) : held;
    // one number for the dot and for ordering: the scarcest allowance. It is
    // never drawn as "the" share when there are several (see quotaRead).
    const shownLeft = allow.length ? Math.min(...allow.map((h) => h.left)) : null;
    // the reset that goes with that number: the one that brings a spent
    // allowance back, else the soonest among the allowances counted
    const heldResets = held.map((h) => h.resetsAt).filter(Boolean).sort();
    // several allowances: a blocked one is what the reader is waiting for
    const blockedResets = held.filter((h) => Math.round(h.left) <= 0).map((h) => h.resetsAt).filter(Boolean).sort();
    const leftResetsAt = held.length === 1 ? held[0].resetsAt : (blockedResets[0] || heldResets[0] || "");
    return {
      provider,
      baseProvider,
      left: shownLeft,
      allow,
      leftResetsAt,
      name: p?.name || provider,
      plan: p?.plan || "",
      alias: p?.alias || "",
      user: p?.user || "",
      from: p?.from || "",
      until: p?.until || "",
      renew: p?.renew || "",
      windows: shown,
      hadText,
      kind: p?.kind || ((p?.balance || (p?.error && !(p?.windows || []).length)) ? "balance" : "subscription"),
      balance: p?.balance || "",
      error: p?.error || "",
      balanceError: "",
    };
  }

  loadQuotaPrefs() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("routing.quotaPrefs") : null;
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d?.quotaOpen === "boolean") this.quotaOpen = d.quotaOpen;
      if (Array.isArray(d?.expandedProviders)) this.expandedProviders = new Set(d.expandedProviders.map(String));
      if (Array.isArray(d?.expandedAccounts)) this.expandedAccounts = new Set(d.expandedAccounts.map(String));
      if (Array.isArray(d?.providerOrder)) this.providerOrder = d.providerOrder.map(String);
      if (d?.accountOrder && typeof d.accountOrder === "object" && !Array.isArray(d.accountOrder)) {
        this.accountOrder = d.accountOrder;
      }
    } catch (_) { /* ignore storage errors */ }
  }

  saveQuotaPrefs() {
    try {
      // a demo stage's folds and order are demo.json's, never the person's own
      if (this.demo || typeof localStorage === "undefined") return;
      localStorage.setItem("routing.quotaPrefs", JSON.stringify({
        quotaOpen: Boolean(this.quotaOpen),
        expandedProviders: [...this.expandedProviders],
        expandedAccounts: [...this.expandedAccounts],
        providerOrder: this.providerOrder,
        accountOrder: this.accountOrder,
      }));
    } catch (_) { /* ignore storage errors */ }
  }

  orderedProviders() {
    const entries = Object.entries(this.quotas || {});
    if (!this.providerOrder?.length) return entries;
    const rank = new Map(this.providerOrder.map((id, i) => [id, i]));
    return [...entries].sort(([a], [b]) => {
      const ra = rank.has(a) ? rank.get(a) : 1e9;
      const rb = rank.has(b) ? rank.get(b) : 1e9;
      return ra - rb;
    });
  }

  orderedAccounts(provId, accounts) {
    const list = accounts || [];
    const order = this.accountOrder?.[provId];
    if (!Array.isArray(order) || !order.length) return list;
    const rank = new Map(order.map((k, i) => [k, i]));
    return [...list].sort((a, b) => {
      const ra = rank.has(a.key) ? rank.get(a.key) : 1e9;
      const rb = rank.has(b.key) ? rank.get(b.key) : 1e9;
      return ra - rb;
    });
  }

  finishProviderDrag(clickedId, provIds) {
    const from = this.dragProvider;
    const over = this.overProvider;
    this.dragProvider = null;
    this.overProvider = null;
    if (!from) return;
    if (over && from !== over) {
      const list = [...provIds];
      const fromIdx = list.indexOf(from);
      const toIdx = list.indexOf(over);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        list.splice(fromIdx, 1);
        list.splice(toIdx, 0, from);
        this.providerOrder = list;
        this.saveQuotaPrefs();
      }
    } else if (clickedId === from) {
      if (this.expandedProviders.has(from)) this.expandedProviders.delete(from);
      else this.expandedProviders.add(from);
      this.saveQuotaPrefs();
    }
  }

  finishAcctDrag(provId, clickedKey, acctKeys) {
    if (!this.dragAcct || this.dragAcct.prov !== provId) return;
    const from = this.dragAcct.key;
    const over = this.overAcct;
    this.dragAcct = null;
    this.overAcct = null;
    if (!from) return;
    if (over && from !== over) {
      const list = [...acctKeys];
      const fromIdx = list.indexOf(from);
      const toIdx = list.indexOf(over);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        list.splice(fromIdx, 1);
        list.splice(toIdx, 0, from);
        this.accountOrder = { ...this.accountOrder, [provId]: list };
        this.saveQuotaPrefs();
      }
    } else if (clickedKey === from) {
      const foldKey = `${provId}::${from}`;
      if (this.expandedAccounts.has(foldKey)) this.expandedAccounts.delete(foldKey);
      else this.expandedAccounts.add(foldKey);
      this.saveQuotaPrefs();
    }
  }

  groupQuotaEntries(items, now = Date.now()) {
    const grouped = {};
    const mergeBalance = (target, balEntry) => {
      if (balEntry.balance && !target.balance) target.balance = balEntry.balance;
      else if (balEntry.error && !target.balance && !target.balanceError) target.balanceError = balEntry.error;
    };
    for (const raw of items || []) {
      if (raw?.provider && raw?.icon && !String(raw.icon).startsWith("file:")) {
        this.providerIcons.set(String(raw.provider).toLowerCase(), String(raw.icon));
      }
      const entry = this.normalizeQuotaItem(raw, now);
      const prov = entry.provider;
      if (!grouped[prov]) {
        grouped[prov] = { provider: prov, baseProvider: entry.baseProvider, name: entry.name, accounts: [] };
      } else if (grouped[prov].name === prov && entry.name && entry.name !== prov) {
        grouped[prov].name = entry.name;
      }
      const accounts = grouped[prov].accounts;
      const u = entry.user.trim().toLowerCase();
      const al = entry.alias.trim().toLowerCase();
      const isBal = entry.kind === "balance";
      const matchIdx = accounts.findIndex((cur) => {
        const curIsBal = cur.kind === "balance";
        if (isBal === curIsBal) return false;
        const target = isBal ? cur : entry;
        if (target.balance || target.balanceError) return false;
        const cu = cur.user.trim().toLowerCase();
        const cal = cur.alias.trim().toLowerCase();
        if ((u || al) && (cu || cal)) return u === cu && al === cal;
        return true;
      });
      if (matchIdx >= 0) {
        const cur = accounts[matchIdx];
        if (isBal) mergeBalance(cur, entry);
        else {
          mergeBalance(entry, cur);
          accounts[matchIdx] = entry;
        }
      } else {
        accounts.push(entry);
      }
    }

    for (const group of Object.values(grouped)) {
      const accts = group.accounts;
      const seenKeys = new Map();
      accts.forEach((a, i) => {
        a.num = i + 1;
        const u = a.user.trim().toLowerCase();
        const al = a.alias.trim().toLowerCase();
        const baseKey = u ? `u:${u}` : al ? `a:${al}` : `n:${a.num}`;
        const cnt = (seenKeys.get(baseKey) || 0) + 1;
        seenKeys.set(baseKey, cnt);
        a.key = cnt > 1 ? `${baseKey}#${cnt}` : baseKey;
      });

      if (accts.length > 1) {
        // Unify credit breakdown (Credits / Extra credits / Total credits) across accounts of the same provider
        const hasCreditBreakdown = accts.some((a) =>
          a.windows.some((w) => /^extra\s+credits$/i.test(w.name)) &&
          a.windows.some((w) => /^total\s+credits$/i.test(w.name)));
        if (hasCreditBreakdown) {
          for (const a of accts) {
            const cred = a.windows.find((w) => /^credits$/i.test(w.name));
            if (!cred) continue;
            if (!a.windows.some((w) => /^extra\s+credits$/i.test(w.name))) {
              a.windows.push({
                name: "Extra credits",
                used: 100,
                remaining: 0,
                resetsAt: "",
                pool: "",
                text: false,
                display: "0 / 0",
                unit: cred.unit || "credits",
                unlimited: false,
              });
            }
            if (!a.windows.some((w) => /^total\s+credits$/i.test(w.name))) {
              a.windows.push({
                name: "Total credits",
                used: cred.used,
                remaining: cred.remaining,
                resetsAt: cred.resetsAt || "",
                pool: "",
                text: false,
                display: cred.display || "",
                unit: cred.unit || "credits",
                unlimited: false,
              });
            }
          }
        }

        // Unify 5-hour / 7-day paired pool windows when an exhausted 7-day pool omits its 5-hour window
        const fiveHourByPrefix = new Map();
        for (const a of accts) {
          for (const w of a.windows) {
            if (w.name.includes("·") && /5\s*h/i.test(w.name)) {
              const prefix = w.name.split("·")[0].trim().toLowerCase();
              if (!fiveHourByPrefix.has(prefix)) fiveHourByPrefix.set(prefix, w);
            }
          }
        }
        if (fiveHourByPrefix.size) {
          for (const a of accts) {
            for (const [prefix, tpl] of fiveHourByPrefix) {
              const has5h = a.windows.some((w) =>
                w.name.includes("·") && w.name.split("·")[0].trim().toLowerCase() === prefix && /5\s*h/i.test(w.name));
              if (has5h) continue;
              const w7d = a.windows.find((w) =>
                w.name.includes("·") && w.name.split("·")[0].trim().toLowerCase() === prefix && /7\s*d/i.test(w.name));
              if (w7d && this.winLeft(w7d) <= 0) {
                a.windows.push({
                  name: tpl.name,
                  used: 100,
                  remaining: 0,
                  resetsAt: w7d.resetsAt || "",
                  pool: w7d.pool || tpl.pool || "",
                  text: false,
                  display: "",
                  unit: "",
                  unlimited: false,
                });
              }
            }
          }
        }
      }
    }
    return grouped;
  }

  // one quotas read; without kept=1 the gateway asks the vendors again
  // (provider.QuotaReport), so this is a live refresh not a cache copy
  async fetchQuotas(cx) {
    if (this.demo) return;
    if (this.quotaInFlight) return this.quotaInFlight;
    const mySeq = ++this.quotaFetchSeq;
    this.quotaBusy = true;
    cx?.notify();
    const t0 = Date.now();
    this.quotaInFlight = (async () => {
      try {
        const r = await exec("curl", ["-sS", "--max-time", "20", `${this.baseUrl}/v1/magpie/quotas`],
          this.execOpts(25000));
        const d = JSON.parse(r?.stdout || "{}");
        if (mySeq !== this.quotaFetchSeq) return;
        if (!Array.isArray(d?.data)) {
          throw new Error(d?.error?.message || "invalid quota payload");
        }
        const qNow = Date.now();
        this.quotas = this.groupQuotaEntries(d.data, qNow);
        this.quotasAt = qNow;
        this.recordQuotaTelemetry(qNow);
        this.syncSharedStatus(qNow);
        cx?.notify();
      } finally {
        const held = Date.now() - t0;
        if (held < 800 && cx?.sleep) await cx.sleep(800 - held);
        if (mySeq === this.quotaFetchSeq) {
          this.quotaBusy = false;
          this.quotaInFlight = null;
          cx?.notify();
        }
      }
    })();
    return this.quotaInFlight;
  }

  async refreshAll(cx) {
    if (this.demo) return;
    if (this.traceInFlight) return this.traceInFlight;
    this.traceBusy = true;
    cx?.notify();
    this.traceInFlight = (async () => {
      try {
        const sentAfter = this.seq;
        const sentPid = this.pid;
        const sentGen = this.traceGen;
        const url = `${this.baseUrl}/v1/magpie/trace?after=${sentAfter}`;
        const r = await exec("curl", ["-sS", "--max-time", "15", url], this.execOpts(20000));
        const d = JSON.parse(r?.stdout || "{}");
        if (d?.object === "trace") {
          this.applyTraceSnapshot(d, cx, { sentAfter, sentPid, sentGen, fromPoll: false });
        }
      } catch (_) { /* keep existing state */ }
      finally {
        this.traceBusy = false;
        this.traceInFlight = null;
        cx?.notify();
      }
    })();
    this.fetchQuotas(cx).catch(() => {});
    return this.traceInFlight;
  }

  // provider quotas, refreshed on its own slower beat
  async pollQuota(cx) {
    for (;;) {
      try { await this.fetchQuotas(cx); } catch (e) { /* keep the last numbers */ }
      await cx.sleep(60000);
    }
  }

  fmtAgo(ms) {
    if (ms < 0) ms = 0;
    if (ms < 90000) return `${Math.max(1, Math.round(ms / 60000))}m ago`;
    return `${(ms / 3600000).toFixed(1)}h ago`;
  }
  fmtUntil(iso) {
    if (!iso) return "";
    const ms = Date.parse(iso) - Date.now();
    if (ms <= 0) return "soon";
    const m = Math.round(ms / 60000);
    if (m < 60) return `in ${m}m`;
    const h = Math.round(ms / 3600000);
    if (h < 48) return `in ${h}h`;
    const d = Math.round(ms / 86400000);
    return `in ${d}d`;
  }
  // Keep every active (!r.done) route and every route whose flight is still on
  // stage; only evict finished history past 60, so a long stream isn't dropped
  // and re-started as "new" on subsequent gateway deltas.
  trimRoutes(ids) {
    if (Array.isArray(ids)) {
      const kept = new Set(ids);
      for (const [id, r] of this.routes) {
        if (!r.done && !kept.has(id)) {
          this.routes.delete(id);
          this.flights.delete(id);
        }
      }
    }
    const removable = [...this.routes.entries()]
      .filter(([id, r]) => r.done && !this.flights.has(id))
      .map(([id]) => id)
      .sort((a, b) => a - b);
    const keepDone = Math.max(0, 60 - (this.routes.size - removable.length));
    for (const id of removable.slice(0, Math.max(0, removable.length - keepDone))) {
      this.routes.delete(id);
    }
  }

  // Resolve a seat actually tried by `r` into { key, name, who, model }, using
  // `r.order` only as metadata lookup rather than populating untried fallbacks.
  seatEntry(r, tr) {
    if (!tr) return null;
    const meta = (r.order || []).find((o) =>
      (tr.id && (o.id === tr.id || o.who === tr.id)) ||
      (!tr.id && tr.who && o.who === tr.who));
    const key = tr.id || meta?.id || tr.who || meta?.who ||
      ((tr.provider || meta?.provider) ? `${tr.provider || meta?.provider}/${tr.name || meta?.name || ""}` : "");
    if (!key) return null;
    return {
      key,
      name: provLabel(tr.name || meta?.name || tr.provider || meta?.provider || tr.who || meta?.who || key),
      who: tr.who || meta?.who || "",
      model: tr.model || meta?.model || r.served || r.model || "",
    };
  }

  recompute() {
    const all = [...this.routes.values()].sort((a, b) => b.id - a.id);
    const isLive = (r) => {
      if (!r.done) return true;
      const f = this.flights.get(r.id);
      return Boolean(f && f.state !== "gone");
    };
    const liveRoutes = all.filter(isLive);
    const doneRoutes = all.filter((r) => !isLive(r)).slice(0, 40);
    // Live / still-flying routes claim stage slots ahead of finished history,
    // and only tried seats (`r.tries`) for on-stage agents enter the right
    // column — untried fallback candidates never sit as unconnected pills.
    const ordered = [...liveRoutes, ...doneRoutes];
    const agents = [], seenA = new Set();
    for (const r of ordered) {
      const id = r.agent || "agent";
      if (!seenA.has(id)) { seenA.add(id); agents.push({ id, color: hueOf(id) }); }
      if (agents.length >= MAX_AGENTS) break;
    }
    const onStageAgents = new Set(agents.map((a) => a.id));
    const accounts = [], seen = new Map();
    for (const r of ordered) {
      if (!onStageAgents.has(r.agent || "agent")) continue;
      for (const tr of [...(r.tries || [])].reverse()) {
        const seat = this.seatEntry(r, tr);
        if (!seat || seen.has(seat.key)) continue;
        seen.set(seat.key, true);
        accounts.push(seat);
        if (accounts.length >= MAX_ACCOUNTS) break;
      }
      if (accounts.length >= MAX_ACCOUNTS) break;
    }
    agents.reverse();
    accounts.reverse();
    // first-seen order: a row keeps its slot for good, new names only
    // take free slots; nothing hops around and nothing flickers
    this.agents = this.stable(this.agents, agents, "id", MAX_AGENTS);
    this.accounts = this.stable(this.accounts, accounts, "key", MAX_ACCOUNTS);
    this.syncSharedStatus();
  }

  stable(oldRows, freshRows, k, max) {
    const byKey = new Map(freshRows.map(r => [r[k], r]));
    const rows = [];
    // a row keeps its old slot, its data refreshed from the fresh pass
    for (const o of oldRows) {
      const f = byKey.get(o[k]);
      if (f) { byKey.delete(o[k]); rows.push({ ...o, ...f }); }
    }
    // never-seen names take the free slots below the old ones
    for (const r of freshRows) if (byKey.has(r[k])) rows.push(r);
    while (rows.length > max) rows.shift();
    return rows;
  }

  estTextW(s, px, bold = false) {
    // calibrated against measured SF Pro / Inter sans-serif widths so fitText
    // uses available width cleanly without prematurely chopping model names.
    const str = String(s || "");
    if (!str) return 0;
    const cache = this._estWCache;
    const key = cache ? `${px}|${bold ? 1 : 0}|${str}` : "";
    if (cache) {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
    }
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      // a surrogate pair is one astral code point, counted once as wide
      // (for..of iteration semantics); only a real pair skips the trailing
      // half — a lone high surrogate must not swallow the code unit after it
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const lo = str.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) { w += px * 1.00; i++; continue; }
      }
      if (c > 255) { w += px * 1.00; continue; }
      const ch = str[i];
      if (ch === "m" || ch === "w") w += px * 0.80;
      else if (ch === "M" || ch === "W" || ch === "G" || ch === "O" || ch === "Q" || ch === "D" || ch === "%") w += px * 0.78;
      else if (c >= 65 && c <= 90) w += px * 0.67;
      else if (c >= 48 && c <= 57) w += px * 0.56;
      else if (ch === "-") w += px * 0.38;
      else if (
        ch === "i" || ch === "I" || ch === "l" || ch === "." || ch === "," ||
        ch === ":" || ch === ";" || ch === "|" || ch === "!" || ch === "(" ||
        ch === ")" || ch === "[" || ch === "]" || ch === " " || ch === "t" ||
        ch === "f" || ch === "r" || ch === "j"
      ) w += px * 0.33;
      else w += px * 0.53;
    }
    if (bold) w *= 1.04;
    const res = w > 0 ? Math.ceil(w) + 1 : 0;
    if (cache) {
      if (cache.size > 512) cache.clear();
      cache.set(key, res);
    }
    return res;
  }

  // Hard-truncate a string to `budget` px without adding an ellipsis.
  fitText(s, px, budget, bold = false) {
    s = String(s || "");
    if (!s || budget <= 0) return "";
    const cache = this._fitCache;
    // estTextW always answers an integer, so a fractional budget below X
    // truncates exactly like floor(X): the cache key is the floor, never the
    // round — rounding 26.8 up to 27 would serve a too-long cached answer.
    const key = cache ? `${px}|${bold ? 1 : 0}|${Math.floor(budget)}|${s}` : "";
    if (cache) {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
    }
    const w = (str) => this.estTextW(str, px, bold);
    let out = s;
    if (w(out) > budget) {
      while (out.length > 0 && w(out) > budget) out = out.slice(0, -1);
    }
    if (cache) {
      if (cache.size > 512) cache.clear();
      cache.set(key, out);
    }
    return out;
  }

  geometry() {
    const W = this.size.width || 336;
    // Adaptive height: fit active stage rows with symmetric top/bottom padding
    // (at least 1 row so an empty stage still reads cleanly as a card)
    const n = Math.max(1, (this.agents || []).length, (this.accounts || []).length);
    const H = 2 * PAD + n * ROW_H;
    const cy = (i) => PAD + i * ROW_H + ROW_H / 2;
    const ax = W < 280 ? 2 : 5;
    // Left chip chrome: BORDER(2) + px(5)*2(10) + ICON_BOX(13) + GAP(4) = 29
    const AGENT_CHROME = 29;
    const agentNeed = (this.agents || []).reduce(
      (m, a) => Math.max(m, AGENT_CHROME + this.estTextW(agentLabel(a?.id), 11, true)), 56);
    const agentMax = Math.min(104, Math.max(76, Math.round(W * 0.28)));
    const agentW = Math.max(56, Math.min(agentMax, agentNeed));

    const BORDER = 2, PAD_X = 6, DOT = 6, DOT_GAP = 5, SEP_GAP = 4, SEP_W = 1, DIVIDER_W = SEP_GAP * 2 + SEP_W;
    const hasModel = (this.accounts || []).some((a) => Boolean(shortModelName(a?.model, "", a?.name)));
    const chromeW = BORDER + PAD_X * 2 + DOT + DOT_GAP + (hasModel ? DIVIDER_W : 0);
    let rawNameW = 0, rawModelW = 0;
    for (const a of this.accounts || []) {
      rawNameW = Math.max(rawNameW, this.estTextW(a?.name, 11, true));
      const mLabel = shortModelName(a?.model, "", a?.name);
      if (mLabel) rawModelW = Math.max(rawModelW, this.estTextW(mLabel, 9.5, false));
    }

    // Reserve at least minSky for the S-curve corridor on narrow panels;
    // when W is wider, anchor the account pills flush to the right edge (W - ax)
    // so the middle wire corridor stretches naturally.
    const minSky = Math.max(48, Math.round(W * 0.18));
    const maxAcctW = Math.min(280, Math.max(92, W - 2 * ax - agentW - minSky));
    const pillW = Math.max(64, Math.min(maxAcctW, Math.round(rawNameW + rawModelW + chromeW)));
    const sx = Math.max(ax + agentW + minSky, W - ax - pillW);
    const acctW = Math.max(64, Math.min(pillW, W - ax - sx));
    const sky = sx - (ax + agentW);
    return {
      W, H, agentW, acctW, sky,
      gapX: (ax + agentW + sx) / 2, // the middle of the sky between the columns
      agent: (i) => ({ x1: ax, x2: ax + agentW, cy: cy(i) }),
      acct: (i) => ({ x1: sx, x2: sx + acctW, cy: cy(i) }),
    };
  }

  agentIndex(id) { return this.agents.findIndex(a => a.id === id); }
  acctIndex(key) { return this.accounts.findIndex(a => a.key === key); }
  acctOf(key) { return this.accounts[this.acctIndex(key)]; }
  agentBox(id) { return this.geometry().agent(this.agentIndex(id)); }
  acctBox(key) { return this.geometry().acct(this.acctIndex(key)); }

  // the seat a try went to, as a row on the stage — a seat the column
  // doesn't show yet joins it only when its agent is on the stage too
  seatOf(r, i) {
    const seat = this.seatEntry(r, r.tries?.[i]);
    if (!seat) return null;
    if (this.acctIndex(seat.key) >= 0) return seat.key;
    if (this.agentIndex(r.agent || "agent") >= 0 && this.accounts.length < MAX_ACCOUNTS) {
      this.accounts.push(seat);
      return seat.key;
    }
    return null;
  }

  // ---------- the bird's paths ----------

  // Every wire is one smooth S curve from an agent's port to an account's
  // dot — the same curve shape magpie's own Routing page draws. There is no
  // Z-shaped detour and no missing vertical piece: the visible wire and the
  // bird's flight are generated from the same cubic, so they meet exactly.
  curveBetween(ai, si, g = this.geometry()) {
    const a = g.agent(ai), s = g.acct(si);
    if (!a || !s || ai < 0 || si < 0) return null;
    const x0 = a.x2 + 4, y0 = a.cy;
    const x3 = s.x1 - 4, y3 = s.cy;
    const mx = (x0 + x3) / 2;
    return { x0, y0, mx, y3, x3, seg: [x0, y0, mx, y0, mx, y3, x3, y3] };
  }

  // the way out: the smooth wire itself
  outSegs(f) {
    const c = this.curveBetween(this.agentIndex(f.agent), this.acctIndex(f.seat));
    return c ? [c.seg] : null;
  }

  // the way home: exactly the same smooth curve, reversed
  backSegs(f) {
    const c = this.curveBetween(this.agentIndex(f.agent), this.acctIndex(f.seat));
    return c ? [[c.x3, c.y3, c.mx, c.y3, c.mx, c.y0, c.x0, c.y0]] : null;
  }

  // a failed seat to the next: one broad, smooth U through the open sky,
  // never a corner or a broken piece
  retrySegs(f, fromSeat) {
    const i1 = this.acctIndex(fromSeat), i2 = this.acctIndex(f.seat);
    const g = this.geometry(), s1 = g.acct(i1), s2 = g.acct(i2);
    if (!s1 || !s2 || i1 < 0 || i2 < 0) return null;
    const x0 = s1.x1 + 3, y0 = s1.cy, x3 = s2.x1 + 3, y3 = s2.cy;
    const mx = Math.min(x0, x3) - Math.min(58, 24 + Math.abs(y3 - y0) * .18);
    return [[x0, y0, mx, y0, mx, y3, x3, y3]];
  }

  // where a request sits while routing hasn't picked a seat for it yet
  waitPos(f) {
    const a = this.agentBox(f.agent);
    return a ? { x: a.x2 + 12, y: a.cy } : null;
  }

  // flat: a path as points close together with the length along it — the
  // same sampling client.js flat() does for its own M/C wires.
  flat(segs) {
    const xs = [], ys = [], len = [];
    const to = (x, y) => {
      const j = xs.length - 1;
      len.push(j < 0 ? 0 : len[j] + Math.hypot(x - xs[j], y - ys[j]));
      xs.push(x); ys.push(y);
    };
    for (const s of segs || []) {
      if (!xs.length) to(s[0], s[1]);
      if (s.length === 4) { to(s[2], s[3]); continue; }
      const P = s;
      let hull = 0;
      for (let j = 2; j < 8; j += 2) hull += Math.hypot(P[j] - P[j - 2], P[j + 1] - P[j - 1]);
      const steps = Math.max(1, Math.ceil(hull / 2));
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, u = 1 - t;
        const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        let x = 0, y = 0;
        w.forEach((wi, q) => { x += wi * P[2 * q]; y += wi * P[2 * q + 1]; });
        to(x, y);
      }
    }
    return xs.length > 1 && len[len.length - 1] > 0 ? { xs, ys, len, L: len[len.length - 1] } : null;
  }

  pointAt(poly, s) {
    const { xs, ys, len } = poly;
    s = Math.max(0, Math.min(poly.L, s));
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (len[mid] <= s) lo = mid; else hi = mid; }
    const f = len[hi] > len[lo] ? (s - len[lo]) / (len[hi] - len[lo]) : 0;
    return { x: xs[lo] + (xs[hi] - xs[lo]) * f, y: ys[lo] + (ys[hi] - ys[lo]) * f };
  }

  // ---------- the flight, magpie's play()/fly()/pose() ----------

  start(r) {
    const id = r.agent || "agent";
    // an agent the column doesn't show yet joins it when a slot is free
    if (this.agentIndex(id) < 0 && this.agents.length < MAX_AGENTS) {
      this.agents.push({ id, color: hueOf(id) });
    }
    this.flights.set(r.id, {
      id: r.id, agent: id, color: hueOf(id),
      state: "wait", phase: null, tryIndex: 0, seat: null,
      segs: null, ms: 0, t0: Date.now(), pos: null, vel: null, dir: 1,
      bird: null, birdT0: 0, awayT0: null, awayDir: 1,
      back: false, err: false, held: false, swapped: false,
    });
  }

  segsOf(f) { return (typeof f.segs === "function" ? f.segs() : f.segs) || []; }

  flyTo(f, segs, phase, ms, { back = false, err = false, bird = "req" } = {}) {
    const get = typeof segs === "function" ? segs : () => segs;
    const L = this.flat(get())?.L || 200;
    f.segs = get; f.ms = ms(L); f.t0 = Date.now();
    f.phase = phase; f.state = "fly"; f.back = back; f.err = err;
    f.held = false; f.swapped = false;
    // An agent keeps at most two magpies in the air — one "req" out, one
    // "res" home. A burst of requests of one agent shares them: further
    // packets still glide along their wires, but no extra bird spawns
    // (a flock of overlapping birds reads as clutter, not as traffic).
    if (bird) {
      const busy = [...this.flights.values()].some((o) =>
        o !== f && o.bird === bird && o.agent === f.agent && o.state === "fly");
      if (!busy) { f.bird = bird; f.birdT0 = Date.now(); f.awayT0 = null; }
    }
  }

  advance(f, now) {
    const r = this.routes.get(f.id);
    if (!r) { f.state = "gone"; return; }
    switch (f.state) {
      case "wait": {
        // the request sits at its agent while routing hasn't picked yet
        const p = this.waitPos(f); if (p) f.pos = p;
        if (f.tryIndex < (r.tries?.length || 0)) this.beginTry(f, r);
        else if (r.done) f.state = "gone";
        return;
      }
      case "fly": {
        const e = easeIO(Math.min(1, (now - f.t0) / f.ms));
        this.pose(f, e);
        // a retry's loop: past the dive's far point the failed packet has
        // been handed back and a fresh one is on its way out
        if (f.phase === "retry" && !f.swapped && f.vel && f.vel.x > 0) {
          f.swapped = true; f.back = false; f.err = false;
        }
        if (now - f.t0 < f.ms) return;
        if (f.phase === "out" || f.phase === "retry") {
          // let go at the account: it waits there while it answers
          f.state = "held"; f.held = true;
          f.awayT0 = now; f.awayDir = f.dir ?? 1;
          f.bird = null;
        } else if (f.phase === "back") {
          this.ticks.set(f.agent, now);
          // the bird lands the answer at its agent and flies off; the
          // packet is handed over at once, its flight lingers for rtaway
          f.awayT0 = now; f.awayDir = -1; f.bird = null; f.held = false;
          f.state = "away";
        }
        return;
      }
      case "away": {
        if (now - f.awayT0 > 450) f.state = "gone";
        return;
      }
      case "held": {
        // the packet hovers at the wire's tip, just outside the seat — a
        // full circle in the gap, not a red blob pressed on the button
        const s = this.acctBox(f.seat);
        if (s) f.pos = { x: s.x1 - 7, y: s.cy };
        const tr = r.tries?.[f.tryIndex];
        if (!tr) { f.held = false; f.state = r.done ? "gone" : "wait"; return; }
        if (!tr.done) return;
        f.held = false;
        const ok = tr.status >= 200 && tr.status < 400;
        if (ok) { f.state = "waitDone"; return; }
        this.shakes.set(f.seat, now);
        const last = f.tryIndex >= (r.tries?.length || 0) - 1;
        const over = r.done || (!tr.rest && !tr.credits && (!tr.again || tr.gone)) || last;
        const nextSeat = this.seatOf(r, f.tryIndex + 1);
        if (!over && nextSeat && nextSeat !== f.seat) {
          // dive back through the sky to the seat routing tries next
          f.prevSeat = f.seat; f.seat = nextSeat; f.tryIndex++;
          this.flyTo(f, () => this.retrySegs(f, f.prevSeat) || [], "retry",
            (L) => Math.max(1600, Math.min(6400, 4400 * L / 400)), { back: true, err: true, bird: "res" });
        } else {
          if (!this.backSegs(f)) { f.state = "gone"; return; }
          this.flyTo(f, () => this.backSegs(f) || [], "back",
            (L) => Math.max(1680, Math.min(7200, 5600 * L / 900)), { back: true, err: true, bird: "res" });
        }
        return;
      }
      case "waitDone": {
        const s = this.acctBox(f.seat);
        if (s) f.pos = { x: s.x1 - 7, y: s.cy };
        if (!r.done) return;
        if (!this.backSegs(f)) { f.state = "gone"; return; }
        this.flyTo(f, () => this.backSegs(f) || [], "back",
          (L) => Math.max(1680, Math.min(7200, 5600 * L / 900)), { back: true, err: false, bird: "res" });
        return;
      }
    }
  }

  beginTry(f, r) {
    if (this.agentIndex(f.agent) < 0) {
      if (r.done) f.state = "gone";
      return;
    }
    const seat = this.seatOf(r, f.tryIndex);
    if (!seat) {
      if (r.done) f.state = "gone";
      else f.tryIndex++;
      return;
    }
    f.seat = seat;
    if (!this.outSegs(f)) { f.seat = null; f.tryIndex++; return; }
    this.flyTo(f, () => this.outSegs(f) || [], "out",
      (L) => Math.max(1600, Math.min(7200, 5600 * L / 900)), { bird: "req" });
  }

  // pose puts the dot e of the way along, and its magpie with it, heading
  // the way it flies — client.js pose()
  pose(f, e) {
    const poly = this.flat(this.segsOf(f));
    if (!poly) return;
    const edge = Math.min(6, poly.L / 4);
    const d = edge + e * (poly.L - 2 * edge);
    const pt = this.pointAt(poly, d);
    const p0 = this.pointAt(poly, d - 3), p1 = this.pointAt(poly, d + 3);
    let vx = p1.x - p0.x, vy = p1.y - p0.y;
    if (Math.abs(vx) + Math.abs(vy) < .01) { vx = f.vel?.x ?? (f.back ? -1 : 1); vy = 0; }
    f.vel = { x: vx, y: vy };
    f.dir = vx < 0 ? -1 : 1;
    f.pos = pt;
  }

  // ---------- drawing ----------

  flier(f, now) {
    // The magpie, drawn to fly: tail, body, belly, head, beak and a wing
    // each side that beats from the shoulder — client.js FLIER/rtflap.
    // The dot it carries is at the tip of its beak.
    const left = f.dir === -1;
    const sfx = left ? "-l" : "";
    // the dot it carries is at the tip of its beak — the right end facing
    // right, the left end facing left; scaled to 60% of magpie's bird
    const W = 27.4, H = 22.3;
    // The packet sits at the beak's tip: 25.5 px in from the left on the
    // right-facing sprite, 1.9 px in on the left-facing one (its -l art
    // lives in the -4..34 half of the shared viewBox). Before this the
    // beak overshot the dot by ~22 px and the bird trailed its packet.
    const ox = f.pos.x - (left ? 1.9 : 25.5), oy = f.pos.y - 14.3;
    const come = Math.min(1, (now - f.birdT0) / 300); // rtcome
    const away = f.awayT0 ? Math.min(1, (now - f.awayT0) / 450) : 0; // rtaway
    const dx = -6 * (1 - come) + 14 * away * (f.awayDir || 1);
    const dy = -10 * (1 - come) - 16 * away;
    const op = come * (1 - away);
    const part = (name, color, opacity) =>
      svg(`mods/routing/flier-${name}${sfx}.svg`).absolute().left(ox + dx).top(oy + dy)
        .w(W).h(H).text_color(color).opacity(opacity * op);
    const t = theme();
    const body = t.foreground;
    const u = Math.floor((now - f.birdT0) / 210) % 2 ? "down" : "up";
    const uf = Math.floor((now - f.birdT0 - 70) / 210) % 2 ? "down" : "up";
    return [
      part(`far-${uf}`, body, .45),
      part("body", body, 1),
      part("belly", t.raised, 1),
      part(`near-${u}`, body, 1),
      part(`bar-${u}`, t.raised, .85),
    ];
  }

  /* The rendered page is the original Magpie panel: a titled preview card
   * (the wires + the flying bird), then the request list under one
   * "Requests" header that carries the counts, then a single-line footer.
   * Active rows lead the list; their gold dot is what sets them apart. */

  fmtTok(n) {
    if (!n) return "—";
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
    return String(n);
  }
  fmtMs(ms) {
    if (ms == null) return "—";
    if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  }
  fmtElapsed(ms) {
    if (ms < 1000) return "<1s";
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
  toksPerS(r) {
    const out = r.out ?? 0, ms = r.ms ?? 0;
    if (!ms || !out) return "—";
    // streamed replies decode between ttft and done — out/(ms-ttft) is
    // the real rate when that stretch is the bulk of the request. A
    // short tail (the answer landed in one lump, or under a quarter of
    // the request) measures a burst not a rate, so report end-to-end
    // throughput instead of a thousand-tok/s fiction
    const tail = ms - (r.ttft ?? 0);
    const gen = tail >= 500 && tail >= ms * 0.25 ? tail : ms;
    return `${Math.max(1, Math.round(out / (gen / 1000)))} tok/s`;
  }

  // The share of the prompt read from the vendors' cache, as magpie's own
  // routing page reads it (routing/client.js promptOf): input excludes both
  // cache tiers, writes count in the denominator, and a vendor that counts no
  // cache tokens (Kiro, cache_unknown) has no rate at all rather than 0%.
  // The trace's usage[] is per try, so a retried request's billable attempts
  // are all counted. null when nothing is known.
  cacheHit(r) {
    let prompt = 0, read = 0;
    for (const u of r?.usage || []) {
      if (u.cache_unknown) continue;
      read += u.cache_read || 0;
      prompt += (u.in || 0) + (u.cache_read || 0) + (u.cache_write || 0);
    }
    if (!prompt) return null;
    return Math.round((read / prompt) * 100);
  }

  // ---- updates ---------------------------------------------------------
  // The files under ~/.config/herdr-app are the install, so the mod updates
  // itself the way the installer would: find the newest release, verify it,
  // lay it down. Herdr's hot reload picks the new files up on its own.
  //
  // When GitHub is asked (never in demo mode, never twice at once):
  //   start / reload   only when the kept answer is older than UPDATE_EVERY;
  //                    a known update shows at once from the kept answer
  //   routine          every UPDATE_EVERY, measured by the wall clock
  //   asked            the person pressed Refresh: at most every UPDATE_ASKED
  //   online           the gateway came back and the last look had failed
  //   failed look      again after UPDATE_RETRY (2m, 10m, 30m, then hourly)
  //   install          the release is resolved once more right before it is laid down
  loadStagePrefs() {
    try {
      const v = typeof localStorage !== "undefined" ? localStorage.getItem("routing.stageStyle") : null;
      if (v && STAGE_STYLES.includes(v)) this.stageStyle = v;
    } catch (_) { /* ignore storage errors */ }
  }

  saveStagePrefs() {
    if (this.demo) return;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("routing.stageStyle", this.stageStyle);
    } catch (_) { /* ignore storage errors */ }
  }

  cycleStageStyle(cx) {
    const i = STAGE_STYLES.indexOf(this.stageStyle);
    this.stageStyle = STAGE_STYLES[(i + 1) % STAGE_STYLES.length];
    this.saveStagePrefs();
    cx.notify();
  }

  loadAlertPrefs() {
    try {
      const v = typeof localStorage !== "undefined" ? localStorage.getItem("routing.alerts") : null;
      if (v === "false" || v === "0") this.alertsEnabled = false;
      else if (v === "true" || v === "1") this.alertsEnabled = true;
    } catch (_) { /* ignore storage errors */ }
  }

  saveAlertPrefs() {
    if (this.demo) return;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("routing.alerts", this.alertsEnabled ? "true" : "false");
    } catch (_) { /* ignore storage errors */ }
  }

  toggleAlerts(cx) {
    this.alertsEnabled = !this.alertsEnabled;
    this.saveAlertPrefs();
    cx.notify();
  }

  async runMagpieCli(args, timeout = 12000) {
    if (!this.remote && this.isWindows()) {
      return exec("magpie", args, this.execOpts(timeout));
    }
    const cmd = `PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" magpie ${args.map(shellQuote).join(" ")}`;
    return exec("sh", ["-c", cmd], this.execOpts(timeout));
  }

  spawnAction(cx, fn) {
    if (typeof cx?.spawn === "function") cx.spawn(async (cx2) => { await fn(cx2); });
    else fn(cx);
  }

  closeMenus(cx) {
    if (!this.agentMenu && !this.profileMenuOpen) return;
    this.agentMenuGen += 1;
    this.agentMenu = null;
    this.profileMenuOpen = false;
    cx?.notify();
  }

  async loadProfiles(cx) {
    if (!this.cliControlState().targetOk) {
      this.profiles = [];
      this.profilesLoaded = false;
      this.activeProfile = "";
      this.profileMenuOpen = false;
      return;
    }
    if (this.profilesInFlight) return this.profilesInFlight;
    this.profilesInFlight = (async () => {
      try {
        const r = await this.runMagpieCli(["profiles"], 10000);
        if (!this.cliControlState().targetOk) return;
        this.profilesLoaded = true;
        if (r?.code !== 0 && !r?.stdout) return;
        const list = parseProfiles(r.stdout || "");
        this.profiles = list;
        if (this.activeProfile && !list.some((p) => p.name === this.activeProfile)) {
          this.activeProfile = "";
        }
        cx?.notify();
      } catch (_) { /* magpie CLI optional */ }
      finally {
        this.profilesInFlight = null;
      }
    })();
    return this.profilesInFlight;
  }

  async applyProfile(name, cx) {
    // a profile switch rewrites every agent's config at once: it never runs
    // beside a single-agent write, and never beside another profile switch
    if (!this.cliControlState().writable || this.profileBusy || this.agentWrites.size > 0) return;
    this.profileBusy = name;
    cx?.notify();
    try {
      const r = await this.runMagpieCli(["use", name], 15000);
      if (r?.code === 0) {
        this.activeProfile = name;
        this.profileMenuOpen = false;
        notify({ title: "Magpie Profile", level: "success", timeout: 4000, body: `Switched to ${name}` });
      } else {
        // stderr carries the profile's file paths and model ids; masked
        // privacy mode answers with a classed summary instead
        const msg = this.masked
          ? `Failed to switch profile${r?.code != null ? ` (exit ${r.code})` : ""}`
          : stripAnsi(r?.stderr || r?.stdout || "failed").trim().split(/\r?\n/).pop() || `magpie use ${name} failed`;
        notify({ title: "Magpie Profile Error", level: "error", timeout: 6000, body: msg });
      }
    } catch (e) {
      notify({ title: "Magpie Profile Error", level: "error", timeout: 6000,
        body: this.masked ? "Failed to switch profile" : String(e?.message || e) });
    } finally {
      this.profileBusy = "";
      cx?.notify();
    }
  }

  async openMagpiePanel(cx) {
    if (!this.cliControlState().targetOk) return;
    try {
      await this.runMagpieCli(["panel"], 8000);
    } catch (_) { /* ignore */ }
    cx?.notify();
  }

  async openAgentMenu(agentId, rowIndex, cx) {
    if (!this.cliControlState().writable) return;
    const cliAgent = resolveCliAgent(agentId);
    if (!cliAgent) return;
    const gen = ++this.agentMenuGen;
    const startWriteSeq = this.agentWriteDoneSeq.get(cliAgent) || 0;
    this.profileMenuOpen = false;
    this.hoveredQuotaProv = null;
    this.agentMenu = {
      agent: agentId,
      cliAgent,
      rowIndex,
      gen,
      loading: true,
      busy: this.agentWrites.get(cliAgent)?.op || "",
      error: "",
      currentModel: "",
      currentEffort: "",
      models: [],
    };
    cx?.notify();
    try {
      const [statusRes, modelsRes] = await Promise.all([
        this.runMagpieCli([cliAgent], 10000),
        this.runMagpieCli(["models", cliAgent], 12000),
      ]);
      if (!this.agentMenu || this.agentMenu.gen !== gen || !this.cliControlState().writable) return;
      const st = parseAgentStatus(statusRes?.stdout || "");
      const models = parseAgentModels(modelsRes?.stdout || "");
      const wroteDuringLoad = (this.agentWriteDoneSeq.get(cliAgent) || 0) !== startWriteSeq;
      const curModel = wroteDuringLoad ? (this.agentMenu.currentModel || st.model) : st.model;
      const curEffort = wroteDuringLoad ? (this.agentMenu.currentEffort || st.effort) : st.effort;
      this.agentMenu = {
        ...this.agentMenu,
        loading: false,
        busy: this.agentWrites.get(cliAgent)?.op || "",
        currentModel: curModel,
        currentEffort: curEffort,
        models,
        error: this.agentMenu.error || ((!curModel && !models.length) ? "No CLI config or models found for this agent." : ""),
      };
    } catch (e) {
      if (!this.agentMenu || this.agentMenu.gen !== gen) return;
      this.agentMenu = {
        ...this.agentMenu,
        loading: false,
        busy: this.agentWrites.get(cliAgent)?.op || "",
        error: String(e?.message || e).slice(0, 140),
      };
    }
    cx?.notify();
  }

  async setAgentModel(agentId, modelId, cx) {
    if (!this.cliControlState().writable) return;
    const cliAgent = resolveCliAgent(agentId);
    // a profile switch in flight rewrites this agent's config too: a
    // single-agent write never starts beside it. Writes of OTHER agents
    // stay parallel, as they always were.
    if (!cliAgent || this.profileBusy || this.agentWrites.has(cliAgent)) return;
    const seq = ++this.agentWriteSeq;
    this.agentWrites.set(cliAgent, { op: modelId, seq });
    if (this.agentMenu?.cliAgent === cliAgent) {
      this.agentMenu = { ...this.agentMenu, busy: modelId, error: "" };
    }
    cx?.notify();
    try {
      const r = await this.runMagpieCli([cliAgent, modelId], 12000);
      if (r?.code === 0) {
        const stRes = await this.runMagpieCli([cliAgent], 8000).catch(() => null);
        const st = parseAgentStatus(stRes?.stdout || "");
        const resolvedModel = st.model || modelId.replace(/^magpie\//, "");
        this.agentWriteDoneSeq.set(cliAgent, seq);
        if (this.agentMenu?.cliAgent === cliAgent) {
          this.agentMenu = {
            ...this.agentMenu,
            currentModel: resolvedModel,
            currentEffort: st.effort || this.agentMenu.currentEffort,
          };
        }
        notify({ title: agentLabel(agentId), level: "success", timeout: 3500, body: `Model → ${modelId}` });
      } else {
        const msg = stripAnsi(r?.stderr || r?.stdout || "failed").trim().split(/\r?\n/).pop();
        if (this.agentMenu?.cliAgent === cliAgent) {
          this.agentMenu = { ...this.agentMenu, error: msg || "Failed to switch model" };
        }
      }
    } catch (e) {
      if (this.agentMenu?.cliAgent === cliAgent) {
        this.agentMenu = { ...this.agentMenu, error: String(e?.message || e) };
      }
    } finally {
      if (this.agentWrites.get(cliAgent)?.seq === seq) this.agentWrites.delete(cliAgent);
      if (this.agentMenu?.cliAgent === cliAgent) {
        this.agentMenu = { ...this.agentMenu, busy: this.agentWrites.get(cliAgent)?.op || "" };
      }
      cx?.notify();
    }
  }

  async setAgentEffort(agentId, effort, cx) {
    if (!this.cliControlState().writable) return;
    const cliAgent = resolveCliAgent(agentId);
    if (!cliAgent || this.profileBusy || this.agentWrites.has(cliAgent)) return;
    const op = `effort:${effort}`;
    const seq = ++this.agentWriteSeq;
    this.agentWrites.set(cliAgent, { op, seq });
    if (this.agentMenu?.cliAgent === cliAgent) {
      this.agentMenu = { ...this.agentMenu, busy: op, error: "" };
    }
    cx?.notify();
    try {
      const r = await this.runMagpieCli([cliAgent, "effort", effort], 12000);
      if (r?.code === 0) {
        this.agentWriteDoneSeq.set(cliAgent, seq);
        if (this.agentMenu?.cliAgent === cliAgent) {
          this.agentMenu = { ...this.agentMenu, currentEffort: effort };
        }
        notify({ title: agentLabel(agentId), level: "success", timeout: 3000, body: `Effort → ${effort}` });
      } else {
        const msg = stripAnsi(r?.stderr || r?.stdout || "failed").trim().split(/\r?\n/).pop();
        if (this.agentMenu?.cliAgent === cliAgent) {
          this.agentMenu = { ...this.agentMenu, error: msg || "Failed to set effort" };
        }
      }
    } catch (e) {
      if (this.agentMenu?.cliAgent === cliAgent) {
        this.agentMenu = { ...this.agentMenu, error: String(e?.message || e) };
      }
    } finally {
      if (this.agentWrites.get(cliAgent)?.seq === seq) this.agentWrites.delete(cliAgent);
      if (this.agentMenu?.cliAgent === cliAgent) {
        this.agentMenu = { ...this.agentMenu, busy: this.agentWrites.get(cliAgent)?.op || "" };
      }
      cx?.notify();
    }
  }

  tightestQuotaLeft(group) {
    const accts = group?.accounts || [];
    if (!accts.length) return null;
    const oneEach = accts.every((a) => (a.allow || []).length <= 1);
    const bestByPool = new Map();
    for (const a of accts) {
      for (const h of a.allow || []) {
        if (typeof h?.left !== "number" || !Number.isFinite(h.left)) continue;
        const label = oneEach ? "" : String(h.label || "");
        const cur = bestByPool.get(label);
        if (cur === undefined || h.left > cur) bestByPool.set(label, h.left);
      }
    }
    if (!bestByPool.size) {
      let bestDirect = null;
      for (const a of accts) {
        if (typeof a?.left === "number" && Number.isFinite(a.left)) {
          bestDirect = bestDirect == null ? a.left : Math.max(bestDirect, a.left);
        }
      }
      return bestDirect;
    }
    let maxPool = -Infinity;
    for (const v of bestByPool.values()) {
      if (v > maxPool) maxPool = v;
    }
    return Number.isFinite(maxPool) ? maxPool : null;
  }

  burnRateOf(provId, now = Date.now()) {
    const raw = this.quotaHistory.get(provId);
    if (!raw?.length) return null;
    const cutoff = now - 60 * 60 * 1000;
    const pts = raw.filter((p) => p.ts >= cutoff);
    if (pts.length !== raw.length) {
      if (pts.length) this.quotaHistory.set(provId, pts);
      else this.quotaHistory.delete(provId);
    }
    if (pts.length < 2) return null;
    const first = pts[0], last = pts[pts.length - 1];
    const dtMs = last.ts - first.ts;
    const drop = first.left - last.left;
    if (dtMs < 5 * 60 * 1000 || drop < 1) return null;
    const pctPerHr = Math.round((drop / (dtMs / 3600000)) * 10) / 10;
    if (!(pctPerHr > 0)) return null;
    const estHoursLeft = last.left > 0 ? Math.round((last.left / pctPerHr) * 10) / 10 : 0;
    return { pctPerHr, estHoursLeft };
  }

  recordQuotaTelemetry(now = Date.now()) {
    const cutoff = now - 60 * 60 * 1000;
    const quotas = this.quotas || {};
    for (const [provId, group] of Object.entries(quotas)) {
      const left = this.tightestQuotaLeft(group);
      if (left == null) {
        this.quotaHistory.delete(provId);
        this.prevQuotaLeft.delete(provId);
        this.prevQuotaTier.delete(provId);
        continue;
      }
      let hist = (this.quotaHistory.get(provId) || []).filter((p) => p.ts >= cutoff);
      hist.push({ ts: now, left });
      if (hist.length > 120) hist = hist.slice(-120);
      this.quotaHistory.set(provId, hist);
      this.maybeAlertQuota(provId, provLabel(group.name || provId), left, now);
    }
    // a provider missing from a valid snapshot has been removed from the
    // gateway: its burn-rate history and its alert tier go with it, so a
    // re-added provider starts clean instead of inheriting a stale decline
    for (const provId of [...this.quotaHistory.keys()]) {
      if (!Object.hasOwn(quotas, provId)) {
        this.quotaHistory.delete(provId);
        this.prevQuotaLeft.delete(provId);
        this.prevQuotaTier.delete(provId);
      }
    }
  }

  maybeAlertQuota(provId, label, left, now = Date.now()) {
    const prev = this.prevQuotaLeft.get(provId);
    const prevTier = this.prevQuotaTier.get(provId)
      || (prev === undefined ? "ok" : prev <= 0 ? "exhausted" : prev <= 15 ? "low" : "ok");
    const tier = left <= 0 ? "exhausted" : left <= 15 ? "low" : "ok";
    this.prevQuotaLeft.set(provId, left);
    this.prevQuotaTier.set(provId, tier);
    if (!this.alertsEnabled || this.demo || tier === "ok") return;
    if (prev !== undefined && prev <= 15 && left >= prev && tier === prevTier) return;
    const escalated = tier === "exhausted" && prevTier !== "exhausted";
    const key = `q:${provId}`;
    const lastAt = this.alertCooldowns.get(key) || 0;
    if (!escalated && now - lastAt < 15 * 60 * 1000) return;
    this.alertCooldowns.set(key, now);
    const rate = this.burnRateOf(provId, now);
    const tail = rate ? ` · ~${rate.pctPerHr}%/h` : "";
    notify({
      title: left <= 0 ? `Quota Exhausted: ${label}` : `Low Quota: ${label}`,
      level: left <= 0 ? "error" : "warning",
      timeout: 7000,
      body: left <= 0 ? `0% remaining${tail}` : `${Math.round(left)}% remaining${tail}`,
    });
  }

  maybeAlertError(r, now = Date.now()) {
    if (!this.alertsEnabled || this.demo || !r?.done || !(r.status >= 400)) return;
    if (this.notifiedErrors.has(r.id)) return;
    this.notifiedErrors.add(r.id);
    if (this.notifiedErrors.size > 200) {
      const first = this.notifiedErrors.values().next().value;
      this.notifiedErrors.delete(first);
    }
    const lastTry = r.tries?.length ? r.tries[r.tries.length - 1] : null;
    const tryMeta = lastTry ? (r.order || []).find((o) =>
      (lastTry.id && (o.id === lastTry.id || o.who === lastTry.id)) ||
      (!lastTry.id && lastTry.who && o.who === lastTry.who)) : null;
    const seat = lastTry ? this.seatEntry(r, lastTry) : null;
    const acctRow = seat?.key ? this.acctOf(seat.key) : null;
    const safeProvider = provLabel(r.provider || lastTry?.provider || tryMeta?.provider || "");
    // masked mode names only the provider class plus the HTTP status: even a
    // try name that carries no @ can be a person's account id, so it stays
    // out of the notification. The cooldown key still uses seat.key, which
    // never leaves the process.
    const acct = this.masked
      ? (safeProvider || "provider")
      : (acctRow?.name || seat?.name || safeProvider || "provider");
    const key = `err:${seat?.key || safeProvider || "provider"}`;
    const lastAt = this.alertCooldowns.get(key) || 0;
    if (now - lastAt < 2 * 60 * 1000) return;
    this.alertCooldowns.set(key, now);
    const reason = HTTP_REASONS[r.status] ? ` ${HTTP_REASONS[r.status]}` : "";
    notify({
      title: "Magpie Request Failed",
      level: "error",
      timeout: 6000,
      body: `${agentLabel(r.agent || "agent")} → ${acct} (${r.status}${reason})`,
    });
  }

  syncSharedStatus(now = Date.now()) {
    if (typeof setShared !== "function" || this.demo) return false;
    if (this.offline) {
      const sig = "offline";
      if (sig === this._lastSharedSig) return false;
      this._lastSharedSig = sig;
      try { setShared("routing.status", { active: 0, recentErr: false, lowQuota: false, offline: true }); } catch (_) { /* ignore */ }
      return true;
    }
    let active = 0;
    let recentErr = false;
    for (const r of this.routes.values()) {
      if (!r.done) { active += 1; continue; }
      const startedAt = r.time ? Date.parse(r.time) : NaN;
      const finishedAt = Number.isFinite(startedAt) ? startedAt + Math.max(0, Number(r.ms) || 0) : NaN;
      if (r.status >= 400 && Number.isFinite(finishedAt) && (now - finishedAt) < 5 * 60 * 1000) {
        recentErr = true;
      }
    }
    // a failure whose row has already been evicted by 60 newer successes
    // keeps its five minutes through the remembered completion time
    if (!recentErr && this.lastErrorDoneAt && (now - this.lastErrorDoneAt) < 5 * 60 * 1000) {
      recentErr = true;
    }
    let lowQuota = false;
    for (const group of Object.values(this.quotas || {})) {
      const left = this.tightestQuotaLeft(group);
      if (left != null && left <= 15) { lowQuota = true; break; }
    }
    const sig = `${active}|${recentErr ? 1 : 0}|${lowQuota ? 1 : 0}`;
    if (sig === this._lastSharedSig) return false;
    this._lastSharedSig = sig;
    try { setShared("routing.status", { active, recentErr, lowQuota }); } catch (_) { /* ignore */ }
    return true;
  }

  loadUpdateState() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("routing.update") : null;
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d?.latest === "string" && SEMVER.test(d.latest)) this.upd.latest = d.latest;
      if (Number.isFinite(d?.checkedAt)) this.upd.checkedAt = d.checkedAt;
      if (Number.isFinite(d?.triedAt)) this.upd.triedAt = d.triedAt;
      if (Number.isFinite(d?.fails)) this.upd.fails = d.fails;
      if (typeof d?.seen === "string") this.upd.seen = d.seen;
    } catch (_) { /* ignore storage errors */ }
  }

  saveUpdateState() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem("routing.update", JSON.stringify(this.upd));
    } catch (_) { /* ignore storage errors */ }
  }

  async readModVersion() {
    try {
      const v = ((await readTextFile(`${appHome()}/mods/routing/VERSION`)) || "").trim().replace(/^v/, "");
      if (SEMVER.test(v)) this.modVersion = v;
    } catch (_) { /* an install from before the file was shipped */ }
  }

  // The first frame after the version moved says so once, however it moved:
  // the button here, install.sh, or a git checkout.
  announceVersion() {
    if (!this.modVersion) return;
    this.loadUpdateState(); // another reload of this mod may already have said it
    const was = this.upd.seen;
    if (was === this.modVersion) return;
    this.upd.seen = this.modVersion;
    this.saveUpdateState();
    if (was && this.newerThan(this.modVersion, was)) {
      notify({ title: "herdr-magpie updated", level: "success", timeout: 6000,
        body: `${was} → ${this.modVersion}` });
    }
  }

  newerThan(a, b) {
    const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }

  updateReady() {
    return Boolean(this.modVersion) && Boolean(this.upd.latest)
      && this.newerThan(this.upd.latest, this.modVersion);
  }

  updateDue(reason, now) {
    if (this.demo || !this.configReady || this.updateChecking || this.updateBusy) return false;
    const u = this.upd;
    const last = Math.max(u.checkedAt, u.triedAt);
    if (last > now) return true; // the clock was set back: the kept times mean nothing
    if (reason === "asked") return now - last >= UPDATE_ASKED;
    if (reason === "online") return u.fails > 0 && now - u.triedAt >= 30000;
    if (u.fails > 0) return now - u.triedAt >= UPDATE_RETRY[Math.min(u.fails, UPDATE_RETRY.length) - 1];
    return now - u.checkedAt >= UPDATE_EVERY;
  }

  maybeCheckUpdate(cx, reason) {
    if (!this.updateDue(reason, Date.now())) return;
    this.checkLatest().then((moved) => { if (moved) cx.notify(); }).catch(() => {});
  }

  // releases/latest redirects to the newest published, non-draft, non-prerelease
  // tag; the tag is read off the final address. Resolves to whether the answer moved.
  async latestRelease() {
    // /dev/null is the bit bucket on every Unix; on Windows the same idea
    // is spelled NUL (curl.exe there is the real curl, only the name differs)
    const r = await exec("curl", ["-fsSLI", "--max-time", "10", "-o", this.isWindows() ? "NUL" : "/dev/null", "-w", "%{url_effective}",
      `https://github.com/${UPDATE_REPO}/releases/latest`], { timeout: 15000 });
    if (r.code !== 0) throw new Error((r.stderr || "").trim() || `curl exited ${r.code}`);
    const m = /\/releases\/tag\/v?(\d+\.\d+\.\d+)\s*$/.exec(r.stdout || "");
    return m ? m[1] : ""; // "": the repository has no release yet
  }

  async checkLatest() {
    if (this.updateChecking) return false;
    this.updateChecking = true;
    const before = this.upd.latest;
    this.upd.triedAt = Date.now();
    try {
      const v = await this.latestRelease();
      this.upd.checkedAt = Date.now();
      this.upd.fails = 0;
      if (v) this.upd.latest = v;
      if (v && v !== before) this.updateError = "";
    } catch (_) {
      this.upd.fails += 1; // offline or blocked: the kept answer stands, the retry is scheduled
    } finally {
      this.updateChecking = false;
      this.saveUpdateState();
    }
    return this.upd.latest !== before;
  }

  // One shell run that leaves the last good install standing unless every step
  // before the copy succeeded: the archive is fetched and unpacked in a
  // temporary folder and its sha256 is verified before anything is touched.
  // Files are laid over the install rather than replacing the folder, so what
  // the release does not ship stays (mods/routing/config.json: the person's
  // gateway, remote or demo pick). main.js goes last and by rename, so Herdr
  // reloads once, onto a complete install.
  updateScript(version) {
    const q = (v) => `'${String(v).replace(/'/g, "'\\''")}'`;
    return [
      "set -eu",
      `H=${q(appHome())}`,
      `V=${q(version)}`,
      `U="https://github.com/${UPDATE_REPO}/releases/download/v$V/herdr-magpie-$V.tar.gz"`,
      'T=$(mktemp -d)',
      'trap \'rm -rf "$T"\' EXIT',
      // a connection to GitHub that drops mid-handshake is common on some
      // networks; three tries each, in the shell so any curl can do it
      'get() { n=0; until curl -fsSL --max-time "$1" -o "$2" "$3"; do'
        + ' n=$((n+1)); [ "$n" -lt 3 ] || return 1; sleep 2; done; }',
      'get 120 "$T/pkg.tgz" "$U"',
      'get 20 "$T/pkg.sha256" "$U.sha256"',
      'WANT=$(cut -d" " -f1 < "$T/pkg.sha256")',
      'if command -v sha256sum >/dev/null 2>&1; then GOT=$(sha256sum "$T/pkg.tgz" | cut -d" " -f1);'
        + ' else GOT=$(shasum -a 256 "$T/pkg.tgz" | cut -d" " -f1); fi',
      '[ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || { echo "checksum mismatch" >&2; exit 1; }',
      'X="$T/x"; mkdir -p "$X"',
      'tar xzf "$T/pkg.tgz" -C "$X" --strip-components=1',
      '[ -f "$X/mods/routing/main.js" ] && [ -f "$X/mods/tabs-routing/main.js" ]'
        + ' || { echo "the release is missing its mods" >&2; exit 1; }',
      '[ -f "$X/mods/routing/VERSION" ] || printf "%s\\n" "$V" > "$X/mods/routing/VERSION"',
      'mv "$X/mods/routing/main.js" "$T/main.js"',
      'mkdir -p "$H/mods/routing" "$H/mods/tabs-routing" "$H/layouts"',
      'cp -R "$X/mods/tabs-routing/." "$H/mods/tabs-routing/"',
      'if [ -d "$X/layouts" ]; then cp -R "$X/layouts/." "$H/layouts/"; fi',
      'cp -R "$X/mods/routing/." "$H/mods/routing/"',
      'cp "$T/main.js" "$H/mods/routing/.main.js.new"',
      'mv -f "$H/mods/routing/.main.js.new" "$H/mods/routing/main.js"',
    ].join("\n");
  }

  // The updateScript() of Windows: the same fetch-verify-overlay-rename
  // order, phrased for PowerShell. curl.exe and tar.exe are named by their
  // full System32 path because the ones Git for Windows ships parse a path
  // with a drive letter ("C:\\...") as scp syntax and fail the download as a
  // "remote host". Everything runs inside try/finally so the temporary
  // folder is removed however the run ends.
  updateScriptWindows(version) {
    // The install root never goes into the script as quoted text: a path
    // spelled in single quotes still breaks on a user folder that itself
    // contains a ' or a curly ’, and PowerShell reads a backtick inside
    // double quotes as an escape. Base64 carries the exact UTF-8 bytes as
    // pure data instead -- alphabet digits and +/ only -- and the script
    // decodes it back; no quoting rule can ever touch it.
    const home64 = utf8ToBase64(appHome());
    return [
      "$ErrorActionPreference = 'Stop'",
      `$H = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${home64}'))`,
      `$V = '${String(version).replace(/'/g, "''")}'`,
      `$U = "https://github.com/${UPDATE_REPO}/releases/download/v$V/herdr-magpie-$V.tar.gz"`,
      "$Curl = Join-Path $env:SystemRoot 'System32\\curl.exe'",
      "$Tar = Join-Path $env:SystemRoot 'System32\\tar.exe'",
      "$T = Join-Path ([IO.Path]::GetTempPath()) ('herdr-magpie-' + [Guid]::NewGuid().ToString('N'))",
      "New-Item -ItemType Directory -Force -Path $T | Out-Null",
      // every file and folder below is addressed by -LiteralPath and copies
      // walk the source children one item at a time (no \\* wildcard tails),
      // so an install or temp path holding [ or ], $ or a backtick -- all
      // legal in a Windows user name -- is taken as the plain text it is.
      // New-Item is the one exception: it has no -LiteralPath, but its -Path
      // already passes every character through, wildcards uninterpreted.
      "try {",
      // a connection to GitHub that drops mid-handshake is common on some
      // networks; three tries each, checking the exit code of a native
      // command that never raises
      "  function Get-File($Timeout, $Out, $Url) {",
      "    for ($n = 0; $n -lt 3; $n++) {",
      "      & $Curl -fsSL --max-time $Timeout -o \"$Out\" $Url",
      "      if ($LASTEXITCODE -eq 0) { return }",
      "      Start-Sleep -Seconds 2",
      "    }",
      "    [Console]::Error.WriteLine(\"download failed: $Url\"); exit 1",
      "  }",
      "  Get-File 120 (Join-Path $T 'pkg.tgz') $U",
      "  Get-File 20 (Join-Path $T 'pkg.sha256') ($U + '.sha256')",
      // an empty checksum file reads back as $null; the cast keeps it a
      // string, so the comparison below -- not a null-method error -- is
      // what reports the mismatch
      "  $Want = (([string](Get-Content -Raw -LiteralPath (Join-Path $T 'pkg.sha256'))) -split '\\s+')[0].ToLowerInvariant()",
      "  $Got = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $T 'pkg.tgz')).Hash.ToLowerInvariant()",
      "  if (-not $Want -or $Want -ne $Got) { [Console]::Error.WriteLine('checksum mismatch'); exit 1 }",
      "  $X = Join-Path $T 'x'",
      "  New-Item -ItemType Directory -Force -Path $X | Out-Null",
      "  & $Tar xzf \"$(Join-Path $T 'pkg.tgz')\" -C \"$X\" --strip-components=1",
      "  if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine('could not unpack the release'); exit 1 }",
      "  if (-not ((Test-Path -LiteralPath (Join-Path $X 'mods\\routing\\main.js')) -and (Test-Path -LiteralPath (Join-Path $X 'mods\\tabs-routing\\main.js')))) {",
      "    [Console]::Error.WriteLine('the release is missing its mods'); exit 1",
      "  }",
      "  if (-not (Test-Path -LiteralPath (Join-Path $X 'mods\\routing\\VERSION'))) { Set-Content -NoNewline -LiteralPath (Join-Path $X 'mods\\routing\\VERSION') -Value (\"$V`n\") }",
      // the overlay, in the same order as the Unix updater: main.js aside
      // first, tabs-routing, the layout, routing (config.json in the archive
      // never lands, but the skip also guards a repacked archive), and the
      // new main.js last, by atomic replace, so Herdr reloads once onto a
      // complete install
      "  Move-Item -Force -LiteralPath (Join-Path $X 'mods\\routing\\main.js') -Destination (Join-Path $T 'main.js')",
      "  foreach ($d in @('mods\\routing', 'mods\\tabs-routing', 'layouts')) {",
      "    New-Item -ItemType Directory -Force -Path (Join-Path $H $d) | Out-Null",
      "  }",
      "  Get-ChildItem -LiteralPath (Join-Path $X 'mods\\tabs-routing') -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $H 'mods\\tabs-routing') -Recurse -Force }",
      "  if (Test-Path -LiteralPath (Join-Path $X 'layouts')) { Get-ChildItem -LiteralPath (Join-Path $X 'layouts') -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $H 'layouts') -Recurse -Force } }",
      "  Get-ChildItem -LiteralPath (Join-Path $X 'mods\\routing') -Force | Where-Object { $_.Name -ne 'config.json' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $H 'mods\\routing') -Recurse -Force }",
      "  Copy-Item -Force -LiteralPath (Join-Path $T 'main.js') -Destination (Join-Path $H 'mods\\routing\\.main.js.new')",
      // the swap: same volume (same folder), so .NET's Replace is the Win32
      // ReplaceFileW -- the target keeps its old content until the new file
      // is fully in place, where Move-Item -Force deleted it first. Move is
      // already atomic for the first install, when nothing is there yet. The
      // null backup path is passed as NullString::Value: under Windows
      // PowerShell 5.1 a bare $null arriving at a [string] parameter is
      // marshalled as "" and ReplaceFileW fails on the empty backup path;
      // NullString::Value crosses the boundary as a real CLR null, on 5.1
      // and on PowerShell 7+ alike.
      "  $TmpMain = Join-Path $H 'mods\\routing\\.main.js.new'",
      "  $DstMain = Join-Path $H 'mods\\routing\\main.js'",
      "  if ([IO.File]::Exists($DstMain)) {",
      "    [IO.File]::Replace($TmpMain, $DstMain, [System.Management.Automation.Language.NullString]::Value)",
      "  } else {",
      "    [IO.File]::Move($TmpMain, $DstMain)",
      "  }",
      "} finally {",
      "  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath $T",
      "}",
    ].join("\n");
  }

  async updateMod(cx) {
    if (this.demo || this.updateBusy) return;
    this.updateBusy = true;
    this.updateError = "";
    cx.notify();
    try {
      await this.checkLatest(); // a release may have landed since the button appeared
      const v = this.upd.latest;
      if (!SEMVER.test(v) || !this.newerThan(v, this.modVersion)) return; // nothing newer after all
      // eight minutes either way; on Windows the updater is the PowerShell
      // one, and only ever on the panel's own machine (a remote host keeps
      // the shell form it understands)
      const r = this.isWindows()
        ? await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", this.updateScriptWindows(v)], { timeout: 480000 })
        : await exec("sh", ["-c", this.updateScript(v)], { timeout: 480000 });
      if (r.code !== 0) throw new Error((r.stderr || "").trim().split("\n").pop() || `exited ${r.code}`);
      // Herdr is reloading the mod onto the new files; if this instance is
      // still the one drawn, it carries on as the new version
      await this.readModVersion();
      this.announceVersion();
    } catch (e) {
      this.updateError = String(e?.message ?? e).slice(0, 160);
      notify({ title: "herdr-magpie update failed", level: "error", timeout: 9000,
        body: `${this.updateError}\nhttps://github.com/${UPDATE_REPO}/releases/latest` });
    } finally {
      this.updateBusy = false;
      cx.notify();
    }
  }

  // The one control that is only there when it is needed: a pill in the top
  // bar, after "· n live", that names the release it moves to. While the
  // install is the newest release the bar is exactly as it was.
  updatePill(t) {
    if (this.demo || !this.updateReady()) return null;
    const v = this.upd.latest;
    const tip = `herdr-magpie ${this.modVersion} → ${v}\n`
      + "Downloads the release from GitHub, checks its sha256 and installs it. "
      + "The panel reloads by itself; your gateway settings are kept."
      + (this.updateError ? `\n\nLast try failed: ${this.updateError}` : "");
    return h_flex().id("mod-update").h(17).pl(6).pr(8).gap(3).rounded_full().items_center().flex_none()
      .bg(t.accent).text_color(t.canvas)
      .when(this.updateBusy, (el) => el.opacity(0.55))
      .when(!this.updateBusy, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)))
      .on_click((_, cx2) => { cx2.stop_propagation(); this.updateMod(cx2); })
      .tooltip(tip)
      .child(svg("mods/routing/icons/update.svg").size(10).flex_none().text_color(t.canvas))
      .child(div().text_size(10).font_medium().child(this.updateBusy ? "Updating…" : `Update ${v}`));
  }

  quotaPanel(t) {
    const W = this.size.width || 336;
    try {
      const providers = this.orderedProviders();
      const provIds = providers.map(([id]) => id);
      const acctKeysByProv = new Map();
      const rows = [];
      const nameW = Math.max(68, Math.min(118, W - 196));
      const barW = Math.max(40, Math.min(84, W - 220));
      const titleCase = (s) => String(s || "").replace(/\b([a-z])([a-z]*)\b/g, (_, a, b) => a.toUpperCase() + b);
      const poolOf = (w) => {
        if (w.pool) return w.pool;
        const n = w.name.toLowerCase();
        if (/claude|gpt/.test(n)) return "claude & gpt";
        const m = n.match(/^([a-z0-9 .&-]+?)(?:\s*·|$)/);
        return m ? m[1].trim() : n;
      };
      const creditRank = (name) => /^credits$/i.test(name) ? 0
        : /^extra\s+credits$/i.test(name) ? 1
        : /^total\s+credits$/i.test(name) ? 2 : -1;
      // A provider's accounts are alternative seats on the same allowances, so
      // the provider holds, per allowance, whatever its best-off account holds.
      const summarizeGroup = (group) => {
        const accts = group.accounts || [];
        const best = new Map();
        // accounts that each hold one allowance hold the same one, whatever
        // the gateway called its window on each of them
        const oneEach = accts.every((a) => (a.allow || []).length <= 1);
        for (const a of accts) for (const h of a.allow || []) {
          const label = oneEach ? "" : h.label;
          const cur = best.get(label);
          const better = !cur || h.left > cur.left
            || (h.left === cur.left && (h.long?.left ?? 0) > (cur.long?.left ?? 0));
          if (better) best.set(label, h);
        }
        const allow = [...best.values()];
        const bestBalance = allow.length ? "" : (accts.find((a) => a.balance)?.balance || "");
        const allErr = !allow.length && !bestBalance && accts.length > 0 && accts.every((a) => Boolean(a.error));
        return { allow, bestBalance, allErr, count: accts.length };
      };
      // the pieces of a quotaRead, set side by side
      const readEl = (read, size) => h_flex().items_center().flex_none()
        .children(read.segs.map((g) => div().text_size(size).flex_none()
          .when(Boolean(g.sep), (el) => el.px(3))
          .text_color(g.color || (g.sep ? t.dim : t.muted))
          .when(Boolean(g.strong), (el) => el.font_semibold())
          .child(g.text)));
      const plainEl = (text, color, size) => div().text_size(size).font_semibold().text_color(color).flex_none().child(text);
      // a row too narrow for a pair per family gives each family its one number
      const tightFams = W < 300;
      const statusEl = (allow, balance, error, size, compact = false) => {
        const fams = compact ? null : this.quotaFamilies(allow);
        if (fams) {
          // every family the same width (room for "100% · 100%"), so the icons
          // of the accounts listed under one provider stand in columns
          const one = tightFams || fams.length > 2;
          return h_flex().items_center().flex_none().gap(8)
            .children(fams.map((f) => h_flex().items_center().flex_none().gap(3)
              .child(iconNamed(f.icon, size + 1.5, t.muted))
              .child(h_flex().items_center().flex_none().min_w(Math.round(size * (one ? 3 : 6)))
                .child(readEl(this.quotaRead(f.allows, one), size)))));
        }
        const read = this.quotaRead(allow, compact);
        if (read) return readEl(read, size);
        if (balance) return plainEl(String(balance), "#34d399", size);
        if (error) return plainEl("Error", "#e26a6a", size);
        return plainEl("Ready", "#34d399", size);
      };
      const acctStatusBadge = (q) => statusEl(q.allow, q.balance, q.error, 8.5);
      const buildAccountBars = (q, wName) => {
        const wins = (q.windows || []).filter((w) => !w.text)
          .sort((a, b) => {
            const ca = creditRank(a.name), cb = creditRank(b.name);
            if (ca >= 0 && cb >= 0) return ca - cb;
            const pa = poolOf(a), pb = poolOf(b);
            if (pa !== pb) {
              const rank = /gemini/i.test(pa) ? 0 : /claude|gpt/.test(pa) ? 1 : 2;
              const rankB = /gemini/i.test(pb) ? 0 : /claude|gpt/.test(pb) ? 1 : 2;
              if (rank !== rankB) return rank - rankB;
              return pa.localeCompare(pb);
            }
            return Date.parse(a.resetsAt || "9999") - Date.parse(b.resetsAt || "9999");
          })
          .slice(0, 10);
        const nextReset = q.leftResetsAt || wins.map((w) => w.resetsAt).filter(Boolean).sort()[0];
        const barRows = wins.map((w) => {
          const label = titleCase(w.name);
          const left = this.winLeft(w);
          const frac = w.unlimited ? 1 : Math.max(0, Math.min(1, left / 100));
          const exhausted = !w.unlimited && Math.round(left) <= 0;
          const color = w.unlimited ? "#34d399" : left < 10 ? "#e26a6a" : left < 30 ? "#d4b06a" : "#34d399";
          const valText = w.unlimited ? "Unlimited" : exhausted ? "Exhausted" : `${Math.round(left)}%`;
          return h_flex().items_center().gap(5)
            .child(div().w(wName).text_size(8.5).text_color(t.muted).flex_none().truncate().child(label))
            .child(div().w(barW).h(3).rounded(2).bg(t.border).flex_none()
              .when(frac > 0, (el) => el.child(div().h_full().rounded(2).w(Math.max(2, Math.round(barW * frac))).bg(color))))
            .child(div().text_size(8.5).text_color(color).flex_none().child(valText));
        });
        if (wins.length && q.balance) {
          barRows.push(div().text_size(8.5).text_color(t.muted).child(`Balance: ${q.balance}`));
        } else if (wins.length && q.balanceError) {
          barRows.push(div().text_size(8.5).text_color(t.dim).child(`Balance: ${shortQuotaError(q.balanceError, this.masked)}`));
        } else if (!wins.length && q.balance) {
          barRows.push(div().text_size(9.5).text_color("#34d399").child(`${q.balance} left`));
        } else if (!wins.length && q.error) {
          barRows.push(div().text_size(8.5).text_color(t.dim).child(`Balance: ${shortQuotaError(q.error, this.masked)}`));
        } else if (!wins.length && typeof q.left === "number" && Number.isFinite(q.left) && Math.round(q.left) <= 0) {
          // an account that reports nothing but an empty share reads as
          // exhausted in the hover card; the expanded bars read the same,
          // never the green plenty-of-juice line of an untouched account
          barRows.push(h_flex().items_center().gap(6)
            .child(div().size(5).rounded(2.5).bg("#e26a6a").flex_none())
            .child(div().text_size(9).font_semibold().text_color("#e26a6a").child("Exhausted")));
        } else if (!wins.length) {
          barRows.push(h_flex().items_center().gap(6)
            .child(div().size(5).rounded(2.5).bg("#34d399").flex_none())
            .child(div().text_size(9).text_color("#34d399").child("Plenty Of Juice — Build On.")));
        }
        return { barRows, nextReset };
      };

      const fromProvIdx = this.dragProvider ? provIds.indexOf(this.dragProvider) : -1;

      for (let provIdx = 0; provIdx < providers.length; provIdx++) {
        const [id, group] = providers[provIdx];
        const rawAccounts = group.accounts || [];
        if (!rawAccounts.length) continue;
        const accounts = this.orderedAccounts(id, rawAccounts);
        const acctKeys = accounts.map((a) => a.key);
        acctKeysByProv.set(id, acctKeys);
        const provFolded = !this.expandedProviders.has(id);
        const provDragging = this.dragProvider === id && this.overProvider !== id;
        const provDropTarget = this.dragProvider !== null && this.overProvider === id && this.dragProvider !== id;
        const provRate = this.burnRateOf(id);

        if (accounts.length === 1) {
          const q = accounts[0];
          const { barRows, nextReset } = buildAccountBars(q, nameW);
          const badgeParts = [];
          const safeAlias = this.safeAcctAlias(q);
          if (safeAlias) badgeParts.push(safeAlias);
          if (q.plan && q.plan.toLowerCase() !== safeAlias.toLowerCase()) {
            badgeParts.push(titleCase(q.plan));
          }
          const badge = badgeParts.join(" · ");
          const who = !this.masked && q.user ? q.user : "";
          const foldedStatus = provFolded ? acctStatusBadge(q) : null;
          rows.push(v_flex().relative().id(`quota-prov-${id}`).gap(2)
            .when(provDragging, (el) => el.opacity(0.45))
            .on_mouse_move((_e, cx2) => {
              if (this.dragProvider !== null && this.overProvider !== id) {
                this.overProvider = id;
                cx2.notify();
              }
            })
            .on_mouse_up("left", (_e, cx2) => {
              if (this.dragProvider !== null) {
                cx2.stop_propagation();
                this.finishProviderDrag(id, provIds);
                cx2.notify();
              }
            })
            .child(h_flex().id(`quota-prov-hdr-${id}`).px(4).py(2).rounded(5).items_center().gap(5)
              .cursor_pointer().hover((s) => s.bg(t.hover))
              .on_mouse_down("left", (_e, cx2) => {
                cx2.stop_propagation();
                this.dragProvider = id;
                this.overProvider = id;
                this.dragAcct = null;
                this.overAcct = null;
              })
              .child(div().w(8).text_size(9).text_color(t.dim).flex_none().child(provFolded ? "▸" : "▾"))
              .child(iconEl(id, 14, t.muted, this.providerIcons))
              .child(div().text_size(10.5).font_semibold().truncate().flex_1().min_w(0).child(provLabel(group.name || id)))
              .when(Boolean(badge), (el) => el.child(div().text_size(8.5).text_color(t.dim).flex_none().child(`· ${badge}`)))
              .when(Boolean(who), (el) => el.child(div().text_size(8.5).text_color(t.muted).flex_none().max_w(90).truncate().child(`· ${who}`)))
              .when(Boolean(provRate), (el) => el.child(div().px(4).py(0.5).rounded(4).bg(t.surface).border(1).border_color(t.border)
                .text_size(8).text_color(provRate.estHoursLeft < 4 ? "#d4b06a" : t.accent).flex_none().child(`~${provRate.pctPerHr}%/h`)))
              .when(Boolean(foldedStatus), (el) => el.child(foldedStatus))
              .child(div().text_size(9).text_color(t.dim).flex_none()
                .child(nextReset ? `Resets ${this.fmtUntil(nextReset)}` : "")))
            .when(!provFolded, (el) => el.child(v_flex().pl(24).pr(4).gap(2).children(barRows)))
            .when(provDropTarget, (el) => el.child(
              div().absolute().left(2).right(2).h(2).rounded(1).bg(t.accent)
                .when(fromProvIdx < provIdx, (line) => line.bottom(0))
                .when(fromProvIdx > provIdx, (line) => line.top(0))
            )));
          continue;
        }

        const plans = accounts.map((a) => (a.plan ? titleCase(a.plan) : "")).filter(Boolean);
        const sharedPlan = plans.length === accounts.length && new Set(plans).size === 1 ? plans[0] : "";
        const subNameW = Math.max(64, nameW - 6);
        const baseLabels = accounts.map((q, idx) => this.safeAcctAlias(q)
          ? (!this.masked && q.user ? `${q.alias} · ${q.user}` : q.alias)
          : (!this.masked && q.user ? q.user : `Account ${q.num || idx + 1}`));
        const labelCounts = new Map();
        for (const lbl of baseLabels) labelCounts.set(lbl, (labelCounts.get(lbl) || 0) + 1);
        const labelSeen = new Map();
        const fromAcctIdx = this.dragAcct?.prov === id ? acctKeys.indexOf(this.dragAcct.key) : -1;

        const subBlocks = accounts.map((q, idx) => {
          const { barRows, nextReset } = buildAccountBars(q, subNameW);
          const baseLbl = baseLabels[idx];
          const seenIdx = (labelSeen.get(baseLbl) || 0) + 1;
          labelSeen.set(baseLbl, seenIdx);
          const acctLabel = (labelCounts.get(baseLbl) || 0) > 1 ? `${baseLbl} #${seenIdx}` : baseLbl;
          const acctPlanRaw = q.plan ? titleCase(q.plan) : "";
          const acctPlan = acctPlanRaw && acctPlanRaw !== sharedPlan && acctPlanRaw.toLowerCase() !== String(q.alias || "").toLowerCase()
            ? acctPlanRaw : "";
          const dotColor = q.left != null
            ? (q.left < 10 ? "#e26a6a" : q.left < 30 ? "#d4b06a" : "#34d399")
            : (q.error && !q.balance ? "#e26a6a" : "#34d399");
          const acctFolded = !this.expandedAccounts.has(`${id}::${q.key}`);
          const acctStatus = acctFolded ? acctStatusBadge(q) : null;
          const acctDragging = this.dragAcct?.prov === id && this.dragAcct.key === q.key && this.overAcct !== q.key;
          const acctDropTarget = this.dragAcct?.prov === id && this.overAcct === q.key && this.dragAcct.key !== q.key;

          return v_flex().relative().id(`quota-acct-${id}-${q.key}`).gap(2)
            .when(acctDragging, (el) => el.opacity(0.45))
            .on_mouse_move((_e, cx2) => {
              if (this.dragAcct?.prov === id && this.overAcct !== q.key) {
                this.overAcct = q.key;
                cx2.notify();
              }
            })
            .on_mouse_up("left", (_e, cx2) => {
              if (this.dragAcct?.prov === id) {
                cx2.stop_propagation();
                this.finishAcctDrag(id, q.key, acctKeys);
                cx2.notify();
              }
            })
            .child(h_flex().id(`quota-acct-hdr-${id}-${q.key}`).px(4).py(1.5).rounded(5).items_center().gap(5)
              .cursor_pointer().hover((s) => s.bg(t.hover))
              .on_mouse_down("left", (_e, cx2) => {
                cx2.stop_propagation();
                this.dragAcct = { prov: id, key: q.key };
                this.overAcct = q.key;
                this.dragProvider = null;
                this.overProvider = null;
              })
              .child(div().w(7).text_size(8.5).text_color(t.dim).flex_none().child(acctFolded ? "▸" : "▾"))
              .child(div().size(5).rounded(2.5).bg(dotColor).flex_none())
              .child(div().text_size(9.5).font_semibold().text_color(t.foreground).truncate().flex_1().min_w(0).child(acctLabel))
              .when(Boolean(acctPlan), (el) => el.child(div().text_size(8.5).text_color(t.dim).flex_none().child(`· ${acctPlan}`)))
              .when(Boolean(acctStatus), (el) => el.child(acctStatus))
              .child(div().text_size(8.5).text_color(t.dim).flex_none()
                .child(nextReset ? `Resets ${this.fmtUntil(nextReset)}` : "")))
            .when(!acctFolded, (el) => el.child(v_flex().pl(16).pr(4).gap(2).children(barRows)))
            .when(acctDropTarget, (el) => el.child(
              div().absolute().left(4).right(2).h(2).rounded(1).bg(t.accent)
                .when(fromAcctIdx < idx, (line) => line.bottom(0))
                .when(fromAcctIdx > idx, (line) => line.top(0))
            ));
        });

        const grpSummary = provFolded ? summarizeGroup(group) : null;
        const grpEl = grpSummary
          ? statusEl(grpSummary.allow, grpSummary.bestBalance, grpSummary.allErr, 8.5) : null;

        rows.push(v_flex().relative().id(`quota-prov-${id}`).gap(3)
          .when(provDragging, (el) => el.opacity(0.45))
          .on_mouse_move((_e, cx2) => {
            if (this.dragProvider !== null && this.overProvider !== id) {
              this.overProvider = id;
              cx2.notify();
            }
          })
          .on_mouse_up("left", (_e, cx2) => {
            if (this.dragAcct?.prov === id) {
              cx2.stop_propagation();
              this.finishAcctDrag(id, null, acctKeys);
              cx2.notify();
              return;
            }
            if (this.dragProvider !== null) {
              cx2.stop_propagation();
              this.finishProviderDrag(id, provIds);
              cx2.notify();
            }
          })
          .child(h_flex().id(`quota-prov-hdr-${id}`).px(4).py(2).rounded(5).items_center().gap(5)
            .cursor_pointer().hover((s) => s.bg(t.hover))
            .on_mouse_move((_e, cx2) => {
              if (this.dragAcct?.prov === id && acctKeys.length && this.overAcct !== acctKeys[0]) {
                this.overAcct = acctKeys[0];
                cx2.notify();
              }
            })
            .on_mouse_down("left", (_e, cx2) => {
              cx2.stop_propagation();
              this.dragProvider = id;
              this.overProvider = id;
              this.dragAcct = null;
              this.overAcct = null;
            })
            .child(div().w(8).text_size(9).text_color(t.dim).flex_none().child(provFolded ? "▸" : "▾"))
            .child(iconEl(id, 14, t.muted, this.providerIcons))
            .child(div().text_size(10.5).font_semibold().truncate().flex_1().min_w(0).child(provLabel(group.name || id)))
            .when(Boolean(sharedPlan), (el) => el.child(div().text_size(8.5).text_color(t.dim).flex_none().child(`· ${sharedPlan}`)))
            .when(Boolean(provRate), (el) => el.child(div().px(4).py(0.5).rounded(4).bg(t.surface).border(1).border_color(t.border)
              .text_size(8).text_color(provRate.estHoursLeft < 4 ? "#d4b06a" : t.accent).flex_none().child(`~${provRate.pctPerHr}%/h`)))
            .when(Boolean(grpEl), (el) => el.child(grpEl))
            .child(div().text_size(8.5).text_color(t.dim).flex_none().child(`${accounts.length} Accounts`)))
          .when(!provFolded, (el) => el.child(v_flex().pl(14).gap(5).children(subBlocks)))
          .when(provDropTarget, (el) => el.child(
            div().absolute().left(2).right(2).h(2).rounded(1).bg(t.accent)
              .when(fromProvIdx < provIdx, (line) => line.bottom(0))
              .when(fromProvIdx > provIdx, (line) => line.top(0))
          )));
      }
      if (!rows.length) rows.push(div().text_size(10).text_color(t.dim).child("No quota reported yet."));
      const commitAnyDrag = (cx2) => {
        let changed = false;
        if (this.dragAcct) {
          const pId = this.dragAcct.prov;
          this.finishAcctDrag(pId, null, acctKeysByProv.get(pId) || []);
          changed = true;
        }
        if (this.dragProvider) {
          this.finishProviderDrag(null, provIds);
          changed = true;
        }
        if (changed) {
          this.lastDragEndAt = Date.now();
          cx2.notify();
        }
        return changed;
      };
      const body = div().relative().max_h(360).min_h(0).flex_shrink(1)
        .child(v_flex().id("quota-body").max_h(360).min_h(0).flex_shrink(1)
          .overflow_y_scroll().px(6).pt(4).pb(10).gap(6)
          .on_mouse_up("left", (_e, cx2) => { commitAnyDrag(cx2); })
          .children(rows))
        .child(Scrollbar.vertical("quota-body").absolute().inset_0());
      const shortName = (id, name) => {
        const clean = provLabel(name || id)
          .replace(/\s*·\s*Remote magpie$/i, "")
          .replace(/\s*\((China|International)\)$/i, "")
          .replace(/^Google\s+/i, "");
        return clean || String(id);
      };
      const withMetrics = providers.map(([id, g]) => [id, g, summarizeGroup(g)]);
      const chipProviders = withMetrics
        .filter(([, , s]) => s.allow.length || s.bestBalance)
        .concat(withMetrics.filter(([, , s]) => !s.allow.length && !s.bestBalance && !s.allErr))
        .concat(withMetrics.filter(([, , s]) => s.allErr))
        .slice(0, 6);
      const quotaTip = (id, group) => {
        const rate = this.burnRateOf(id);
        const lines = [
          `${provLabel(group.name || id)}${rate ? ` · ~${rate.pctPerHr}%/h (${rate.estHoursLeft}h left)` : ""}`,
        ];
        const accts = this.orderedAccounts(id, group.accounts);
        for (let idx = 0; idx < accts.length; idx++) {
          const q = accts[idx];
          const lbl = this.safeAcctAlias(q) || (!this.masked && q.user ? q.user : (accts.length > 1 ? `Account ${q.num || idx + 1}` : ""));
          const parts = [];
          for (const h of q.allow || []) {
            const p = h.pace && h.long ? `${Math.round(h.pace.left)}% / ${Math.round(h.long.left)}%` : `${Math.round(h.left)}%`;
            const reset = h.resetsAt ? ` (${this.fmtUntil(h.resetsAt)})` : "";
            parts.push(`${h.label ? `${h.label} ` : ""}${p}${reset}`);
          }
          if (!parts.length && q.balance) parts.push(String(q.balance));
          else if (!parts.length && q.error) parts.push(shortQuotaError(q.error, this.masked).slice(0, 60));
          else if (!parts.length && typeof q.left === "number" && Number.isFinite(q.left)) {
            const pct = Math.round(q.left);
            parts.push(pct <= 0 ? "Exhausted" : `${pct}%${q.leftResetsAt ? ` (${this.fmtUntil(q.leftResetsAt)})` : ""}`);
          } else if (!parts.length) parts.push("Ready");
          lines.push(`${lbl ? `${lbl}: ` : ""}${parts.join(" · ")}`);
        }
        return lines.join("\n");
      };
      const summaryChips = chipProviders.map(([id, group, s]) => {
        const nameMax = s.count > 1 ? 62 : 76;
        const nameTxt = this.fitText(shortName(id, group.name), 9, nameMax, false);
        return h_flex().id(`quota-chip-${id}`).items_center().gap(4).flex_none()
          .tooltip(quotaTip(id, group))
          .on_hover((isOn, cx2) => {
            if (isOn) this.hoveredQuotaProv = id;
            else if (this.hoveredQuotaProv === id) this.hoveredQuotaProv = null;
            cx2.notify();
          })
          .child(iconEl(id, 11, t.muted, this.providerIcons))
          .child(div().text_size(9).text_color(t.muted).overflow_hidden().whitespace_nowrap().child(nameTxt))
          .when(s.count > 1, (el) => el.child(div().text_size(8).text_color(t.dim).child(`×${s.count}`)))
          .child(statusEl(s.allow, s.bestBalance, s.allErr, 9, true));
      });
      const summaryRow = h_flex().px(10).pb(8).items_center().cursor_pointer()
        .on_click((_, cx2) => { this.quotaOpen = true; this.hoveredQuotaProv = null; this.saveQuotaPrefs(); cx2.notify(); })
        .child(h_flex().id("quota-summary-clip").flex_1().min_w(0).gap(8).items_center().overflow_hidden()
          .when(summaryChips.length > 0, el => el.children(summaryChips))
          .when(!summaryChips.length, el => el.child(div().text_size(9).text_color(t.dim).child("Loading provider quotas…"))));
      return v_flex().mx(10).mb(8).rounded(10).bg(t.canvas).border(1).border_color(t.border)
        .on_mouse_up("left", (_e, cx2) => { commitAnyDrag(cx2); })
        .child(h_flex().px(10).pt(8).pb(6).items_center().cursor_pointer()
          .on_mouse_move((_e, cx2) => {
            if (this.dragProvider !== null && provIds.length && this.overProvider !== provIds[0]) {
              this.overProvider = provIds[0];
              cx2.notify();
            }
          })
          .on_mouse_up("left", (_e, cx2) => {
            if (commitAnyDrag(cx2)) cx2.stop_propagation();
          })
          .on_click((_, cx2) => {
            if (this.dragProvider || this.dragAcct || (Date.now() - (this.lastDragEndAt || 0) < 300)) return;
            this.quotaOpen = !this.quotaOpen;
            this.hoveredQuotaProv = null;
            this.saveQuotaPrefs();
            cx2.notify();
          })
          .child(div().text_size(10).text_color(t.muted).pr(5).child(this.quotaOpen ? "▾" : "▸"))
          .child(div().text_size(11).font_semibold().child("Agent Quota"))
          .child(div().text_size(9.5).text_color(t.dim).pl(6)
            .child(this.quotasAt ? `Updated ${this.fmtAgo(Date.now() - this.quotasAt)}` : ""))
          .child(div().flex_1())
          .child(div().text_size(9.5).text_color(t.accent).cursor_pointer()
            .on_click((_, cx2) => {
              cx2.stop_propagation();
              this.fetchQuotas(cx2).catch(() => {});
              this.maybeCheckUpdate(cx2, "asked");
            })
            .child(this.quotaBusy ? "Refreshing…" : "Refresh")))
        .child(this.quotaOpen ? body : summaryRow);
    } catch (e) {
      return div().mx(10).mb(6).p(8).rounded(10).bg(t.canvas).border(1).border_color(t.border)
        .text_size(9).text_color(t.blocked)
        .child(`quotaPanel: ${e.message}`);
    }
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const g = this.geometry();
    const live = [...this.routes.values()].some(r => !r.done);
    const liveAgents = new Set(), liveSeats = new Map();
    for (const f of this.flights.values()) {
      if (f.state === "gone" || this.agentIndex(f.agent) < 0) continue;
      const r = this.routes.get(f.id);
      if (r && r.done && f.state !== "fly") continue;
      liveAgents.add(f.agent);
      if (f.seat && f.state !== "away" && this.acctIndex(f.seat) >= 0) {
        liveSeats.set(f.seat, f.color);
      }
    }

    const children = [];

    const animNow = this.demo ? 620 : now;
    const wirePairs = new Map();
    for (const f of this.flights.values()) {
      if (!f.seat || f.state === "gone" || f.state === "away") continue;
      if (this.agentIndex(f.agent) < 0 || this.acctIndex(f.seat) < 0) continue;
      const r = this.routes.get(f.id);
      const isLive = Boolean(r && !r.done) && f.phase !== "back";
      const pairKey = `${f.agent}\u0000${f.seat}`;
      const prev = wirePairs.get(pairKey);
      wirePairs.set(pairKey, {
        agent: f.agent,
        key: f.seat,
        live: Boolean(prev?.live || isLive),
        err: Boolean(prev?.err || f.err),
      });
    }
    for (const r of [...this.routes.values()].filter(r => !r.done)) {
      const agent = r.agent || "agent";
      if (this.agentIndex(agent) < 0) continue;
      liveAgents.add(agent);
      const key = this.seatEntry(r, r.tries?.[r.tries.length - 1])?.key;
      if (!key || this.acctIndex(key) < 0) continue;
      liveSeats.set(key, hueOf(agent));
      const pairKey = `${agent}\u0000${key}`;
      const prev = wirePairs.get(pairKey);
      wirePairs.set(pairKey, { agent, key, live: true, err: prev?.err || false });
    }
    const focusAgent = this.hoveredAgent || this.selectedAgent;
    const focusAcct = this.hoveredAcct || this.selectedAcct;
    if (focusAgent || focusAcct) {
      for (const r of this.routes.values()) {
        const agent = r.agent || "agent";
        const key = this.seatEntry(r, r.tries?.[r.tries.length - 1])?.key;
        if (!key || this.agentIndex(agent) < 0 || this.acctIndex(key) < 0) continue;
        const matchFocus = (focusAgent && agent === focusAgent) ||
          (focusAcct && key === focusAcct);
        if (!matchFocus) continue;
        const pairKey = `${agent}\u0000${key}`;
        if (!wirePairs.has(pairKey)) {
          wirePairs.set(pairKey, { agent, key, live: false, err: Boolean(r.status && r.status >= 400) });
        }
      }
    }

    const hovering = Boolean(focusAgent || focusAcct);
    const hasLive = liveAgents.size > 0 && !hovering;
    const orderedWires = [...wirePairs.values()].sort((a, b) => Number(a.live) - Number(b.live));
    let activeWireCount = 0;
    for (const w of orderedWires) {
      const matched = (focusAgent && w.agent === focusAgent) || (focusAcct && w.key === focusAcct);
      if ((w.live || this.shakes.has(w.key)) && (!hovering || matched)) activeWireCount++;
    }
    const portDots = new Map();
    const birds = [];
    let activeIdx = 0;

    const makeCurve = (c, width) => {
      const cache = this._curveCache;
      const key = cache ? `${c.x0.toFixed(1)},${c.y0.toFixed(1)},${c.x3.toFixed(1)},${c.y3.toFixed(1)},${width}` : "";
      if (cache) {
        const hit = cache.get(key);
        if (hit) return hit;
      }
      const pb = PathBuilder.stroke(width).move_to(c.x0, c.y0);
      const path = (Math.abs(c.y3 - c.y0) < 1
        ? pb.line_to(c.x3, c.y3)
        : pb.cubic_bezier_to(c.x3, c.y3, c.mx, c.y0, c.mx, c.y3)
      ).build();
      if (cache) {
        if (cache.size > 64) cache.clear();
        cache.set(key, path);
      }
      return path;
    };

    const getFlat = (c) => {
      const cache = this._flatCache;
      const key = cache ? `${c.x0.toFixed(1)},${c.y0.toFixed(1)},${c.x3.toFixed(1)},${c.y3.toFixed(1)}` : "";
      if (cache && cache.has(key)) return cache.get(key);
      const poly = this.flat([c.seg]);
      if (cache) {
        if (cache.size > 64) cache.clear();
        cache.set(key, poly);
      }
      return poly;
    };

    const sliceCurvePath = (poly, s0, s1, width) => {
      if (!poly || s1 - s0 < 0.6) return null;
      const p0 = this.pointAt(poly, s0);
      let pb = PathBuilder.stroke(width).move_to(p0.x, p0.y);
      const steps = Math.max(1, Math.ceil((s1 - s0) / 4.5));
      for (let step = 1; step <= steps; step++) {
        const p = this.pointAt(poly, s0 + ((s1 - s0) * step) / steps);
        pb = pb.line_to(p.x, p.y);
      }
      return pb.build();
    };

    for (const w of orderedWires) {
      const c = this.curveBetween(this.agentIndex(w.agent), this.acctIndex(w.key), g);
      if (!c) continue;
      const shaking = this.shakes.has(w.key);
      const color = shaking ? "#e26a6a" : hueOf(w.agent);
      const matched = (focusAgent && w.agent === focusAgent) ||
        (focusAcct && w.key === focusAcct);
      const dimFactor = hovering ? (matched ? 1 : 0.16) : (hasLive && !w.live && !shaking ? 0.35 : 1);
      const strokeW = matched ? 2 : (w.live ? 1.5 : 1.25);
      const wireActive = (w.live || shaking) && (!hovering || matched);

      if (wireActive) {
        if (this.stageStyle === "stream") {
          const glowPath = makeCurve(c, 3.5);
          children.push(div().id(`wire-glow-${w.agent}-${w.key}`).absolute().left(0).top(0).size_full()
            .loop("opacity", { from: 0.04, to: 0.10, period: 1600 })
            .child(window.paint_path(glowPath, color).absolute().left(0).top(0).size_full()));

          const corePath = makeCurve(c, 1.25);
          children.push(div().id(`wire-core-${w.agent}-${w.key}`).absolute().left(0).top(0).size_full()
            .child(window.paint_path(corePath, rgba(color, 0.24)).absolute().left(0).top(0).size_full()));

          const poly = getFlat(c);
          if (poly && poly.L > 12) {
            const idx = activeIdx++;
            const period = 1600;
            const tailLen = Math.min(56, poly.L * 0.55);
            const pulses = (poly.L > 115 && activeWireCount <= 3) ? [[0, 1.0], [0.5, 0.55]] : [[0, 1.0]];
            let arrivalBloom = 0;

            for (const [phaseOff, intensity] of pulses) {
              const u = (((animNow + idx * 470) % period) / period + phaseOff) % 1;
              const p = easeIO(u);
              const headS = p * poly.L;
              const tailStart = Math.max(0, headS - tailLen);
              const env = Math.min(1, Math.sin(Math.PI * p) * 2.8);
              const op = env * intensity;
              if (p > 0.85) {
                arrivalBloom = Math.max(arrivalBloom, ((p - 0.85) / 0.15) * intensity);
              }
              if (op <= 0.02 || headS <= tailStart + 0.6) continue;

              // Feathered 2-segment bloom along front 60% of tail (primary pulse)
              const span = headS - tailStart;
              if (intensity >= 0.8) {
                const bloomStart = tailStart + span * 0.40;
                const bloomSpan = headS - bloomStart;
                const bloomSegs = 2;
                for (let k = 0; k < bloomSegs; k++) {
                  const seg0 = bloomStart + (bloomSpan * k) / bloomSegs;
                  const seg1 = bloomStart + (bloomSpan * (k + 1)) / bloomSegs;
                  const frac = (k + 1) / bloomSegs;
                  const bloomPath = sliceCurvePath(poly, seg0, seg1, 3.6);
                  if (bloomPath) {
                    children.push(window.paint_path(bloomPath, rgba(color, Math.pow(frac, 1.8) * 0.20 * op))
                      .absolute().left(0).top(0).size_full());
                  }
                }
              }

              // Tapered comet core
              const segs = intensity >= 0.8 ? 5 : 4;
              for (let k = 0; k < segs; k++) {
                const seg0 = tailStart + (span * k) / segs;
                const seg1 = tailStart + (span * (k + 1)) / segs;
                const frac = (k + 1) / segs;
                const wSeg = 1.0 + 1.0 * frac;
                const segPath = sliceCurvePath(poly, seg0, seg1, wSeg);
                if (segPath) {
                  children.push(window.paint_path(segPath, rgba(color, Math.pow(frac, 2.0) * 0.88 * op))
                    .absolute().left(0).top(0).size_full());
                }
              }

              // White-hot specular head
              const hp = this.pointAt(poly, headS);
              if (intensity >= 0.8) {
                children.push(div().absolute().left(hp.x - 5).top(hp.y - 5).size(10).rounded(5)
                  .bg(rgba(color, 0.14 * op)));
              }
              children.push(div().absolute().left(hp.x - 2.5).top(hp.y - 2.5).size(5).rounded(2.5)
                .bg(rgba(color, 0.48 * op)));
              children.push(div().absolute().left(hp.x - 1.1).top(hp.y - 1.1).size(2.2).rounded(1.1)
                .bg(rgba("#ffffff", 0.95 * op)));
            }

            if (arrivalBloom > 0.02) {
              const rSize = 5 + arrivalBloom * 7;
              const fade = 1 - arrivalBloom * 0.72;
              children.push(div().absolute().left(c.x3 - rSize / 2).top(c.y3 - rSize / 2)
                .size(rSize).rounded(rSize / 2).border(1).border_color(rgba(color, 0.55 * fade)));
            }
          }
        } else {
          const glowPath = makeCurve(c, 3.5);
          children.push(div().id(`wire-glow-${w.agent}-${w.key}`).absolute().left(0).top(0).size_full()
            .loop("opacity", { from: 0.08, to: 0.20, period: 1400 })
            .child(window.paint_path(glowPath, color).absolute().left(0).top(0).size_full()));

          const corePath = makeCurve(c, strokeW);
          children.push(div().id(`wire-core-${w.agent}-${w.key}`).absolute().left(0).top(0).size_full()
            .loop("opacity", { from: 0.58, to: 0.92, period: 1400 })
            .child(window.paint_path(corePath, color).absolute().left(0).top(0).size_full()));

          if (this.stageStyle === "magpie") {
            const poly = getFlat(c);
            if (poly && poly.L > 12) {
              const idx = activeIdx++;
              const shuttleMs = 2400;
              const u = ((animNow + idx * 1180) % shuttleMs) / shuttleMs;
              const goingLeft = u >= 0.5;
              const p = easeIO(goingLeft ? (u - 0.5) * 2 : u * 2);
              const edge = Math.min(4, poly.L * 0.10);
              const dist = goingLeft
                ? (poly.L - edge - p * (poly.L - 2 * edge))
                : (edge + p * (poly.L - 2 * edge));
              const pt = this.pointAt(poly, dist);
              const bob = Math.sin(animNow / 115 + idx * 2.1) * 1.1;
              const op = Math.min(1, Math.sin(Math.PI * p) * 3.2);
              if (op > 0.02) {
                const BIRD = 15;
                const birdSvg = goingLeft ? "mods/routing/icons/magpie-l.svg" : "mods/routing/icons/magpie.svg";
                const birdLeft = pt.x - (goingLeft ? 0.5 : 14.5);
                const birdTop = pt.y - 4.2 + bob;
                birds.push(div().absolute().left(pt.x - 3.5).top(pt.y - 3.5).size(7).rounded(3.5)
                  .bg(color).opacity(0.28 * op));
                birds.push(div().absolute().left(pt.x - 1.75).top(pt.y - 1.75).size(3.5).rounded(1.75)
                  .bg(color).opacity(0.95 * op));
                birds.push(svg(birdSvg).absolute().left(birdLeft).top(birdTop).size(BIRD)
                  .text_color(t.foreground).opacity(0.92 * op));
              }
            }
          }
        }
      } else {
        const corePath = makeCurve(c, strokeW);
        const baseOp = w.live ? 0.78 * dimFactor : (matched ? 0.62 : 0.32 * dimFactor);
        children.push(window.paint_path(corePath, color).absolute().left(0).top(0).size_full()
          .opacity(baseOp));
      }

      const portOp = w.live ? 0.95 * dimFactor : (matched ? 0.75 : 0.45 * dimFactor);
      const p0Key = `a:${w.agent}`;
      const p1Key = `s:${w.key}`;
      const cur0 = portDots.get(p0Key);
      if (!cur0 || portOp > cur0.op || wireActive) {
        portDots.set(p0Key, { key: p0Key, x: c.x0, y: c.y0, color, op: portOp, live: Boolean(cur0?.live || wireActive) });
      }
      const cur1 = portDots.get(p1Key);
      if (!cur1 || portOp > cur1.op || wireActive) {
        portDots.set(p1Key, { key: p1Key, x: c.x3, y: c.y3, color, op: portOp, live: Boolean(cur1?.live || wireActive) });
      }
    }

    for (const p of portDots.values()) {
      if (p.live) {
        children.push(div().id(`port-live-${p.key}`).absolute().left(p.x - 2).top(p.y - 2).size(4).rounded(2)
          .bg(p.color).loop("opacity", { from: 0.55, to: 1.0, period: 1100 }));
      } else {
        children.push(div().absolute().left(p.x - 1.75).top(p.y - 1.75).size(3.5).rounded(2)
          .bg(p.color).opacity(p.op));
      }
    }

    const shake = (key) => {
      const t0 = this.shakes.get(key);
      if (t0 === undefined) return 0; // rthit: -5, 4, -2, 1 over 450ms
      const p = (now - t0) / 450;
      return p < .2 ? -5 * p / .2 : p < .4 ? -5 + 9 * (p - .2) / .2 : p < .6 ? 4 - 6 * (p - .4) / .2 : p < .8 ? -2 + 3 * (p - .6) / .2 : 1 - (p - .8) / .2;
    };

    // agent chips: rounded-rect pills with client icons, restrained spotlight when active
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i], b = g.agent(i);
      const on = liveAgents.has(a.id), ticked = this.ticks.has(a.id);
      const hovered = this.hoveredAgent === a.id;
      const selected = this.selectedAgent === a.id;
      const cliAgent = resolveCliAgent(a.id);
      const pillCli = this.cliControlState();
      const canCli = Boolean(cliAgent && pillCli.writable);
      const pillTip = canCli
        ? "Click to filter · Right-click to switch model / effort"
        : (cliAgent && pillCli.reason ? `Click to filter · ${pillCli.reason}` : "Click to filter");
      const iconName = resolveIconName(a.id, this.providerIcons);
      const leading = iconName !== "generic"
        ? div().id(`agent-icon-${a.id}`).size(13).flex_none().flex().items_center().justify_center()
            .rounded(3).overflow_hidden()
            .child(iconNamed(iconName, 13, a.color))
        : div().id(`agent-icon-${a.id}`).size(13).flex_none().flex().items_center().justify_center()
            .child(div().size(6).rounded(3).bg(a.color));
      children.push(h_flex().id(`agent-pill-${a.id}`).absolute().left(b.x1 + shake(a.id)).top(b.cy - 13).w(g.agentW).h(26)
        .items_center().gap(4).px(5).rounded(7).cursor_pointer()
        .bg(selected ? t.selected : on ? rgba(a.color, 0.08) : hovered ? t.raised : t.canvas)
        .border(1).border_color(selected ? t.accent : on ? rgba(a.color, 0.85) : hovered ? t.selected : t.border)
        .when(!on && hasLive && !hovered && !selected, el => el.opacity(0.48))
        .tooltip(pillTip)
        .on_hover((isOn, cx2) => {
          if (isOn) this.hoveredAgent = a.id;
          else if (this.hoveredAgent === a.id) this.hoveredAgent = null;
          cx2.notify();
        })
        .when(canCli, el => el.on_mouse_down("right", (_e, cx2) => {
          cx2.stop_propagation();
          this.spawnAction(cx2, (cx3) => this.openAgentMenu(a.id, i, cx3));
        }))
        .on_click((_, cx2) => {
          this.selectedAgent = selected ? null : a.id;
          this.selectedAcct = null;
          cx2.notify();
        })
        .child(leading)
        .child(div().text_size(11).font_semibold().min_w(0).overflow_hidden().whitespace_nowrap()
          .text_color(ticked ? t.accent : (on || hovered || selected) ? t.foreground : t.muted)
          .child(this.fitText(agentLabel(a.id), 11, Math.max(12, g.agentW - 29), true))));
    }
    // Account chips: compact layout with 1px hairline divider (`|`) and zero-overflow accounting.
    //   pillW = BORDER(2) + PAD_X*2(12) + DOT(6) + DOT_GAP(5) [+ DIVIDER_W(9)] + name + model
    const BORDER = 2, PAD_X = 6, DOT = 6, DOT_GAP = 5, SEP_GAP = 4, SEP_W = 1, DIVIDER_W = SEP_GAP * 2 + SEP_W;
    const acctModels = this.accounts.map((a) => shortModelName(a.model, "", a.name));
    const hasModel = acctModels.some(Boolean);
    const chromeW = BORDER + PAD_X * 2 + DOT + DOT_GAP + (hasModel ? DIVIDER_W : 0);

    let rawNameW = 0, rawModelW = 0;
    for (let j = 0; j < this.accounts.length; j++) {
      const a = this.accounts[j];
      rawNameW = Math.max(rawNameW, this.estTextW(a.name, 11, true));
      if (acctModels[j]) rawModelW = Math.max(rawModelW, this.estTextW(acctModels[j], 9.5, false));
    }

    const pillW = g.acctW;
    const innerW = Math.max(48, pillW - chromeW);

    let nameColB = rawNameW, modelColB = rawModelW;
    if (rawNameW + rawModelW > innerW) {
      nameColB = Math.min(rawNameW, Math.round(innerW * 0.55));
      modelColB = innerW - nameColB;
      if (rawModelW <= modelColB) {
        modelColB = rawModelW;
        nameColB = innerW - modelColB;
      }
    }

    for (let j = 0; j < this.accounts.length; j++) {
      const a = this.accounts[j], b = g.acct(j);
      const hot = liveSeats.get(a.key);
      const hovered = this.hoveredAcct === a.key;
      const selected = this.selectedAcct === a.key;
      const errShake = this.shakes.has(a.key);
      const aNameW = this.estTextW(a.name, 11, true);
      const aModel = acctModels[j];
      const aModelW = aModel ? this.estTextW(aModel, 9.5, false) : 0;
      let rowNameMax = nameColB;
      let rowModelMax = modelColB;
      if (!aModel) {
        rowNameMax = innerW + (hasModel ? DIVIDER_W : 0);
        rowModelMax = 0;
      } else {
        const availModel = Math.max(0, innerW - Math.min(aNameW, nameColB));
        if (aModelW <= availModel && aNameW > nameColB) {
          rowModelMax = aModelW;
          rowNameMax = Math.min(aNameW, Math.max(0, innerW - rowModelMax));
        } else {
          rowNameMax = Math.min(aNameW, nameColB);
          rowModelMax = Math.min(aModelW, Math.max(0, innerW - rowNameMax));
        }
      }
      const nameTxt = this.fitText(a.name, 11, rowNameMax, true);
      const modelTxt = aModel ? this.fitText(aModel, 9.5, rowModelMax, false) : "";
      const hotColor = errShake ? "#e26a6a" : hot;
      children.push(h_flex().id(`acct-pill-${a.key}`).absolute().left(b.x1 + shake(a.key)).top(b.cy - 13)
        .w(pillW).h(26).overflow_hidden()
        .items_center().px(PAD_X).rounded(7).cursor_pointer()
        .bg(selected ? t.selected : hot ? rgba(hotColor, 0.07) : hovered ? t.raised : t.canvas)
        .border(1)
        .border_color(errShake ? "#e26a6a" : selected ? t.accent : hot ? rgba(hot, 0.75) : hovered ? t.selected : t.border)
        .when(!hot && hasLive && !hovered && !selected, el => el.opacity(0.48))
        .on_hover((isOn, cx2) => {
          if (isOn) this.hoveredAcct = a.key;
          else if (this.hoveredAcct === a.key) this.hoveredAcct = null;
          cx2.notify();
        })
        .on_click((_, cx2) => {
          this.selectedAcct = selected ? null : a.key;
          this.selectedAgent = null;
          cx2.notify();
        })
        .child(h_flex().items_center().gap(DOT_GAP).flex_none().min_w(0).overflow_hidden()
          .max_w(DOT + DOT_GAP + rowNameMax)
          .child(div().id(`acct-dot-${a.key}`).size(DOT).rounded(3)
            .bg(errShake ? "#e26a6a" : hot ? hot : "#8a6d3f").flex_none()
            .when(hot, el => el.loop("opacity", { from: 1, to: .4, period: 1200 })))
          .child(div().text_size(11).font_semibold().min_w(0).max_w(rowNameMax)
            .overflow_hidden().whitespace_nowrap()
            .text_color((hot || hovered || selected) ? t.foreground : t.muted)
            .child(nameTxt)))
        .when(Boolean(modelTxt), el => el
          .child(div().mx(SEP_GAP).w(SEP_W).h(10).flex_none()
            .bg(hot ? rgba(hotColor, 0.35) : t.border))
          .child(div().text_size(9.5).text_color(t.dim).flex_1().min_w(0).max_w(rowModelMax)
            .overflow_hidden().whitespace_nowrap()
            .child(modelTxt))));
    }

    for (const b of birds) children.push(b);

    // Active stage flows render according to stageStyle (magpie / stream / minimal).

    const matchesFilter = (r) => {
      if (this.selectedAgent) return r.agent === this.selectedAgent;
      if (this.selectedAcct) {
        return (r.tries || []).some(tr =>
          tr.id === this.selectedAcct || this.seatEntry(r, tr)?.key === this.selectedAcct);
      }
      return true;
    };
    const routes = [...this.routes.values()].sort((a, b) => b.id - a.id).filter(matchesFilter);
    const inFlightAll = routes.filter(r => !r.done);
    const recentAll = routes.filter(r => r.done).slice(0, 40);
    const errorRoutes = recentAll.filter(r => r.status && r.status >= 400);
    if ((this.statusFilter === "active" && !inFlightAll.length) || (this.statusFilter === "error" && !errorRoutes.length)) {
      this.statusFilter = null;
    }
    const activeFilter = this.statusFilter;
    const inFlight = activeFilter === "error" ? [] : inFlightAll;
    const recent = activeFilter === "active" ? [] : (activeFilter === "error" ? errorRoutes : recentAll);

    const rowFor = (r) => {
      const agent = r.agent || "?";
      const agentDisp = agentLabel(agent);
      const group = r.group?.ref || r.group?.id || "";
      const seatKey = r.tries?.length ? this.seatOf(r, r.tries.length - 1) : null;
      const acctRow = seatKey ? this.acctOf(seatKey) : null;
      const acct = acctRow?.name || r.provider || "?";
      const rawModel = r.served || r.model || "";
      const displayModel = (rawModel && rawModel !== group) ? rawModel : (acctRow?.model || "");
      const model = displayModel || rawModel || "?";
      const cleanModel = shortModelName(displayModel, r.provider, acct);
      const badgeRaw = (group && cleanModel && group !== cleanModel)
        ? `${group} · ${cleanModel}`
        : (cleanModel || group || "");
      const d = r.time ? new Date(r.time) : null;
      const time = d ? [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":") : "";
      const tries = r.tries?.length || 0;
      const retry = tries > 1 ? `${tries} try · ` : "";
      const tps = r.done ? this.toksPerS(r) : "";
      const cache = r.done ? this.cacheHit(r) : null;
      // the state dot and the seat's name share the request's colour:
      // gold active, green answered, red failed — magpie's row read
      const failed = r.done && r.status && r.status >= 400;
      const errLabel = failed
        ? `${r.status}${HTTP_REASONS[r.status] ? ` ${HTTP_REASONS[r.status]}` : ""}`
        : "";
      const stat = r.done
        ? (failed
          ? `${retry}${errLabel}${r.tokens ? ` · ${this.fmtTok(r.tokens)} tok` : ""} · ${this.fmtMs(r.ms)}`
          : `${retry}${this.fmtTok(r.tokens)} tok · ${this.fmtMs(r.ms)}${tps && tps !== "—" ? ` · ${tps}` : ""}${cache != null ? ` · ${cache}% cached` : ""}`)
        : `${retry}${this.fmtElapsed(now - new Date(r.time).getTime())}`;
      const whoColor = !r.done ? "#d4b06a" : failed ? "#e26a6a" : "#34d399";
      const dotColor = !r.done ? "#facc15" : failed ? "#e26a6a" : "#34d399";
      const shown = !this.masked && acctRow?.who && acctRow.who !== acctRow.name
        ? acctRow.who : null;
      const expanded = this.expandedRouteId === r.id;
      const modelDiff = r.model && r.served && r.served !== r.model && !r.model.endsWith(`/${r.served}`);
      const modelLabel = modelDiff ? `${r.model} → ${r.served}` : model;
      const metrics = [
        r.ttft != null ? `TTFT ${this.fmtMs(r.ttft)}` : null,
        r.in ? `in ${this.fmtTok(r.in)}` : null,
        r.out ? `out ${this.fmtTok(r.out)}` : null,
        cache != null ? `cache hit ${cache}%` : null,
      ].filter(Boolean).join(" · ");

      const rowInnerW = Math.max(160, (g.W + 14) - 4);
      const detailBarW = Math.max(110, Math.round(rowInnerW - 42));
      const buildSegBar = (segs, totalVal, hPx) => {
        if (!segs.length || totalVal <= 0) return null;
        const segSum = segs.reduce((s, x) => s + x.val, 0);
        if (segSum <= 0) return null;
        const targetFillW = segSum >= totalVal
          ? detailBarW
          : Math.min(detailBarW, Math.max(segs.length * 2, Math.round((segSum / totalVal) * detailBarW)));
        let usedW = 0;
        const bars = segs.map((seg, idx) => {
          const remaining = Math.max(0, targetFillW - usedW);
          const minReserve = (segs.length - 1 - idx) * 2;
          let wPx;
          if (idx === segs.length - 1) {
            wPx = remaining;
          } else {
            const rawW = Math.max(2, Math.round((seg.val / totalVal) * detailBarW));
            wPx = Math.min(rawW, Math.max(2, remaining - minReserve));
          }
          usedW += wPx;
          return div().w(wPx).h(hPx).bg(seg.color).flex_none();
        });
        return h_flex().w(detailBarW).h(hPx).rounded(hPx / 2).overflow_hidden().bg(t.border).children(bars);
      };

      let ctxBlock = null;
      let timingBlock = null;
      let diagBadges = null;
      if (expanded) {
        if (r.prompt?.tokens > 0) {
          const pTok = r.prompt.tokens;
          const pWin = r.prompt.window || 0;
          const pPct = pWin > 0 ? Math.min(100, Math.round((pTok / pWin) * 100)) : null;
          const pCol = pPct == null ? t.muted : pPct >= 85 ? "#e26a6a" : pPct >= 60 ? "#d4b06a" : "#34d399";
          const parts = (r.prompt.parts || []).filter((p) => p?.tokens > 0);
          const partSum = parts.reduce((s, p) => s + p.tokens, 0);
          const ctxDenom = Math.max(pTok, partSum);
          const partSegs = parts.map((p) => ({
            val: p.tokens,
            color: PROMPT_PART_COLORS[p.kind] || "#94a3b8",
            kind: PROMPT_PART_NAMES[p.kind] || p.kind,
            pct: Math.max(1, Math.round((p.tokens / ctxDenom) * 100)),
          }));
          const topLegend = [...partSegs].sort((a, b) => b.val - a.val).slice(0, 3);
          const barEl = buildSegBar(partSegs, ctxDenom, 5);
          ctxBlock = v_flex().gap(3).pt(1)
            .child(h_flex().items_center().justify_between().text_size(9).min_w(0)
              .child(div().text_color(t.muted).child(pWin > 0
                ? `Context ${this.fmtTok(pTok)} / ${this.fmtTok(pWin)}`
                : `Prompt ${this.fmtTok(pTok)}`))
              .child(div().text_color(pCol).font_semibold().child([
                pPct != null ? `${pPct}%` : null,
                r.prompt.turns ? `${r.prompt.turns} turns` : null,
              ].filter(Boolean).join(" · "))))
            .when(Boolean(barEl), (el) => el.child(barEl))
            .when(topLegend.length > 0, (el) => el.child(h_flex().gap(8).items_center().flex_wrap()
              .children(topLegend.map((lg) => h_flex().gap(3).items_center().text_size(8.5).text_color(t.dim)
                .child(div().size(5).rounded(2.5).bg(lg.color).flex_none())
                .child(`${lg.kind} ${lg.pct}%`)))));
        }
        const phases = computeTimingPhases(r);
        if (phases.length > 0) {
          const pSegs = phases.map((p) => ({ val: p.ms, color: p.color, label: p.label, ms: p.ms }));
          const tDenom = Math.max(Math.round(r.ms || 0), pSegs.reduce((s, x) => s + x.val, 0));
          const tBar = buildSegBar(pSegs, tDenom, 4);
          timingBlock = v_flex().gap(3).pt(1)
            .when(Boolean(tBar), (el) => el.child(tBar))
            .child(h_flex().gap(8).items_center().flex_wrap()
              .children(phases.map((p) => h_flex().gap(3).items_center().text_size(8.5).text_color(t.dim)
                .child(div().size(5).rounded(2.5).bg(p.color).flex_none())
                .child(`${p.label} ${this.fmtMs(p.ms)}`))));
        }
        const bList = [];
        if (r.affinity) {
          const affText = r.affinity.kept
            ? `Affinity kept${r.affinity.cacheRead > 0 ? ` (${this.fmtTok(r.affinity.cacheRead)})` : ""}`
            : `Affinity: ${r.affinity.why || "rerouted"}`;
          bList.push(div().px(5).py(1).rounded(4).text_size(8.5)
            .bg(t.surface).border(1).border_color(t.border)
            .text_color(r.affinity.kept ? "#34d399" : "#d4b06a")
            .child(affText));
        }
        if (r.masked?.n > 0) {
          const kinds = Object.entries(r.masked.kinds || {})
            .sort((a, b) => b[1] - a[1]).slice(0, 2)
            .map(([k, v]) => `${v} ${k}`).join(" · ");
          bList.push(div().px(5).py(1).rounded(4).text_size(8.5)
            .bg(t.surface).border(1).border_color(t.border)
            .text_color(t.accent)
            .child(`${r.masked.n} masked${kinds ? ` (${kinds})` : ""}`));
        }
        if (r.effort) {
          bList.push(div().px(5).py(1).rounded(4).text_size(8.5)
            .bg(t.surface).border(1).border_color(t.border)
            .text_color(t.muted)
            .child(`effort ${r.effort}`));
        }
        if (bList.length) diagBadges = h_flex().gap(4).items_center().flex_wrap().pt(1).children(bList);
      }

      const detailBlock = expanded ? v_flex().mt(4).ml(20).px(8).py(6).gap(3).rounded(6).min_w(0).overflow_hidden()
        .bg(t.canvas).border(1).border_color(t.border)
        .child(div().text_size(9.5).text_color(t.muted).min_w(0).truncate().child(modelLabel))
        .when(Boolean(metrics), el => el.child(div().text_size(9.5).text_color(t.dim).min_w(0).truncate().child(metrics)))
        .when(Boolean(ctxBlock), el => el.child(ctxBlock))
        .when(Boolean(timingBlock), el => el.child(timingBlock))
        .when(Boolean(diagBadges), el => el.child(diagBadges))
        .children((r.tries || []).map((tr, idx) => {
          const tSeat = this.acctOf(tr.id);
          const tName = tSeat?.name || provLabel(tr.name || tr.id || "?");
          const tFail = tr.done && tr.status && tr.status >= 400;
          const tCol = !tr.done ? "#facc15" : tFail ? "#e26a6a" : "#34d399";
          const tStat = !tr.done ? "active" : `${tr.status || "ok"}${tr.ms ? ` · ${this.fmtMs(tr.ms)}` : ""}`;
          return h_flex().gap(6).items_center().text_size(9.5).min_w(0)
            .child(div().text_color(t.dim).flex_none().child(`#${idx + 1}`))
            .child(div().size(4).rounded(2).bg(tCol).flex_none())
            .child(div().text_color(t.foreground).truncate().flex_1().min_w(0).child(tName))
            .child(div().text_color(tFail ? "#e26a6a" : t.dim).flex_none().child(tStat));
        })) : null;
      const timeW = this.estTextW(time, 10, false);
      const topAvail = Math.max(80, rowInnerW - 54 - timeW);
      const agentMax = Math.min(84, Math.max(32, Math.floor(topAvail * 0.34)));
      const agentTxt = this.fitText(agentDisp, 11.5, agentMax, true);
      const afterAgent = Math.max(24, topAvail - this.estTextW(agentTxt, 11.5, true));
      const acctNeed = this.estTextW(acct, 11, true);
      const minBadgeTotal = badgeRaw ? 48 : 0;
      const acctMax = acctNeed + minBadgeTotal <= afterAgent
        ? acctNeed
        : Math.max(28, Math.min(110, afterAgent - minBadgeTotal));
      const acctTxt = this.fitText(acct, 11, acctMax, true);
      // badge chrome is 22px, not 20: px(6)*2 + border(2) + ml(2) shell = 16,
      // plus the gap(4) the badge adds as a seventh flex child — the row's
      // fixed chrome with a badge is 76px (icon 13 + 7 gaps 28 + arrow 12 +
      // shell 16 + spacer 2 + dot 5), so the text budget must shrink by 2.
      const badgeRem = afterAgent - this.estTextW(acctTxt, 11, true) - 22;
      const badgeTxt = (badgeRaw && badgeRem >= 20) ? this.fitText(badgeRaw, 9.5, badgeRem, false) : "";

      const plW = g.W < 270 ? 15 : 17;
      const line2W = Math.max(100, rowInnerW - plW);
      const statW = this.estTextW(stat, 10, false);
      const remShown = (r.done && !this.masked && shown) ? (line2W - statW - 8) : 0;
      const shownDoneTxt = remShown >= 28 ? this.fitText(shown, 10, Math.min(120, remShown), false) : "";
      const fallbackBadge = (!r.done && !badgeTxt && badgeRaw && line2W - statW - 22 >= 20)
        ? this.fitText(badgeRaw, 9.5, Math.max(20, line2W - statW - 22), false) : "";

      const activePhase = !r.done
        ? ((r.firstReasoning && !r.firstText)
          ? "Thinking"
          : ((r.estTok > 0 || r.firstText || r.bytes > 0) ? "Streaming" : "Waiting"))
        : "";
      const promptTok = !r.done ? (r.prompt?.tokens || r.in || 0) : 0;
      const estOut = !r.done ? (r.estTok || r.out || 0) : 0;
      const fmtEstOut = (n) => n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
      const activeMetaParts = [];
      if (promptTok > 0) activeMetaParts.push(`${this.fmtTok(promptTok)} in`);
      if (estOut > 0) activeMetaParts.push(`~${fmtEstOut(estOut)} out`);
      if (!this.masked && shown) activeMetaParts.push(shown);
      const activeMetaRaw = activeMetaParts.length ? `· ${activeMetaParts.join(" · ")}` : "";

      const activeLeftW = Math.max(0, line2W - statW - 10);
      const phaseW = activePhase ? this.estTextW(activePhase, 10, true) : 0;
      const showPhase = !r.done && !fallbackBadge && activeLeftW >= phaseW;
      const activeMetaBudget = showPhase ? (activeLeftW - phaseW - 4) : 0;
      const activeMetaTxt = (activeMetaRaw && activeMetaBudget >= 24)
        ? this.fitText(activeMetaRaw, 10, activeMetaBudget, false) : "";

      return v_flex().id(`req-row-${r.id}`).gap(3).px(2).py(7).min_w(0).overflow_hidden().border_b(1).border_color(t.border)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_, cx2) => {
          this.expandedRouteId = expanded ? null : r.id;
          cx2.notify();
        })
        .child(h_flex().items_center().gap(4).min_w(0).overflow_hidden()
          .child(iconEl(agent, 13, t.muted, this.providerIcons))
          .child(div().text_size(11.5).font_semibold().text_color(t.foreground).flex_none().whitespace_nowrap().child(agentTxt))
          .child(div().text_size(10.5).text_color(t.dim).flex_none().child("→"))
          .when(Boolean(acctTxt), row => row.child(
            div().text_size(11).font_semibold().text_color(whoColor).flex_none().whitespace_nowrap().child(acctTxt)))
          .when(Boolean(badgeTxt), row => row.child(
            div().ml(2).px(6).py(1).rounded(6).flex_none()
              .bg(t.canvas).border(1).border_color(t.border)
              .text_size(9.5).text_color(t.foreground)
              .overflow_hidden().whitespace_nowrap()
              .child(badgeTxt)))
          .child(div().flex_1().min_w(2))
          .child(div().id(`req-dot-${r.id}`).size(5).rounded(3).bg(dotColor).flex_none()
            .when(!r.done, el => el.loop("opacity", { from: 1, to: .35, period: 1100 })))
          .child(div().text_size(10).text_color(t.dim).flex_none().whitespace_nowrap().child(time)))
        .when(r.done, el => el.child(h_flex().items_center().gap(6).pl(plW).min_w(0).overflow_hidden()
          .child(div().text_size(10).text_color(failed ? "#e26a6a" : t.dim).min_w(0).overflow_hidden().whitespace_nowrap().child(stat))
          .when(Boolean(shownDoneTxt), row => row
            .child(div().flex_1().min_w(4))
            .child(div().text_size(10).text_color(t.dim).flex_none().whitespace_nowrap().child(shownDoneTxt)))))
        .when(!r.done, el => el.child(h_flex().items_center().pl(plW).min_w(0).overflow_hidden()
          .when(Boolean(fallbackBadge), row => row.child(
            div().px(6).py(1).rounded(6).flex_none()
              .bg(t.canvas).border(1).border_color(t.border)
              .text_size(9.5).text_color(t.foreground)
              .overflow_hidden().whitespace_nowrap()
              .child(fallbackBadge)))
          .when(showPhase, row => row.child(h_flex().items_center().gap(4).min_w(0).overflow_hidden()
            .child(div().text_size(10).font_medium().text_color("#d4b06a").flex_none().whitespace_nowrap().child(activePhase))
            .when(Boolean(activeMetaTxt), meta => meta.child(
              div().text_size(10).text_color(t.dim).flex_none().whitespace_nowrap().child(activeMetaTxt)))))
          .child(div().flex_1().min_w(6))
          .child(div().text_size(10).text_color(t.dim).flex_none().whitespace_nowrap().child(stat))))
        .when(Boolean(detailBlock), el => el.child(detailBlock));
    };

    const filterLabel = this.selectedAgent ? agentLabel(this.selectedAgent) : (this.selectedAcct ? (this.acctOf(this.selectedAcct)?.name || this.selectedAcct) : null);
    const list = v_flex().id("requests-list").flex_1().min_h(0)
      .overflow_y_scrollbar().px(10).pb(4).gap(0);
    // No sub-headers: a section label that comes and goes with every request
    // made the list jump. The header row carries both counts instead.
    for (const r of inFlight) list.child(rowFor(r));
    for (const r of recent) list.child(rowFor(r));
    if (!inFlight.length && !recent.length) {
      list.child(div().px(2).py(12).text_size(11).text_color(t.dim).child((filterLabel || activeFilter) ? "No matching requests." : "No request yet."));
    }

    const updatePill = this.updatePill(t);
    const cliCtrl = this.cliControlState();
    const hasProfiles = cliCtrl.writable && this.profiles.length > 0;
    const rawRemote = String(this.remoteLabel || "");
    const headerHost = (hasProfiles && Boolean(updatePill) && g.W < 340)
      ? ((/:\d+$/.exec(rawRemote)?.[0]) || rawRemote.replace(/^localhost\s*·\s*/i, ""))
      : this.remoteLabel;
    const showQuotaHover = !this.quotaOpen && Boolean(this.hoveredQuotaProv && this.quotas?.[this.hoveredQuotaProv]) && !this.agentMenu && !this.profileMenuOpen;
    const popoverChildren = (!this.offline && ((cliCtrl.writable && (this.agentMenu || this.profileMenuOpen)) || showQuotaHover)) ? this.renderPopovers(t, g) : [];
    return div().relative().size_full().bg(t.surface).text_color(t.foreground)
      .child(v_flex().size_full()
        .child(h_flex().px(12).pt(10).pb(6).gap(6).items_center()
          .child(div().text_size(13).font_semibold().child("Magpie"))
          .when(Boolean(updatePill), el => el
            .child(div().text_size(11).text_color(t.dim).flex_none().child("·"))
            .child(updatePill))
          .child(div().flex_1())
          .child(div().id("open-magpie").text_size(9.5).text_color(t.dim).min_w(0).truncate()
            .when(cliCtrl.targetOk, el => el.cursor_pointer()
              .hover(s => s.text_color(t.foreground))
              .tooltip(`${rawRemote} · Click to open Magpie panel`)
              .on_click((_, cx2) => { this.spawnAction(cx2, (cx3) => this.openMagpiePanel(cx3)); }))
            .when(!cliCtrl.targetOk && Boolean(cliCtrl.reason), el => el.tooltip(`${rawRemote} · ${cliCtrl.reason}`))
            .child(headerHost))
          .when(hasProfiles, el => el
            .child(h_flex().id("profile-toggle").px(5).py(1).gap(3).rounded(4).items_center().flex_none()
              .cursor_pointer().bg(this.profileMenuOpen ? t.selected : t.canvas)
              .border(1).border_color(this.profileMenuOpen ? t.accent : t.border)
              .hover(s => s.bg(t.hover))
              .tooltip("Switch Magpie routing profile")
              .on_click((_, cx2) => {
                cx2.stop_propagation();
                this.agentMenu = null;
                this.hoveredQuotaProv = null;
                this.profileMenuOpen = !this.profileMenuOpen;
                cx2.notify();
              })
              .child(div().text_size(9).font_medium().text_color(t.muted).child(this.activeProfile || "Profile"))
              .child(div().text_size(8.5).text_color(t.dim).child("▾")))))
        .when(this.offline, el => el.child(div().px(12).py(16).text_size(11.5).text_color(t.muted).child(this.offline)))
        .when(!this.offline, el => el
          .child(div().id("stage-card").relative().mx(10).mb(8).p(6).rounded(10).bg(t.canvas).border(1).border_color(t.border)
            .on_hover((isOn, cx2) => { if (this.stageHovered !== isOn) { this.stageHovered = isOn; cx2.notify(); } })
            .child(div().relative().w_full().h(g.H)
              .id("stage").on_size_change((size, cx) => {
                const zoom = settings().zoom || 1;
                const w = size.width / zoom, h = size.height / zoom;
                const widthChanged = Math.abs(w - this.size.width) >= 0.5;
                this.size = { width: w, height: h };
                if (widthChanged) cx.notify();
              })
              .children(children))
            .when(this.stageHovered, el2 => el2.child(
              h_flex().id("stage-style-toggle").absolute().right(6).bottom(3)
                .px(6).py(1).gap(4).rounded(5).items_center().cursor_pointer()
                .bg(t.surface).border(1).border_color(t.border)
                .hover(s => s.bg(t.hover).border_color(t.selected))
                .tooltip(`Stage style: ${STAGE_STYLE_LABELS[this.stageStyle]} (click to switch)`)
                .on_click((_, cx2) => { cx2.stop_propagation(); this.cycleStageStyle(cx2); })
                .child(this.stageStyle === "magpie"
                  ? svg("mods/routing/icons/magpie.svg").size(10).flex_none().text_color(t.accent)
                  : this.stageStyle === "stream"
                    ? svg("mods/routing/route.svg").size(10).flex_none().text_color(t.accent)
                    : div().size(6).rounded(3).bg(t.muted).flex_none())
                .child(div().text_size(9).font_medium().text_color(t.muted)
                  .child(STAGE_STYLE_LABELS[this.stageStyle])))))
          .child(this.quotaPanel(t))
          .child(h_flex().px(12).pt(2).pb(2).gap(6).items_center()
            .child(div().text_size(11).font_semibold().flex_none().child("Requests"))
            .when(Boolean(filterLabel), el => el.child(h_flex().id("clear-filter").px(6).py(1).gap(4).rounded(4)
              .bg(t.canvas).border(1).border_color(t.border).items_center().cursor_pointer()
              .hover(s => s.bg(t.hover))
              .on_click((_, cx2) => { this.selectedAgent = null; this.selectedAcct = null; this.statusFilter = null; cx2.notify(); })
              .child(div().text_size(9.5).text_color(t.accent).max_w(100).truncate().child(filterLabel))
              .child(div().text_size(9.5).text_color(t.dim).child("×"))))
            .when(inFlightAll.length > 0, el => el
              .child(div().id("filter-active").text_size(9.5).flex_none().cursor_pointer()
                .when(activeFilter === "active", e2 => e2.px(5).py(1).rounded(4).bg(t.canvas).border(1).border_color("#d4b06a"))
                .text_color("#d4b06a")
                .hover(s => s.opacity(0.8))
                .on_click((_, cx2) => { this.statusFilter = activeFilter === "active" ? null : "active"; cx2.notify(); })
                .child(`${inFlightAll.length} active`))
              .when(recentAll.length > 0 || errorRoutes.length > 0, el2 => el2.child(div().text_size(9.5).text_color(t.dim).flex_none().child("·"))))
            .when(recentAll.length > 0, el => el
              .child(div().text_size(9.5).text_color(t.dim).flex_none().child(`${recentAll.length} recent`)))
            .when(errorRoutes.length > 0, el => el
              .when(recentAll.length > 0, e2 => e2.child(div().text_size(9.5).text_color(t.dim).flex_none().child("·")))
              .child(div().id("filter-errors").text_size(9.5).flex_none().cursor_pointer()
                .when(activeFilter === "error", e2 => e2.px(5).py(1).rounded(4).bg(t.canvas).border(1).border_color("#e26a6a"))
                .text_color("#e26a6a")
                .hover(s => s.opacity(0.8))
                .on_click((_, cx2) => { this.statusFilter = activeFilter === "error" ? null : "error"; cx2.notify(); })
                .child(`${errorRoutes.length} err`)))
            .child(div().flex_1())
            .child(h_flex().id("toggle-masked").gap(4).items_center().flex_none()
              .cursor_pointer()
              .on_click((_, cx2) => { this.masked = !this.masked; cx2.notify(); })
              .child(svg(`mods/routing/icons/${this.masked ? "eye-off" : "eye"}.svg`).size(11)
                .text_color(this.masked ? t.muted : t.accent))
              .child(div().text_size(9.5)
                .text_color(this.masked ? t.muted : t.accent)
                .child(this.masked ? "Masked" : "Shown"))))
          .child(list)
          .child(h_flex().px(12).py(6).gap(6).items_center().border_t(1).border_color(t.border)
            .child(div().text_size(10).text_color(t.dim).truncate().flex_1().min_w(0)
              .child(`pid ${this.pid || "—"} · ${this.totals.requests} calls · ${this.totals.rerouted} retried`))
            .child(div().id("toggle-alerts").px(5).py(1).rounded(4).text_size(9.5).flex_none()
              .cursor_pointer()
              .bg(this.alertsEnabled ? t.canvas : t.surface)
              .border(1).border_color(this.alertsEnabled ? t.border : t.surface)
              .text_color(this.alertsEnabled ? t.accent : t.dim)
              .hover(s => s.bg(t.hover).text_color(t.foreground))
              .tooltip(this.alertsEnabled ? "Quota & error notifications ON (click to mute)" : "Notifications muted (click to enable)")
              .on_click((_, cx2) => { cx2.stop_propagation(); this.toggleAlerts(cx2); })
              .child(this.alertsEnabled ? "Alerts" : "Muted"))
            .child(div().id("refresh-all").px(4).py(1).rounded(4).text_size(11).flex_none()
              .text_color(this.traceBusy || this.quotaBusy ? t.accent : t.dim)
              .cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
              .on_click((_, cx2) => { this.refreshAll(cx2); })
              .child("⟳")))))
      .children(popoverChildren);
  }

  renderPopovers(t, g) {
    const out = [];
    const cliCtrl = this.cliControlState();
    const showAgentMenu = Boolean(this.agentMenu && cliCtrl.writable);
    const showProfileMenu = Boolean(this.profileMenuOpen && cliCtrl.writable);
    if (showAgentMenu || showProfileMenu) {
      out.push(div().id("popover-backdrop").absolute().inset_0()
        .on_mouse_down("left", (_e, cx2) => { cx2.stop_propagation(); this.closeMenus(cx2); }));
    }
    if (showAgentMenu) {
      const m = this.agentMenu;
      const cliAgent = m.cliAgent || resolveCliAgent(m.agent);
      const isBusy = Boolean(m.busy || (cliAgent && this.agentWrites.has(cliAgent)));
      const activeModel = (m.models || []).find((x) =>
        m.currentModel && (x.id === m.currentModel || x.id.endsWith(`/${m.currentModel}`)));
      const efforts = activeModel?.efforts?.length
        ? activeModel.efforts
        : (m.currentEffort ? ["low", "medium", "high", "xhigh", "max"] : []);
      const popTop = Math.min(240, 88 + (m.rowIndex || 0) * 28);
      out.push(v_flex().id("agent-menu-popover").absolute().left(10).right(10).max_w(312).top(popTop).overflow_hidden()
        .p(8).gap(6).rounded(8).bg(t.surface).border(1).border_color(t.accent)
        .on_mouse_down("left", (_e, cx2) => cx2.stop_propagation())
        .child(h_flex().items_center().gap(6)
          .child(iconEl(m.agent, 13, hueOf(m.agent), this.providerIcons))
          .child(div().text_size(11).font_semibold().flex_1().truncate()
            .child(`${agentLabel(m.agent)} Quick Switch`))
          .when(isBusy, el => el.child(div().text_size(9).text_color(t.accent).child("Applying…")))
          .child(div().id("agent-menu-close").px(4).text_size(11).text_color(t.dim).cursor_pointer()
            .hover(s => s.text_color(t.foreground))
            .on_click((_, cx2) => { cx2.stop_propagation(); this.closeMenus(cx2); })
            .child("×")))
        .when(m.loading, el => el.child(div().text_size(9.5).text_color(t.dim).py(4).child("Loading agent config…")))
        .when(Boolean(m.error), el => el.child(div().text_size(9.5).text_color("#e26a6a").child(m.error)))
        .when(!m.loading && efforts.length > 0, el => el
          .child(v_flex().gap(3)
            .child(div().text_size(9).text_color(t.dim).child("Effort"))
            .child(h_flex().gap(4).items_center().flex_wrap()
              .children(efforts.map((eff) => {
                const cur = m.currentEffort === eff;
                return div().id(`effort-${eff}`).px(6).py(2).rounded(4).text_size(9.5)
                  .bg(cur ? t.selected : t.canvas)
                  .border(1).border_color(cur ? t.accent : t.border)
                  .text_color(cur ? t.foreground : t.muted)
                  .when(cur, e => e.font_semibold())
                  .when(isBusy, e => e.opacity(0.55))
                  .when(!isBusy, e => e.cursor_pointer().hover(s => s.bg(t.hover))
                    .on_click((_, cx2) => { cx2.stop_propagation(); this.spawnAction(cx2, (cx3) => this.setAgentEffort(m.agent, eff, cx3)); }))
                  .child(eff);
              })))))
        .when(!m.loading && m.models?.length > 0, el => el
          .child(v_flex().gap(3)
            .child(div().text_size(9).text_color(t.dim).child("Model"))
            .child(v_flex().id("agent-models-list").max_h(190).overflow_y_scroll().gap(2)
              .children(m.models.map((mod) => {
                const isCur = Boolean(m.currentModel && (mod.id === m.currentModel || mod.id.endsWith(`/${m.currentModel}`)));
                return h_flex().id(`pick-model-${mod.id}`).px(6).py(4).gap(6).rounded(5).items_center()
                  .bg(isCur ? t.selected : t.canvas)
                  .border(1).border_color(isCur ? t.accent : t.border)
                  .when(isBusy, e => e.opacity(0.55))
                  .when(!isBusy, e => e.cursor_pointer().hover(s => s.bg(t.hover))
                    .on_click((_, cx2) => { cx2.stop_propagation(); this.spawnAction(cx2, (cx3) => this.setAgentModel(m.agent, mod.id, cx3)); }))
                  .child(div().size(5).rounded(2.5).bg(isCur ? t.accent : t.dim).flex_none())
                  .child(div().text_size(10).when(isCur, e => e.font_semibold()).text_color(isCur ? t.foreground : t.muted).truncate().flex_1().min_w(0)
                    .child(mod.label || shortModelName(mod.id)))
                  .child(div().text_size(8.5).text_color(t.dim).max_w(118).truncate().flex_none().child(mod.id));
              }))))));
    }
    if (showProfileMenu) {
      const popW = Math.min(264, Math.max(200, g.W));
      out.push(v_flex().id("profile-menu-popover").absolute().right(10).top(34).w(popW).overflow_hidden()
        .p(8).gap(4).rounded(8).bg(t.surface).border(1).border_color(t.accent)
        .on_mouse_down("left", (_e, cx2) => cx2.stop_propagation())
        .child(h_flex().items_center().justify_between()
          .child(div().text_size(10.5).font_semibold().child("Switch Profile"))
          .when(Boolean(this.profileBusy), el => el.child(div().text_size(9).text_color(t.accent).child(`Switching ${this.profileBusy}…`))))
        .children(this.profiles.map((p) => {
          const isCur = p.name === this.activeProfile;
          return v_flex().id(`pick-profile-${p.name}`).px(6).py(4).gap(2).rounded(5).cursor_pointer()
            .bg(isCur ? t.selected : t.canvas)
            .border(1).border_color(isCur ? t.accent : t.border)
            .hover(s => s.bg(t.hover))
            .on_click((_, cx2) => { cx2.stop_propagation(); this.spawnAction(cx2, (cx3) => this.applyProfile(p.name, cx3)); })
            .child(h_flex().items_center().justify_between()
              .child(div().text_size(10).font_semibold().text_color(isCur ? t.foreground : t.muted).child(p.name))
              .when(isCur, el => el.child(div().text_size(9).text_color(t.accent).child("active"))))
            .child(div().text_size(8.5).text_color(t.dim).truncate().child(p.summary));
        })));
    }
    if (!this.quotaOpen && this.hoveredQuotaProv && this.quotas?.[this.hoveredQuotaProv] && !this.agentMenu && !this.profileMenuOpen) {
      const provId = this.hoveredQuotaProv;
      const group = this.quotas[provId];
      const accts = this.orderedAccounts(provId, group.accounts || []);
      const rate = this.burnRateOf(provId);
      const acctCards = accts.slice(0, 4).map((q, idx) => {
        const lbl = this.safeAcctAlias(q) || (!this.masked && q.user ? q.user : (accts.length > 1 ? `Account ${q.num || idx + 1}` : "Account"));
        const planTxt = q.plan ? String(q.plan).replace(/\b([a-z])([a-z]*)\b/g, (_, a, b) => a.toUpperCase() + b) : "";
        const showPlan = planTxt && planTxt.toLowerCase() !== lbl.toLowerCase();
        const dotCol = q.left != null
          ? (q.left < 10 ? "#e26a6a" : q.left < 30 ? "#d4b06a" : "#34d399")
          : (q.error && !q.balance ? "#e26a6a" : "#34d399");
        const wins = (q.windows || []).filter((w) => !w.text).slice(0, 4);
        const winRows = wins.map((w) => {
          const left = this.winLeft(w);
          const frac = w.unlimited ? 1 : Math.max(0, Math.min(1, left / 100));
          const exhausted = !w.unlimited && Math.round(left) <= 0;
          const col = w.unlimited ? "#34d399" : left < 10 ? "#e26a6a" : left < 30 ? "#d4b06a" : "#34d399";
          const valTxt = w.unlimited ? "Unlimited" : exhausted ? "Exhausted" : `${Math.round(left)}%`;
          const resetTxt = w.resetsAt ? this.fmtUntil(w.resetsAt) : "";
          return h_flex().items_center().gap(5)
            .child(div().w(68).text_size(8.5).text_color(t.muted).flex_none().truncate().child(w.name || "Window"))
            .child(div().w(64).h(4).rounded(2).bg(t.border).flex_none()
              .when(frac > 0, (el) => el.child(div().h_full().rounded(2).w(Math.max(2, Math.round(64 * frac))).bg(col))))
            .child(div().text_size(8.5).font_semibold().text_color(col).flex_none().child(valTxt))
            .child(div().flex_1().min_w(2))
            .when(Boolean(resetTxt), (el) => el.child(div().text_size(8).text_color(t.dim).flex_none().child(resetTxt)));
        });
        return v_flex().p(6).gap(3).rounded(6).bg(t.canvas).border(1).border_color(t.border)
          .child(h_flex().items_center().gap(5)
            .child(div().size(5).rounded(2.5).bg(dotCol).flex_none())
            .child(div().text_size(9.5).font_semibold().text_color(t.foreground).truncate().child(lbl))
            .when(Boolean(showPlan), (el) => el.child(div().text_size(8.5).text_color(t.dim).flex_none().child(`· ${planTxt}`)))
            .child(div().flex_1().min_w(4))
            .when(Boolean(q.balance), (el) => el.child(div().text_size(8.5).text_color("#34d399").flex_none().child(String(q.balance)))))
          .children(winRows)
          .when(!wins.length && Boolean(q.error) && !q.balance, (el) => el.child(div().text_size(8.5).text_color("#e26a6a").truncate().child(shortQuotaError(q.error, this.masked))))
          .when(!wins.length && !q.error && !q.balance && typeof q.left === "number" && Number.isFinite(q.left), (el) => {
            const pct = Math.round(q.left);
            const exhausted = pct <= 0;
            const col = exhausted ? "#e26a6a" : q.left < 10 ? "#e26a6a" : q.left < 30 ? "#d4b06a" : "#34d399";
            return el.child(div().text_size(8.5).font_semibold().text_color(col).child(exhausted ? "Exhausted" : `${pct}% left`));
          })
          .when(!wins.length && !q.error && !q.balance && !(typeof q.left === "number" && Number.isFinite(q.left)), (el) => el.child(div().text_size(8.5).text_color("#34d399").child("Ready")));
      });
      out.push(v_flex().id("quota-hover-card").absolute().left(10).right(10).max_w(312).top(g.H + 106).overflow_hidden()
        .p(8).gap(6).rounded(8).bg(t.surface).border(1).border_color(t.border)
        .child(h_flex().items_center().gap(6)
          .child(iconEl(provId, 13, t.muted, this.providerIcons))
          .child(div().text_size(11).font_semibold().truncate().flex_1().min_w(0).child(provLabel(group.name || provId)))
          .when(accts.length > 1, (el) => el.child(div().text_size(8.5).text_color(t.dim).flex_none().child(`×${accts.length}`)))
          .when(Boolean(rate), (el) => el.child(div().px(5).py(1).rounded(4).bg(t.canvas).border(1).border_color(t.border)
            .text_size(8.5).text_color(rate.estHoursLeft < 4 ? "#d4b06a" : t.accent).flex_none()
            .child(`~${rate.pctPerHr}%/h · ~${rate.estHoursLeft}h`))))
        .children(acctCards));
    }
    return out;
  }
}
