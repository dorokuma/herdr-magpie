// What the quota panel says an account has left.
//
// The numbers here were worked out by hand from the windows in each case, not
// read back from the code: a provider with a 5 hours at 71% inside a 7 days at
// 96% must read "71% · 96%", whatever the code does to get there.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadMod, texts, find, ROOT } from "./harness.mjs";

const RED = "#e26a6a", GOLD = "#d4b06a", GREEN = "#34d399";
const mod = await loadMod();
const o = mod.make();

const W = (name, remaining, resetsAt, pool) => ({ name, remaining, used: 100 - remaining, resetsAt, pool });
// the folded reading of one account: its text and the colour of each number
function read(account, compact = false) {
  const q = o.normalizeQuotaItem({ provider: "x", ...account });
  const r = o.quotaRead(q.allow, compact);
  return {
    q,
    text: r ? r.segs.map((s) => s.text).join(" ") : null,
    colors: r ? r.segs.filter((s) => !s.sep).map((s) => s.color) : [],
  };
}
const stack = (h5, d7) => ({ windows: [W("5 hours", h5, "2030-01-19T15:00:00Z"), W("7 days", d7, "2030-01-24T13:00:00Z")] });

test("a window's length is read off its name", () => {
  const spans = { "5 hours": 5, "5h": 5, "1 day": 24, "7 days": 168, "Gemini · 7 days": 168, weekly: 168, "30 min": 0.5, "1 month": 720 };
  for (const [name, hours] of Object.entries(spans)) assert.equal(o.winSpan(name), hours, name);
  for (const name of ["Credits", "gemini-4-carbon", "Grok Bot", "Total", ""]) assert.equal(o.winSpan(name), null, `${name} is not a span`);
});

test("5 hours inside 7 days: short window first, long window after, percentages only", () => {
  const r = read(stack(71, 96));
  assert.equal(r.text, "71% · 96%");
  assert.deepEqual(r.colors, [GREEN, GREEN]);
  assert.doesNotMatch(r.text, /5h|7d|hour|day/i, "no span labels");
  assert.equal(read(stack(71, 96), true).text, "96%", "the summary strip shows the long window");
});

test("each number has its own traffic light: red under 10, gold under 30", () => {
  assert.deepEqual(read(stack(8, 90)).colors, [RED, GREEN]);
  assert.deepEqual(read(stack(20, 25)).colors, [GOLD, GOLD]);
  assert.deepEqual(read(stack(29, 30)).colors, [GOLD, GREEN]);
  assert.deepEqual(read(stack(9, 10)).colors, [RED, GOLD]);
});

test("the long window empty is Exhausted, however full the short one reports", () => {
  const r = read(stack(100, 0));
  assert.equal(r.text, "Exhausted");
  assert.deepEqual(r.colors, [RED]);
  assert.equal(r.q.left, 0, "never the 50 an average would give");
  assert.equal(r.q.leftResetsAt, "2030-01-24T13:00:00Z", "back when the 7 days resets");
  assert.equal(read(stack(100, 0), true).text, "0%", "strip");
  assert.equal(read(stack(100, 0.4)).text, "Exhausted", "0.4% is drawn as 0%, so it counts as spent");
  assert.equal(read(stack(0, 0)).text, "Exhausted", "both empty");
  assert.equal(read({ windows: [W("1 day", 100, "a"), W("7 days", 0, "b")] }).text, "Exhausted", "1 day inside 7 days");
});

test("only the short window empty: 0% beside what the long one holds", () => {
  const r = read(stack(0, 80));
  assert.equal(r.text, "0% · 80%");
  assert.deepEqual(r.colors, [RED, GREEN]);
  assert.equal(r.q.left, 0, "nothing can be called right now");
  assert.equal(r.q.leftResetsAt, "2030-01-19T15:00:00Z", "back when the 5 hours resets");
  assert.equal(read(stack(0, 80), true).text, "0%", "strip: the short window is what blocks");
});

test("a lone window is one number", () => {
  assert.equal(read({ windows: [W("5 hours", 40, "a")] }).text, "40%");
  assert.equal(read({ windows: [W("Credits", 2, "a")] }).text, "2%");
});

