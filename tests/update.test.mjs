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
import { pathToFileURL } from "node:url";
import {
  loadMod, storage, offlineExec, fakeRelease, packTree, treeVersion, oldInstall,
  releasedMods, stubHerdrApp, sha256, tmpdir, MAIN, REPO, ROOT,
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

test("install.sh honours XDG_CONFIG_HOME over HOME, and HERDR_APP_HOME over both", () => {
  const src = unpack(packTree(), V);
  const stub = stubHerdrApp();
  const base = { ...process.env, PATH: stub.PATH };
  delete base.HERDR_APP_HOME;
  const xdg = tmpdir("xdg");
  const fakeHome = tmpdir("home");

  const r = spawnSync(path.join(src, "install.sh"), [], { encoding: "utf8", env: { ...base, XDG_CONFIG_HOME: xdg, HOME: fakeHome } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(xdg, "herdr-app/mods/routing/main.js")), "installed under $XDG_CONFIG_HOME/herdr-app");
  assert.ok(!fs.existsSync(path.join(fakeHome, ".config/herdr-app")), "HOME's .config was not used");

  const override = tmpdir("override");
  const r2 = spawnSync(path.join(src, "install.sh"), [], { encoding: "utf8", env: { ...base, XDG_CONFIG_HOME: xdg, HOME: fakeHome, HERDR_APP_HOME: override } });
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(fs.existsSync(path.join(override, "mods/routing/main.js")), "HERDR_APP_HOME wins over XDG_CONFIG_HOME");
});

test("install.sh refuses to fall into '/.config/herdr-app' when HOME is empty or '/'", () => {
  const src = unpack(packTree(), V);
  // an isolated PATH whose mkdir and herdr-app are stand-ins that refuse to
  // run: if the installer ever reaches either of them the refusal has failed,
  // wherever in the filesystem it was headed
  const bin = tmpdir("bin");
  const log = path.join(bin, "calls.log");
  for (const tool of ["mkdir", "herdr-app"]) {
    fs.writeFileSync(path.join(bin, tool), `#!/bin/sh\nprintf '%s\\n' '${tool}' >> '${log}'\necho '${tool}: refusing to run inside this test' >&2\nexit 1\n`, { mode: 0o755 });
  }
  const base = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  delete base.HERDR_APP_HOME;
  delete base.XDG_CONFIG_HOME;

  for (const bad of ["", "/"]) {
    const r = spawnSync(path.join(src, "install.sh"), [], { encoding: "utf8", env: { ...base, HOME: bad } });
    assert.notEqual(r.status, 0, `HOME='${bad}' must not install`);
    assert.match(r.stderr, /HOME/, "the refusal says why");
    assert.ok(!r.stdout.includes("Installed herdr-magpie"), "nothing was installed");
  }
  assert.ok(!fs.existsSync(log), "neither mkdir nor herdr-app was ever reached");
});

test("install.sh never copies a source mods/routing/config.json over the installed one", () => {
  const src = unpack(packTree(), V);
  const home = tmpdir("home");
  const stub = stubHerdrApp();

  // a clone someone configured before running the installer: config.json sits
  // in the source tree, untracked, never part of the release
  fs.writeFileSync(path.join(src, "mods/routing/config.json"), '{"source":true}\n');
  // an install that is already configured differently
  const target = path.join(home, "mods/routing");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "config.json"), '{"mine":true}\n');
  const before = fs.readFileSync(path.join(target, "config.json"));

  const r = spawnSync(path.join(src, "install.sh"), [], { encoding: "utf8", env: { ...process.env, PATH: stub.PATH, HERDR_APP_HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readFileSync(path.join(target, "config.json")), before, "the installed config.json is byte for byte what it was");
  assert.ok(fs.existsSync(path.join(target, "config.example.json")), "config.example.json is installed");
});

// --- install.sh, piped into bash: the one-line installer ---------------------
// There is no tree beside the script then, so it bootstraps itself: resolve
// the latest release, download the archive, verify its sha256, and only then
// install. "GitHub" is a folder again, served by a curl stand-in: the real
// download flags (-o, -w, --max-time) are parsed the way curl itself reads
// them, and anything not pointing at the stand-in's release base fails.

function stubCurl() {
  const bin = tmpdir("bin");
  fs.writeFileSync(path.join(bin, "curl"), `#!/bin/sh
out=""; writefmt=""; url=""; i=1
while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output) shift; out="$1" ;;
    -w|--write-out) shift; writefmt="$1" ;;
    --max-time) shift ;;
    -*) ;;
    *) url="$1" ;;
  esac
  shift
done
case "$url" in
  */latest)
    base="\${url%/latest}"
    if [ -n "$writefmt" ]; then printf '%s' "$base/tag/v\${STUB_VERSION:-0.0.0}"; fi
    exit 0 ;;
esac
case "$url" in
  file://*) ;;
  *) echo "curl: (6) no such host" >&2; exit 6 ;;
esac
if [ -z "$out" ]; then echo "curl: (3) no output file" >&2; exit 3; fi
# the GitHub download URL shape, mapped onto the flat release folder the
# harness packs: <base>/download/vX.Y.Z/<file> is <base>/<file>
case "$url" in
  */download/v*/*) url="\${url%%/download/v*/*}/\${url##*/}" ;;
esac
src="\${url#file://}"
if [ -f "$src" ]; then cp "$src" "$out"; exit 0; fi
echo "curl: (22) not found: $url" >&2
exit 22
`, { mode: 0o755 });
  // the bare stub folder, NOT pre-joined to the real PATH: the caller puts
  // every stub ahead of the real PATH exactly once. Joining it here would
  // sandwich the real PATH in front of the herdr-app stub -- and on a
  // machine with a real herdr-app installed the install would then drive
  // THAT instead of the stub.
  return bin;
}

// the installer as a person pipes it: bash reads the script from stdin. The
// checkout's install.sh is the script under test; the archive it downloads
// is the packed tree in `dir`, found through HERDR_MAGPIE_RELEASE_BASE.
// `before` is prepended to the PATH ahead of even the curl stub: a test that
// wants its own stand-in for a tool (a tar that must never run, say) hands
// its folder in here.
function pipedInstall(dir, { home, version, env = {}, before = "" } = {}) {
  const stub = stubHerdrApp();
  // HERDR_MAGPIE_RELEASE_BASE / HERDR_MAGPIE_VERSION re-point the installer:
  // whatever the host shell has them set to must never steer an offline unit
  // test at a server the test did not stand up. They are dropped here, and
  // only the test's own fixture values (or an explicit override) go back in.
  const hostEnv = { ...process.env };
  delete hostEnv.HERDR_MAGPIE_RELEASE_BASE;
  delete hostEnv.HERDR_MAGPIE_VERSION;
  const r = spawnSync("bash", [], {
    input: fs.readFileSync(path.join(ROOT, "install.sh"), "utf8"),
    encoding: "utf8",
    env: {
      ...hostEnv,
      PATH: `${before ? `${before}${path.delimiter}` : ""}${stubCurl()}${path.delimiter}${stub.PATH}`,
      HERDR_APP_HOME: home,
      HERDR_MAGPIE_RELEASE_BASE: `${pathToFileURL(dir).href}`,
      STUB_VERSION: version,
      ...env,
    },
  });
  return { ...r, stub };
}

test("install.sh, piped into bash, downloads, verifies and installs the release", () => {
  const dir = packTree();
  const home = tmpdir("home");
  const r = pipedInstall(dir, { home, version: V });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("Installed herdr-magpie"), "the install completed");
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/VERSION"), "utf8").trim(), V);
  assert.equal(sha256(path.join(home, "mods/routing/main.js")), sha256(MAIN), "main.js is the release's, byte for byte");
  for (const f of ["mods/tabs-routing/main.js", "layouts/Magpie.json"]) {
    assert.ok(fs.existsSync(path.join(home, f)), `${f} laid down`);
  }
  assert.deepEqual(r.stub.calls(), [
    `check ${home}/mods/routing`, `check ${home}/mods/tabs-routing`, 'do layout.switch {"name":"Magpie"}',
  ], "then checks both mods and switches to the layout, as the local install does");

  // a second run over an install that has been configured keeps the person's
  // config.json, the same rule the local install follows
  fs.writeFileSync(path.join(home, "mods/routing/config.json"), '{"mine":true}');
  const r2 = pipedInstall(dir, { home, version: V });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(fs.readFileSync(path.join(home, "mods/routing/config.json"), "utf8"), '{"mine":true}', "config.json survives the bootstrap install");
});

