// What the panel draws: the whole of render(), run against the demo stage.
//
// texts() is every string the tree would show, in drawing order, so a line
// like "Requests | 2 active | · | 4 recent" is asserted as it reads on screen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, texts, find, ROOT } from "./harness.mjs";

// the stage demo.json describes, as config.json's "demo": true loads it
async function demo() {
  const m = await loadMod({ home: ROOT });
  const o = m.make({ demo: true });
  await o.loadDemo(m.cx);
  assert.equal(o.offline, "", "demo.json loaded");
  const draw = () => texts(o.render(m.cx));
  return { o, cx: m.cx, draw, line: () => draw().join(" | ") };
}

test("the demo stage draws, top to bottom", async () => {
  const { line } = await demo();
  const s = line();
  for (const part of ["Magpie", "Agent Quota", "Requests", "Masked", "pid 48210"]) assert.ok(s.includes(part), `draws ${part}`);
  const order = ["Magpie", "Agent Quota", "Requests"].map((p) => s.indexOf(p));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "title, then quota, then requests");
});

// the Requests header row: everything from its title up to the Masked switch
function header(drawn) {
  const from = drawn.indexOf("Requests");
  const to = drawn.findIndex((s, i) => i > from && /icons\/eye(-off)?\.svg$/.test(s));
  assert.ok(from >= 0 && to > from, "the Requests header is drawn, ending in the Masked switch");
  return drawn.slice(from, to);
}

test("one Requests header carries the counts", async () => {
  const { o, draw } = await demo();
  assert.deepEqual(header(draw()), ["Requests", "2 active", "·", "4 recent"]);

  for (const r of o.routes.values()) r.done = true;
  assert.deepEqual(header(draw()), ["Requests", "6 recent"], "nothing active: no active count, no separator");

  for (const r of o.routes.values()) r.done = false;
  assert.deepEqual(header(draw()), ["Requests", "6 active"], "nothing finished: no recent count, no separator");

  o.routes.clear();
  assert.deepEqual(header(draw()), ["Requests"], "no requests: the title alone");
  assert.ok(draw().includes("No request yet."), "and the empty state below it");
});

test("filtering by an agent puts its chip after the title and counts only its requests", async () => {
  const { o, draw } = await demo();
  o.selectedAgent = "claude";
  assert.deepEqual(header(draw()), ["Requests", "claude", "×", "1 active", "·", "1 recent"]);
});

test("the old labels are gone", async () => {
  const { line } = await demo();
  assert.doesNotMatch(line(), /IN FLIGHT|in flight|RECENT|REQUESTS|\d+ live/);
});

test("a request's expanded try list says active, not in flight", async () => {
  const { o, cx } = await demo();
  const open = [...o.routes.values()].find((r) => !r.done);
  open.tries = [{ id: "x", name: "Somewhere", done: false }];
  o.expandedRouteId = open.id;
  const row = texts(find(o.render(cx), `req-row-${open.id}`));
  assert.deepEqual(row.slice(-3), ["#1", "Somewhere", "active"], row.join(" | "));
});

test("the update pill: only when a newer release exists, right after the title", async () => {
  const { o, cx, draw } = await demo();
  o.demo = false; // a demo stage never offers an update
  o.modVersion = "1.2.3";

  o.upd.latest = "1.2.3";
  assert.equal(find(o.render(cx), "mod-update"), null, "on the latest release: no pill");
  assert.deepEqual(draw().slice(0, 2), ["Magpie", o.remoteLabel], "the gateway label follows the title directly, no separator dot");

  o.upd.latest = "1.3.0";
  assert.deepEqual(draw().slice(0, 4), ["Magpie", "·", "mods/routing/icons/update.svg", "Update 1.3.0"]);

  o.updateBusy = true;
  assert.ok(texts(find(o.render(cx), "mod-update")).includes("Updating…"));
  o.updateBusy = false;

  o.modVersion = "";
  assert.equal(find(o.render(cx), "mod-update"), null, "version unknown: never guesses");
  o.modVersion = "2.0.0";
  assert.equal(find(o.render(cx), "mod-update"), null, "a build ahead of the latest release: no pill");

  o.modVersion = "1.2.3"; o.demo = true;
  assert.equal(find(o.render(cx), "mod-update"), null, "demo mode: no pill");
});

test("the demo still shows cache hits, tok/s and a multi-account two-window quota", async () => {
  const { o, cx, draw } = await demo();
  const line = draw().join(" | ");
  assert.match(line, /983 tok\/s · 96% cached/, "a done request carries its rate and cache hit");
  assert.match(line, /cache hit 96%/, "the expanded request card repeats it");

  // main.js cacheHit reads usage[] per try: usage.in excludes both cache
  // tiers, prompt = in + cache_read + cache_write, and the row's in/tokens
  // must stay on that same book — in === sum(usage.in), tokens === prompt + out
  for (const r of [...o.routes.values()].filter((r) => r.done)) {
    let prompt = 0, input = 0;
    for (const u of r.usage || []) {
      input += u.in || 0;
      prompt += (u.in || 0) + (u.cache_read || 0) + (u.cache_write || 0);
    }
    assert.equal(r.in, input, `route ${r.id}: in === sum(usage.in)`);
    assert.equal(r.tokens, prompt + r.out, `route ${r.id}: tokens === prompt + out`);
  }

  o.quotaOpen = true;
  const open = texts(o.render(cx));
  assert.ok(open.includes("2 Accounts"), "a provider with two seats folds as `2 Accounts`");
  const claude = texts(find(o.render(cx), "quota-prov-hdr-claude")).join(" ");
  assert.match(claude, /76% · 88%/, "its folded row reads short window · long window");

  o.quotaOpen = false;
  const strip = texts(o.render(cx)).join(" ");
  assert.match(strip, /×2/, "the summary chip carries the account count");
});

test("before the gateway answers, the panel says so instead of drawing a stage", async () => {
  const m = await loadMod();
  const o = m.make();
  const s = texts(o.render(m.cx)).join(" | ");
  assert.ok(s.includes("Connecting to Magpie…"), s);
  assert.ok(!s.includes("Requests"), "no stage yet");
});
