// Loads mods/routing/main.js outside Herdr, so the code a release ships is the
// code under test.
//
// The mod imports three modules only Herdr provides (gpui-kit, gpui-base,
// herdr). Here those import lines, and nothing else, are replaced by stand-ins:
// the UI builders become recorders that remember the text they were given, and
// the host calls (exec, appHome, readTextFile, notify, localStorage) are
// handed in by the test. No line of the mod's own logic is copied or cut out.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MAIN = path.join(ROOT, "mods/routing/main.js");
export const REPO = "dorokuma/herdr-magpie";

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";[ \t]*$/gm;
const HOST = ["gpui-kit", "gpui-base", "herdr"];
let seq = 0;
const made = [];
process.on("exit", () => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

export function tmpdir(tag = "t") {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `herdr-magpie-${tag}-`));
  made.push(d);
  return d;
}

// --- the UI stand-in ---------------------------------------------------------
// Every builder call returns another recorder, so any chain the mod writes
// (div().flex().child(...).when(cond, (el) => ...)) runs to the end. What a
// node was given as children is kept, which is what texts() reads back.
function recorder(label, seed) {
  const node = { label, id: null, kids: [], ...seed };
  const fn = function () {};
  const p = new Proxy(fn, {
    get(_t, k) {
      if (k === "__node") return node;
      if (k === "then") return undefined; // never mistaken for a promise
      if (k === Symbol.toPrimitive) return () => `[${label}]`;
      if (typeof k === "symbol") return undefined;
      if (k === "id") return (v) => { node.id = String(v); return p; };
      if (k === "child") return (c) => { node.kids.push(c); return p; };
      if (k === "children") return (cs) => { for (const c of cs || []) node.kids.push(c); return p; };
      if (k === "when") return (cond, f) => { if (cond && typeof f === "function") f(p); return p; };
      if (k === "when_some") return (v, f) => { if (v != null && typeof f === "function") f(p, v); return p; };
      // any other builder method: styling and event wiring, which draw no text
      return () => p;
    },
    // div("text"), PathBuilder.stroke(1), new Scrollbar(...): a call makes a
    // fresh node; a leading string is its content
    apply(_t, _this, args) { return fresh(label, args); },
    construct(_t, args) { return fresh(label, args); },
  });
  return p;
}

function fresh(label, args, seed) {
  const r = recorder(label, seed);
  for (const x of args || []) if (typeof x === "string") r.__node.kids.push(x);
  return r;
}

// A PathBuilder that writes down what it was asked to draw: the stroke width
// and every move/line/bezier segment's coordinates, so a test can assert the
// geometry of what a frame painted — and how many builders a frame spent.
function pathBuilderFactory(paths) {
  return new Proxy(function () {}, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => "[PathBuilder]";
      if (typeof k === "symbol") return undefined;
      if (k === "stroke") {
        return (width) => {
          const rec = { width, ops: [] };
          paths.push(rec);
          const builder = new Proxy(function () {}, {
            get(_t2, k2) {
              if (typeof k2 === "symbol") return undefined;
              if (["move_to", "line_to", "cubic_bezier_to"].includes(k2)) {
                return (...coords) => { rec.ops.push([k2, ...coords]); return builder; };
              }
              if (k2 === "build") return () => ({ __path: rec });
              return () => builder; // style methods draw no geometry
            },
          });
          return builder;
        };
      }
      return () => pathBuilderFactory(paths); // never reached by the mod today
    },
  });
}

// Every (path, color) a frame painted, in order, with the path's recorded
// geometry attached. window.paint_path is the only constructor the mod calls
// on gpui-shell's window.
function paintPathRecorder() {
  return (path, color) => {
    const r = recorder("paint_path");
    r.__node.paintPath = path;
    r.__node.paintColor = color;
    return r;
  };
}

