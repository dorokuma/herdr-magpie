// Routing, live: magpie's Routing stage as a Herdr mod.
// A magpie carries each request from its agent through the gap between
// the columns to the account routing picked, lets it go while it answers,
// and another brings the answer back — the motion language of magpie's
// internal/gui/assets/plugins/routing (fly()/pose(), FLIER, .pkt), laid
// out for a narrow stage: no hub node, the bird flies the whole way.

import { View, div, svg, image, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { theme, exec, settings, appHome, readTextFile, notify } from "herdr";
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
const FRAME = 40;          // ms between animation frames, only while flying
const MAX_AGENTS = 4;      // the stage's four, as in magpie
const MAX_ACCOUNTS = 6;

const PAD = 12, ROW_H = 28, ROW_GAP = 8;

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
  magpie: "magpie", "remote-magpie": "magpie", workbuddy: "workbuddy-color",
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

const ICON_PATTERNS = [
  [/workbuddy/, "workbuddy-color"], [/codebuddy/, "codebuddy-color"], [/cline/, "cline"],
  [/ai-?studio|google/, "google-color"], [/gemini/, "gemini-color"],
  [/agy|antigravity/, "antigravity-color"], [/claude|anthropic/, "claude-color"],
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
  "pig", "crush", "arkapi", "aihubmix-color", "alibabacloud-color", "antigravity-color",
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

const iconEl = (id, size, color, customMap) => {
  const n = resolveIconName(id, customMap);
  if (PNG_ICONS.has(n)) return image(`mods/routing/icons/${n}.png`).size(size).flex_none();
  return svg(`mods/routing/icons/${n}.svg`).size(size).flex_none().text_color(color);
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
  const n = parseInt(hex.slice(1), 16);
  return `#${hex.slice(1)}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
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
    this.demo = false; // config.json's "demo": renders mods/routing/demo.json, asks no gateway

    cx.spawn(async (cx) => {
      await this.initTarget(cx);
      if (this.demo) return; // a demo stage is still: no polling, no frame timer
      cx.spawn(async (cx2) => this.poll(cx2));
      cx.spawn(async (cx2) => this.pollQuota(cx2));
    });
    // once a minute, against the wall clock rather than a long sleep: a laptop
    // that slept through the night is overdue the moment it wakes
    cx.timer.every(60000, (cx) => { this.maybeCheckUpdate(cx, "routine"); });
    cx.timer.every(FRAME, (cx) => {
      if (this.demo) return;
      const now = Date.now();
      let changed = false;
      for (const [id, f] of this.flights) {
        const prevState = f.state;
        const prevPhase = f.phase;
        this.advance(f, now);
        if (f.state !== prevState || f.phase !== prevPhase) changed = true;
        if (f.state === "gone") { this.flights.delete(id); changed = true; }
      }
      for (const [k, t0] of this.shakes) if (now - t0 > 450) { this.shakes.delete(k); changed = true; }
      for (const [k, t0] of this.ticks) if (now - t0 > 400) { this.ticks.delete(k); changed = true; }
      const animating = [...this.flights.values()].some((f) => f.state === "fly") ||
        this.shakes.size > 0 || this.ticks.size > 0;
      const inFlightAny = [...this.routes.values()].some((r) => !r.done);
      const secTick = inFlightAny && (now - this.lastSecTick >= 1000);
      if (secTick) this.lastSecTick = now;
      if (animating || changed || secTick) cx.notify();
    });
  }

  execOpts(timeout = 30000) {
    return this.remote ? { on: this.remote, timeout } : { timeout };
  }

  async initTarget(cx) {
    let cfg = null;
    try {
      const raw = await readTextFile(`${appHome()}/mods/routing/config.json`);
      if (raw) {
        cfg = JSON.parse(raw);
        if (cfg.remote !== undefined) this.remote = cfg.remote || null;
        if (cfg.baseUrl) this.baseUrl = String(cfg.baseUrl).replace(/\/$/, "");
        if (cfg.label) this.remoteLabel = String(cfg.label);
        else if (this.remote) this.remoteLabel = `${this.remote} · ${this.baseUrl.replace(/^https?:\/\//, "")}`;
      }
    } catch (_) { /* optional config.json */ }
    if (cfg?.demo) {
      this.demo = true;
      await this.loadDemo(cx);
      return;
    }
    this.configReady = true;
    this.discoverProviders().then(() => cx.notify()).catch(() => {});
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
    this.masked = d.masked !== false;
    this.loaded = true;
    this.configReady = true;
    this.offline = "";
    cx.notify();
  }

  async discoverProviders() {
    try {
      const r = await exec("sh", ["-c", "cat ~/.config/magpie/providers.json 2>/dev/null || true"], this.execOpts(10000));
      if (!r.stdout) return;
      const d = JSON.parse(r.stdout);
      for (const p of d.providers || []) {
        if (p.id && p.icon && !String(p.icon).startsWith("file:")) {
          this.providerIcons.set(String(p.id).toLowerCase(), String(p.icon));
        }
      }
    } catch (_) { /* optional discovery */ }
  }

  async poll(cx) {
    for (;;) {
      try {
        const url = `${this.baseUrl}/v1/magpie/trace?after=${this.seq}${this.loaded ? "&wait=1" : ""}`;
        const r = await exec("curl", ["-sS", "--max-time", "35", url], this.execOpts(40000));
        const d = JSON.parse(r.stdout);
        if (d.object !== "trace") throw new Error(d.error?.message || "not a trace");
        if (d.seq < this.seq) this.routes.clear(); // the gateway started over
        this.seq = d.seq;
        this.totals = d.totals || this.totals;
        this.pid = d.pid ?? this.pid;
        const first = !this.loaded;
        for (const r of d.routes) {
          for (const o of r.order || []) {
            if (o.id && o.icon && !String(o.icon).startsWith("file:")) {
              this.providerIcons.set(String(o.id).toLowerCase(), String(o.icon));
            }
            if (o.provider && o.icon && !String(o.icon).startsWith("file:")) {
              this.providerIcons.set(String(o.provider).toLowerCase(), String(o.icon));
            }
          }
          const isNew = !this.routes.has(r.id);
          this.routes.set(r.id, r);
          if (isNew && (!first || !r.done)) this.start(r);
        }
        if (Array.isArray(d.ids)) {
          const kept = new Set(d.ids);
          for (const [id, r] of this.routes) if (!r.done && !kept.has(id)) this.routes.delete(id);
        }
        for (const id of [...this.routes.keys()].sort((a, b) => a - b).slice(0, -60)) this.routes.delete(id);
        this.loaded = true;
        this.failCount = 0;
        if (this.offline) this.maybeCheckUpdate(cx, "online");
        this.offline = "";
        this.recompute();
        cx.notify();
      } catch (e) {
        this.failCount = (this.failCount || 0) + 1;
        if (!this.routes.size || this.failCount >= 3) {
          this.offline = `Remote trace error: ${String(e).slice(0, 240)}`;
          this.loaded = false;
          cx.notify();
        }
        await cx.sleep(4000);
      }
    }
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
  // the same allowance (5 hours inside 7 days) are not averaged: the longest
  // one is the allowance, a shorter one only paces it. So the longest window's
  // share stands for the allowance, and it is spent as soon as any of its
  // windows is -- back when the last spent one resets. Windows that are not
  // spans of time (one per model, one per meter) each stand alone.
  allowances(windows) {
    const stacks = new Map(), out = [];
    for (const w of windows) {
      const span = this.winSpan(w.name);
      if (span == null) { out.push({ left: this.winLeft(w), resetsAt: w.resetsAt || "" }); continue; }
      const key = (w.pool || (w.name.includes("·") ? w.name.split("·")[0] : "")).trim().toLowerCase();
      if (!stacks.has(key)) stacks.set(key, []);
      stacks.get(key).push({ w, span });
    }
    for (const stack of stacks.values()) {
      const spent = stack.filter((s) => !s.w.unlimited && Math.round(this.winLeft(s.w)) <= 0);
      if (spent.length) {
        const resets = spent.map((s) => s.w.resetsAt).filter(Boolean).sort();
        out.push({ left: 0, resetsAt: resets[resets.length - 1] || "" });
        continue;
      }
      const longest = stack.reduce((a, b) => (b.span > a.span ? b : a));
      out.push({ left: this.winLeft(longest.w), resetsAt: longest.w.resetsAt || "" });
    }
    return out;
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
    const held = reported || byTotal ? [] : this.allowances(avgSource);
    const shownLeft = reported ? p.left
      : byTotal ? this.winLeft(total)
      : held.length ? held.reduce((a, h) => a + h.left, 0) / held.length
      : null;
    // the reset that goes with that number: the one that brings a spent
    // allowance back, else the soonest among the allowances counted
    const heldResets = held.map((h) => h.resetsAt).filter(Boolean).sort();
    const leftResetsAt = held.length === 1 ? held[0].resetsAt : (heldResets[0] || "");
    return {
      provider,
      baseProvider,
      left: shownLeft,
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
      if (typeof localStorage === "undefined") return;
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
    this.quotaBusy = true; cx.notify();
    const t0 = Date.now();
    try {
      const r = await exec("curl", ["-sS", "--max-time", "20", `${this.baseUrl}/v1/magpie/quotas`],
        this.execOpts(25000));
      const d = JSON.parse(r.stdout);
      this.quotas = this.groupQuotaEntries(d.data || [], Date.now());
      this.quotasAt = Date.now();
      cx.notify();
    } finally {
      const held = Date.now() - t0;
      if (held < 800) await cx.sleep(800 - held);
      this.quotaBusy = false; cx.notify();
    }
  }

  async refreshAll(cx) {
    if (this.demo) return;
    this.traceBusy = true;
    cx.notify();
    try {
      const url = `${this.baseUrl}/v1/magpie/trace?after=${this.seq}`;
      const r = await exec("curl", ["-sS", "--max-time", "15", url], this.execOpts(20000));
      const d = JSON.parse(r.stdout);
      if (d.object === "trace") {
        if (d.seq < this.seq) this.routes.clear();
        this.seq = d.seq;
        this.totals = d.totals || this.totals;
        this.pid = d.pid ?? this.pid;
        for (const rt of d.routes) {
          const isNew = !this.routes.has(rt.id);
          this.routes.set(rt.id, rt);
          if (isNew && !rt.done) this.start(rt);
        }
        this.loaded = true;
        this.offline = "";
        this.recompute();
      }
    } catch (_) { /* keep existing state */ }
    finally { this.traceBusy = false; cx.notify(); }
    this.fetchQuotas(cx).catch(() => {});
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
  recompute() {
    const recent = [...this.routes.values()].sort((a, b) => b.id - a.id).slice(0, 40);
    const agents = [], seenA = new Set();
    for (const r of recent) {
      const id = r.agent || "agent";
      if (!seenA.has(id)) { seenA.add(id); agents.push({ id, color: hueOf(id) }); }
      if (agents.length >= MAX_AGENTS) break;
    }
    const accounts = [], seen = new Map();
    for (const r of recent) {
      for (const w of [...(r.order || []), ...(r.tries || [])]) {
        const key = w.id || w.who || `${w.provider}/${w.name}`;
        if (!key || seen.has(key)) continue;
        seen.set(key, true);
        accounts.push({ key, name: w.name || w.provider || w.who || "?", who: w.who || "",
          model: w.model || r.model || "" });
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

  geometry() {
    const W = this.size.width || 336;
    // the stage is always a full column tall — rows appearing or leaving
    // can't bounce the card and the list below it
    const n = Math.max(MAX_AGENTS, MAX_ACCOUNTS);
    const H = Math.max(2 * PAD + n * ROW_H - ROW_GAP + 10, 120);
    const cy = (i) => PAD + i * ROW_H + ROW_H / 2;
    const skyMin = 76;
    const agentW = Math.min(88, Math.max(72, Math.round(W * 0.23)));
    const acctW = Math.min(240, Math.max(156, W - 12 - agentW - skyMin));
    const ax = 6, sx = W - acctW - 6;
    return {
      W, H, agentW, acctW,
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
  // doesn't show yet joins it, so its flight isn't dropped
  seatOf(r, i) {
    const tr = r.tries?.[i];
    if (!tr) return null;
    let key = this.acctIndex(tr.id) >= 0 ? tr.id : null;
    if (!key) {
      const w = (r.order || []).find(w => w.id === tr.id || w.who === tr.id);
      key = w ? (w.id || w.who) : tr.id;
      if (this.acctIndex(key) < 0 && this.accounts.length < MAX_ACCOUNTS)
        this.accounts.push({ key, name: w?.name || w?.who || tr.id, who: w?.who || "", model: tr.model || w?.model || "" });
    }
    return key;
  }

  // ---------- the bird's paths ----------

  // Every wire is one smooth S curve from an agent's port to an account's
  // dot — the same curve shape magpie's own Routing page draws. There is no
  // Z-shaped detour and no missing vertical piece: the visible wire and the
  // bird's flight are generated from the same cubic, so they meet exactly.
  curveBetween(ai, si) {
    const g = this.geometry();
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
    // an agent the column doesn't show yet joins it — the flight plays
    // instead of being dropped
    if (this.agentIndex(id) < 0) this.agents.push({ id, color: hueOf(id) });
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
    f.seat = this.seatOf(r, f.tryIndex);
    if (!f.seat || !this.outSegs(f)) { f.tryIndex++; return; }
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
   * (the wires + the flying bird), then the request list under REQUESTS,
   * then a single-line footer. Rows split IN FLIGHT / RECENT. */

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
    if (ms < 1000) return `${ms}ms`;
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
    const r = await exec("curl", ["-fsSLI", "--max-time", "10", "-o", "/dev/null", "-w", "%{url_effective}",
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

  async updateMod(cx) {
    if (this.demo || this.updateBusy) return;
    this.updateBusy = true;
    this.updateError = "";
    cx.notify();
    try {
      await this.checkLatest(); // a release may have landed since the button appeared
      const v = this.upd.latest;
      if (!SEMVER.test(v) || !this.newerThan(v, this.modVersion)) return; // nothing newer after all
      const r = await exec("sh", ["-c", this.updateScript(v)], { timeout: 480000 });
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
      const summarizeGroup = (group) => {
        const accts = group.accounts || [];
        const lefts = accts.map((a) => a.left).filter((v) => v != null);
        const bestLeft = lefts.length ? Math.max(...lefts) : null;
        const bestBalance = bestLeft == null ? (accts.find((a) => a.balance)?.balance || "") : "";
        const allErr = bestLeft == null && !bestBalance && accts.length > 0 && accts.every((a) => Boolean(a.error));
        return { bestLeft, bestBalance, allErr, count: accts.length };
      };
      const acctStatusBadge = (q) => {
        if (q.left != null) {
          const pct = Math.round(q.left);
          const color = q.left < 10 ? "#e26a6a" : q.left < 30 ? "#d4b06a" : "#34d399";
          return { text: pct <= 0 ? "Exhausted" : `${pct}%`, color };
        }
        if (q.balance) return { text: String(q.balance), color: "#34d399" };
        if (q.error) return { text: "Error", color: "#e26a6a" };
        return { text: "Ready", color: "#34d399" };
      };
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
          barRows.push(div().text_size(8.5).text_color(t.dim).child(`Balance: ${q.balanceError}`));
        } else if (!wins.length && q.balance) {
          barRows.push(div().text_size(9.5).text_color("#34d399").child(`${q.balance} left`));
        } else if (!wins.length && q.error) {
          barRows.push(div().text_size(8.5).text_color(t.dim).child(`Balance: ${q.error}`));
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

        if (accounts.length === 1) {
          const q = accounts[0];
          const { barRows, nextReset } = buildAccountBars(q, nameW);
          const badgeParts = [];
          if (q.alias) badgeParts.push(q.alias);
          if (q.plan && q.plan.toLowerCase() !== String(q.alias || "").toLowerCase()) {
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
              .child(div().text_size(10.5).font_semibold().truncate().flex_1().min_w(0).child(String(group.name || id)))
              .when(Boolean(badge), (el) => el.child(div().text_size(8.5).text_color(t.dim).flex_none().child(`· ${badge}`)))
              .when(Boolean(who), (el) => el.child(div().text_size(8.5).text_color(t.muted).flex_none().max_w(90).truncate().child(`· ${who}`)))
              .when(Boolean(foldedStatus), (el) => el.child(div().text_size(8.5).font_semibold().text_color(foldedStatus.color).flex_none().child(foldedStatus.text)))
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
        const baseLabels = accounts.map((q, idx) => q.alias
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
              .when(Boolean(acctStatus), (el) => el.child(div().text_size(8.5).font_semibold().text_color(acctStatus.color).flex_none().child(acctStatus.text)))
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
        const grpPct = grpSummary && grpSummary.bestLeft != null ? Math.round(grpSummary.bestLeft) : null;
        const grpVal = !grpSummary ? ""
          : grpPct != null ? (grpPct <= 0 ? "Exhausted" : `${grpPct}%`)
          : grpSummary.bestBalance ? String(grpSummary.bestBalance)
          : grpSummary.allErr ? "Error" : "Ready";
        const grpCol = !grpSummary ? t.dim
          : grpSummary.allErr ? "#e26a6a"
          : grpPct == null ? "#34d399"
          : grpPct < 10 ? "#e26a6a" : grpPct < 30 ? "#d4b06a" : "#34d399";

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
            .child(div().text_size(10.5).font_semibold().truncate().flex_1().min_w(0).child(String(group.name || id)))
            .when(Boolean(sharedPlan), (el) => el.child(div().text_size(8.5).text_color(t.dim).flex_none().child(`· ${sharedPlan}`)))
            .when(Boolean(grpVal), (el) => el.child(div().text_size(8.5).font_semibold().text_color(grpCol).flex_none().child(grpVal)))
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
        const clean = String(name || id)
          .replace(/\s*·\s*Remote magpie$/i, "")
          .replace(/\s*\((China|International)\)$/i, "")
          .replace(/^Google\s+/i, "");
        return clean || String(id);
      };
      const withMetrics = providers.map(([id, g]) => [id, g, summarizeGroup(g)]);
      const chipProviders = withMetrics
        .filter(([, , s]) => s.bestLeft != null || s.bestBalance)
        .concat(withMetrics.filter(([, , s]) => s.bestLeft == null && !s.bestBalance && !s.allErr))
        .concat(withMetrics.filter(([, , s]) => s.allErr))
        .slice(0, 4);
      const summaryChips = chipProviders.map(([id, group, s]) => {
        const pct = s.bestLeft != null ? Math.round(s.bestLeft) : null;
        const val = pct != null ? `${pct}%` : (s.bestBalance ? String(s.bestBalance) : (s.allErr ? "Error" : "Ready"));
        const valColor = s.allErr ? "#e26a6a" : pct == null ? "#34d399" : pct < 10 ? "#e26a6a" : pct < 30 ? "#d4b06a" : "#34d399";
        return h_flex().items_center().gap(4).flex_none()
          .child(iconEl(id, 11, t.muted, this.providerIcons))
          .child(div().text_size(9).text_color(t.muted).max_w(s.count > 1 ? 62 : 76).truncate().child(shortName(id, group.name)))
          .when(s.count > 1, (el) => el.child(div().text_size(8).text_color(t.dim).child(`×${s.count}`)))
          .child(div().text_size(9).font_semibold().text_color(valColor).child(val));
      });
      const summaryRow = h_flex().px(10).pb(8).gap(8).items_center().overflow_hidden().cursor_pointer()
        .on_click((_, cx2) => { this.quotaOpen = true; this.saveQuotaPrefs(); cx2.notify(); })
        .when(summaryChips.length > 0, el => el.children(summaryChips))
        .when(!summaryChips.length, el => el.child(div().text_size(9).text_color(t.dim).child("Loading provider quotas…")));
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
      liveAgents.add(f.agent);
      if (f.seat && f.state !== "gone") liveSeats.set(f.seat, f.color);
    }

    const children = [];

    const wirePairs = new Map();
    for (const f of this.flights.values()) {
      if (!f.seat || f.state === "gone" || f.state === "away") continue;
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
      const tr = r.tries?.[r.tries.length - 1];
      const key = tr?.id;
      if (!key || this.acctIndex(key) < 0) continue;
      const pairKey = `${r.agent}\u0000${key}`;
      const prev = wirePairs.get(pairKey);
      wirePairs.set(pairKey, { agent: r.agent, key, live: true, err: prev?.err || false });
    }
    const focusAgent = this.hoveredAgent || this.selectedAgent;
    const focusAcct = this.hoveredAcct || this.selectedAcct;
    if (focusAgent || focusAcct) {
      for (const r of this.routes.values()) {
        const tr = r.tries?.[r.tries.length - 1];
        const key = tr?.id;
        if (!key || this.acctIndex(key) < 0) continue;
        const matchFocus = (focusAgent && r.agent === focusAgent) ||
          (focusAcct && key === focusAcct);
        if (!matchFocus) continue;
        const pairKey = `${r.agent}\u0000${key}`;
        if (!wirePairs.has(pairKey)) {
          wirePairs.set(pairKey, { agent: r.agent, key, live: false, err: Boolean(r.status && r.status >= 400) });
        }
      }
    }

    const hovering = Boolean(focusAgent || focusAcct);
    const orderedWires = [...wirePairs.values()].sort((a, b) => Number(a.live) - Number(b.live));
    const portDots = new Map();

    const makeCurve = (c, width) => {
      const pb = PathBuilder.stroke(width).move_to(c.x0, c.y0);
      return (Math.abs(c.y3 - c.y0) < 1
        ? pb.line_to(c.x3, c.y3)
        : pb.cubic_bezier_to(c.x3, c.y3, c.mx, c.y0, c.mx, c.y3)
      ).build();
    };

    for (const w of orderedWires) {
      const c = this.curveBetween(this.agentIndex(w.agent), this.acctIndex(w.key));
      if (!c) continue;
      const shaking = this.shakes.has(w.key);
      const color = shaking ? "#e26a6a" : hueOf(w.agent);
      const matched = (focusAgent && w.agent === focusAgent) ||
        (focusAcct && w.key === focusAcct);
      const dimFactor = hovering ? (matched ? 1 : 0.16) : 1;
      const strokeW = matched ? 2 : (w.live ? 1.5 : 1.25);

      if ((w.live || shaking) && (!hovering || matched)) {
        const glowPath = makeCurve(c, 4);
        children.push(div().absolute().left(0).top(0).size_full()
          .loop("opacity", { from: 0.07, to: 0.22, period: 1400 })
          .child(window.paint_path(glowPath, color).absolute().left(0).top(0).size_full()));
      }

      const corePath = makeCurve(c, strokeW);
      const baseOp = w.live ? 0.78 * dimFactor : (matched ? 0.62 : 0.32 * dimFactor);
      if ((w.live || shaking) && (!hovering || matched)) {
        children.push(div().absolute().left(0).top(0).size_full()
          .loop("opacity", { from: 0.56, to: 0.94, period: 1400 })
          .child(window.paint_path(corePath, color).absolute().left(0).top(0).size_full()));
      } else {
        children.push(window.paint_path(corePath, color).absolute().left(0).top(0).size_full()
          .opacity(baseOp));
      }

      const portOp = w.live ? 0.9 * dimFactor : (matched ? 0.75 : 0.45 * dimFactor);
      const p0Key = `a:${w.agent}`;
      const p1Key = `s:${w.key}`;
      const cur0 = portDots.get(p0Key);
      if (!cur0 || portOp > cur0.op) portDots.set(p0Key, { x: c.x0, y: c.y0, color, op: portOp });
      const cur1 = portDots.get(p1Key);
      if (!cur1 || portOp > cur1.op) portDots.set(p1Key, { x: c.x3, y: c.y3, color, op: portOp });
    }

    for (const p of portDots.values()) {
      children.push(div().absolute().left(p.x - 1.75).top(p.y - 1.75).size(3.5).rounded(2)
        .bg(p.color).opacity(p.op));
    }

    for (const f of this.flights.values()) {
      if (f.state !== "fly" || !f.pos) continue;
      const matched = !hovering ||
        (focusAgent && f.agent === focusAgent) ||
        (focusAcct && f.seat === focusAcct);
      const pColor = f.err ? "#e26a6a" : hueOf(f.agent);
      const op = matched ? 1 : 0.2;
      children.push(div().absolute().left(f.pos.x - 4).top(f.pos.y - 4).size(8).rounded(4)
        .bg(pColor).opacity(0.28 * op));
      children.push(div().absolute().left(f.pos.x - 2).top(f.pos.y - 2).size(4).rounded(2)
        .bg(pColor).opacity(0.95 * op));
    }

    const shake = (key) => {
      const t0 = this.shakes.get(key);
      if (t0 === undefined) return 0; // rthit: -5, 4, -2, 1 over 450ms
      const p = (now - t0) / 450;
      return p < .2 ? -5 * p / .2 : p < .4 ? -5 + 9 * (p - .2) / .2 : p < .6 ? 4 - 6 * (p - .4) / .2 : p < .8 ? -2 + 3 * (p - .6) / .2 : 1 - (p - .8) / .2;
    };

    // agent chips: bordered pills, click to filter, hover to highlight
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i], b = g.agent(i);
      const on = liveAgents.has(a.id), ticked = this.ticks.has(a.id);
      const hovered = this.hoveredAgent === a.id;
      const selected = this.selectedAgent === a.id;
      children.push(h_flex().id(`agent-pill-${a.id}`).absolute().left(b.x1 + shake(a.id)).top(b.cy - 13).w(g.agentW).h(26)
        .items_center().gap(6).px(8).rounded(13).cursor_pointer()
        .bg(selected ? t.selected : hovered ? t.raised : t.canvas)
        .border(1).border_color(selected ? t.accent : hovered ? t.selected : t.border)
        .on_hover((isOn, cx2) => {
          if (isOn) this.hoveredAgent = a.id;
          else if (this.hoveredAgent === a.id) this.hoveredAgent = null;
          cx2.notify();
        })
        .on_click((_, cx2) => {
          this.selectedAgent = selected ? null : a.id;
          this.selectedAcct = null;
          cx2.notify();
        })
        .child(div().size(6).rounded(3).bg(a.color).flex_none()
          .when(on, el => el.loop("opacity", { from: 1, to: .4, period: 1200 })))
        .child(div().text_size(11).font_semibold().truncate().min_w(0)
          .text_color(ticked ? t.accent : (on || hovered || selected) ? t.foreground : t.muted).child(a.id)));
    }
    // account buttons: adaptive width, click to filter, flash red on error
    const modelMaxW = Math.max(54, Math.round(g.acctW * 0.42));
    for (let j = 0; j < this.accounts.length; j++) {
      const a = this.accounts[j], b = g.acct(j);
      const hot = liveSeats.get(a.key);
      const hovered = this.hoveredAcct === a.key;
      const selected = this.selectedAcct === a.key;
      const errShake = this.shakes.has(a.key);
      children.push(h_flex().id(`acct-pill-${a.key}`).absolute().left(b.x1 + shake(a.key)).top(b.cy - 13).w(g.acctW).h(26)
        .items_center().gap(6).px(9).rounded(13).cursor_pointer()
        .bg(selected ? t.selected : (hot || hovered) ? t.raised : t.canvas)
        .border(1).border_color(errShake ? "#e26a6a" : selected ? t.accent : (hot || hovered) ? t.selected : t.border)
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
        .child(div().size(6).rounded(3).bg(errShake ? "#e26a6a" : hot ? "#d4b06a" : "#8a6d3f").flex_none()
          .when(hot, el => el.loop("opacity", { from: 1, to: .35, period: 1200 })))
        .child(div().text_size(11).font_semibold().min_w(0).flex_1().truncate()
          .text_color((hot || hovered || selected) ? t.foreground : t.muted).child(a.name))
        .child(div().text_size(9.5).text_color(t.dim).flex_none().max_w(modelMaxW).truncate().child(a.model)));
    }

    // the flights over everything: no bird, no packet — the wire itself
    // carries the life: live wires breathe, finished ones fade out

    const matchesFilter = (r) => {
      if (this.selectedAgent) return r.agent === this.selectedAgent;
      if (this.selectedAcct) {
        return (r.tries || []).some(tr => tr.id === this.selectedAcct) ||
          (r.tries?.length ? this.seatOf(r, r.tries.length - 1) === this.selectedAcct : false);
      }
      return true;
    };
    const routes = [...this.routes.values()].sort((a, b) => b.id - a.id).filter(matchesFilter);
    const inFlight = routes.filter(r => !r.done);
    const recent = routes.filter(r => r.done).slice(0, 40);

    const rowFor = (r) => {
      const agent = r.agent || "?";
      const group = r.group?.ref || r.group?.id || "";
      const seatKey = r.tries?.length ? this.seatOf(r, r.tries.length - 1) : null;
      const acctRow = seatKey ? this.acctOf(seatKey) : null;
      const acct = acctRow?.name || r.provider || "?";
      const rawModel = r.served || r.model || "";
      const displayModel = (rawModel && rawModel !== group) ? rawModel : (acctRow?.model || "");
      const model = displayModel || rawModel || "?";
      const d = r.time ? new Date(r.time) : null;
      const time = d ? [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":") : "";
      const tries = r.tries?.length || 0;
      const retry = tries > 1 ? `${tries} try · ` : "";
      const tps = r.done ? this.toksPerS(r) : "";
      const cache = r.done ? this.cacheHit(r) : null;
      const stat = r.done
        ? `${retry}${this.fmtTok(r.tokens)} tokens · ${this.fmtMs(r.ms)}${tps && tps !== "—" ? ` · ${tps}` : ""}${cache != null ? ` · ${cache}% cached` : ""}`
        : `${retry}${this.fmtElapsed(now - new Date(r.time).getTime())}…`;
      // the state dot and the seat's name share the request's colour:
      // gold in flight, green answered, red failed — magpie's row read
      const failed = r.done && r.status && r.status >= 400;
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
      const detailBlock = expanded ? v_flex().mt(4).ml(20).px(8).py(6).gap(3).rounded(6).min_w(0).overflow_hidden()
        .bg(t.canvas).border(1).border_color(t.border)
        .child(div().text_size(9.5).text_color(t.muted).min_w(0).truncate().child(modelLabel))
        .when(Boolean(metrics), el => el.child(div().text_size(9.5).text_color(t.dim).min_w(0).truncate().child(metrics)))
        .children((r.tries || []).map((tr, idx) => {
          const tSeat = this.acctOf(tr.id);
          const tName = tSeat?.name || tr.name || tr.id || "?";
          const tFail = tr.done && tr.status && tr.status >= 400;
          const tCol = !tr.done ? "#facc15" : tFail ? "#e26a6a" : "#34d399";
          const tStat = !tr.done ? "in flight" : `${tr.status || "ok"}${tr.ms ? ` · ${this.fmtMs(tr.ms)}` : ""}`;
          return h_flex().gap(6).items_center().text_size(9.5).min_w(0)
            .child(div().text_color(t.dim).flex_none().child(`#${idx + 1}`))
            .child(div().size(4).rounded(2).bg(tCol).flex_none())
            .child(div().text_color(t.foreground).truncate().flex_1().min_w(0).child(tName))
            .child(div().text_color(tFail ? "#e26a6a" : t.dim).flex_none().child(tStat));
        })) : null;
      return v_flex().id(`req-row-${r.id}`).gap(3).py(7).min_w(0).border_b(1).border_color(t.border)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_, cx2) => {
          this.expandedRouteId = expanded ? null : r.id;
          cx2.notify();
        })
        .child(h_flex().items_center().gap(7)
          .child(iconEl(agent, 13, t.muted, this.providerIcons))
          .child(div().text_size(11.5).font_semibold().text_color(t.foreground).flex_none().child(agent))
          .child(group ? div().text_size(9.5).px(5).py(1).rounded(4).bg(t.canvas)
            .border(1).border_color(t.border).text_color(t.muted).flex_none().child(group) : div().w(0))
          .child(div().flex_1())
          .child(div().size(5).rounded(3).bg(dotColor).flex_none()
            .when(!r.done, el => el.loop("opacity", { from: 1, to: .35, period: 1100 })))
          .child(div().text_size(10).text_color(t.dim).flex_none().child(time)))
        .child(h_flex().items_center().gap(6).pl(20)
          .child(div().text_size(10.5).text_color(t.dim).flex_none().child("→"))
          .child(div().size(5).rounded(3).bg(dotColor).flex_none())
          .child(div().text_size(11).font_semibold().text_color(whoColor).flex_none().max_w(110).truncate()
            .child(acct))
          .when(shown, row => row.child(div().text_size(10).text_color(t.dim).flex_none().max_w(120).truncate()
            .child(`· ${shown}`)))
          .when(Boolean(displayModel), row => row.child(div().text_size(10).text_color(t.dim).flex_1().min_w(0).truncate().child(`· ${displayModel}`)))
          .when(!displayModel, row => row.child(div().flex_1()))
          .child(div().text_size(10).text_color(t.dim).flex_none().child(stat)))
        .when(Boolean(detailBlock), el => el.child(detailBlock));
    };

    const filterLabel = this.selectedAgent || (this.selectedAcct ? (this.acctOf(this.selectedAcct)?.name || this.selectedAcct) : null);
    const list = v_flex().id("requests-list").flex_1().min_h(0)
      .overflow_y_scrollbar().px(10).pb(4).gap(0);
    if (inFlight.length) {
      list.child(div().pt(6).pb(2).text_size(9.5).font_semibold().text_color(t.dim).child(`IN FLIGHT ${inFlight.length}`));
      for (const r of inFlight) list.child(rowFor(r));
    }
    list.child(div().pt(6).pb(2).text_size(9.5).font_semibold().text_color(t.dim).child(`RECENT ${recent.length}`));
    if (recent.length) for (const r of recent) list.child(rowFor(r));
    else list.child(div().p(12).text_size(11).text_color(t.dim).child(filterLabel ? "No matching requests." : "No request yet."));

    const updatePill = this.updatePill(t);
    return v_flex().size_full().bg(t.surface).text_color(t.foreground)
      .child(h_flex().px(12).pt(10).pb(6).gap(6).items_center()
        .child(div().text_size(13).font_semibold().child("Magpie"))
        .when(inFlight.length > 0, el => el
          .child(div().text_size(11).text_color(t.accent).flex_none().child(`· ${inFlight.length} live`)))
        .when(Boolean(updatePill), el => el
          .child(div().text_size(11).text_color(t.dim).flex_none().child("·"))
          .child(updatePill))
        .child(div().flex_1())
        .child(div().text_size(9.5).text_color(t.dim).min_w(0).truncate().child(this.remoteLabel)))
      .when(this.offline, el => el.child(div().px(12).py(16).text_size(11.5).text_color(t.muted).child(this.offline)))
      .when(!this.offline, el => el
        .child(div().mx(10).mb(8).p(6).rounded(10).bg(t.canvas).border(1).border_color(t.border)
          .child(div().relative().w_full().h(g.H)
            .id("stage").on_size_change((size, cx) => {
              const zoom = settings().zoom || 1;
              this.size = { width: size.width / zoom, height: size.height / zoom };
              cx.notify();
            })
            .children(children)))
        .child(this.quotaPanel(t))
        .child(h_flex().px(12).pb(4).gap(6).items_center()
          .child(div().text_size(9.5).font_semibold().text_color(t.dim).child("REQUESTS"))
          .when(Boolean(filterLabel), el => el.child(h_flex().id("clear-filter").px(6).py(1).gap(4).rounded(4)
            .bg(t.canvas).border(1).border_color(t.border).items_center().cursor_pointer()
            .hover(s => s.bg(t.hover))
            .on_click((_, cx2) => { this.selectedAgent = null; this.selectedAcct = null; cx2.notify(); })
            .child(div().text_size(9.5).text_color(t.accent).max_w(100).truncate().child(filterLabel))
            .child(div().text_size(9.5).text_color(t.dim).child("×"))))
          .child(div().flex_1())
          .child(h_flex().id("toggle-masked").gap(4).items_center().flex_none()
            .cursor_pointer()
            .on_click((_, cx2) => { this.masked = !this.masked; cx2.notify(); })
            .child(svg(`mods/routing/icons/${this.masked ? "eye-off" : "eye"}.svg`).size(12)
              .text_color(this.masked ? t.muted : t.accent))
            .child(div().text_size(10).font_semibold()
              .text_color(this.masked ? t.muted : t.accent)
              .child(this.masked ? "Masked" : "Shown"))))
        .child(list)
        .child(h_flex().px(12).py(6).items_center().justify_between().border_t(1).border_color(t.border)
          .child(div().text_size(10).text_color(t.dim)
            .child(`pid ${this.pid || "—"} · ${this.totals.requests} calls · ${this.totals.rerouted} retried`))
          .child(div().id("refresh-all").px(4).py(1).rounded(4).text_size(11)
            .text_color(this.traceBusy || this.quotaBusy ? t.accent : t.dim)
            .cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_, cx2) => { this.refreshAll(cx2); })
            .child("⟳"))));
  }
}