test("several pools: each column shows its tightest pool, nothing is averaged", () => {
  const pools = { windows: [
    W("A · 7 days", 10, "a7", "A"), W("A · 5 hours", 100, "a5", "A"),
    W("B · 7 days", 75, "b7", "B"), W("B · 5 hours", 94, "b5", "B")] };
  const r = read(pools);
  assert.equal(r.text, "94% · 10%");
  assert.deepEqual(r.colors, [GREEN, GOLD]);
  assert.equal(read(pools, true).text, "10%");
  const two = (a, b) => ({ windows: [W("A · 7 days", a, "a", "A"), W("B · 7 days", b, "b", "B")] });
  assert.equal(read(two(0, 0)).text, "Exhausted", "every pool spent");
  assert.equal(read(two(0, 60)).text, "0%", "one pool spent, one not: 0%, not Exhausted and not 30%");
  assert.equal(read(two(100, 100)).text, "100%");
  assert.equal(read({ windows: [W("gemini-4-carbon", 0, "t"), W("gemini-4-argon", 100, "t")] }).text, "0%", "per-model meters: the empty one, not their mean");
});

test("a number the gateway reports, a credit breakdown, and no percentage at all", () => {
  assert.equal(read({ left: 42 }).text, "42%");
  assert.equal(read({ left: 0 }).text, "Exhausted");
  assert.equal(read({ balance: "$3" }).text, null, "a balance has no percentage");
  const credits = { provider: "workbuddy", windows: [
    { name: "Credits", used: 100 }, { name: "Extra credits", remaining: 8.6 }, { name: "Total credits", remaining: 7.16 }] };
  assert.equal(read(credits).text, "7%", "read off Total credits");
});

// --- an account that holds several model families ------------------------------

const G = "gemini-color", C = "claude-color";
const fams = (windows) => {
  const f = o.quotaFamilies(o.normalizeQuotaItem({ provider: "x", windows }).allow);
  return f && f.map((x) => [x.icon, o.quotaRead(x.allows).segs.map((g) => g.text).join(" ")]);
};
const pool = (name, h5, d7) => [W(`${name} · 7 days`, d7, "d", name), W(`${name} · 5 hours`, h5, "h", name)];

test("two model families read as one pair each, never as one pair for both", () => {
  // one pair would say "97% · 10%": a 5 hours from Gemini beside a 7 days from Claude
  assert.deepEqual(fams([...pool("Gemini", 97, 87), ...pool("Claude & GPT", 100, 10)]), [[G, "97% · 87%"], [C, "100% · 10%"]]);
  assert.deepEqual(fams([...pool("Claude & GPT", 100, 10), ...pool("Gemini", 97, 87)]).map((f) => f[0]), [G, C], "Gemini first, whatever order the gateway gives");
});

test("a family with nothing left says so beside the one that still has", () => {
  assert.deepEqual(fams([...pool("Gemini", 62, 99), ...pool("Claude & GPT", 100, 0)]), [[G, "62% · 99%"], [C, "Exhausted"]]);
  assert.deepEqual(fams([...pool("Gemini", 0, 99), ...pool("Claude & GPT", 100, 40)]), [[G, "0% · 99%"], [C, "100% · 40%"]]);
  assert.equal(fams([...pool("Gemini", 100, 0), ...pool("Claude & GPT", 100, 0)]), null, "nothing left anywhere is one Exhausted, not two");
});

test("pools that share an icon are one family, read by its tightest", () => {
  const w = [...pool("Gemini", 85, 65), ...pool("Claude & GPT", 100, 100), W("Gemini 4 Argon · 7 days", 24, "a", "Gemini 4 Argon")];
  assert.deepEqual(fams(w), [[G, "85% · 24%"], [C, "100% · 100%"]]);
});

