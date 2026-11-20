// The update pill's machinery, without the network.
//
// "GitHub" here is a folder: the look for the latest release is answered by the
// test, and the install script — the mod's own, unmodified but for the address
// it downloads from — runs for real against an archive on disk. The archive is
// this checkout, packed the way a release is packed.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  loadMod, storage, offlineExec, fakeRelease, packTree, treeVersion, oldInstall,
  releasedMods, stubHerdrApp, sha256, tmpdir, MAIN, REPO,
} from "./harness.mjs";

const V = treeVersion();
const H = 3600e3, M = 60e3;

const mod = await loadMod();
const fresh = (over = {}) => mod.make({ configReady: true, ...over });

test("versions compare as numbers, not as text", () => {
  const o = fresh();
  assert.ok(o.newerThan("0.3.0", "0.2.0"));
  assert.ok(!o.newerThan("0.2.0", "0.2.0"));
  assert.ok(!o.newerThan("0.2.9", "0.10.0"), "0.10.0 is newer than 0.2.9");
  assert.ok(o.newerThan("0.10.0", "0.9.9"));
  assert.ok(o.newerThan("1.0.0", "0.99.99"));
});

test("an update is offered only to an install that is known to be older", () => {
  const o = fresh();
  o.upd.latest = "0.2.0";
  o.modVersion = ""; assert.ok(!o.updateReady(), "no VERSION file: never guesses");
  o.modVersion = "0.2.0"; assert.ok(!o.updateReady(), "same version");
  o.modVersion = "0.1.0"; assert.ok(o.updateReady(), "older install");
  o.modVersion = "0.3.0"; assert.ok(!o.updateReady(), "a build ahead of the latest release");
  o.upd.latest = ""; o.modVersion = "0.1.0"; assert.ok(!o.updateReady(), "GitHub not asked yet");
});

test("when GitHub is asked", () => {
  const o = fresh();
  const now = Date.now();
  const at = (u) => Object.assign(o.upd, { checkedAt: 0, triedAt: 0, fails: 0 }, u);
  const due = (reason) => o.updateDue(reason, now);

  at({}); assert.ok(due("routine"), "first run ever");
  at({ checkedAt: now - 5 * M, triedAt: now - 5 * M });
  assert.ok(!due("routine"), "a reload 5m after a look asks nothing");
  assert.ok(!due("asked"), "Refresh 5m after a look is throttled");
  at({ checkedAt: now - 11 * M, triedAt: now - 11 * M });
  assert.ok(due("asked"), "Refresh 11m after a look");
  assert.ok(!due("routine"), "but not the routine look");
  at({ checkedAt: now - 6 * H + M, triedAt: now - 6 * H + M }); assert.ok(!due("routine"), "5h59m: not yet");
  at({ checkedAt: now - 6 * H, triedAt: now - 6 * H }); assert.ok(due("routine"), "6h by the wall clock (a laptop waking up)");

  // after a failed look: 2m, 10m, 30m, then hourly
  at({ checkedAt: now - H, triedAt: now - 1 * M, fails: 1 }); assert.ok(!due("routine"), "failed 1m ago: wait");
  at({ checkedAt: now - H, triedAt: now - 2 * M, fails: 1 }); assert.ok(due("routine"), "failed 2m ago: retry");
  at({ checkedAt: now - H, triedAt: now - 9 * M, fails: 2 }); assert.ok(!due("routine"), "second failure waits 10m");
  at({ checkedAt: now - H, triedAt: now - 10 * M, fails: 2 }); assert.ok(due("routine"));
  at({ checkedAt: now - 9 * H, triedAt: now - 59 * M, fails: 9 }); assert.ok(!due("routine"), "many failures: hourly, 59m is early");
  at({ checkedAt: now - 9 * H, triedAt: now - 60 * M, fails: 9 }); assert.ok(due("routine"), "many failures: hourly");

  at({ checkedAt: now - H, triedAt: now - 1 * M, fails: 3 }); assert.ok(due("online"), "gateway back after a failed look: retry now");
  at({ checkedAt: now - H, triedAt: now - H }); assert.ok(!due("online"), "gateway back, last look was fine: nothing");
  at({ checkedAt: now + 5 * H, triedAt: now + 5 * H }); assert.ok(due("routine"), "the clock was set back");

  at({});
  o.demo = true; assert.ok(!due("routine"), "demo mode: never"); o.demo = false;
  o.updateBusy = true; assert.ok(!due("asked"), "while installing: never"); o.updateBusy = false;
  o.updateChecking = true; assert.ok(!due("routine"), "while already looking: never"); o.updateChecking = false;
  o.configReady = false; assert.ok(!due("routine"), "before the config is read: never");
});

