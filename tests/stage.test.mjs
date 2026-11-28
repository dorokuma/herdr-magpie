// Stage topology invariants: which agent / account pills belong on the stage,
// and why an unconnected pill must never sit orphaned or flicker as "hot".

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadMod, find, texts, storage, ROOT, MAIN } from "./harness.mjs";

// Total recorder nodes in a rendered tree: what one frame costs to build.
function nodeCount(tree) {
  const seen = new Set();
  const walk = (v) => {
    if (v == null) return 0;
    if (Array.isArray(v)) return v.reduce((s, x) => s + walk(x), 0);
    if (typeof v !== "object" && typeof v !== "function") return 0;
    const n = v.__node;
    if (!n || seen.has(n)) return 0;
    seen.add(n);
    return 1 + n.kids.reduce((s, x) => s + walk(x), 0);
  };
  return walk(tree);
}

test("untried fallback candidates in r.order do not appear as stage pills", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "" });
  o.routes.set(1, {
    id: 1,
    agent: "pig",
    model: "group/verifier",
    served: "swe-2",
    done: true,
    status: 200,
    order: [
      { id: "devin", provider: "devin", name: "Devin", who: "team@acme.dev", model: "swe-2" },
      { id: "anyrouter", provider: "anyrouter", name: "AnyRouter", model: "claude-fable-5-2" },
      { id: "stepfun", provider: "stepfun", name: "StepFun (China)", model: "step-5-preview" },
    ],
    tries: [
      { id: "devin", model: "swe-2", status: 200, done: true },
    ],
  });
  o.recompute();

  assert.deepEqual(o.agents.map((a) => a.id), ["pig"]);
  assert.deepEqual(
    o.accounts.map((a) => ({ key: a.key, name: a.name, who: a.who, model: a.model })),
    [{ key: "devin", name: "Devin", who: "team@acme.dev", model: "swe-2" }],
    "only the seat actually tried enters the stage, enriched with r.order metadata",
  );

  // Once a second seat is actually tried on fallback, it joins the stage too.
  o.routes.set(2, {
    id: 2,
    agent: "pig",
    model: "group/verifier",
    served: "claude-fable-5-2",
    done: true,
    status: 200,
    order: [
      { id: "devin", provider: "devin", name: "Devin", model: "swe-2" },
      { id: "anyrouter", provider: "anyrouter", name: "AnyRouter (local proxy)", model: "claude-fable-5-2" },
    ],
    tries: [
      { id: "devin", model: "swe-2", status: 503, done: true },
      { id: "anyrouter", model: "claude-fable-5-2", status: 200, done: true },
    ],
  });
  o.recompute();
  assert.deepEqual(
    o.accounts.map((a) => ({ key: a.key, name: a.name, model: a.model })),
    [
      { key: "devin", name: "Devin", model: "swe-2" },
      { key: "anyrouter", name: "AnyRouter", model: "claude-fable-5-2" },
    ],
  );
});

test("a burst of 65 short pig requests never orphans or flickers an active stream on another agent", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "" });

  // #181: slow active request on `pi -> anyrouter`
  const slow = {
    id: 181,
    agent: "pi",
    model: "anyrouter/claude-fable-5-2",
    served: "claude-fable-5-2",
    done: false,
    order: [{ id: "anyrouter", name: "AnyRouter", model: "claude-fable-5-2" }],
    tries: [{ id: "anyrouter", model: "claude-fable-5-2", done: false }],
  };
  o.routes.set(slow.id, slow);
  o.recompute();
  o.start(slow);
  o.advance(o.flights.get(181), Date.now());

  // 65 finished short requests on `pig -> devin`, plus #247 currently in flight
  for (let id = 182; id <= 246; id++) {
    o.routes.set(id, {
      id,
      agent: "pig",
      model: "group/worker",
      served: "swe-2",
      done: true,
      status: 200,
      order: [{ id: "devin", name: "Devin", model: "swe-2" }],
      tries: [{ id: "devin", model: "swe-2", done: true, status: 200 }],
    });
    o.trimRoutes();
    o.recompute();
  }
  const activePig = {
    id: 247,
    agent: "pig",
    model: "group/worker",
    served: "swe-2",
    done: false,
    order: [{ id: "devin", name: "Devin", model: "swe-2" }],
    tries: [{ id: "devin", model: "swe-2", done: false }],
  };
  o.routes.set(activePig.id, activePig);
  o.trimRoutes();
  o.recompute();
  o.start(activePig);
  o.advance(o.flights.get(247), Date.now());

  assert.ok(o.routes.has(181), "active stream #181 is never evicted by the 60-route history cap");
  assert.equal(o.routes.size, 60, "total routes remain capped at 60 by trimming finished ones");
  assert.deepEqual(o.agents.map((a) => a.id), ["pi", "pig"], "both active agents stay on stage");
  assert.deepEqual(o.accounts.map((a) => a.key), ["anyrouter", "devin"], "both active seats stay paired");

  const tree = o.render(m.cx);
  assert.notEqual(find(tree, "wire-core-pi-anyrouter"), null, "pi -> anyrouter has a live breathing wire");
  assert.notEqual(find(tree, "wire-core-pig-devin"), null, "pig -> devin has a live breathing wire");
  assert.notEqual(find(tree, "acct-dot-anyrouter"), null, "breathing dots carry stable element ids");
  assert.notEqual(find(tree, "acct-dot-devin"), null, "breathing dots carry stable element ids");

  // Once #181 finishes and its return flight completes, both pi and anyrouter leave together.
  o.routes.set(181, { ...slow, done: true, status: 200, tries: [{ id: "anyrouter", model: "claude-fable-5-2", done: true, status: 200 }] });
  o.flights.delete(181);
  o.trimRoutes();
  o.recompute();
  assert.deepEqual(o.agents.map((a) => a.id), ["pig"]);
  assert.deepEqual(o.accounts.map((a) => a.key), ["devin"]);
});

test("an off-stage 5th concurrent agent cannot push an orphaned hot seat onto the stage", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "" });

  // 5 concurrent agents; MAX_AGENTS is 4 so the oldest active (#1) won't fit on stage
  const names = ["extra", "claude", "codex", "pi", "pig"];
  for (let i = 0; i < names.length; i++) {
    const id = i + 1;
    o.routes.set(id, {
      id,
      agent: names[i],
      model: "m",
      done: false,
      tries: [{ id: `seat-${names[i]}`, name: `Seat ${names[i]}`, model: "m", done: false }],
    });
  }
  o.recompute();
  for (const r of o.routes.values()) o.start(r);
  for (const f of o.flights.values()) o.advance(f, Date.now());

  assert.equal(o.agents.length, 4);
  assert.ok(!o.agents.some((a) => a.id === "extra"));
  assert.ok(!o.accounts.some((a) => a.key === "seat-extra"), "off-stage agent never pushes an unconnected seat");
  assert.equal(o.flights.get(1).seat, null, "off-stage flight does not claim a seat");

  // Filtering by account in render() is pure and never mutates this.accounts
  o.selectedAcct = "seat-extra";
  const before = o.accounts.map((a) => a.key);
  assert.equal(find(o.render(m.cx), "acct-pill-seat-extra"), null);
  assert.deepEqual(o.accounts.map((a) => a.key), before);
});