// Every string a rendered tree would show, in drawing order.
export function texts(tree) {
  const out = [];
  const seen = new Set();
  const walk = (v) => {
    if (v == null || v === false) return;
    if (typeof v === "string") { out.push(v); return; }
    if (typeof v === "number") { out.push(String(v)); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const n = v.__node;
    if (n && !seen.has(n)) { seen.add(n); n.kids.forEach(walk); }
  };
  walk(tree);
  return out;
}

// The element the mod gave this id (`.id("mod-update")`), or null if it was not
// drawn. texts(find(tree, id)) is what that one element shows.
export function find(tree, id) {
  const seen = new Set();
  const walk = (v) => {
    if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return null;
    if (Array.isArray(v)) { for (const x of v) { const r = walk(x); if (r) return r; } return null; }
    const n = v.__node;
    if (!n || seen.has(n)) return null;
    seen.add(n);
    if (n.id === id) return v;
    return walk(n.kids);
  };
  return walk(tree);
}

const palette = new Proxy({}, { get: (_t, k) => (typeof k === "symbol" ? undefined : "#808080") });

function hostModules(env, paths, shared) {
  class View {}
  const ui = (extra) => new Proxy(extra, {
    get: (t, k) => (k in t ? t[k] : typeof k === "symbol" ? undefined : recorder(String(k))),
  });
  return {
    "gpui-kit": ui({ View, PathBuilder: pathBuilderFactory(paths) }),
    "gpui-base": ui({}),
    herdr: {
      theme: () => palette,
      settings: {},
      exec: (...a) => env.exec(...a),
      appHome: () => env.appHome(),
      readTextFile: (p) => env.readTextFile(p),
      notify: (n) => env.notify(n),
      shared: (k) => shared.get(k),
      setShared: (k, v) => { shared.set(k, v); return null; },
      // herdr's window(): the platform is what the mod branches on. A test
      // hands in its own answer (windows, or null as `herdr-app check` sees);
      // the default is the Linux panel most installs run on.
      window: env.window ?? (() => ({ platform: "linux" })),
    },
  };
}

// A Map-backed localStorage; `data` is exposed so a test can read what was kept
// or hand the same store to a second load, as a reload of the mod would see it.
export function storage(data = new Map()) {
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); } };
}

// Runs a command for real, in the shape the mod's exec() resolves to.
export function realExec(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: opts.timeout, env: opts.env || process.env });
  return Promise.resolve({ code: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || String(r.error || "") });
}

// loadMod({ source?, home?, exec?, store?, window? }) -> { Routing, env, notes, store, cx, make, paths }
//   source  the text of a main.js; default: this checkout's. A released one
//           comes from `git show vX.Y.Z:mods/routing/main.js`.
//   home    what appHome() answers: the folder holding mods/ and layouts/.
//   window  what herdr's window() answers: a function returning the window's
//           metadata, or null as it does during `herdr-app check`.
export async function loadMod({ source, home, exec, store, window: windowFn } = {}) {
  const src = source ?? fs.readFileSync(MAIN, "utf8");
  const notes = [];
  const env = {
    home: home ?? tmpdir("home"),
    exec: exec ?? (async () => { throw new Error("exec() was called, but this test gave none"); }),
    appHome: () => env.home,
    readTextFile: async (p) => fs.readFileSync(p, "utf8"),
    notify: (n) => { notes.push(n); },
    window: windowFn,
  };
  const st = store ?? storage();
  const shared = new Map();
  const id = `m${++seq}`;
  // pathBuilds: one entry per PathBuilder.stroke(width) the mod starts,
  // recording the width and the move/line/bezier geometry — what a frame
  // spent on building curves. window.paint_path keeps its own recording on
  // each rendered node (paintPath/paintColor).
  const pathBuilds = [];
  const windowStandIn = recorder("window");
  const windowProxy = new Proxy(function () {}, {
    get(_t, k) {
      if (k === "__node") return windowStandIn.__node;
      if (k === "then") return undefined;
      if (k === Symbol.toPrimitive) return () => "[window]";
      if (typeof k === "symbol") return undefined;
      if (k === "paint_path") return paintPathRecorder();
      const inner = windowStandIn;
      if (k === "id") return (v) => { inner.__node.id = String(v); return windowProxy; };
      if (k === "child") return (c) => { inner.__node.kids.push(c); return windowProxy; };
      if (k === "children") return (cs) => { for (const c of cs || []) inner.__node.kids.push(c); return windowProxy; };
      if (k === "when") return (cond, f) => { if (cond && typeof f === "function") f(windowProxy); return windowProxy; };
      if (k === "when_some") return (v, f) => { if (v != null && typeof f === "function") f(windowProxy, v); return windowProxy; };
      return () => windowProxy;
    },
    apply(_t, _this, args) { return fresh("window", args); },
    construct(_t, args) { return fresh("window", args); },
  });
  (globalThis.__herdrMagpie ??= {})[id] = { mods: hostModules(env, pathBuilds, shared), localStorage: st, window: windowProxy };

  const swapped = [];
  let body = src.replace(IMPORT, (_all, names, from) => {
    swapped.push(from);
    // `import { a, b as c }` becomes destructuring `const { a, b: c }`: the
    // `as` form is not valid inside braces, only the colon one is
    const destructured = names.split(",").map((n) => {
      const m = /^\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(n);
      return m ? `${m[1]}: ${m[2]}` : n;
    }).join(",");
    return `const {${destructured}} = __host.mods[${JSON.stringify(from)}];`;
  });
  const unknown = swapped.filter((m) => !HOST.includes(m));
  if (unknown.length) throw new Error(`main.js imports a module the harness has no stand-in for: ${unknown.join(", ")}`);
  if (/^\s*import\s/m.test(body)) throw new Error("main.js has an import the harness could not rewrite (not `import { a, b } from \"x\";` on one line)");
  if (!swapped.includes("herdr")) throw new Error("main.js no longer imports from \"herdr\": the harness would be testing nothing");
  body = `const __host = globalThis.__herdrMagpie[${JSON.stringify(id)}];\n`
    + "const localStorage = __host.localStorage;\nconst window = __host.window;\n" + body;

  const file = path.join(tmpdir("mod"), "main.mjs");
  fs.writeFileSync(file, body);
  const Routing = (await import(pathToFileURL(file).href)).default;
  if (typeof Routing !== "function") throw new Error("main.js has no default export class");

  // The context Herdr hands a view. Nothing here runs timers or background
  // work: a test calls the method it means to test.
  const cx = { redraws: 0 };
  cx.notify = () => { cx.redraws++; };
  cx.spawn = () => {};
  cx.sleep = async () => {};
  cx.stop_propagation = () => {};
  cx.timer = { every: () => {}, after: () => {} };
  cx.listener = (f) => f;

  // An instance with the fields init() sets, without init()'s polling.
  const make = (over = {}) => {
    const o = new Routing();
    o.init({}, cx);
    return Object.assign(o, over);
  };
  return { Routing, env, notes, store: st, shared, cx, make, paths: pathBuilds };
}

