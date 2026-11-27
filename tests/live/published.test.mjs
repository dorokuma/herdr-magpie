// After a release: is what GitHub serves the release, and does the pill get a
// real install onto it? This one uses the network, so it is not part of
// `node --test tests/*.test.mjs`; scripts/release-check.sh --published runs it.
//
//   HM_PUBLISHED=X.Y.Z node --test tests/live/published.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadMod, realExec, oldInstall, releasedMods, stubHerdrApp, tmpdir, ROOT, REPO } from "../harness.mjs";

const V = process.env.HM_PUBLISHED || "";
const skip = V ? false : "set HM_PUBLISHED=X.Y.Z (scripts/release-check.sh --published does)";

// The child processes this file spawns run real downloads from the network.
// They get a whitelist environment: a blacklist can only ever name the
// credential variables someone thought of today, while a token handed to a
// subprocess (and to every server its downloads touch) is a token leaked.
// Only what a download needs survives: PATH, HOME, the locale and the shell,
// HTTP proxies in both casings, and the certificate-authority overrides curl
// and node read. HERDR_MAGPIE_RELEASE_BASE and HERDR_MAGPIE_VERSION must
// never leak in either: they re-point the installer at a stand-in server,
// and this file's whole point is exercising the real one.
const ENV_KEEP = new Set([
  "PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "TERM", "LANG",
  "SSL_CERT_FILE", "SSL_CERT_DIR", "CURL_CA_BUNDLE", "NODE_EXTRA_CA_CERTS",
]);
const ENV_PROXY = /^(https?|all|no)_proxy$/i;
const ENV_LOCALE = /^LC_/;
function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (ENV_KEEP.has(k) || ENV_PROXY.test(k) || ENV_LOCALE.test(k)) env[k] = v;
  }
  delete env.HERDR_MAGPIE_RELEASE_BASE;
  delete env.HERDR_MAGPIE_VERSION;
  return Object.assign(env, extra);
}

// One curl at a redirect script behind dorokuma.github.io, retried like the
// other network calls here. Returns the response body with the HTTP status
// line already cut off.
function fetchHop(url) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = spawnSync("curl", ["-sSL", "--max-time", "30", "-w", "\n%{http_code}", url], { encoding: "utf8", env: cleanEnv() });
    if (r.status === 0) break;
  }
  assert.equal(r.status, 0, `curl reached ${url}: ${r.stderr}`);
  assert.ok(r.stdout.endsWith("\n200"), `${url} answers HTTP 200, got the tail ${JSON.stringify(r.stdout.slice(-40))}`);
  return r.stdout.slice(0, -4);
}