test("stage pills right-anchor on wide panels, hard-truncate without ellipses, clip quota strip, and keep narrow request metrics", async () => {
  const m = await loadMod();
  const o = m.make({
    loaded: true,
    offline: "",
    quotaOpen: false,
    size: { width: 500, height: 600 },
  });

  // Hard truncation never appends ellipsis
  const cut = o.fitText("StepFun (China)", 11, 45, true);
  assert.ok(cut.length > 0 && cut.length < "StepFun (China)".length);
  assert.ok(!cut.includes("\u2026") && !cut.includes("..."));

  o.agents = [{ id: "pig", color: "#d4b06a" }];
  o.accounts = [
    { key: "stepfun", name: "StepFun (China)", who: "team@example.invalid", model: "step-5-preview" },
    { key: "devin", name: "Devin", who: "", model: "swe-2-1" },
  ];
  o.quotas = o.groupQuotaEntries([
    { provider: "antigravity", name: "Antigravity", allow: [{ label: "5h", left: 78 }] },
    { provider: "workbuddy", name: "WorkBuddy", allow: [{ label: "5h", left: 16 }] },
  ], Date.now());

  const wideG = o.geometry();
  assert.equal(wideG.acct(0).x2, 500 - 5, "wide panels anchor account pills to W - ax");
  assert.ok(wideG.sky > Math.round(500 * 0.18), "wide panels stretch the middle wire corridor");

  o.size = { width: 246, height: 600 };
  const narrowG = o.geometry();
  assert.ok(narrowG.sky >= 48, "narrow panels preserve the minimum wire corridor");

  const now = Date.now();
  o.routes.set(1, {
    id: 1,
    agent: "pig",
    group: { ref: "group/worker" },
    model: "swe-2-1",
    served: "swe-2-1",
    time: new Date(now - 31000).toISOString(),
    done: false,
    tries: [{ id: "devin", name: "Devin", done: false }],
  });
  o.routes.set(2, {
    id: 2,
    agent: "pig",
    group: { ref: "group/verifier" },
    model: "step-5-preview",
    served: "step-5-preview",
    time: new Date(now - 50000).toISOString(),
    done: true,
    status: 200,
    tokens: 177000,
    in: 2000,
    out: 300,
    ms: 9500,
    usage: [{ in: 1000, cache_read: 99000 }],
    tries: [{ id: "stepfun", name: "StepFun (China)", status: 200, done: true }],
  });

  const tree = o.render(m.cx);
  assert.notEqual(find(tree, "quota-summary-clip"), null, "collapsed quota strip uses clipping container");

  const activeRow = find(tree, "req-row-1");
  const activeTexts = texts(activeRow);
  assert.ok(activeTexts.some((s) => /^3[0-9]s$/.test(s)), "active timer omits trailing ellipsis");
  assert.ok(!activeTexts.some((s) => s.includes("\u2026") || s.includes("...")), "active row has no ellipses");

  const doneRow = find(tree, "req-row-2");
  const doneTexts = texts(doneRow);
  assert.ok(doneTexts.some((s) => s.includes("99% cached")), "narrow request row preserves cache-hit stat");
  assert.ok(!doneTexts.some((s) => s.includes("\u2026") || s.includes("...")), "narrow request row hard-truncates without ellipses");
});

test("stage card adapts height to active row count cleanly", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "", size: { width: 336, height: 600 } });

  assert.equal(o.geometry().H, 64, "empty stage preserves 1-row minimum card height with toggle clearance");

  o.agents = [{ id: "codex", color: "#5e95d7" }, { id: "alma", color: "#849e4a" }, { id: "magpie", color: "#00a6b0" }];
  o.accounts = [{ key: "codex", name: "Codex", model: "gpt-5.4" }];
  assert.equal(o.geometry().H, 120, "3-row stage shrinks symmetrically instead of reserving 6 rows");

  o.accounts = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, name: `Acc${i}`, model: "m" }));
  assert.equal(o.geometry().H, 204, "6-row stage accommodates all MAX_ACCOUNTS rows");
});

test("left-column agent pills render client icons, keep magpie untruncated on narrow panels, and fall back to a dot", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "", size: { width: 251, height: 600 } });
  o.agents = [
    { id: "codex", color: "#5e95d7" },
    { id: "alma", color: "#849e4a" },
    { id: "magpie", color: "#00a6b0" },
    { id: "custom-agent", color: "#d97757" },
  ];
  o.accounts = [{ key: "codex", name: "Codex", model: "gpt-5.4" }];
  o.routes.set(1, {
    id: 1,
    agent: "codex",
    model: "gpt-5.4",
    done: false,
    tries: [{ id: "codex", name: "Codex", done: false }],
  });

  const tree = o.render(m.cx);
  assert.deepEqual(texts(find(tree, "agent-icon-codex")), ["mods/routing/icons/codex-color.png"]);
  assert.deepEqual(texts(find(tree, "agent-icon-alma")), ["mods/routing/icons/alma-color.png"]);
  assert.deepEqual(texts(find(tree, "agent-icon-magpie")), ["mods/routing/icons/magpie.svg"]);
  assert.deepEqual(texts(find(tree, "agent-icon-custom-agent")), [], "unknown client falls back to dot without icon asset");
  assert.ok(texts(find(tree, "agent-pill-magpie")).includes("Magpie"), "Magpie fits without truncation at W=251");
});

test("stage flow themes default to minimal, cycle cleanly, and isolate demo mode", async () => {
  const m0 = await loadMod({ home: ROOT, store: storage() });
  const def = m0.make({ loaded: true, offline: "", size: { width: 336, height: 600 } });
  assert.equal(def.stageStyle, "minimal", "default stage style is minimal");

  const store = storage(new Map([["routing.stageStyle", "stream"]]));
  const m = await loadMod({ home: ROOT, store });
  const o = m.make({ loaded: true, offline: "", size: { width: 336, height: 600 } });
  assert.equal(o.stageStyle, "stream");

  o.agents = [{ id: "claude", color: "#d97757" }, { id: "codex", color: "#5e95d7" }];
  o.accounts = [{ key: "anthropic", name: "Anthropic", model: "claude-sonnet-4" }];
  o.routes.set(1, {
    id: 1,
    agent: "claude",
    model: "claude-sonnet-4",
    done: false,
    tries: [{ id: "anthropic", name: "Anthropic", done: false }],
  });

  assert.equal(find(o.render(m.cx), "stage-style-toggle"), null, "toggle stays hidden when stage is not hovered");
  o.stageHovered = true;
  assert.deepEqual(texts(find(o.render(m.cx), "stage-style-toggle")), ["mods/routing/route.svg", "Stream"]);

  o.cycleStageStyle(m.cx);
  assert.equal(o.stageStyle, "magpie");
  assert.equal(store.data.get("routing.stageStyle"), "magpie");
  assert.deepEqual(texts(find(o.render(m.cx), "stage-style-toggle")), ["mods/routing/icons/magpie.svg", "Magpie"]);
  assert.notEqual(find(o.render(m.cx), "wire-core-claude-anthropic"), null);

  o.cycleStageStyle(m.cx);
  assert.equal(o.stageStyle, "minimal");
  assert.equal(store.data.get("routing.stageStyle"), "minimal");
  assert.deepEqual(texts(find(o.render(m.cx), "stage-style-toggle")), ["Minimal"]);
  assert.notEqual(find(o.render(m.cx), "wire-core-claude-anthropic"), null);

  // Demo mode isolates storage preferences
  const demoView = m.make({ demo: true });
  await demoView.loadDemo(m.cx);
  demoView.cycleStageStyle(m.cx);
  assert.equal(demoView.stageStyle, "stream");
  assert.equal(store.data.get("routing.stageStyle"), "minimal", "demo cycle never mutates persisted preference");
});