test("the look asks github.com for releases/latest and keeps the answer", async () => {
  const exec = offlineExec({ latest: "4.5.6" });
  const store = storage();
  const m = await loadMod({ exec, store });
  const o = m.make({ configReady: true });

  assert.equal(await o.checkLatest(), true, "the answer moved");
  assert.equal(o.upd.latest, "4.5.6");
  assert.equal(o.upd.fails, 0);
  assert.ok(o.upd.checkedAt > 0);
  assert.equal(exec.calls.length, 1, "one request");
  assert.equal(exec.calls[0][0], "curl");
  assert.equal(exec.calls[0].at(-1), `https://github.com/${REPO}/releases/latest`);
  assert.equal(JSON.parse(store.data.get("routing.update")).latest, "4.5.6", "kept in localStorage");

  assert.equal(await o.checkLatest(), false, "asked again, same answer: nothing moved");

  const reloaded = m.make({ configReady: true }); // what a reload of the mod starts with
  assert.equal(reloaded.upd.latest, "4.5.6", "a reload knows the answer");
  assert.equal(exec.calls.length, 2, "without asking GitHub");
  assert.ok(!reloaded.updateDue("routine", Date.now()), "and does not ask again yet");
});

test("a look that fails keeps the last answer and schedules a retry", async () => {
  const store = storage();
  const good = await loadMod({ exec: offlineExec({ latest: "4.5.6" }), store });
  await good.make({ configReady: true }).checkLatest();

  const m = await loadMod({ exec: offlineExec({ fail: true }), store });
  const o = m.make({ configReady: true });
  assert.equal(await o.checkLatest(), false);
  assert.equal(o.upd.latest, "4.5.6", "the kept answer stands");
  assert.equal(o.upd.fails, 1);
  assert.ok(!o.updateDue("routine", Date.now()), "not retried at once");
  assert.ok(o.updateDue("routine", Date.now() + 2 * M), "retried after 2m");
  assert.equal(m.notes.length, 0, "a failed look is silent");
});

test("a repository with no release yet offers nothing", async () => {
  const m = await loadMod({ exec: offlineExec({ latest: "" }) });
  const o = m.make({ configReady: true, modVersion: "0.1.0" });
  await o.checkLatest();
  assert.equal(o.upd.latest, "");
  assert.ok(!o.updateReady());
});

// --- the install ---------------------------------------------------------------

// an install at `from`, whose mod is `source` (default: this checkout's), with
// `dir` standing in for GitHub and `latest` as its newest release
async function installAt(from, { source, dir, latest }) {
  const home = tmpdir("home");
  const r = oldInstall(home, from);
  const m = await loadMod({ source, home, exec: offlineExec({ dir, latest }) });
  const o = m.make({ configReady: true });
  await o.readModVersion();
  o.announceVersion(); // the first frame: remembers which version this is
  return { home, r, m, o };
}