test("install.sh, piped into bash, refuses an archive that fails its sha256 and writes nothing", () => {
  // the archive itself is left intact: only the checksum beside it lies
  const goodDir = packTree();
  const dir = tmpdir("rel");
  for (const f of fs.readdirSync(goodDir)) fs.copyFileSync(path.join(goodDir, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, `herdr-magpie-${V}.tar.gz.sha256`), `${"0".repeat(64)}  herdr-magpie-${V}.tar.gz\n`);

  // a tar stand-in that records every invocation sits ahead of everything
  // on PATH: unpacking before the checksum passes is the regression this
  // test exists for, and it would be invisible without it -- a wrong order
  // still produces the same refusal, just having read the untrusted bytes.
  const tarBin = tmpdir("tarbin");
  const tarLog = path.join(tarBin, "calls.log");
  fs.writeFileSync(path.join(tarBin, "tar"), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${tarLog}'\nexit 0\n`, { mode: 0o755 });

  const home = tmpdir("home");
  const r = pipedInstall(dir, { home, version: V, before: tarBin });
  assert.notEqual(r.status, 0, "the checksum mismatch is fatal");
  assert.match(r.stderr, /checksum mismatch/, "the refusal says why");
  assert.ok(!r.stdout.includes("Installed herdr-magpie"), "the install did not complete");
  assert.deepEqual(fs.readdirSync(home), [], "nothing was written into HERDR_APP_HOME: the checksum gates the install");
  assert.ok(!fs.existsSync(tarLog), "tar was never even invoked: an archive that fails verification is never unpacked");
});

// --- Windows: the platform the panel runs on -----------------------------------
// herdr's window() answers the platform; the harness hands it in. On Windows
// there is no /bin/sh and no /dev/null, so the mod phrases its probes and its
// updater for PowerShell and NUL instead.

test("on Windows the release look discards the body into NUL, not /dev/null", async () => {
  const calls = [];
  const exec = async (cmd, args = []) => {
    calls.push([cmd, ...args]);
    return { code: 0, stdout: `https://github.com/${REPO}/releases/tag/v9.9.9`, stderr: "" };
  };
  const m = await loadMod({ window: () => ({ platform: "windows" }), exec });
  const o = m.make({ configReady: true });
  assert.equal(o.isWindows(), true);
  assert.equal(await o.latestRelease(), "9.9.9");
  const curl = calls[0];
  assert.equal(curl[0], "curl");
  assert.ok(curl.includes("NUL"), "the body goes to NUL");
  assert.ok(!curl.includes("/dev/null"), "never /dev/null on Windows");
});

test("on Windows the updater is the PowerShell one, checksummed and atomic", async () => {
  const calls = [];
  const exec = async (cmd, args = []) => {
    calls.push([cmd, ...(args || [])]);
    if (cmd === "curl") return { code: 0, stdout: `https://github.com/${REPO}/releases/tag/v9.9.9`, stderr: "" };
    if (cmd === "powershell.exe") return { code: 0, stdout: "", stderr: "" };
    throw new Error(`unexpected command ${cmd}`);
  };
  // a home spelled the way a real user folder can be: curly apostrophe,
  // spaces, brackets -- every one of them legal and lethal to naive quoting
  const home = "C:\\Users\\O\u2019Connor [dev]\\.config\\herdr-app";
  const m = await loadMod({ window: () => ({ platform: "windows" }), exec, home });
  const o = m.make({ configReady: true });
  o.modVersion = "0.0.1";
  await o.updateMod(m.cx);
  const ps = calls.find((c) => c[0] === "powershell.exe");
  assert.ok(ps, "powershell.exe was run");
  assert.ok(!calls.some((c) => c[0] === "sh"), "no sh on Windows");
  assert.deepEqual(ps.slice(1, 4), ["-NoProfile", "-NonInteractive", "-Command"]);
  const script = ps[4];
  for (const piece of ["System32\\curl.exe", "System32\\tar.exe", "Get-FileHash", "checksum mismatch", "missing its mods"]) {
    assert.ok(script.includes(piece), `the script mentions ${piece}`);
  }
  // the home never appears as text: it is passed as Base64 data and decoded
  // inside the script, byte for byte the UTF-8 of the original path
  assert.ok(!script.includes("O\u2019Connor"), "the raw path is not spliced into the script");
  assert.ok(!script.includes(home), "not even a quoting-safe fragment of it is");
  const b64 = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)?.[1];
  assert.ok(b64, "the home is passed as Base64");
  assert.equal(Buffer.from(b64, "base64").toString("utf8"), home, "decoding hands back the exact path");
  // file operations are wildcard- and quote-proof, the swap is atomic, and
  // every native command's exit code is looked at
  assert.ok(script.includes("-LiteralPath"), "file operations use -LiteralPath");
  assert.ok(!script.includes("\\*')"), "no \\* wildcard tails in copy paths");
  assert.ok(script.includes("[IO.File]::Replace($TmpMain, $DstMain, [System.Management.Automation.Language.NullString]::Value)"),
    "main.js is swapped in by the atomic ReplaceFileW, the null backup passed so PowerShell 5.1 marshals a real CLR null");
  assert.ok(!script.includes("[IO.File]::Replace($TmpMain, $DstMain, $null)"), "a bare $null never reaches ReplaceFileW's backup parameter");
  assert.ok(/\[IO\.File\]::Move\(\$TmpMain, \$DstMain\)/.test(script), "with an atomic Move when nothing is there yet");
  assert.ok(/Copy-Item -Force -LiteralPath [\s\S]*\.main\.js\.new[\s\S]*\[IO\.File\]::(Replace|Move)/.test(script),
    "main.js is staged as .main.js.new and swapped in atomically, last");
  // curl and tar are native commands that never raise: the failure branch of
  // each must read the exit code right where the command ran, not somewhere
  // downstream of it
  assert.ok(/& \$Curl -fsSL --max-time \$Timeout -o "\$Out" \$Url\n\s+if \(\$LASTEXITCODE -eq 0\) \{ return \}/.test(script),
    "curl's exit code decides the download retry loop");
  assert.ok(/for \(\$n = 0; \$n -lt 3; \$n\+\+\) \{[\s\S]*?\n    \}\n    \[Console\]::Error\.WriteLine\("download failed: \$Url"\); exit 1/.test(script),
    "three failed tries end the script in exit 1, right after the retry loop");
  assert.ok(/& \$Tar xzf [^\n]*\n\s+if \(\$LASTEXITCODE -ne 0\) \{ \[Console\]::Error\.WriteLine\('could not unpack the release'\); exit 1 \}/.test(script),
    "tar's exit code is checked immediately after unpacking");
  // the overlay never installs a config.json, whatever the archive carries
  assert.ok(/Get-ChildItem -LiteralPath \(Join-Path \$X 'mods\\routing'\) -Force \| Where-Object \{ \$_\.Name -ne 'config\.json' \} \| ForEach-Object \{ Copy-Item/.test(script),
    "the mods\\routing overlay filters config.json out");
  assert.ok(fs.existsSync(path.join(ROOT, "mods/routing/config.example.json")), "config.example.json is what the release ships instead");
  assert.ok(script.includes("GetTempPath") && script.includes("finally"), "a temporary folder, cleaned in finally");
  assert.equal(o.updateError, "", "a clean powershell run installs without error");
});

test("on Windows provider discovery is phrased for PowerShell, follows magpie's XDG rules and parses providers.json", async () => {
  const calls = [];
  const fixture = JSON.stringify({
    providers: [
      { id: "MyProvider", icon: "data:image/svg+xml;base64,xyz" },
      { id: "filebacked", icon: "file:/tmp/icon.svg" },
    ],
  });
  const opts = [];
  const exec = async (cmd, args = [], o3) => {
    calls.push([cmd, ...(args || [])]);
    opts.push(o3);
    return { code: 0, stdout: fixture, stderr: "" };
  };
  const m = await loadMod({ window: () => ({ platform: "windows" }), exec });
  const o = m.make({ configReady: true });
  await o.discoverProviders();
  const probe = calls[0];
  assert.equal(probe[0], "powershell.exe", "PowerShell does the probing");
  assert.ok(!calls.some((c) => c[0] === "sh"), "no sh on Windows");
  assert.ok(probe[4].includes("XDG_CONFIG_HOME") && probe[4].includes("USERPROFILE"), "both config roots are named");
  assert.ok(probe[4].includes("magpie") && probe[4].includes("providers.json"), "it reads magpie's providers.json");

  // a real providers.json document is parsed into the provider -> icon map;
  // file:-backed icons (local files, not part of the discovery) are not taken
  assert.equal(o.providerIcons.get("myprovider"), "data:image/svg+xml;base64,xyz", "the provider's icon is discovered");
  assert.ok(!o.providerIcons.has("filebacked"), "file: icons are not taken");

  // magpie's own rule: an XDG_CONFIG_HOME that is a full path is the ONLY
  // config root -- no falling back to the profile when the file is not there --
  // and only an unset or non-absolute one reads the profile copy. The probe
  // picks exactly one path: the elseif is what keeps the fallback from
  // running after a valid XDG root, and the regex is what keeps a
  // drive-relative C:relative out of the roots.
  assert.ok(/\$p = Join-Path \(Join-Path \$xdg 'magpie'\)[\s\S]*?elseif/.test(probe[4]),
    "a valid absolute XDG root never falls back to the profile copy");
  assert.ok(/\$xdg -match '\^\[A-Za-z\]:/.test(probe[4]), "the XDG root must be a full drive or UNC path");
  assert.ok(!probe[4].includes("IsPathRooted"), "IsPathRooted is not trusted (it passes drive-relative C:x)");

  // the regex itself, extracted from the probe the production code generated
  // rather than spelled out again here: whatever the mod ships is what these
  // cases run against. Full drive paths and UNC shares -- backslashes and
  // forward slashes alike -- pass; drive-relative and plain relative ones,
  // and a lone leading slash, do not.
  const pat = /\$xdg -match '([^']+)'/.exec(probe[4])?.[1];
  assert.ok(pat, "the probe's absolute-path test is a single-quoted regex");
  const re = new RegExp(pat);
  for (const abs of ["C:\\cfg", "C:/cfg", "\\\\server\\share\\cfg", "//server/share/cfg"]) {
    assert.ok(re.test(abs), `${JSON.stringify(abs)} is absolute`);
  }
  for (const rel of ["C:relative", "\\foo", "/foo", "relative"]) {
    assert.ok(!re.test(rel), `${JSON.stringify(rel)} is not absolute`);
  }

  // and off Windows the same probe stays a shell one, XDG first, and a
  // remote host always gets the shell form even from a Windows panel
  const m2 = await loadMod({ exec });
  const o2 = m2.make({ configReady: true });
  await o2.discoverProviders();
  const unix = calls.filter((c) => c[0] === "sh").pop();
  assert.ok(unix, "sh does the probing on Linux/macOS");
  assert.ok(unix[2].includes("$XDG_CONFIG_HOME/magpie/providers.json"), "XDG_CONFIG_HOME is honoured first");

  const m3 = await loadMod({ window: () => ({ platform: "windows" }), exec });
  const o3 = m3.make({ configReady: true });
  o3.remote = "my-box";
  calls.length = 0;
  opts.length = 0;
  await o3.discoverProviders();
  assert.equal(calls[0][0], "sh", "a remote host is probed over sh even from a Windows panel");
  assert.ok(!calls.some((c) => c[0] === "powershell.exe"), "never PowerShell for a remote host");
  assert.equal(opts[0]?.on, o3.remote, "the probe is exec'd on the remote host, not the panel's");
});