test("display capitalization preserves internal IDs and compact right chip keeps model untruncated", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "", size: { width: 246, height: 600 } });
  o.agents = [
    { id: "alma", color: "#849e4a" },
    { id: "codex", color: "#5e95d7" },
    { id: "agy", color: "#00a6b0" },
    { id: "mybot", color: "#d97757" },
  ];
  o.accounts = [
    { key: "codex", name: "Codex", model: "codex/gpt-6.2-sol" },
    { key: "openrouter", name: "OpenRouter", model: "qwen/qwen-3" },
  ];
  o.routes.set(1, {
    id: 1,
    agent: "alma",
    model: "codex/gpt-6.2-sol",
    served: "codex/gpt-6.2-sol",
    done: false,
    tries: [{ id: "codex", name: "Codex", done: false }],
  });

  const tree = o.render(m.cx);
  // Element IDs keep internal IDs while display labels are capitalized
  assert.ok(texts(find(tree, "agent-pill-alma")).includes("Alma"));
  assert.ok(texts(find(tree, "agent-pill-codex")).includes("Codex"));
  assert.ok(texts(find(tree, "agent-pill-agy")).includes("Agy"));
  assert.ok(texts(find(tree, "agent-pill-mybot")).includes("Mybot"));

  // Compact right chip strips matching provider prefix and fits untruncated even at W=246
  assert.deepEqual(texts(find(tree, "acct-pill-codex")), ["Codex", "gpt-6.2-sol"]);

  // At standard panel width (W=320), non-matching prefixes (qwen/qwen-3) are preserved untruncated
  o.size = { width: 320, height: 600 };
  const wideTree = o.render(m.cx);
  assert.deepEqual(texts(find(wideTree, "acct-pill-openrouter")), ["OpenRouter", "qwen/qwen-3"]);

  // Filtering still matches raw lowercase agent id while chip label is capitalized
  o.selectedAgent = "alma";
  const filteredTree = o.render(m.cx);
  assert.notEqual(find(filteredTree, "req-row-1"), null);
  assert.ok(texts(find(filteredTree, "clear-filter")).includes("Alma"));

  // Inherited Object.prototype keys fall back to capitalized own IDs instead of hitting Object.prototype
  const protoO = m.make({ loaded: true, offline: "", size: { width: 336, height: 600 } });
  protoO.agents = [
    { id: "constructor", color: "#5e95d7" },
    { id: "__proto__", color: "#849e4a" },
    { id: "toString", color: "#00a6b0" },
  ];
  protoO.accounts = [{ key: "codex", name: "Codex", model: "gpt-6.2-sol" }];
  protoO.routes.set(1, {
    id: 1,
    agent: "constructor",
    model: "gpt-6.2-sol",
    done: false,
    tries: [{ id: "codex", name: "Codex", done: false }],
  });
  const protoTree = protoO.render(m.cx);
  assert.ok(texts(find(protoTree, "agent-pill-constructor")).includes("Constructor"));
  assert.ok(texts(find(protoTree, "agent-pill-__proto__")).includes("__proto__"));
  assert.ok(texts(find(protoTree, "agent-pill-toString")).includes("ToString"));

  protoO.selectedAgent = "constructor";
  const protoFiltered = protoO.render(m.cx);
  assert.notEqual(find(protoFiltered, "req-row-1"), null);
  assert.ok(texts(find(protoFiltered, "clear-filter")).includes("Constructor"));
});

