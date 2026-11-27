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
import { loadMod, realExec, oldInstall, releasedMods, stubHerdrApp, tmpdir, ROOT } from "../harness.mjs";

const V = process.env.HM_PUBLISHED || "";
const skip = V ? false : "set HM_PUBLISHED=X.Y.Z (scripts/release-check.sh --published does)";
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
  const m = await loadMod({ source: prev.source, home, exec: realExec });
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

// the lines a person on an install too old to have the pill is told to paste
const pasted = (file) => {
  const blocks = [...fs.readFileSync(path.join(ROOT, file), "utf8").matchAll(/```bash\n([\s\S]*?)```/g)].map((b) => b[1]);
  return blocks.filter((b) => b.includes("releases/latest"));
};

test(`the README's no-clone install lines install ${V}`, { skip }, () => {
  const en = pasted("README.md"), zh = pasted("README.zh-CN.md");
  assert.equal(en.length, 1, "README.md has one block that resolves releases/latest");
  assert.deepEqual(zh, en, "README.zh-CN.md gives the same lines");

  const home = tmpdir("home");
  const stub = stubHerdrApp();
  // the block is a subshell whose own trap removes the temporary folder it
  // made, however it ends; nothing of /tmp is swept here
  let r;
  for (let i = 0; i < 3; i++) {
    r = spawnSync("sh", ["-c", en[0]], { encoding: "utf8", env: { ...process.env, PATH: stub.PATH, HERDR_APP_HOME: home } });
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
  return blocks.filter((b) => b.includes("releases/latest") && b.includes("install.ps1"));
};

test("the READMEs' PowerShell install block is one and the same in both languages", { skip }, () => {
  const en = pastedPs("README.md"), zh = pastedPs("README.zh-CN.md");
  assert.equal(en.length, 1, "README.md has one PowerShell install block");
  assert.equal(zh.length, 1, "README.zh-CN.md has one PowerShell install block");
  assert.deepEqual(zh, en, "README.zh-CN.md gives the same lines, byte for byte");
  assert.ok(!/herdr-magpie-\d+\.\d+\.\d+/.test(en[0]), "no version is pinned into the block");
});
