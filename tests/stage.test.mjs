// Stage topology invariants: which agent / account pills belong on the stage,
// and why an unconnected pill must never sit orphaned or flicker as "hot".

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, find } from "./harness.mjs";

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