test("two-line request rows render route badge on line 1, live telemetry phases on active line 2, and compact metrics on done rows", async () => {
  const realNow = Date.now;
  const FIXED_NOW = Date.parse("2026-11-27T10:15:30.400Z");
  const fmtClock = (ms) => {
    const d = new Date(ms);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  };
  Date.now = () => FIXED_NOW;
  try {
    const m = await loadMod();
    const o = m.make({ loaded: true, offline: "", size: { width: 320, height: 600 } });
    const t1 = fmtClock(FIXED_NOW - 5400);
    const t2 = fmtClock(FIXED_NOW - 18400);
    const t3 = fmtClock(FIXED_NOW - 31400);
    const t4 = fmtClock(FIXED_NOW - 60000);
    const t5 = fmtClock(FIXED_NOW - 2500);
    o.agents = [
      { id: "codex", color: "#5e95d7" },
      { id: "agy", color: "#00a6b0" },
    ];
    o.accounts = [
      { key: "codex", name: "Codex", model: "gpt-6.2-sol" },
      { key: "antigravity", name: "Antigravity", model: "Orchestrator (Neon)" },
    ];
    // 1. Active Waiting
    o.routes.set(1, {
      id: 1,
      agent: "codex",
      model: "codex/gpt-6.2-sol",
      served: "codex/gpt-6.2-sol",
      time: new Date(FIXED_NOW - 5400).toISOString(),
      done: false,
      prompt: { tokens: 146304 },
      tries: [{ id: "codex", name: "Codex", done: false }],
    });
    // 2. Active Thinking
    o.routes.set(2, {
      id: 2,
      agent: "codex",
      model: "codex/gpt-6.2-sol",
      served: "codex/gpt-6.2-sol",
      time: new Date(FIXED_NOW - 18400).toISOString(),
      done: false,
      firstReasoning: 1200,
      prompt: { tokens: 146304 },
      tries: [{ id: "codex", name: "Codex", done: false }],
    });
    // 3. Active Streaming
    o.routes.set(3, {
      id: 3,
      agent: "codex",
      model: "codex/gpt-6.2-sol",
      served: "codex/gpt-6.2-sol",
      time: new Date(FIXED_NOW - 31400).toISOString(),
      done: false,
      firstReasoning: 800,
      firstText: 3200,
      estTok: 4063,
      bytes: 557988,
      prompt: { tokens: 146304 },
      tries: [{ id: "codex", name: "Codex", done: false }],
    });
    // 4. Done with compact tok stat + group · model badge
    o.routes.set(4, {
      id: 4,
      agent: "agy",
      group: { ref: "agy" },
      model: "Orchestrator (Neon)",
      served: "Orchestrator (Neon)",
      time: new Date(FIXED_NOW - 60000).toISOString(),
      done: true,
      status: 200,
      tokens: 417000,
      in: 2000,
      out: 344,
      ms: 6500,
      usage: [{ in: 0, cache_read: 416656 }],
      tries: [{ id: "antigravity", name: "Antigravity", status: 200, done: true }],
    });
    // 5. Active, no route badge: timestamp still owns the end of line 1.
    o.routes.set(5, {
      id: 5,
      agent: "pig",
      model: "codex/gpt-6.2-sol",
      served: "codex/gpt-6.2-sol",
      time: new Date(FIXED_NOW - 2500).toISOString(),
      done: false,
      prompt: { tokens: 146304 },
      tries: [{ id: "codex", name: "Codex", done: false }],
    });

    const tree = o.render(m.cx);
    const row1 = texts(find(tree, "req-row-1"));
    assert.deepEqual(row1, ["mods/routing/icons/codex-color.png", "Codex", "→", "Codex", "gpt-6.2-sol", t1, "Waiting", "· 146k in", "5s"]);

    const row2 = texts(find(tree, "req-row-2"));
    assert.deepEqual(row2, ["mods/routing/icons/codex-color.png", "Codex", "→", "Codex", "gpt-6.2-sol", t2, "Thinking", "· 146k in", "18s"]);

    const row3 = texts(find(tree, "req-row-3"));
    assert.deepEqual(row3, ["mods/routing/icons/codex-color.png", "Codex", "→", "Codex", "gpt-6.2-sol", t3, "Streaming", "· 146k in · ~4.1k out", "31s"]);

    const row4 = texts(find(tree, "req-row-4"));
    assert.deepEqual(row4.slice(0, 6), ["mods/routing/icons/antigravity-color.png", "Agy", "→", "Antigravity", "agy · Orchestrator (Neon)", t4]);
    assert.equal(row4[6], "417k tok · 6.5s · 53 tok/s · 100% cached");

    const row5 = texts(find(tree, "req-row-5"));
    assert.deepEqual(row5, ["mods/routing/icons/pig.png", "Pig", "→", "Codex", "gpt-6.2-sol", t5, "Waiting", "· 146k in", "2s"],
      "model-only badge row keeps the timestamp as the last item on line 1");

    // Narrow width (W=246): read the row's first and second line subtrees
    // directly — the timestamp must sit inside line 1, phase/elapsed inside
    // line 2 — and assert concrete rendered fields, meaningful truncated
    // prefixes, no ellipses, and the timestamp width budget against the
    // actual fixed chrome (76px with a badge, 56px without).
    o.size = { width: 246, height: 600 };
    const rowInnerW = (o.geometry().W + 14) - 4;
    const narrowTree = o.render(m.cx);
    const line1of = (id) => texts(find(narrowTree, `req-row-${id}`).__node.kids[0]);
    const line2of = (id) => texts(find(narrowTree, `req-row-${id}`).__node.kids[1]);
    const narrowRow1 = [...line1of(1), ...line2of(1)];
    const narrowRow2 = [...line1of(2), ...line2of(2)];
    const narrowRow3 = [...line1of(3), ...line2of(3)];
    const narrowRow4 = [...line1of(4), ...line2of(4)];
    const narrowRow5 = [...line1of(5), ...line2of(5)];

    assert.deepEqual(narrowRow1, ["mods/routing/icons/codex-color.png", "Codex", "→", "Codex", "gpt-6.2-sol", t1, "Waiting", "· 146k in", "5s"]);
    assert.deepEqual(narrowRow2, ["mods/routing/icons/codex-color.png", "Codex", "→", "Codex", "gpt-6.2-sol", t2, "Thinking", "· 146k in", "18s"]);
    assert.deepEqual(narrowRow3, ["mods/routing/icons/codex-color.png", "Codex", "→", "Codex", "gpt-6.2-sol", t3, "Streaming", "· 146k in · ~4.1k out", "31s"]);

    assert.equal(narrowRow4[0], "mods/routing/icons/antigravity-color.png");
    assert.equal(narrowRow4[1], "Agy");
    assert.equal(narrowRow4[2], "→");
    assert.equal(narrowRow4[3], "Antigravity", "short enough provider name stays untruncated on line 1");
    assert.ok(narrowRow4[4].startsWith("agy · Orche") && "agy · Orchestrator (Neon)".startsWith(narrowRow4[4]),
      `expected meaningful prefix of badge at W=246, got ${narrowRow4[4]}`);
    assert.equal(narrowRow4[5], t4, "timestamp stays present at index 5 on line 1");
    assert.equal(narrowRow4[6], "417k tok · 6.5s · 53 tok/s · 100% cached");

    assert.deepEqual(narrowRow5, ["mods/routing/icons/pig.png", "Pig", "→", "Codex", "gpt-6.2-sol", t5, "Waiting", "· 146k in", "2s"],
      "model-only badge row keeps the timestamp as the last item on line 1 at W=246");

    // Row shape per line subtree: line 1 = [icon, agent, "→", acct, badge, time]
    // with a badge, [icon, agent, "→", acct, time] without one;
    // line 2 = active [phase, meta, elapsed] / done [stat, ...].
    const rowsById = [
      [1, t1, "Waiting", "5s"],
      [2, t2, "Thinking", "18s"],
      [3, t3, "Streaming", "31s"],
      [5, t5, "Waiting", "2s"],
    ];
    for (const [id, ts, phase, elapsed] of rowsById) {
      const l1 = line1of(id), l2 = line2of(id);
      assert.ok(l1.includes(ts), `row ${id}: timestamp ${ts} sits inside the line-1 subtree`);
      assert.ok(!l2.includes(ts), `row ${id}: timestamp does not leak into line 2`);
      assert.ok(l2.includes(phase), `row ${id}: phase ${phase} sits inside the line-2 subtree`);
      assert.ok(l2.includes(elapsed), `row ${id}: elapsed ${elapsed} sits inside the line-2 subtree`);
      assert.ok(!l1.includes(phase) && !l1.includes(elapsed), `row ${id}: phase/elapsed stay out of line 1`);
    }
    {
      const l1 = line1of(4), l2 = line2of(4);
      assert.ok(l1.includes(t4), `row 4: timestamp ${t4} sits inside the line-1 subtree`);
      assert.ok(!l2.includes(t4), "row 4: timestamp does not leak into line 2");
      assert.ok(l2.includes("417k tok · 6.5s · 53 tok/s · 100% cached"),
        "row 4: done-row stat with duration sits inside the line-2 subtree");
    }

    for (const [id, l1, rt] of [[1, line1of(1), narrowRow1], [2, line1of(2), narrowRow2], [3, line1of(3), narrowRow3], [4, line1of(4), narrowRow4], [5, line1of(5), narrowRow5]]) {
      assert.ok(!rt.some((s) => s.includes("\u2026") || s.includes("...")), `row ${id} has no ellipsis at W=246`);
      const hasBadge = l1.length === 6;
      assert.equal(l1.length, hasBadge ? 6 : 5, `row ${id} line 1 shape matches its badge presence`);
      const timeIdx = l1.length - 1;
      const badgeIdx = hasBadge ? 4 : -1;
      // Fixed chrome measured off the row's flex children: icon 13 + arrow 12
      // + spacer min 2 + dot 5 + gaps (6×4=24, or 7×4=28 once the badge joins)
      // + badge shell (ml 2 + px 12 + border 2 = 16) = 56px, or 76px with a badge.
      const fixedChrome = hasBadge ? 76 : 56;
      const line1Used = fixedChrome + o.estTextW(l1[timeIdx], 10, false) +
        o.estTextW(l1[1], 11.5, true) + o.estTextW(l1[3], 11, true) +
        (hasBadge ? o.estTextW(l1[badgeIdx], 9.5, false) : 0);
      assert.ok(line1Used <= rowInnerW, `row ${id} line 1 width (${line1Used}px) fits within container (${rowInnerW}px) so timestamp is never clipped`);
    }
  } finally {
    Date.now = realNow;
  }
});

