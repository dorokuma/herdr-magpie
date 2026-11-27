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

// The redirect script must be exactly that: the tiny template below, and
// nothing else. The body is compared line by line against the exact hand-off
// (CRLF vs LF line endings and stray outer whitespace are the only tolerated
// differences -- a browser, a proxy or GitHub Pages may mangle those): every
// other line, every extra statement, every extra download address or pinned
// version fails the check. This is not pattern matching: one exact text is
// the release contract the README one-liners stake their trust on, and a
// hijacked or padded redirect is a failed check, never something the test
// then executes.
const linesOf = (text) => text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
const REDIRECT_SH = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  `curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | bash`,
];
const REDIRECT_PS1 = [
  "$ErrorActionPreference = 'Stop'",
  `irm https://github.com/${REPO}/releases/latest/download/install.ps1 | iex`,
];
function assertRedirectScript(body, asset, label) {
  const want = asset === "install.sh" ? REDIRECT_SH : REDIRECT_PS1;
  assert.deepEqual(linesOf(body), want,
    `${label} is byte-for-line the exact ${asset} hand-off -- no other statement, no other download address, no pinned version`);
  assert.ok(!/herdr-magpie-\d+\.\d+\.\d+/.test(body), `${label} pins no version`);
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
// the one-line installer, which fetches the installer of releases/latest.
// Both READMEs carry exactly one install block per platform, and what they
// tell a person to paste is one exact single line each -- not "a line that
// mentions hm", but the whole contract text, nothing added and nothing cut.
// The lines themselves are never executed: Markdown is data, not a program.
const pastedBlocks = (file, lang, fragment) => {
  const blocks = [...fs.readFileSync(path.join(ROOT, file), "utf8").matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((b) => b[1]);
  return blocks.filter((b) => b.includes(fragment));
};
const BASH_LINE = "curl -fsSL https://dorokuma.github.io/hm | bash";
const PS_LINE = "irm https://dorokuma.github.io/hm.ps1 | iex";

test("both READMEs carry exactly the one-line install commands", { skip }, () => {
  for (const file of ["README.md", "README.zh-CN.md"]) {
    const bash = pastedBlocks(file, "bash", "dorokuma.github.io/hm");
    assert.equal(bash.length, 1, `${file} has one bash block that goes through the hm redirect`);
    assert.equal(bash[0].trim(), BASH_LINE, `${file}'s bash install line is exactly the one-line installer`);
    const ps = pastedBlocks(file, "powershell", "dorokuma.github.io/hm.ps1");
    assert.equal(ps.length, 1, `${file} has one PowerShell block that goes through the hm.ps1 redirect`);
    assert.equal(ps[0].trim(), PS_LINE, `${file}'s PowerShell install line is exactly the one-line installer`);
  }
});

// The redirect scripts behind the two one-liners, fetched and audited before
// anything they point at ever runs: each must be the exact tiny template that
// downloads the installer asset of THIS repository's latest release and hands
// it to the shell -- not one statement more.
test("dorokuma.github.io/hm is exactly the install.sh hand-off template", { skip }, () => {
  assertRedirectScript(fetchHop("https://dorokuma.github.io/hm"), "install.sh", "the hm redirect script");
});

test("dorokuma.github.io/hm.ps1 is exactly the install.ps1 hand-off template", { skip }, () => {
  // The Windows one-liner cannot be executed here (no PowerShell on the
  // machines this suite targets), but its first hop can: if this answers
  // anything else, every Windows install line is dead no matter how good
  // the release is.
  assertRedirectScript(fetchHop("https://dorokuma.github.io/hm.ps1"), "install.ps1", "the hm.ps1 redirect script");
});

test(`the one-line installer's verified installer bytes install ${V}`, { skip }, () => {
  // The chain the README line trusts, walked by hand instead of piped blind:
  // the redirect script is verified against its exact template (the test
  // above), the installer asset the template points at is downloaded and
  // verified byte for byte against the install.sh the tagged release carries
  // (or, when the tag is not in this checkout, the repository's own), and
  // only THOSE verified bytes are handed to bash -- never the nested remote
  // pipe the README line itself runs, which no test output could audit after
  // the fact.
  const hm = fetchHop("https://dorokuma.github.io/hm");
  assertRedirectScript(hm, "install.sh", "the hm redirect script");

  const dl = spawnSync("curl", ["-fsSL", "--max-time", "60", `https://github.com/${REPO}/releases/latest/download/install.sh`], { encoding: "utf8", env: cleanEnv(), maxBuffer: 8 << 20 });
  assert.equal(dl.status, 0, `install.sh asset of releases/latest downloaded: ${dl.stderr}`);
  const tagged = spawnSync("git", ["-C", ROOT, "show", `v${V}:install.sh`], { encoding: "utf8", maxBuffer: 8 << 20 });
  const reference = tagged.status === 0
    ? tagged.stdout
    : fs.readFileSync(path.join(ROOT, "install.sh"), "utf8");
  assert.equal(dl.stdout, reference,
    tagged.status === 0
      ? `the install.sh asset of releases/latest is byte for byte the one tagged v${V}`
      : `tag v${V} is not in this checkout, so the asset is checked against the repository's install.sh instead (git fetch --tags to pin it)`);
  const verifiedInstaller = dl.stdout;

  const home = tmpdir("home");
  const stub = stubHerdrApp();
  // the verified installer bytes are fed to bash as stdin, the way the pipe
  // at the end of the hand-off template feeds them; the script's own trap
  // removes the temporary folder the bootstrap downloads into, however it
  // ends
  let r;
  for (let i = 0; i < 3; i++) {
    r = spawnSync("bash", [], { input: verifiedInstaller, encoding: "utf8", env: cleanEnv({ PATH: stub.PATH, HERDR_APP_HOME: home }) });
    if (r.status === 0) break;
  }
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/VERSION"), "utf8").trim(), V);
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/main.js"), "utf8"), released.stdout, `main.js is the one tagged v${V}`);
});