// --- a release on disk -------------------------------------------------------
// The mod's updater downloads
//   https://github.com/<repo>/releases/download/vX.Y.Z/herdr-magpie-X.Y.Z.tar.gz
// and the same name + ".sha256". offline() points that one address at a folder
// instead, so the real script — its checksum check, its copy order — runs
// against an archive that has not been published.
export function offline(script, dir) {
  const from = `https://github.com/${REPO}/releases/download/v$V/`;
  const n = script.split(from).length - 1;
  if (n !== 1) throw new Error(`expected the updater to name its download address once, found it ${n} times: the release URL shape changed`);
  return script.replace(from, `${pathToFileURL(dir).href}/`);
}

// exec() for a mod whose "GitHub" is a folder: the look for the latest release
// answers `latest`, and the install script downloads from `dir`. Anything else
// the mod might run is refused, so a test cannot reach the network by accident.
export function offlineExec({ dir, latest, fail = false }) {
  const calls = [];
  const exec = async (cmd, args = [], opts = {}) => {
    calls.push([cmd, ...args]);
    if (cmd === "curl" && args.some((a) => String(a).endsWith(`/${REPO}/releases/latest`))) {
      if (fail) return { code: 6, stdout: "", stderr: "curl: (6) Could not resolve host: github.com" };
      const v = typeof latest === "function" ? latest() : latest;
      return { code: 0, stdout: v ? `https://github.com/${REPO}/releases/tag/v${v}` : `https://github.com/${REPO}/releases`, stderr: "" };
    }
    if (cmd === "sh" && args[0] === "-c") return realExec("sh", ["-c", offline(args[1], dir)], opts);
    throw new Error(`offlineExec: unexpected command ${cmd} ${args.join(" ")}`);
  };
  exec.calls = calls;
  return exec;
}

export function sha256(file) {
  const r = spawnSync("sha256sum", [file], { encoding: "utf8" });
  if (r.status === 0) return r.stdout.slice(0, 64);
  return spawnSync("shasum", ["-a", "256", file], { encoding: "utf8" }).stdout.slice(0, 64);
}