test("rgba clamps non-finite and out-of-range alpha into a valid two-digit hex channel", async () => {
  // rgba() is a module-local function, so it is exercised through the exact
  // source slice the mod itself ships (the same lines the harness loads).
  const src = fs.readFileSync(MAIN, "utf8");
  const start = src.indexOf("const rgba = ");
  const end = src.indexOf("};", start) + 2;
  assert.ok(start >= 0 && end > start, "main.js still defines rgba");
  const rgba = new Function(`${src.slice(start, end)}; return rgba;`)();

  for (const a of [NaN, Infinity, -Infinity]) {
    assert.equal(rgba("#d97757", a), "#d9775700", `non-finite alpha ${a} clamps to 00`);
  }
  assert.equal(rgba("#d97757", -0.4), "#d9775700", "alpha below 0 clamps to 00");
  assert.equal(rgba("#d97757", 2.5), "#d97757ff", "alpha above 1 clamps to ff");
  assert.equal(rgba("#d97757", 0), "#d9775700");
  assert.equal(rgba("#d97757", 1), "#d97757ff");
  assert.equal(rgba("#d97757", 0.5), "#d9775780", "in-range alpha keeps the old rounding");
  for (const a of [0.14, 0.24, 0.48, 0.88, 0.95]) {
    assert.match(rgba("#00a6b0", a), /^#00a6b0[0-9a-f]{2}$/, "every output stays an 8-digit hex color");
  }
});

test("estTextW memoizes while matching the pre-optimization widths exactly, fitText truncates identically", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "" });

  // The per-codepoint semantic the regex loop had before the charCodeAt
  // rewrite: same calibration coefficients, code points counted once.
  const refEstW = (s, px, bold = false) => {
    let w = 0;
    for (const ch of String(s || "")) {
      const c = ch.charCodeAt(0);
      if (c > 255) w += px * 1.00;
      else if (/[mw]/.test(ch)) w += px * 0.80;
      else if (/[MWGOQD]/.test(ch)) w += px * 0.78;
      else if (/[A-Z]/.test(ch)) w += px * 0.67;
      else if (/[0-9]/.test(ch)) w += px * 0.56;
      else if (ch === "-") w += px * 0.38;
      else if (/[iIl.,:;|!()[\] tfrj]/.test(ch)) w += px * 0.33;
      else if (ch === "%") w += px * 0.78;
      else w += px * 0.53;
    }
    if (bold) w *= 1.04;
    return w > 0 ? Math.ceil(w) + 1 : 0;
  };

  // Every single character settles in exactly the same bucket as the old regexes
  const allChars = Array.from({ length: 0x2ff }, (_, i) => String.fromCharCode(i)).join("");
  assert.equal(o.estTextW(allChars, 11, false), refEstW(allChars, 11, false), "ASCII/Latin-1 bucket equivalence");
  assert.equal(o.estTextW(allChars, 9.5, true), refEstW(allChars, 9.5, true), "bold bucket equivalence");

  // Mixed scripts: wide CJK and astral code points counted once, ASCII narrow/wide letters
  for (const s of ["中文宽度测试", "Orchestrator (Neon)", "qwen/qwen-3-32b", "StepFun (China)", "gpt-6.2-sol", "100%", "MWmw", "a😀b", "codex/gpt-6.2",
    // a lone high surrogate is its own wide code unit and must not swallow
    // the ASCII letter after it (for..of yields replacement semantics)
    "\uD800A"]) {
    for (const [px, bold] of [[11, true], [9.5, false], [10, false]]) {
      assert.equal(o.estTextW(s, px, bold), refEstW(s, px, bold), `width of ${JSON.stringify(s)} matches`);
    }
  }
  assert.equal(o.estTextW("中文", 11), 23, "two wide glyphs: 2×11×1.00 ceil + 1");
  assert.equal(o.estTextW("MW", 11), 19, "MW at 0.78px each");
  assert.equal(o.estTextW("100%", 10), 26, "digits at 0.56, percent at 0.78");
  assert.equal(o.estTextW("", 11), 0, "empty string is zero-width");

  // Memoization: a repeated call is a cache hit returning the identical value
  const before = o._estWCache.size;
  assert.ok(before > 0, "estW cache holds the measurements above");
  assert.equal(o.estTextW("中文宽度测试", 11, true), refEstW("中文宽度测试", 11, true));
  assert.equal(o._estWCache.size, before, "cache hit does not grow the memo table");
  const freshKeyHits = o._estWCache.size;
  o.estTextW("never-seen-string", 11, false);
  assert.equal(o._estWCache.size, freshKeyHits + 1, "a miss stores exactly one new entry");

  // fitText: prefixes never exceed their budget, cache repeats are identical
  const budget = 45;
  const cut = o.fitText("StepFun (China)", 11, budget, true);
  assert.ok("StepFun (China)".startsWith(cut) && cut.length < "StepFun (China)".length);
  assert.ok(o.estTextW(cut, 11, true) <= budget, "truncated prefix fits inside the budget");
  assert.equal(o.fitText("StepFun (China)", 11, budget, true), cut, "cached truncation repeats identically");
  assert.equal(o.fitText("short", 11, 500), "short", "a fitting string passes through whole");
  assert.equal(o.fitText("anything", 11, 0), "", "zero budget truncates to empty");

  // Across an integer boundary in either order: estTextW is always an
  // integer, so a fractional budget of W - 0.2 truncates exactly like
  // floor(W) - 1 — never like W. With a rounded cache key the first call's
  // answer would be served to the second budget, in both directions.
  // (A fresh instance per order: the wrong-key entries would poison the
  // cache between the two sequences.)
  const probe = () => {
    const probeInstance = m.make({ loaded: true, offline: "" });
    const probeW = probeInstance.estTextW("abcdefgh", 11, false);
    assert.ok(Number.isInteger(probeW) && probeW > 0, "estTextW only ever answers positive integers");
    return { inst: probeInstance, s: "abcdefgh", W: probeW };
  };
  for (const order of ["int-then-frac", "frac-then-int"]) {
    const { inst, s, W } = probe();
    const calls = order === "int-then-frac"
      ? [inst.fitText(s, 11, W, false), inst.fitText(s, 11, W - 0.2, false)]
      : [inst.fitText(s, 11, W - 0.2, false), inst.fitText(s, 11, W, false)];
    const [full, trimmed] = order === "int-then-frac" ? calls : [calls[1], calls[0]];
    assert.equal(full, s, `${order}: budget ${W} fits the whole string`);
    assert.notEqual(trimmed, s, `${order}: budget ${W - 0.2} truncates — estTextW only answers integers, so a width of ${W} never fits under ${W - 0.2}`);
    assert.ok(trimmed.length < s.length && s.startsWith(trimmed), `${order}: the truncation is a real prefix`);
    assert.ok(inst.estTextW(trimmed, 11, false) <= W - 0.2, `${order}: the truncated prefix fits inside its own fractional budget`);
  }
});

