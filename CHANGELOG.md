# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `Magpie` layout, the `routing` mod and the `tabs-routing` mod are released
together at one version.

## [Unreleased]

## [0.6.1] - 2026-11-27

### Added

- One-line install: `curl -fsSL https://dorokuma.github.io/hm | bash` on macOS / Linux and `irm https://dorokuma.github.io/hm.ps1 | iex` on Windows. Both installers are now dual-mode: run from a clone or an unpacked release they install the tree they sit in; piped into a shell they bootstrap themselves by downloading the release archive, verifying its SHA-256 against the published `.sha256` before anything is unpacked or the install directory is touched. `HERDR_MAGPIE_RELEASE_BASE` and `HERDR_MAGPIE_VERSION` override the release server and the version.

### Changed

- `install.sh` resolves the latest release and downloads the archive itself in remote mode (3 retries), verifies the checksum with `sha256sum` / `shasum -a 256`, and aborts before unpacking on any mismatch; the piped-into-bash invocation no longer fails on an unset `BASH_SOURCE`.
- `install.ps1` downloads with `System32\curl.exe` and unpacks with `System32\tar.exe` in remote mode, verifies the archive with `Get-FileHash -Algorithm SHA256`, and performs the install in the same script instead of launching a downloaded `.ps1`, so it runs unblocked under the default `Restricted` execution policy via `irm | iex`. The script body no longer ends in a bare `exit`, which would have closed the host PowerShell window inside `iex`.
- `scripts/release-check.sh` now ships `install.sh` and `install.ps1` as release assets (`--out`) and verifies the published ones byte for byte against HEAD (`--published`).
- The Quick Start sections of both READMEs use the one-line installers; the PowerShell execution-policy hint is gone because `irm | iex` needs none.
- Lightened the `Stream` flow theme so a single 33ms frame costs far less QuickJS work, eliminating the occasional re-render warning banner on busy stages: curve `Path`s and flattened polylines are cached per wire instead of being rebuilt every frame, beam slices are sampled at a 4.5px step instead of 1.5px, the outer bloom drops from 5 segments to 2 and is drawn for the primary pulse only, the comet core tapers in 5 segments instead of 10, the secondary half-phase pulse now fires only on long wires while at most 3 wires are active and no longer draws its outermost 10px head halo, and text width measurement is memoized with `charCodeAt`-based exact character checks replacing per-character regexes. `rgba` alpha is clamped into `[0, 1]` so non-finite or out-of-range values can never produce an invalid hex color. The calibrated width table and every pre-existing behavior are unchanged.

## [0.6.0] - 2026-11-27

### Added

- Redesigned two-line request rows in the routing stage (PR #2, by @KOP-XIAO): the first line carries the route badge and timestamp, and the second line shows the live stage with elapsed time and metrics as they progress.
- Live stage progress in request rows: `fmtElapsed` removes sub-second jitter from the elapsed-time display, and the `Minimal` stage style skips repaints for intermediate in-flight frames.

### Changed

- Unified agent / provider / account display label casing (PR #2, by @KOP-XIAO), while preserving internal IDs and prototype-key safety.
- Compact stage right-side chips keep the model name untruncated (PR #2, by @KOP-XIAO).
- Follow-up polish: calibrated the fixed chrome budget of narrow-width badges to 2px, split the two-line subtree assertions, and pinned the frame test clock for stable stage tests.

### Documentation

- Documented Windows (PowerShell) configuration for the remote Magpie gateway section in both READMEs: `hc machine ls` discovery note plus a single-line BOM-free UTF-8 write example for `%USERPROFILE%\.config\herdr-app\mods\routing\config.json`.

## [0.5.0] - 2026-11-27

### Added

- Native Windows PowerShell installer `install.ps1`, aligned with the `herdr-app` path priority: uses `-LiteralPath` throughout, skips the source-side `config.json` overwrite, verifies installation through the `herdr-app check` exit code, and stays compatible with both PowerShell 5.1 and 7 Legacy JSON argument passing.
- Windows cross-platform runtime support in `mods/routing/main.js`: `latestRelease()` pipes to `-o NUL`, and the self-update path uses PowerShell with `System32\curl.exe`/`tar.exe`, `Get-FileHash` verification, UTF-8 Base64 path argument passing, and atomic replacement via `[IO.File]::Replace(..., NullString::Value)`.
- One-command install instructions for all platforms in the English and Chinese `README.md` / `README.zh-CN.md` (Unix sub-shell and Windows child scope), plus configuration directory documentation.

### Changed

- Hardened the Linux / macOS `install.sh`: `XDG_CONFIG_HOME` priority, empty or root `HOME` guards, a WSL hint, `herdr-app` fallback probing, and `config.json` protection.
- Aligned `discoverProviders()` in `mods/routing/main.js` across all three platforms with Magpie's `XDG_CONFIG_HOME` resolution rules.
- Updated `scripts/release-check.sh` and the cross-platform unit test coverage for the new install and update paths.

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