function assertInstalled({ home, r, m, o }, from, to) {
  assert.equal(o.updateError, "", "no error");
  assert.equal(fs.readFileSync(path.join(r, "VERSION"), "utf8").trim(), to, "VERSION on disk");
  assert.equal(o.modVersion, to, "the running panel knows its new version");
  assert.equal(sha256(path.join(r, "main.js")), sha256(MAIN), "main.js is the release's, byte for byte");
  assert.equal(fs.readFileSync(path.join(r, "config.json"), "utf8"), '{"remote":"my-box","mine":true}', "the person's config.json is untouched");
  assert.equal(fs.readFileSync(path.join(r, "notes.local"), "utf8"), "mine", "a file the release does not ship is left alone");
  for (const f of ["mods/routing/icons/update.svg", "mods/routing/demo.json", "mods/tabs-routing/main.js", "mods/tabs-routing/mod.json", "layouts/Magpie.json"]) {
    assert.ok(fs.existsSync(path.join(home, f)), `${f} laid down`);
  }
  assert.ok(!fs.existsSync(path.join(r, ".main.js.new")), "no temporary file left behind");
  assert.ok(!o.updateReady() && !o.updateBusy, "the pill is gone");
  assert.deepEqual(m.notes.map((n) => [n.level, n.body]), [["success", `${from} → ${to}`]], "one toast, naming both versions");
  assert.ok(m.cx.redraws >= 2, "the panel was asked to redraw");
}

test(`clicking the pill installs this checkout as ${V} over an older install`, async () => {
  const dir = packTree();
  const t = await installAt("0.0.1", { dir, latest: V });
  await t.o.checkLatest();
  assert.ok(t.o.updateReady(), "the pill is shown");
  await t.o.updateMod(t.m.cx);
  assertInstalled(t, "0.0.1", V);
  t.o.announceVersion();
  assert.equal(t.m.notes.length, 1, "the toast is not repeated");
});

test("clicking the pill when nothing newer exists after all installs nothing", async () => {
  const t = await installAt(V, { dir: packTree(), latest: V });
  await t.o.updateMod(t.m.cx);
  assert.equal(fs.readFileSync(path.join(t.r, "main.js"), "utf8"), "// the previous version\n");
  assert.equal(t.m.notes.length, 0);
});

// each way a download can be wrong must leave the install exactly as it was
async function assertRefused(dir, latest, why) {
  const t = await installAt("0.0.1", { dir, latest });
  await t.o.updateMod(t.m.cx);
  assert.match(t.o.updateError, why, "the reason is kept for the tooltip");
  assert.equal(fs.readFileSync(path.join(t.r, "main.js"), "utf8"), "// the previous version\n", "main.js untouched");
  assert.equal(fs.readFileSync(path.join(t.r, "VERSION"), "utf8").trim(), "0.0.1", "VERSION untouched");
  assert.ok(!fs.existsSync(path.join(t.home, "mods/tabs-routing")), "nothing else laid down");
  assert.deepEqual(t.m.notes.map((n) => n.level), ["error"], "one error toast");
  assert.ok(t.m.notes[0].body.includes(`https://github.com/${REPO}/releases/latest`), "that says where to get it by hand");
  assert.ok(t.o.updateReady() && !t.o.updateBusy, "the pill stays, ready for another try");
}

const good = {
  "mods/routing/main.js": "// new\n", "mods/routing/VERSION": "9.9.9\n",
  "mods/tabs-routing/main.js": "// tabs\n", "layouts/Magpie.json": "{}\n",
};

test("refused: the archive does not match its published sha256", async () => {
  await assertRefused(fakeRelease("9.9.9", good, { checksum: "0".repeat(64) }), "9.9.9", /checksum mismatch/);
});

test("refused: the .sha256 file is empty", async () => {
  const dir = fakeRelease("9.9.9", good);
  fs.writeFileSync(path.join(dir, "herdr-magpie-9.9.9.tar.gz.sha256"), "");
  await assertRefused(dir, "9.9.9", /checksum mismatch/);
});