test("stream renders active wires through cached curves, tighter secondary pulses on crowded stages", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "", size: { width: 500, height: 600 } });
  o.stageStyle = "stream";
  o.agents = [
    { id: "claude", color: "#d97757" },
    { id: "codex", color: "#5e95d7" },
    { id: "pi", color: "#849e4a" },
    { id: "pig", color: "#00a6b0" },
  ];
  o.accounts = [
    { key: "anthropic", name: "Anthropic", model: "claude-sonnet-4" },
    { key: "openai", name: "OpenAI", model: "gpt-6.2-sol" },
    { key: "anyrouter", name: "AnyRouter", model: "claude-fable-5-2" },
    { key: "devin", name: "Devin", model: "swe-2" },
  ];
  // pig -> anthropic is deliberately CROSSED (agent row 3, account row 0):
  // a same-row wire is drawn as one straight line_to, but a cross-line wire
  // exercises the cubic-bezier branch of makeCurve, which is what the cold /
  // hot frame geometry assertions below need.
  const pairs = [["claude", "anthropic"], ["codex", "openai"], ["pi", "anyrouter"], ["pig", "anthropic"]];
  pairs.forEach(([a, k], i) => o.routes.set(i + 1, {
    id: i + 1,
    agent: a,
    model: "m",
    done: false,
    tries: [{ id: k, name: k, done: false }],
  }));

  // These wires are long enough that the secondary half-phase pulse applies:
  // poly.L is 254px, far past the tightened 115px floor.
  for (const [a, k] of pairs) {
    const c = o.curveBetween(o.agentIndex(a), o.acctIndex(k));
    assert.ok(o.flat([c.seg]).L > 115, "fixture wires cross the tightened secondary-pulse floor");
  }

  const realNow = Date.now;
  // the cross-line wire's two static pieces: the glow at width 3.5 and the
  // core at width 1.25, both full curves from the agent port (x0, y0) to the
  // account dot (x3, y3) with y0 !== y3 — the cubic-bezier branch.
  const crossC = o.curveBetween(o.agentIndex("pig"), o.acctIndex("anthropic"));
  assert.notEqual(crossC, null, "the crossed pair has a curve");
  assert.notEqual(crossC.y0, crossC.y3, "the crossed pair's endpoints are on different rows");
  const staticWidths = [3.5, 1.25];
  // static pieces of the crossed wire in a window of the PathBuilder log:
  // same start, same end, one of the static widths, and more than a bare
  // move+line (the cubic carries two control points)
  const crossStatics = (from, to) => m.paths.slice(from, to).filter((p) =>
    staticWidths.includes(p.width) &&
    p.ops.length >= 2 &&
    p.ops[0][0] === "move_to" &&
    Math.abs(p.ops[0][1] - crossC.x0) < 0.05 &&
    Math.abs(p.ops[0][2] - crossC.y0) < 0.05 &&
    // gpui's cubic_bezier_to takes the END point first and the control
    // points after it, so the endpoint of the last op is always its first
    // coordinate pair, whatever the op kind
    Math.abs(p.ops.at(-1)[1] - crossC.x3) < 0.05 &&
    Math.abs(p.ops.at(-1)[2] - crossC.y3) < 0.05);
  try {
    // Curve/flatten caches: the first render tessellates each wire once,
    // the second render at the same geometry paints fully from cache.
    let flatCalls = 0;
    const origFlat = o.flat.bind(o);
    o.flat = (...a) => { flatCalls++; return origFlat(...a); };
    Date.now = () => 500;
    const mark1 = m.paths.length;
    const tree1 = o.render(m.cx);
    const coldMark = m.paths.length;
    const firstPass = flatCalls;
    const tree2 = o.render(m.cx);
    const hotMark = m.paths.length;
    assert.equal(flatCalls - firstPass, 0, "second render tessellates zero wires: getFlat serves the cache");
    assert.ok(o._flatCache.size > 0 && o._curveCache.size > 0, "polyline and path caches are populated");
    assert.equal(nodeCount(tree2), nodeCount(tree1), "cached paint output is identical to the uncached one");

    // Cold frame: the crossed wire's glow and core were built exactly once
    // each, as real cubics ending at the account dot.
    const coldStatics = crossStatics(mark1, coldMark);
    assert.equal(coldStatics.filter((p) => p.width === 3.5).length, 1, "cold frame builds the crossed glow once");
    assert.equal(coldStatics.filter((p) => p.width === 1.25).length, 1, "cold frame builds the crossed core once");
    for (const p of coldStatics) {
      assert.ok(p.ops.some(([op]) => op === "cubic_bezier_to"), "a cross-line wire is drawn as a cubic, not a line");
    }
    // Hot frame at the same geometry: NOT ONE static piece of the crossed
    // wire is rebuilt — the cache served the exact same curve.
    const hotStatics = crossStatics(coldMark, hotMark);
    assert.equal(hotStatics.length, 0, "hot frame rebuilds no static curve of the crossed wire: makeCurve's cache hit is real");

    // And what paint_path actually received, in both frames, is the same
    // geometry: identical endpoints and widths for both static pieces. The
    // pieces are taken out by their own node ids -- wire-glow-pig-anthropic
    // and wire-core-pig-anthropic -- so the glow's 3.5 and the core's 1.25
    // can never be mixed up or swapped, the way a width-only filter could
    // silently trade one for the other.
    const paintPathOf = (tree, id) => {
      const el = find(tree, id);
      assert.notEqual(el, null, `${id} is drawn`);
      const found = [];
      const seen = new Set();
      const walk = (v) => {
        if (v == null || typeof v !== "object" && typeof v !== "function") return;
        if (Array.isArray(v)) { v.forEach(walk); return; }
        const n = v.__node;
        if (!n || seen.has(n)) return;
        seen.add(n);
        if (n.paintPath?.__path) {
          found.push({ width: n.paintPath.__path.width, ops: n.paintPath.__path.ops.map((o) => [...o]) });
        }
        n.kids.forEach(walk);
      };
      walk(el);
      return found;
    };
    const staticPieces = (tree) => {
      const glow = paintPathOf(tree, "wire-glow-pig-anthropic");
      assert.equal(glow.length, 1, "the glow node carries exactly one paint_path");
      assert.equal(glow[0].width, 3.5, "the glow of the crossed wire is stroked 3.5 wide");
      const core = paintPathOf(tree, "wire-core-pig-anthropic");
      assert.equal(core.length, 1, "the core node carries exactly one paint_path");
      assert.equal(core[0].width, 1.25, "the core of the crossed wire is stroked 1.25 wide");
      return { glow: glow[0], core: core[0] };
    };
    const coldPieces = staticPieces(tree1);
    const hotPieces = staticPieces(tree2);
    for (const [piece, p] of [["glow", coldPieces.glow], ["core", coldPieces.core]]) {
      // the endpoint coordinates themselves, for the record: the wire leaves
      // the pig port at row 3 and lands on the anthropic dot at row 0
      assert.ok(Math.abs(p.ops[0][1] - crossC.x0) < 0.05 && Math.abs(p.ops[0][2] - crossC.y0) < 0.05,
        `the ${piece} starts at the agent's port`);
      assert.ok(Math.abs(p.ops.at(-1)[1] - crossC.x3) < 0.05 && Math.abs(p.ops.at(-1)[2] - crossC.y3) < 0.05,
        `the ${piece} ends at the account's dot`);
      assert.ok(p.ops.some(([op]) => op === "cubic_bezier_to"), `the ${piece} is drawn as a cubic, not a line`);
    }
    assert.deepEqual(hotPieces, coldPieces,
      "hot frame paints the crossed wire's glow and core with endpoints, control points and widths byte-identical to the cold frame");

    for (const [a, k] of pairs) {
      assert.notEqual(find(tree1, `wire-core-${a}-${k}`), null, `${a} -> ${k} stream wire is drawn`);
    }

    // Secondary pulses are suppressed once four wires are active: counting
    // pointAt() samples (the per-frame tessellation cost) shows 4 active wires
    // cost strictly less per instant than 3, because the half-phase pulse
    // disappears for every wire instead of adding a fourth workload.
    let pointCalls = 0;
    const origPointAt = o.pointAt.bind(o);
    o.pointAt = (...a) => { pointCalls++; return origPointAt(...a); };
    const costOf = (wires, t) => {
      pairs.forEach(([,], i) => { o.routes.get(i + 1).done = i + 1 > wires; });
      pointCalls = 0;
      Date.now = () => t;
      o.render(m.cx);
      return pointCalls;
    };
    for (const t of [200, 400, 600, 900, 1200]) {
      const three = costOf(3, t);
      const four = costOf(4, t);
      assert.ok(four < three,
        `at t=${t} four active wires (${four} samples) cost less than three (${three}) ` +
        "because the secondary pulse is suppressed");
    }
    pairs.forEach(([,], i) => { o.routes.get(i + 1).done = false; });
  } finally {
    Date.now = realNow;
  }
});

