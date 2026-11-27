// Stage topology invariants: which agent / account pills belong on the stage,
// and why an unconnected pill must never sit orphaned or flicker as "hot".

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, find, texts, storage, ROOT } from "./harness.mjs";

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