test("refused: the archive lacks one of the mods", async () => {
  const { "mods/tabs-routing/main.js": _gone, ...partial } = good;
  await assertRefused(fakeRelease("9.9.9", partial), "9.9.9", /missing its mods/);
});

test("refused: the release has no archive to download", async () => {
  await assertRefused(tmpdir("empty"), "9.9.9", /./);
});

test("an archive from before VERSION was shipped still records its version", async () => {
  const { "mods/routing/VERSION": _gone, ...files } = good;
  const t = await installAt("0.0.1", { dir: fakeRelease("9.9.9", files), latest: "9.9.9" });
  await t.o.updateMod(t.m.cx);
  assert.equal(t.o.updateError, "");
  assert.equal(fs.readFileSync(path.join(t.r, "VERSION"), "utf8").trim(), "9.9.9");
});

// --- the installs already out there --------------------------------------------
// A release is installed by the updater of whatever version a person has, not
// by this checkout's. So every released updater is run, from git history,
// against this checkout's archive: if the archive's shape drifts from what an
// old updater expects, this is where it shows, before the release does.

const num = (v) => v.split(".").map(Number);
const older = (a, b) => { const x = num(a), y = num(b); return (x[0] - y[0] || x[1] - y[1] || x[2] - y[2]) < 0; };
const updaters = releasedMods().filter((t) => /^ {2}updateScript\(/m.test(t.source) && older(t.version, V));

// Under the release gate an empty list is a failure, not a skip: it means the
// tags were not fetched, and the gate would be passing without having run this.
const need = Boolean(process.env.HM_REQUIRE_UPDATERS);
test("every released updater can install this checkout", { skip: updaters.length || need ? false : `no release tag older than ${V} with an updater in this checkout (git fetch --tags)` }, async (t) => {
  assert.ok(updaters.length > 0, `no release tag older than ${V} with an updater was found: git fetch --tags`);
  const dir = packTree();
  for (const u of updaters) {
    await t.test(`${u.tag} → ${V}`, async () => {
      const inst = await installAt(u.version, { source: u.source, dir, latest: V });
      await inst.o.checkLatest();
      assert.ok(inst.o.updateReady(), `${u.tag} offers ${V}`);
      await inst.o.updateMod(inst.m.cx);
      assertInstalled(inst, u.version, V);
    });
  }
});

// --- install.sh ----------------------------------------------------------------

function unpack(dir, version) {
  const to = tmpdir("unpacked");
  const r = spawnSync("tar", ["xzf", path.join(dir, `herdr-magpie-${version}.tar.gz`), "-C", to], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return path.join(to, `herdr-magpie-${version}`);
}

test("install.sh, run from an unpacked release, lays the mods and the layout down", () => {
  const src = unpack(packTree(), V);
  const home = tmpdir("home");
  const stub = stubHerdrApp();
  const run = () => spawnSync(path.join(src, "install.sh"), [], { encoding: "utf8", env: { ...process.env, PATH: stub.PATH, HERDR_APP_HOME: home } });

  let r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/VERSION"), "utf8").trim(), V);
  assert.equal(sha256(path.join(home, "mods/routing/main.js")), sha256(MAIN));
  for (const f of ["mods/tabs-routing/main.js", "layouts/Magpie.json", "layouts/Magpie.png", "mods/routing/icons/magpie.svg"]) {
    assert.ok(fs.existsSync(path.join(home, f)), `${f} laid down`);
  }
  assert.deepEqual(stub.calls(), [
    `check ${home}/mods/routing`, `check ${home}/mods/tabs-routing`, 'do layout.switch {"name":"Magpie"}',
  ], "then checks both mods and switches to the layout");

  // run again over an install that has been configured
  fs.writeFileSync(path.join(home, "mods/routing/config.json"), '{"mine":true}');
  r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/config.json"), "utf8"), '{"mine":true}', "a second run keeps config.json");
});
