# Tests

```bash
node --test tests/*.test.mjs     # about 6 seconds, no network, needs node 22+
scripts/release-check.sh         # the release gate: these tests plus the release checks
```

The tests run `mods/routing/main.js` itself. `harness.mjs` swaps the three
imports only Herdr can answer (`gpui-kit`, `gpui-base`, `herdr`) for stand-ins
and leaves every other line alone, so `render()` runs outside Herdr and the
tests read back the text it would draw.

- **`quota.test.mjs`**: what an account has left. The folded reading
  (`71% · 96%`, `Exhausted`, `0% · 80%`), its colours, pools, and a gateway
  reply with several accounts per provider drawn through the panel.
- **`panel.test.mjs`**: the demo stage through `render()`. The `Requests`
  header, deterministic demo fold state, and when the update pill is drawn.
- **`stage.test.mjs`**: topology stage invariants — only tried seats enter the
  right column, active streams survive bursts of short requests without
  leaving orphaned or flickering pills, and breathing elements carry stable ids.
- **`update.test.mjs`**: when GitHub is asked, and the install. The mod's own
  install script runs for real against an archive on disk, including every
  way a download can be wrong. It also runs the updater of **every released
  version**, read from git history, against this checkout: a release is
  installed by the updater people already have, not by the new one.
- **`live/published.test.mjs`**: after a release, over the network. Not part
  of the run above; `scripts/release-check.sh --published` runs it.

`fixtures/quotas.json` has the shape of the gateway's `GET /v1/magpie/quotas`
reply. Every name, address, balance and date in it is made up. Do not paste a
real reply in: it carries account addresses.

A test that needs the network belongs in `live/`. The rest must pass offline.
