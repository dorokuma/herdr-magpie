// Routing, live: magpie's Routing stage as a Herdr mod.
// A magpie carries each request from its agent through the gap between
// the columns to the account routing picked, lets it go while it answers,
// and another brings the answer back — the motion language of magpie's
// internal/gui/assets/plugins/routing (fly()/pose(), FLIER, .pkt), laid
// out for a narrow stage: no hub node, the bird flies the whole way.

import { View, div, svg, image, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { theme, exec, settings, appHome, readTextFile } from "herdr";
// `window` here is gpui-shell's global window object (its paint_path is an
// element constructor), not herdr's window() — a function that only reports
// metadata. Importing the herdr one shadows the global and breaks render.

// Default connection target; overridden dynamically by mods/routing/config.json
// or auto-detected from ~/.config/magpie/providers.json.
const DEFAULT_BASE_URL = "http://127.0.0.1:3425";
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
};

const ICON_PATTERNS = [
  [/workbuddy/, "workbuddy-color"], [/codebuddy/, "codebuddy-color"],
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
    this.traceBusy = false;
    this.lastSecTick = 0;

    cx.spawn(async (cx) => {
      await this.initTarget(cx);
      cx.spawn(async (cx2) => this.poll(cx2));
      cx.spawn(async (cx2) => this.pollQuota(cx2));
    });
    cx.timer.every(FRAME, (cx) => {
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
    try {
      const raw = await readTextFile(`${appHome()}/mods/routing/config.json`);
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.remote !== undefined) this.remote = cfg.remote || null;
        if (cfg.baseUrl) this.baseUrl = String(cfg.baseUrl).replace(/\/$/, "");
        if (cfg.label) this.remoteLabel = String(cfg.label);
        else if (this.remote) this.remoteLabel = `${this.remote} · ${this.baseUrl.replace(/^https?:\/\//, "")}`;
      }
    } catch (_) { /* optional config.json */ }
    await this.discoverProviders();
    this.configReady = true;
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
        this.offline = "";
        this.recompute();
        cx.notify();
      } catch (e) {
        this.offline = `Remote trace error: ${String(e).slice(0, 240)}`;
        this.loaded = false;
        cx.notify();
        await cx.sleep(4000);
      }
    }
  }

  // one quotas read; without kept=1 the gateway asks the vendors again
  // (provider.QuotaReport), so this is a live refresh not a cache copy
  async fetchQuotas(cx) {
    this.quotaBusy = true; cx.notify();
    const t0 = Date.now();
    try {
      const r = await exec("curl", ["-sS", "--max-time", "20", `${this.baseUrl}/v1/magpie/quotas`],
        this.execOpts(25000));
      const d = JSON.parse(r.stdout);
      const next = {};
      for (const p of d.data || []) {
        const windows = (p.windows || []).map(w => ({
          name: w.name || "", remaining: w.remaining, used: w.used, resetsAt: w.resetsAt || "",
          pool: w.pool || "", text: Boolean(w.text), display: w.display || "",
        }));
        const total = windows.find(w => w.name === "Total" && !w.text);
        const groups = new Map();
        for (const w of windows) {
          if (w.name === "Total" || w.text) continue;
          const key = w.resetsAt || `no:${w.name}`;
          const cur = groups.get(key);
          if (!cur) { groups.set(key, { ...w }); continue; }
          if (w.pool && !cur.pool) groups.set(key, { ...w });
        }
        let shown = [...groups.values()].map(w => {
          if (!w.pool) w.name = w.name.replace(/\s*\((high|medium|low)\)|-tiered$/i, "");
          return w;
        });
        if (p.provider === "cursor" && shown.some(w => /grok/i.test(w.name))) {
          shown = shown.filter(w => /grok/i.test(w.name));
        }
        const hadText = windows.some(w => w.text);
        const shownLeft = (p.provider !== "cursor" && total) ? total.remaining
          : shown.length ? shown.reduce((a, w) => a + (w.remaining ?? 100), 0) / shown.length
          : null;
        const entry = {
          left: shownLeft, name: p.name || p.provider, plan: p.plan || "", windows: shown,
          hadText, kind: p.kind || "", balance: p.balance || "", error: p.error || "",
        };
        const prev = next[p.provider];
        const rank = (e) => ((e.windows.length || e.hadText) ? 4 : 0)
          + (/ultra/i.test(e.plan) ? 2 : /pro/i.test(e.plan) ? 1 : 0);
        if (!prev || rank(entry) > rank(prev)) next[p.provider] = entry;
      }
      this.quotas = next;
      this.quotasAt = Date.now();
      cx.notify();
    } finally {
      const held = Date.now() - t0;
      if (held < 800) await cx.sleep(800 - held);
      this.quotaBusy = false; cx.notify();
    }
  }

  async refreshAll(cx) {
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

  quotaPanel(t) {
    const W = this.size.width || 336;
    try {
      const providers = Object.entries(this.quotas);
      const rows = [];
      const nameW = Math.max(64, Math.min(96, W - 220));
      const barW = Math.max(40, Math.min(84, W - 220));
      const titleCase = (s) => String(s || "").replace(/\b([a-z])([a-z]*)\b/g, (_, a, b) => a.toUpperCase() + b);
      for (const [id, q] of providers) {
        const poolOf = (w) => {
          if (w.pool) return w.pool;
          const n = w.name.toLowerCase();
          if (/claude|gpt/.test(n)) return "claude & gpt";
          const m = n.match(/^([a-z0-9 .&-]+?)(?:\s*·|$)/);
          return m ? m[1].trim() : n;
        };
        const wins = (q.windows || []).filter(w => !w.text)
          .sort((a, b) => {
            const pa = poolOf(a), pb = poolOf(b);
            if (pa !== pb) {
              const rank = /gemini/i.test(pa) ? 0 : /claude|gpt/.test(pa) ? 1 : 2;
              const rankB = /gemini/i.test(pb) ? 0 : /claude|gpt/.test(pb) ? 1 : 2;
              if (rank !== rankB) return rank - rankB;
              return pa.localeCompare(pb);
            }
            return Date.parse(a.resetsAt || "9999") - Date.parse(b.resetsAt || "9999");
          })
          .slice(0, 6);
        const nextReset = wins.map(w => w.resetsAt).filter(Boolean).sort()[0];
        const barRows = wins.map(w => {
          const label = titleCase(w.name);
          const left = w.remaining ?? (100 - (w.used ?? 0));
          const frac = Math.max(0, Math.min(1, left / 100));
          const exhausted = Math.round(left) <= 0;
          const color = left < 10 ? "#e26a6a" : left < 30 ? "#d4b06a" : "#34d399";
          return h_flex().items_center().gap(5)
            .child(div().w(nameW).text_size(8.5).text_color(t.muted).flex_none().truncate().child(label))
            .child(div().w(barW).h(3).rounded(2).bg(t.border).flex_none()
              .when(frac > 0, el => el.child(div().h_full().rounded(2).w(Math.max(2, Math.round(barW * frac))).bg(color))))
            .child(div().text_size(8.5).text_color(color).flex_none()
              .child(exhausted ? "Exhausted" : `${Math.round(left)}%`));
        });
        if (!wins.length && q.balance) {
          barRows.push(div().text_size(9.5).text_color("#34d399").child(`${q.balance} left`));
        } else if (!wins.length && q.error) {
          barRows.push(div().text_size(8.5).text_color(t.dim).child(`Balance: ${q.error}`));
        } else if (!wins.length) {
          barRows.push(h_flex().items_center().gap(6)
            .child(div().size(5).rounded(2.5).bg("#34d399").flex_none())
            .child(div().text_size(9).text_color("#34d399").child("Plenty Of Juice — Build On.")));
        }
        rows.push(v_flex().gap(3)
          .child(h_flex().items_center().gap(6)
            .child(iconEl(id, 14, t.muted, this.providerIcons))
            .child(div().text_size(10.5).font_semibold().truncate().flex_1().min_w(0).child(String(q.name || id)))
            .child(q.plan ? div().text_size(8.5).text_color(t.dim).flex_none().child(`· ${titleCase(q.plan)}`) : div().w(0))
            .child(div().text_size(9).text_color(t.dim).flex_none()
              .child(nextReset ? `Resets ${this.fmtUntil(nextReset)}` : "")))
          .child(v_flex().pl(22).gap(2).children(barRows)));
      }
      if (!rows.length) rows.push(div().text_size(10).text_color(t.dim).child("No quota reported yet."));
      const body = div().relative().max_h(360).min_h(0).flex_shrink(1)
        .child(v_flex().id("quota-body").max_h(360).min_h(0).flex_shrink(1)
          .overflow_y_scroll().px(10).pb(10).gap(10).children(rows))
        .child(Scrollbar.vertical("quota-body").absolute().inset_0());
      const shortName = (id, name) => {
        const clean = String(name || id)
          .replace(/\s*·\s*Remote magpie$/i, "")
          .replace(/\s*\((China|International)\)$/i, "")
          .replace(/^Google\s+/i, "");
        return clean || String(id);
      };
      const chipProviders = providers
        .filter(([, q]) => q.left != null || q.balance)
        .concat(providers.filter(([, q]) => q.left == null && !q.balance))
        .slice(0, 4);
      const summaryChips = chipProviders.map(([id, q]) => {
        const pct = q.left != null ? Math.round(q.left) : null;
        const val = pct != null ? `${pct}%` : (q.balance ? String(q.balance) : "Ready");
        const valColor = pct == null ? "#34d399" : pct < 10 ? "#e26a6a" : pct < 30 ? "#d4b06a" : "#34d399";
        return h_flex().items_center().gap(4).flex_none()
          .child(iconEl(id, 11, t.muted, this.providerIcons))
          .child(div().text_size(9).text_color(t.muted).max_w(76).truncate().child(shortName(id, q.name)))
          .child(div().text_size(9).font_semibold().text_color(valColor).child(val));
      });
      const summaryRow = h_flex().px(10).pb(8).gap(8).items_center().overflow_hidden().cursor_pointer()
        .on_click((_, cx2) => { this.quotaOpen = true; cx2.notify(); })
        .when(summaryChips.length > 0, el => el.children(summaryChips))
        .when(!summaryChips.length, el => el.child(div().text_size(9).text_color(t.dim).child("Loading provider quotas…")));
      return v_flex().mx(10).mb(8).rounded(10).bg(t.canvas).border(1).border_color(t.border)
        .child(h_flex().px(10).pt(8).pb(6).items_center().cursor_pointer()
          .on_click((_, cx2) => { this.quotaOpen = !this.quotaOpen; cx2.notify(); })
          .child(div().text_size(10).text_color(t.muted).pr(5).child(this.quotaOpen ? "▾" : "▸"))
          .child(div().text_size(11).font_semibold().child("Agent Quota"))
          .child(div().text_size(9.5).text_color(t.dim).pl(6)
            .child(this.quotasAt ? `Updated ${this.fmtAgo(Date.now() - this.quotasAt)}` : ""))
          .child(div().flex_1())
          .child(div().text_size(9.5).text_color(t.accent).cursor_pointer()
            .on_click((_, cx2) => {
              cx2.stop_propagation();
              this.fetchQuotas(cx2).catch(() => {});
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
      const stat = r.done
        ? `${retry}${this.fmtTok(r.tokens)} tokens · ${this.fmtMs(r.ms)}${tps && tps !== "—" ? ` · ${tps}` : ""}`
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

    return v_flex().size_full().bg(t.surface).text_color(t.foreground)
      .child(h_flex().px(12).pt(10).pb(6).gap(6).items_center()
        .child(div().text_size(13).font_semibold().child("Magpie"))
        .child(div().text_size(11).text_color(t.accent).child(`· ${inFlight.length} live`))
        .child(div().flex_1())
        .child(div().text_size(9.5).text_color(t.dim).child(this.remoteLabel)))
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