test("nothing to tell apart: the plain reading stays", () => {
  assert.equal(fams(pool("Gemini", 97, 87)), null, "one family");
  assert.equal(fams([W("5 hours", 71, "a"), W("7 days", 96, "b")]), null, "no pools at all");
  assert.equal(fams([...pool("Gemini", 97, 87), W("Gemini 4 Argon · 7 days", 24, "a", "Gemini 4 Argon")]), null, "two pools, one icon");
  assert.equal(fams([...pool("A", 97, 87), ...pool("B", 100, 10)]), null, "pools with no icon of their own to go by");
  assert.equal(fams([...pool("Gemini", 97, 87), ...pool("Mystery", 100, 10)]), null, "one unknown pool: no icon is guessed for it");
  assert.equal(fams([W("gemini-4-carbon", 0, "t"), W("claude-opus", 100, "t")]), null, "per-model meters are not pools");
});

// --- the gateway's reply, through the panel ------------------------------------

const reply = fs.readFileSync(path.join(ROOT, "tests/fixtures/quotas.json"), "utf8");

// a panel that asked its gateway for quotas and got the fixture back
async function panel(over = {}) {
  const calls = [];
  const m = await loadMod({ exec: async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0, stdout: reply, stderr: "" }; } });
  const p = m.make({ loaded: true, offline: "", configReady: true, quotaOpen: true, ...over });
  await p.fetchQuotas(m.cx);
  return { p, calls, cx: m.cx, row: (id) => texts(find(p.render(m.cx), id)).join(" ") };
}

