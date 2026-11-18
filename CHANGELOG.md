# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `Magpie` layout, the `routing` mod and the `tabs-routing` mod are released
together at one version.

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