test("fmtElapsed stops sub-second ms flicker while fmtMs keeps millisecond precision", async () => {
  const m = await loadMod();
  const o = m.make();
  assert.equal(o.fmtElapsed(0), "<1s");
  assert.equal(o.fmtElapsed(250), "<1s");
  assert.equal(o.fmtElapsed(999), "<1s");
  assert.equal(o.fmtElapsed(5400), "5s");
  assert.equal(o.fmtElapsed(90000), "1.5m");
  assert.equal(o.fmtMs(250), "250ms");
});

test("minimal stage style skips intermediate fly-frame redraws without dropping flow themes", async () => {
  const m = await loadMod({ home: ROOT, store: storage() });
  const timers = [];
  m.cx.timer.every = (ms, fn) => timers.push({ ms, fn });
  const o = m.make({ loaded: true, offline: "", size: { width: 336, height: 600 } });
  const frameTimer = timers.find((t) => t.ms === 33);
  assert.ok(frameTimer, "registers 33ms (~30 FPS) animation frame timer");

  // Freeze the wall clock so both manual frame callbacks read the same now:
  // a paused process (≥ 4.9s since t0) would otherwise flip the flight
  // fly → held inside the first frame and redraw for the wrong reason.
  const realNow = Date.now;
  const FIXED_NOW = realNow();
  Date.now = () => FIXED_NOW;
  try {
    const now = FIXED_NOW;
    o.agents = [{ id: "codex", color: "#5e95d7" }];
    o.accounts = [{ key: "codex", name: "Codex", model: "gpt-6.2-sol" }];
    o.routes.set(1, {
      id: 1,
      agent: "codex",
      done: false,
      time: new Date(now - 5000).toISOString(),
      tries: [{ id: "codex", name: "Codex", done: false }],
    });
    o.flights.set(1, {
      id: 1,
      agent: "codex",
      color: "#5e95d7",
      seat: "codex",
      state: "fly",
      phase: "out",
      tryIndex: 0,
      segs: [[70, 32, 140, 32, 140, 32, 210, 32]],
      ms: 5000,
      t0: now - 100,
      bird: "req",
      birdT0: now - 100,
      awayT0: null,
    });
    o.lastSecTick = now + 5000;

    // Minimal skips intermediate fly-frame notify() calls
    o.stageStyle = "minimal";
    const minBefore = m.cx.redraws;
    frameTimer.fn(m.cx);
    assert.equal(m.cx.redraws, minBefore, "minimal skips unnecessary fly redraws");

    // Stream animates at 33ms
    o.stageStyle = "stream";
    const streamBefore = m.cx.redraws;
    frameTimer.fn(m.cx);
    assert.equal(m.cx.redraws, streamBefore + 1, "stream triggers frame redraw while flying");
  } finally {
    Date.now = realNow;
  }
});

test("expanded diagnostic card shows prompt composition, timing waterfall, affinity, and masking while keeping try list last", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "", size: { width: 340, height: 600 } });
  o.agents = [{ id: "codex", color: "#5e95d7" }];
  o.accounts = [{ key: "codex", name: "Codex", model: "gpt-6.2-sol" }];
  o.routes.set(10, {
    id: 10,
    agent: "codex",
    model: "codex/gpt-6.2-sol",
    served: "gpt-6.2-sol",
    effort: "max",
    time: new Date("2026-11-28T08:00:00Z").toISOString(),
    done: true,
    status: 200,
    tokens: 148000,
    in: 400,
    out: 1300,
    ttft: 11200,
    firstReasoning: 700,
    firstText: 11200,
    flow: 2700,
    masking: 380,
    ms: 14280,
    usage: [{ in: 400, cache_read: 146000 }],
    prompt: {
      window: 500000,
      tokens: 146304,
      turns: 66,
      parts: [
        { kind: "system", tokens: 15284 },
        { kind: "results", tokens: 74210 },
        { kind: "chat", tokens: 35278 },
        { kind: "tools", tokens: 10146 },
      ],
    },
    affinity: { kept: true, cacheRead: 132736, why: "turn" },
    masked: { n: 14, kinds: { SECRET: 6, PASSWORD: 1 } },
    tries: [{ id: "codex", name: "Codex", status: 200, ms: 13900, done: true }],
  });
  o.expandedRouteId = 10;

  const row = texts(find(o.render(m.cx), "req-row-10"));
  assert.ok(row.includes("Context 146k / 500k"), row.join(" | "));
  assert.ok(row.includes("29% · 66 turns"), row.join(" | "));
  assert.ok(row.some((s) => s.includes("results 51%")), row.join(" | "));
  assert.ok(row.some((s) => s.includes("Mask 380ms")), row.join(" | "));
  assert.ok(row.some((s) => s.includes("Think 10.5s")), row.join(" | "));
  assert.ok(row.some((s) => s.includes("Stream 2.7s")), row.join(" | "));
  assert.ok(row.includes("Affinity kept (133k)"), row.join(" | "));
  assert.ok(row.includes("14 masked (6 SECRET · 1 PASSWORD)"), row.join(" | "));
  assert.ok(row.includes("effort max"), row.join(" | "));
  assert.deepEqual(row.slice(-3), ["#1", "Codex", "200 · 13.9s"], "tries remain last inside detailBlock");
});

test("semantic error rows and header status filters toggle active/error buckets cleanly", async () => {
  const m = await loadMod();
  const o = m.make({ loaded: true, offline: "", size: { width: 340, height: 600 } });
  o.agents = [{ id: "codex", color: "#5e95d7" }];
  o.accounts = [{ key: "codex", name: "Codex", model: "gpt-6.2-sol" }];
  o.routes.set(1, {
    id: 1, agent: "codex", model: "codex/gpt-6.2-sol", served: "gpt-6.2-sol",
    time: new Date("2026-11-28T08:00:00Z").toISOString(),
    done: false, tries: [{ id: "codex", name: "Codex", done: false }],
  });
  o.routes.set(2, {
    id: 2, agent: "codex", model: "codex/gpt-6.2-sol", served: "gpt-6.2-sol",
    time: new Date("2026-11-28T07:59:00Z").toISOString(),
    done: true, status: 429, tokens: 0, ms: 11700,
    tries: [{ id: "codex", name: "Codex", status: 429, ms: 11700, done: true }],
  });
  o.routes.set(3, {
    id: 3, agent: "codex", model: "codex/gpt-6.2-sol", served: "gpt-6.2-sol",
    time: new Date("2026-11-28T07:58:00Z").toISOString(),
    done: true, status: 200, tokens: 12000, ms: 3200, in: 100, out: 200,
    tries: [{ id: "codex", name: "Codex", status: 200, ms: 3200, done: true }],
  });

  const treeAll = o.render(m.cx);
  assert.ok(texts(find(treeAll, "filter-errors")).includes("1 err"));
  assert.ok(texts(find(treeAll, "filter-active")).includes("1 active"));
  assert.ok(texts(find(treeAll, "req-row-2")).includes("429 Rate Limit · 11.7s"));

  o.statusFilter = "error";
  const treeErr = o.render(m.cx);
  assert.equal(find(treeErr, "req-row-1"), null);
  assert.notEqual(find(treeErr, "req-row-2"), null);
  assert.equal(find(treeErr, "req-row-3"), null);

  o.statusFilter = "active";
  const treeAct = o.render(m.cx);
  assert.notEqual(find(treeAct, "req-row-1"), null);
  assert.equal(find(treeAct, "req-row-2"), null);

  // Without any failed routes, filter-errors chip disappears cleanly
  o.statusFilter = null;
  o.routes.delete(2);
  assert.equal(find(o.render(m.cx), "filter-errors"), null);
});