test("the panel asks the gateway it was pointed at", async () => {
  const { calls } = await panel({ baseUrl: "http://127.0.0.1:9999" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "curl");
  assert.equal(calls[0].at(-1), "http://127.0.0.1:9999/v1/magpie/quotas");
});

test("every account of a provider is kept", async () => {
  const { p } = await panel();
  const accounts = (id) => p.quotas[id].accounts.map((a) => a.alias || a.user);
  assert.deepEqual(accounts("agy-cli"), ["Ultra", "Pro"], "both agy-cli accounts");
  assert.deepEqual(accounts("workbuddy-ai"), ["Spare 1", "Spare 2", "Spare 3"]);
  assert.equal(p.quotas.stepfun.accounts.length, 1, "a plan and its balance are one account");
  assert.equal(p.quotas.stepfun.accounts[0].balance, "¥3.20");
  const keys = Object.values(p.quotas).flatMap((g) => g.accounts.map((a) => `${g.provider}::${a.key}`));
  assert.equal(new Set(keys).size, keys.length, "account keys are unique");
  assert.equal(Object.values(p.quotas).reduce((n, g) => n + g.accounts.length, 0), 14, "15 entries; StepFun's balance is merged into its plan");
});

test("folded provider rows read as designed", async () => {
  const { row } = await panel();
  // provider                 what its windows hold                         -> the row
  assert.match(row("quota-prov-hdr-gemini-web"), /71% · 96%/);          // 5h 71, 7d 96
  assert.match(row("quota-prov-hdr-devin"), /Exhausted/);                // 1d 100, 7d 0
  assert.doesNotMatch(row("quota-prov-hdr-devin"), /\d+%/, "no percentage beside Exhausted");
  assert.match(row("quota-prov-hdr-workbuddy"), /(^| )7%/);              // Total credits 7.2
  assert.match(row("quota-prov-hdr-cursor"), /48%/);                     // its Grok meter
  assert.match(row("quota-prov-hdr-stepfun"), /97%/);
  assert.match(row("quota-prov-hdr-arkapi"), /\$12\.50/);                // a balance
  assert.match(row("quota-prov-hdr-agentrouter-github"), /Error/);
});

const GEM = "mods/routing/icons/gemini-color.png", CLA = "mods/routing/icons/claude-color.png";

test("a folded provider with two model families shows a pair per family, each after its icon", async () => {
  const { row } = await panel();
  // agy-cli: per pool, the better-off of its two accounts.
  //   Gemini         Ultra 5h 94 / 7d 75   (Pro: 85 / 65)
  //   Gemini 4 Argon Pro only: 7d 24       -> same icon as Gemini, so the Gemini family
  //   Claude & GPT   Pro   5h 100 / 7d 100 (Ultra: 100 / 10)
  // Gemini family: short 94, long min(75, 24) = 24. Claude family: 100, 100.
  assert.ok(row("quota-prov-hdr-agy-cli").includes(`${GEM} 94% · 24% ${CLA} 100% · 100%`), row("quota-prov-hdr-agy-cli"));
  // a provider with one family is drawn as before: no family icon before its numbers
  assert.ok(!row("quota-prov-hdr-gemini-web").includes(`${GEM} 71%`), row("quota-prov-hdr-gemini-web"));
});

test("the note on how a provider is reached is not drawn; a region is", async () => {
  const { p, cx, row } = await panel();
  assert.equal(p.quotas["agy-cli"].name, "Antigravity (local agy CLI)", "what the gateway calls it");
  assert.ok(row("quota-prov-hdr-agy-cli").includes(" Antigravity mods/"), row("quota-prov-hdr-agy-cli")); // the name, then the first family icon
  assert.ok(row("quota-prov-hdr-stepfun").includes("StepFun (China)"), "a parenthesis that tells providers apart stays");
  assert.doesNotMatch(texts(p.render(cx)).join(" "), /local agy/i, "nowhere on the open panel");
  p.quotaOpen = false;
  p.quotas = { "agy-cli": p.quotas["agy-cli"] };
  const strip = texts(p.render(cx)).join(" ");
  assert.ok(strip.includes("Antigravity ×2") && !/local agy/i.test(strip), strip);
});

test("an expanded provider lists each account with its own reading", async () => {
  const { p, row } = await panel();
  p.expandedProviders.add("agy-cli");
  const ultra = row("quota-acct-hdr-agy-cli-u:ada@example.com");
  const pro = row("quota-acct-hdr-agy-cli-u:grace@example.com");
  assert.match(ultra, /Ultra/);
  assert.ok(ultra.includes(`${GEM} 94% · 75% ${CLA} 100% · 10%`), ultra); // each family's own 5 hours and 7 days
  assert.match(pro, /Pro/);
  assert.ok(pro.includes(`${GEM} 85% · 24% ${CLA} 100% · 100%`), pro);    // Gemini: short 85, long min(65, Argon 24)
});

test("an unfolded account shows its bars instead of the folded reading", async () => {
  const { p, row } = await panel();
  p.expandedProviders.add("agy-cli");
  p.expandedAccounts.add("agy-cli::u:ada@example.com");
  assert.ok(!row("quota-acct-hdr-agy-cli-u:ada@example.com").includes(GEM), "no reading in the header of an open account");
  const body = row("quota-acct-agy-cli-u:ada@example.com");
  for (const bar of ["Gemini · 5 Hours", "Gemini · 7 Days", "Claude & GPT · 5 Hours", "Claude & GPT · 7 Days"]) assert.ok(body.includes(bar), bar);
});

test("a panel too narrow for two pairs gives each family its one number", async () => {
  const { p, row } = await panel();
  p.expandedProviders.add("agy-cli");
  p.size = { width: 280, height: 200 };
  const ultra = row("quota-acct-hdr-agy-cli-u:ada@example.com");
  assert.ok(ultra.includes(`${GEM} 75% ${CLA} 10%`), ultra); // the long window of each
});

test("masked hides account addresses; unmasking shows them", async () => {
  const { p, cx } = await panel();
  for (const id of Object.keys(p.quotas)) p.expandedProviders.add(id);
  assert.equal(p.masked, true, "masked is the default");
  assert.doesNotMatch(texts(p.render(cx)).join(" "), /@example\.com|555\*+0100/);
  p.masked = false;
  assert.match(texts(p.render(cx)).join(" "), /grace@example\.com/);
});

test("the summary strip gives one number per provider", async () => {
  const { p, cx } = await panel({ quotaOpen: false });
  const strip = () => texts(p.render(cx)).join(" ");
  assert.doesNotMatch(strip(), /\d+% · \d+%/, "no pairs in the strip");
  assert.doesNotMatch(strip(), /Exhausted/, "the strip says 0%");

  // a provider with two model families is one number there too, with no family
  // icons: the tightest long window among the pools it would read as a pair
  p.quotas = { "agy-cli": p.quotas["agy-cli"] };
  assert.ok(strip().includes("Antigravity ×2 24%"), strip());
  assert.ok(!strip().includes(GEM) && !strip().includes(CLA), "no family icons in the strip");
});