// The redirect script must be exactly that: a tiny script that downloads and
// runs the installer asset of THIS repository's latest release. The full URL
// is matched, the rest of the body must not point anywhere else (no other
// repository, no second download address), and nothing may pin a version --
// a comment page or a hijacked redirect is a failed check, never something
// the test then executes.
function assertRedirectScript(body, asset, label) {
  const want = `https://github.com/${REPO}/releases/latest/download/${asset}`;
  assert.ok(body.includes(want), `${label} hands off to the exact ${asset} asset of this repository's latest release`);
  assert.ok(!/herdr-magpie-\d+\.\d+\.\d+/.test(body), `${label} pins no version`);
  const downloads = [...body.matchAll(/https?:\/\/[^\s"'|<>&]+/g)].map((m) => m[0]);
  assert.deepEqual(downloads, [want], `${label} downloads from nowhere but the one asset URL`);
  assert.ok(/\|\s*(bash|iex)\b/.test(body), `${label} is an executable hand-off (a pipe into the shell), not a comment page`);
}
const num = (v) => v.split(".").map(Number);
const older = (a, b) => { const x = num(a), y = num(b); return (x[0] - y[0] || x[1] - y[1] || x[2] - y[2]) < 0; };
const released = V ? spawnSync("git", ["-C", ROOT, "show", `v${V}:mods/routing/main.js`], { encoding: "utf8", maxBuffer: 64 << 20 }) : null;

test(`the pill takes the previous release to ${V}, over the network`, { skip }, async () => {
  assert.equal(released.status, 0, `tag v${V} is not in this checkout`);
  // the install most people are on when a release lands: the one before it
  const prev = releasedMods().filter((t) => /^ {2}updateScript\(/m.test(t.source) && older(t.version, V)).pop();
  assert.ok(prev, `no release older than ${V} with an updater in this checkout (git fetch --tags)`);

  const home = tmpdir("home");
  const r = oldInstall(home, prev.version);
  // the updater runs real downloads: hand it the same credential-scrubbed
  // environment the one-line install test uses
  const stripped = cleanEnv();
  const exec = (cmd, args = [], opts = {}) => realExec(cmd, args, { ...opts, env: stripped });
  const m = await loadMod({ source: prev.source, home, exec });
  const o = m.make({ configReady: true });
  await o.readModVersion();
  o.announceVersion();

  // the connection to github.com drops now and then; the mod retries on its
  // own schedule, here the look is simply repeated
  for (let i = 0; i < 4 && o.upd.latest !== V; i++) await o.checkLatest();
  assert.equal(o.upd.latest, V, `${prev.tag}'s look at releases/latest finds ${V} (a draft or a prerelease is never found)`);
  assert.ok(o.updateReady(), "the pill is shown");

  await o.updateMod(m.cx);
  if (/^curl: /.test(o.updateError)) { m.notes.length = 0; await o.updateMod(m.cx); } // a dropped download, once
  assert.equal(o.updateError, "", "installed without an error");
  assert.equal(fs.readFileSync(path.join(r, "VERSION"), "utf8").trim(), V);
  assert.equal(fs.readFileSync(path.join(r, "main.js"), "utf8"), released.stdout, `main.js is the one tagged v${V}`);
  assert.equal(fs.readFileSync(path.join(r, "config.json"), "utf8"), '{"remote":"my-box","mine":true}', "config.json kept");
  assert.ok(fs.existsSync(path.join(home, "mods/tabs-routing/main.js")) && fs.existsSync(path.join(home, "layouts/Magpie.json")));
  assert.deepEqual(m.notes.map((n) => [n.level, n.body]), [["success", `${prev.version} → ${V}`]]);
});

// the lines a person on an install too old to have the pill is told to paste:
// the one-line installer, which fetches install.sh from releases/latest
const pasted = (file) => {
  const blocks = [...fs.readFileSync(path.join(ROOT, file), "utf8").matchAll(/```bash\n([\s\S]*?)```/g)].map((b) => b[1]);
  return blocks.filter((b) => b.includes("dorokuma.github.io/hm"));
};

test(`the README's no-clone install lines install ${V}`, { skip }, () => {
  const en = pasted("README.md"), zh = pasted("README.zh-CN.md");
  assert.equal(en.length, 1, "README.md has one block that resolves releases/latest");
  assert.deepEqual(zh, en, "README.zh-CN.md gives the same lines");
  assert.ok(en[0].includes("https://dorokuma.github.io/hm"), "the README line goes through the hm redirect");

  // The redirect script is fetched and audited BEFORE anything executes:
  // only bytes verified to be the tiny hand-off to this repository's own
  // install.sh asset are piped into bash -- never unaudited remote ones.
  const hm = fetchHop("https://dorokuma.github.io/hm");
  assertRedirectScript(hm, "install.sh", "the hm redirect script");

  const home = tmpdir("home");
  const stub = stubHerdrApp();
  // the verified redirect bytes are piped into bash exactly the way the
  // README line does; the script's own trap removes the temporary folder
  // the bootstrap downloads into, however it ends
  let r;
  for (let i = 0; i < 3; i++) {
    r = spawnSync("bash", [], { input: hm, encoding: "utf8", env: cleanEnv({ PATH: stub.PATH, HERDR_APP_HOME: home }) });
    if (r.status === 0) break;
  }
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/VERSION"), "utf8").trim(), V);
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/main.js"), "utf8"), released.stdout, `main.js is the one tagged v${V}`);
});

// The PowerShell pendant of those lines, for a Herdr on Windows: not executed
// here (no PowerShell on the release machine), but its exact text is part of
// the release contract -- both READMEs must carry the same one block.
const pastedPs = (file) => {
  const blocks = [...fs.readFileSync(path.join(ROOT, file), "utf8").matchAll(/```powershell\n([\s\S]*?)```/g)].map((b) => b[1]);
  return blocks.filter((b) => b.includes("dorokuma.github.io/hm.ps1"));
};

test("the READMEs' PowerShell install block is one and the same in both languages", { skip }, () => {
  const en = pastedPs("README.md"), zh = pastedPs("README.zh-CN.md");
  assert.equal(en.length, 1, "README.md has one PowerShell install block");
  assert.equal(zh.length, 1, "README.zh-CN.md has one PowerShell install block");
  assert.deepEqual(zh, en, "README.zh-CN.md gives the same lines, byte for byte");
  assert.ok(!/herdr-magpie-\d+\.\d+\.\d+/.test(en[0]), "no version is pinned into the block");
});

// The Windows one-liner cannot be executed here (no PowerShell on the
// machines this suite targets), but its first hop can: the tiny redirect
// script behind dorokuma.github.io/hm.ps1 must answer 200 and point at the
// install.ps1 asset of releases/latest, or every Windows install line is
// dead no matter how good the release is.
test("https://dorokuma.github.io/hm.ps1 answers 200 and hands off to the install.ps1 asset", { skip }, () => {
  const body = fetchHop("https://dorokuma.github.io/hm.ps1");
  assertRedirectScript(body, "install.ps1", "the hm.ps1 redirect script");
});
