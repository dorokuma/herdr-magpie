# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `Magpie` layout, the `routing` mod and the `tabs-routing` mod are released
together at one version.

## [0.3.0] - 2026-11-19

### New

- **One-click update from the panel.** When a newer release is published, an
  `↑ Update x.y.z` pill appears in the panel's top bar after `· n live`; it is
  not drawn while the install is the newest release. Clicking it downloads the
  release archive from GitHub, verifies its `sha256`, lays the files over
  `~/.config/herdr-app` and lets Herdr reload the panel. Nothing is touched
  unless the download and the checksum both pass, and `mods/routing/main.js` is
  replaced last and in one step, so a failed update leaves the previous install
  running. `mods/routing/config.json` is kept.
- **When the mod looks for a release.** At start only if its last look is more
  than 6 hours old; every 6 hours by the wall clock while it runs; when
  **Refresh** is pressed, at most once in 10 minutes; after a failed look in 2,
  10 and 30 minutes and then hourly, and as soon as the gateway is reachable
  again. The answer is kept across reloads. A look is one `HEAD` request to
  `github.com/dorokuma/herdr-magpie/releases/latest` from the machine Herdr runs
  on; nothing is sent and no token is used. This is the first outbound request
  the mod makes to anything but your gateway. Demo mode never looks.
- **`mods/routing/VERSION`** ships with the mod and names the installed version.

### Fixed

- **A folded row averaged windows that stack.** An account with a `1 day` at
  100% and a spent `7 days` read `50%` when folded, though it could not be used.
  Windows on one allowance are no longer averaged: the longest window's share
  stands for the allowance, and the row reads `Exhausted` as soon as any of its
  windows is spent. Separate allowances of one account (two model pools, two
  models) are still averaged.
- **A folded row showed the wrong reset.** It showed the soonest reset of any
  window, so the row above read `Resets in 16h` for an allowance that came back
  in 3 days. It now shows the reset that goes with the number beside it.

### Changed

- Folded percentages of accounts with stacked windows read differently than in
  `0.2.0`: `5 hours` 20% under `7 days` 80% is `80%`, where it was `50%`.

### Upgrade

Nothing to migrate. Installs of `0.2.0` and older have no update pill, so update
once by hand — re-run `./install.sh` from a checkout of `v0.3.0`, or without a
clone:

```bash
curl -fsSL https://github.com/dorokuma/herdr-magpie/releases/download/v0.3.0/herdr-magpie-0.3.0.tar.gz | tar xz -C /tmp
/tmp/herdr-magpie-0.3.0/install.sh
```

Later releases arrive through the pill.

## [0.2.0] - 2026-11-18

### New

- **Multi-account quota support.** Every account a provider reports is now listed
  under its provider instead of only one. `agy-cli` shows `Ultra` and `Pro`,
  `WorkBuddy AI` shows all three signed-in accounts, and any provider with more
  than one account or key (`claude`, `codex`, `copilot`, `kiro`, `qoder`,
  `cursor`, `cline`, `ai-studio`, `gemini-web`, `remote-magpie/*`) keeps them all.
- **Consistent account rows.** When one account of a provider reports a
  breakdown (`Credits` / `Extra credits` / `Total credits`, or a paired
  `5 hours` / `7 days` window), the other accounts of that provider show the
  same rows — an exhausted one included — so the accounts read alike.
- **Collapsible providers and accounts.** Click a provider's title, or an
  account's row, to fold it; the folded row keeps its remaining share or
  balance, and `Resets in …`. Providers and accounts both default to folded.
- **Drag to reorder.** Drag a provider's title, or an account's row, to place it
  where you want it. The order is kept per browser storage.
- **Cache hit rate in the requests feed.** Each answered request shows the share
  of its prompt read from the vendor's cache (`99% cached`), and the expanded
  request card lists `cache hit 99%` beside TTFT and the token counts. The rate
  is read from the gateway's own per-try usage (`cache_read` over
  `in + cache_read + cache_write`), as magpie's Routing page computes it; a
  vendor that counts no cache tokens has no rate rather than 0%.

### Fixed

- **One account per provider was shown.** A provider's second and later accounts
  were dropped: the older code kept a single entry per `provider` id and only
  replaced it when the new one ranked higher, so two accounts of equal rank lost
  the later one.
- **Windows sharing a reset time were merged.** Two windows of one account that
  reset at the same time collapsed into one, so `Total credits` overwrote
  `Credits`, and distinct model pools resetting together lost a row.
- **A plan and a wallet of one provider overwrote each other.** A provider that
  reports both a subscription and a balance (StepFun) now shows the balance
  beside the plan's windows.
- **A drop line vanished above the first row.** Dragging a provider above the
  current first one drew its drop line outside the scroll area, so it was
  clipped; the drop target now lands on the first row and the line is drawn
  inside it.
- **Abbreviated labels.** `accts` reads as `Accounts` and `Err` as `Error`.

### Upgrade

Existing installs keep working; nothing to migrate. Re-run `./install.sh` (or
copy `mods/routing` and `mods/tabs-routing` into `~/.config/herdr-app/mods/`) and
reload. Fold state and the order you set are remembered per browser storage, so
the panel keeps your arrangement.

## [0.1.1] - 2026-11-17

### New

- Reproducible offline demo mode: `"demo": true` in `mods/routing/config.json`
  renders the built-in synthetic fixture with no gateway, credentials or live
  provider data.
- `preview.png` holds invented data only.

## [0.1.0] - 2026-11-15

### New

- First release: the `Magpie` layout with the Routing side panel — live S-curve
  topology, provider quota monitor and per-request trace inspector — plus the
  `tabs-routing` tab bar with per-space panel memory.

[0.2.0]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.2.0
[0.1.1]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.1.1
[0.1.0]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.1.0