test("magpie CLI quick-switch menus parse agent status, models, effort, and profiles and dispatch CLI commands", async () => {
  const calls = [];
  const execMock = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const raw = args.join(" ");
    if (raw.includes("magpie 'profiles'") || raw === "profiles") {
      return {
        code: 0,
        stdout: "  Default  agy Orchestrator (Neon) · codex gpt-6.2-sol\n  Saver    codex gpt-6-astra\n",
      };
    }
    if (raw.includes("'models' 'codex'") || raw === "models codex") {
      return {
        code: 0,
        stdout: [
          "  Codex",
          "  codex/gpt-6.2-sol       GPT-6.2-Sol  low/medium/high/xhigh/max/ultra",
          "  codex/gpt-6-astra       GPT-6-Astra  low/medium/high/xhigh/max",
          "  codex is shown only the models picked for it: 45 not picked",
          "  Codex: 6 more models in its list, not exposed (not picked): old-model",
        ].join("\n"),
      };
    }
    if (raw.includes("magpie 'codex' 'effort' 'medium'") || raw === "codex effort medium") {
      return { code: 0, stdout: "" };
    }
    if (raw.includes("magpie 'codex' 'codex/gpt-6-astra'") || raw === "codex codex/gpt-6-astra") {
      return { code: 0, stdout: "" };
    }
    if (raw.includes("magpie 'use' 'Saver'") || raw === "use Saver") {
      return { code: 0, stdout: "" };
    }
    if (raw.includes("magpie 'codex'") || raw === "codex") {
      return { code: 0, stdout: "  Codex  gpt-6.2-sol  ·  effort max  ·  memories codex/gpt-6.2-sol  ~/.codex/config.toml\n" };
    }
    return { code: 0, stdout: "" };
  };

  const m = await loadMod({ home: ROOT, exec: execMock });
  const o = m.make({ loaded: true, offline: "", size: { width: 368, height: 600 } });
  o.agents = [{ id: "codex", color: "#5e95d7" }];
  o.accounts = [{ key: "codex", name: "Codex", model: "gpt-6.2-sol" }];

  await o.loadProfiles(m.cx);
  assert.equal(o.profiles.length, 2);
  assert.equal(o.activeProfile, "Default");

  await o.openAgentMenu("codex", 0, m.cx);
  assert.equal(o.agentMenu.currentModel, "gpt-6.2-sol");
  assert.equal(o.agentMenu.currentEffort, "max");
  assert.deepEqual(o.agentMenu.models.map((x) => x.id), ["codex/gpt-6.2-sol", "codex/gpt-6-astra"]);

  const popTree = o.render(m.cx);
  assert.notEqual(find(popTree, "agent-menu-popover"), null);
  assert.notEqual(find(popTree, "effort-medium"), null);
  assert.notEqual(find(popTree, "pick-model-codex/gpt-6-astra"), null);

  await o.setAgentEffort("codex", "medium", m.cx);
  assert.equal(o.agentMenu.currentEffort, "medium");
  await o.setAgentModel("codex", "codex/gpt-6-astra", m.cx);
  assert.ok(calls.some((c) => c.join(" ").includes("'codex' 'effort' 'medium'")));
  assert.ok(calls.some((c) => c.join(" ").includes("'codex' 'codex/gpt-6-astra'")));

  o.closeMenus(m.cx);
  o.profileMenuOpen = true;
  assert.notEqual(find(o.render(m.cx), "profile-menu-popover"), null);
  await o.applyProfile("Saver", m.cx);
  assert.equal(o.activeProfile, "Saver");
  assert.equal(o.profileMenuOpen, false);
});

test("quota burn-rate calculation and proactive error/quota alert cooldowns behave cleanly", async () => {
  const realNow = Date.now;
  let now = Date.parse("2026-11-28T08:00:00Z");
  Date.now = () => now;
  try {
    const store = storage();
    const m = await loadMod({ home: ROOT, store });
    const o = m.make({ loaded: true, offline: "" });
    assert.equal(o.alertsEnabled, true);

    o.quotas = { codex: { name: "Codex", accounts: [{ allow: [{ label: "5h", left: 30 }] }] } };
    o.recordQuotaTelemetry(now);
    assert.equal(m.notes.length, 0);

    // 30m later, quota drops by 18% -> burn ~36%/h and crosses <=15% alert threshold
    now += 30 * 60 * 1000;
    o.quotas = {
      codex: {
        name: "Codex",
        accounts: [{
          key: "codex-main",
          alias: "Pro",
          balance: "62500 credits",
          left: 12,
          windows: [{ name: "7 days", used: 88, remaining: 12, resetsAt: "2026-11-28T11:30:00Z" }],
          allow: [{ label: "7d", left: 12 }],
        }],
      },
    };
    o.recordQuotaTelemetry(now);
    const rate = o.burnRateOf("codex");
    assert.equal(rate.pctPerHr, 36);
    assert.equal(m.notes.length, 1);
    assert.match(m.notes[0].title, /Low Quota: Codex/);
    assert.match(m.notes[0].body, /12% remaining · ~36%\/h/);

    // Collapsed quota hover card shows structured window details + burn rate without blocking backdrop
    o.quotaOpen = false;
    o.hoveredQuotaProv = "codex";
    const hoverTree = o.render(m.cx);
    assert.equal(find(hoverTree, "popover-backdrop"), null);
    const hoverCard = find(hoverTree, "quota-hover-card");
    assert.notEqual(hoverCard, null);
    assert.match(texts(hoverCard).join(" "), /62500 credits/);
    assert.match(texts(hoverCard).join(" "), /~36%\/h/);

    // Expanded quota view hides hover card and renders inline burn-rate badge on provider header
    o.quotaOpen = true;
    const expandedTree = o.render(m.cx);
    assert.equal(find(expandedTree, "quota-hover-card"), null);
    assert.match(texts(find(expandedTree, "quota-prov-hdr-codex")).join(" "), /~36%\/h/);

    // Repeat within 15m cooldown -> no duplicate notification
    now += 5 * 60 * 1000;
    o.quotas = { codex: { name: "Codex", accounts: [{ allow: [{ label: "5h", left: 10 }] }] } };
    o.recordQuotaTelemetry(now);
    assert.equal(m.notes.length, 1);

    // Failed route fires one notification per cooldown
    o.maybeAlertError({ id: 99, agent: "codex", provider: "codex", done: true, status: 429 }, now);
    assert.equal(m.notes.length, 2);
    assert.match(m.notes[1].body, /Codex → codex \(429 Rate Limit\)/);

    // Shared top-bar status reflects lowQuota, active, and recentErr cleanly
    o.syncSharedStatus(now);
    assert.deepEqual(m.shared.get("routing.status"), { active: 0, recentErr: false, lowQuota: true });
    o.routes.set(1, { id: 1, done: false });
    o.routes.set(2, { id: 2, done: true, status: 429, time: new Date(now).toISOString() });
    o.quotas = { codex: { name: "Codex", accounts: [{ allow: [{ label: "5h", left: 90 }] }] } };
    o.syncSharedStatus(now);
    assert.deepEqual(m.shared.get("routing.status"), { active: 1, recentErr: true, lowQuota: false });

    // Muting persists and suppresses notifications
    o.toggleAlerts(m.cx);
    assert.equal(o.alertsEnabled, false);
    assert.equal(store.data.get("routing.alerts"), "false");
    now += 20 * 60 * 1000;
    o.maybeAlertError({ id: 100, agent: "codex", provider: "codex", done: true, status: 500 }, now);
    assert.equal(m.notes.length, 2);
  } finally {
    Date.now = realNow;
  }
});