// Packs `files` ({ "mods/routing/main.js": "text", ... }) the way a release is
// packed: herdr-magpie-X.Y.Z.tar.gz with everything under herdr-magpie-X.Y.Z/,
// and a .sha256 beside it. Returns the folder to hand to offline().
export function fakeRelease(version, files, { dir = tmpdir("rel"), checksum } = {}) {
  const name = `herdr-magpie-${version}`;
  const stage = tmpdir("stage");
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(stage, name, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  const tgz = path.join(dir, `${name}.tar.gz`);
  const r = spawnSync("tar", ["czf", tgz, "-C", stage, name], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`tar: ${r.stderr}`);
  fs.writeFileSync(`${tgz}.sha256`, `${checksum ?? sha256(tgz)}  ${name}.tar.gz\n`);
  return dir;
}

// The files a release of this checkout would carry: everything git tracks or
// would track, read from the working tree, so an uncommitted edit is tested
// too. Outside a git checkout (an unpacked release) it is every file present.
export function treeFiles() {
  const r = spawnSync("git", ["-C", ROOT, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout) return r.stdout.split("\0").filter((f) => f && fs.existsSync(path.join(ROOT, f)));
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const f = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(f); else out.push(f);
    }
  };
  walk("");
  return out;
}

export const treeVersion = () => fs.readFileSync(path.join(ROOT, "VERSION"), "utf8").trim();

// This checkout packed as release `version`. When HM_RELEASE_DIR names a folder
// that already holds that archive (scripts/release-check.sh builds the real one
// with `git archive`), that archive is used instead, so the gate tests the very
// bytes that get uploaded.
export function packTree(version = treeVersion()) {
  const given = process.env.HM_RELEASE_DIR;
  if (given && fs.existsSync(path.join(given, `herdr-magpie-${version}.tar.gz`))) return given;
  const name = `herdr-magpie-${version}`;
  const stage = tmpdir("stage");
  for (const rel of treeFiles()) {
    const to = path.join(stage, name, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), to); // keeps install.sh executable
  }
  const dir = tmpdir("rel");
  const tgz = path.join(dir, `${name}.tar.gz`);
  const r = spawnSync("tar", ["czf", tgz, "-C", stage, name], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`tar: ${r.stderr}`);
  fs.writeFileSync(`${tgz}.sha256`, `${sha256(tgz)}  ${name}.tar.gz\n`);
  return dir;
}

// A PATH whose `herdr-app` is a stand-in that only writes down how it was
// called. install.sh runs `herdr-app do layout.switch` when it finds the real
// one, which would switch the layout of whoever is running the tests.
export function stubHerdrApp() {
  const bin = tmpdir("bin");
  const log = path.join(bin, "calls.log");
  fs.writeFileSync(path.join(bin, "herdr-app"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexit 0\n`, { mode: 0o755 });
  return { PATH: `${bin}${path.delimiter}${process.env.PATH}`, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []) };
}

// Released versions whose main.js is in this checkout's git history, oldest
// first: [{ tag, version, source }]. Empty outside a git checkout with tags.
export function releasedMods() {
  const r = spawnSync("git", ["-C", ROOT, "tag", "-l", "v*"], { encoding: "utf8" });
  if (r.status !== 0) return [];
  const num = (v) => v.split(".").map(Number);
  return r.stdout.split("\n").filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((tag) => ({ tag, version: tag.slice(1) }))
    .sort((a, b) => { const x = num(a.version), y = num(b.version); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; })
    .map((t) => {
      const s = spawnSync("git", ["-C", ROOT, "show", `${t.tag}:mods/routing/main.js`], { encoding: "utf8", maxBuffer: 64 << 20 });
      return { ...t, source: s.status === 0 ? s.stdout : "" };
    })
    .filter((t) => t.source);
}

// An install as a person has it: an older version, plus the files that are
// theirs and that no update may touch.
export function oldInstall(home, version, { config = '{"remote":"my-box","mine":true}' } = {}) {
  const r = path.join(home, "mods/routing");
  fs.mkdirSync(r, { recursive: true });
  fs.writeFileSync(path.join(r, "main.js"), "// the previous version\n");
  if (version) fs.writeFileSync(path.join(r, "VERSION"), `${version}\n`);
  fs.writeFileSync(path.join(r, "config.json"), config);
  fs.writeFileSync(path.join(r, "notes.local"), "mine");
  return r;
}
