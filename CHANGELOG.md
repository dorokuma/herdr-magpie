# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `Magpie` layout, the `routing` mod and the `tabs-routing` mod are released
together at one version.

## [Unreleased]

## [0.4.1] - 2026-11-26

### Changed

- Upgraded the `Stream` flow theme to a tapered optical-fiber beam with alpha-feathered tail, white-hot specular head, destination port arrival ring, and smoother 24ms frame pacing.

## [0.4.0] - 2026-11-26

### Added

- Switchable routing flow themes (`Minimal` default, `Stream` optical beam, and `Magpie` flying bird), toggled via a hover button on the routing card or `"stageStyle"` in `config.json`, persisted in `localStorage`.
- Client icons on left-column agent pills (including `alma`, with colored dot fallback for unknown agents).

### Changed

- Adaptive routing card height that fits the active row count (minimum 1 row) instead of reserving 6 rows.
- Active-route spotlighting: active agent and account pills receive subtle tinted fills and colored borders while idle pills and wires softly dim.

## [0.3.5] - 2026-11-26

### Changed

- UI polish.

## [0.3.4] - 2026-11-25

### Added

- Per-family folded quota readings: subscriptions with independent `5 hours` / `7 days` windows per model family (e.g. Antigravity's Gemini and Claude & GPT pools) now display one icon-led `short% · long%` pair per family in aligned columns, falling back to long-window percentages on narrow panels (`< 300px`).

### Changed

- Stripped gateway transport suffixes (such as `(local agy CLI)`) from provider titles while keeping region/edition qualifiers like `StepFun (China)`.
- Updated offline demo data and `preview.png` with multi-family Antigravity accounts, and isolated demo fold/order state from saved user preferences.

### Fixed

- Fixed orphaned and flickering right-column pills caused by untried fallback candidates entering the stage or short-request bursts evicting active streams.

## [0.3.3] - 2026-11-24

### Changed

- Enriched offline demo mode (`"demo": true`) with realistic cache-hit rates, tok/s metrics, multi-account folded quotas, and low-quota amber warning states.

## [0.3.2] - 2026-11-20

### Changed

- Replaced the stacked `REQUESTS` / `IN FLIGHT` / `RECENT` labels with a single `Requests` header carrying live counts (`Requests 2 active · 40 recent`) and an inline filter chip.
- Renamed `in flight` to `active` across the request header and expanded try list.
- Removed the redundant live request counter from the top bar.

### Fixed

- Folded provider quota rows now show exact `short% · long%` readings (with per-window color status and `Exhausted` when the long window is depleted) instead of averaging stacked windows or pools.

## [0.3.1] - 2026-11-19

### Fixed

- Hid the `· 0 live` counter in the top bar when no requests are active.

## [0.3.0] - 2026-11-19

### Added

- One-click in-panel updates: displays an `↑ Update` pill in the top bar when a newer release is available, downloads and verifies the release archive's SHA-256 checksum, and reloads while preserving `config.json`, fold state, and row order.

### Fixed

- Stopped averaging stacked quota windows on folded rows; a depleted outer window now reports `Exhausted` with its matching reset time.

## [0.2.0] - 2026-11-18

### Added

- Multi-account quota support: lists every account reported by a provider under its provider group with consistent window/credit breakdowns.
- Collapsible providers and accounts (folded by default) with drag-to-reorder persistence.
- Cache-hit rate display (`XX% cached`) in the request feed and expanded request details.

### Fixed

- Fixed multi-account providers dropping secondary accounts.
- Fixed quota windows sharing a reset time overwriting each other, and subscription plans overwriting wallet balances.
- Fixed the drag-and-drop indicator clipping above the first provider row.
- Expanded abbreviated labels (`accts` → `Accounts`, `Err` → `Error`).

## [0.1.1] - 2026-11-17

### Added

- Offline demo mode (`"demo": true` in `mods/routing/config.json`) using synthetic fixtures without connecting to a gateway.

## [0.1.0] - 2026-11-15

### Added

- Initial release of the `Magpie` Herdr layout with the Routing side panel (live routing topology, provider quota monitor, and inline request inspector) and `tabs-routing` tab bar.

[0.4.1]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.4.1
[0.4.0]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.4.0
[0.3.5]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.3.5
[0.3.4]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.3.4
[0.3.3]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.3.3
[0.3.2]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.3.2
[0.3.1]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.3.1
[0.3.0]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.3.0
[0.2.0]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.2.0
[0.1.1]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.1.1
[0.1.0]: https://github.com/dorokuma/herdr-magpie/releases/tag/v0.1.0