test("install.ps1, the Windows installer, never poisons a successful install's exit code", () => {
  // PowerShell cannot run on the machines this suite targets, so what is
  // checked is the script's text -- the same defense the updater tests use
  // for the generated one.
  const ps1 = fs.readFileSync(path.join(ROOT, "install.ps1"), "utf8");
  // the checks stay fatal, by exit code, while the layout switch stays
  // best-effort inside its try/catch
  assert.equal((ps1.match(/if \(\$LASTEXITCODE -ne 0\) \{ throw "herdr-app check failed/g) || []).length, 2,
    "both herdr-app checks throw on a non-zero exit");
  assert.ok(/try \{[\s\S]*layout\.switch[\s\S]*\} catch \{ \}/.test(ps1), "layout.switch is best-effort");
  // a successful install ends 0 even when that best-effort switch exited
  // non-zero. But a bare `exit` inside `irm ... | iex` would terminate the
  // person's own PowerShell window, so the script body is one script block
  // that resets the leftover exit code and returns instead: no line of the
  // script may call exit at all
  assert.ok(!/^\s*exit\b/m.test(ps1), "no bare exit anywhere: inside irm | iex it would close the host PowerShell window");
  assert.ok(/^& \{ param\(\$InstallerScriptRoot\)\s*$/m.test(ps1),
    "the body is a single script block taking the script root as a parameter, so a throw inside iex stays in iex");
  assert.ok(/Write-Output "Installed herdr-magpie into \$HerdrHome"[\s\S]*\$global:LASTEXITCODE = 0\s*\n\s*return\s*\n\}\s*\$PSScriptRoot\s*$/.test(ps1),
    "the script ends by resetting the leftover native exit code and returning, not by exiting; \$PSScriptRoot is passed into the block");
  // nothing but comments and #requires may stand outside the block: piped
  // into a person's interactive PowerShell session, a strict mode, an error
  // preference or a variable set at file scope would stay behind in that
  // session after the script ends or throws
  const outside = ps1.slice(0, ps1.indexOf("& { param($InstallerScriptRoot)"));
  assert.ok(!/^\s*Set-StrictMode\b/m.test(outside), "no Set-StrictMode outside the block: it would poison the caller's session");
  assert.ok(!/^\s*\$ErrorActionPreference\s*=/m.test(outside), "no $ErrorActionPreference assignment outside the block");
  assert.ok(!/^\s*\$InstallerScriptRoot\s*=/m.test(outside), "no $InstallerScriptRoot variable outside the block: it is a parameter");
  // the dual-mode bootstrap: beside a tree it installs what it sits in
  // ($InstallerScriptRoot, captured from $PSScriptRoot before the wrapper);
  // piped into iex it downloads the release itself, verifies it and unpacks
  // it with the System32 curl.exe and tar.exe the updater also uses
  assert.ok(/\}\s*\$PSScriptRoot\s*$/.test(ps1), "\$PSScriptRoot is captured by the invocation, outside the block where it is still set");
  assert.ok(ps1.includes("Join-Path $InstallerScriptRoot 'mods\\routing'"), "local mode probes the tree beside the script");
  assert.ok(ps1.includes("$env:HERDR_MAGPIE_RELEASE_BASE"), "the release server can be overridden");
  assert.ok(ps1.includes("$env:HERDR_MAGPIE_VERSION"), "the version can be pinned");
  assert.ok(ps1.includes("System32\\curl.exe"), "downloads use the System32 curl.exe");
  assert.ok(ps1.includes("System32\\tar.exe"), "unpacking uses the System32 tar.exe");
  assert.ok(ps1.includes("Get-FileHash -Algorithm SHA256 -LiteralPath"), "the archive is verified with Get-FileHash before anything is installed");
  assert.ok(/for \(\$n = 0; \$n -lt 3; \$n\+\+\)/.test(ps1), "the download retries three times");
  assert.ok(/throw "install\.ps1: checksum mismatch/.test(ps1), "a checksum mismatch throws before anything is unpacked or installed");
  assert.ok(ps1.includes("} finally {"), "the temporary folder is cleaned in finally");
  assert.ok(!ps1.includes("herdr-magpie-$V\\install.ps1"), "the downloaded .ps1 is never launched: it would not run under the Restricted policy irm | iex works around");
  // Legacy argument passing is the default before PowerShell 7.3, where the
  // PSNativeCommandArgumentPassing variable does not exist at all: a missing
  // variable must read as Legacy, not as a modern pass-through
  assert.ok(ps1.includes("$argPassVar = Get-Variable -Name PSNativeCommandArgumentPassing -ErrorAction SilentlyContinue"),
    "the variable is probed tolerantly");
  assert.ok(ps1.includes("$legacy = ($null -eq $argPassVar) -or ($argPassVar.Value -eq 'Legacy')"),
    "an absent variable (5.1, 7.0-7.2) or a Legacy value takes the escaped-JSON form");
  // each branch passes its own spelling: Legacy needs the quotes escaped
  // (else the JSON arrives stripped), modern passing must NOT escape them
  assert.ok(/if \(\$legacy\) \{\n\s+& \$HerdrAppBin do layout\.switch '\{\\"name\\":\\"Magpie\\"\}' \*>\$null\n\s+\}/.test(ps1),
    "the legacy branch passes the escaped-JSON form");
  assert.ok(/else \{\n\s+& \$HerdrAppBin do layout\.switch '\{"name":"Magpie"\}' \*>\$null\n\s+\}/.test(ps1),
    "the modern branch passes the plain JSON form");
  // and the overlay copy filters config.json out of mods\routing, by the
  // same rule the updater's copy follows
  assert.ok(/Get-ChildItem -LiteralPath \(Join-Path \$SrcDir 'mods\\routing'\) -Force \| Where-Object \{ \$_\.Name -ne 'config\.json' \} \| ForEach-Object/.test(ps1),
    "the mods\\routing copy filters config.json out");
  assert.ok(ps1.includes("-LiteralPath"), "file operations use -LiteralPath");
});

test("during herdr-app check window() is null: the mod constructs and is not Windows", async () => {
  const m = await loadMod({ window: () => null, exec: async () => ({ code: 0, stdout: "", stderr: "" }) });
  let o;
  assert.doesNotThrow(() => { o = m.make({ configReady: true }); }, "construction never touches a null window()");
  assert.equal(o.isWindows(), false, "no window: the Unix answers");
  assert.doesNotThrow(() => o.updateScript("9.9.9"), "the Unix updater is generated");
});
