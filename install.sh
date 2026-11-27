#!/usr/bin/env bash
set -euo pipefail

# Where herdr-app looks for mods, in the order its own src/mods.rs resolves it:
#   1. a non-empty HERDR_APP_HOME
#   2. a non-empty XDG_CONFIG_HOME -> "$XDG_CONFIG_HOME/herdr-app"
#   3. "$HOME/.config/herdr-app"
if [ -n "${HERDR_APP_HOME:-}" ]; then
  HERDR_HOME="$HERDR_APP_HOME"
elif [ -n "${XDG_CONFIG_HOME:-}" ]; then
  HERDR_HOME="$XDG_CONFIG_HOME/herdr-app"
else
  if [ -z "${HOME:-}" ] || [ "${HOME:-}" = "/" ]; then
    echo "install.sh: HOME is unset or '/' and neither HERDR_APP_HOME nor XDG_CONFIG_HOME is set." >&2
    echo "Refusing to install into '/.config/herdr-app': set HOME or HERDR_APP_HOME and run again." >&2
    exit 1
  fi
  HERDR_HOME="$HOME/.config/herdr-app"
fi

# Where the files to install come from. Two modes:
#
#   local   run from a clone or an unpacked release archive: the script sits
#           next to layouts/, mods/routing/ and mods/tabs-routing/, and those
#           are what gets installed.
#   remote  piped into bash (curl -fsSL https://dorokuma.github.io/hm | bash):
#           there is no script file and no tree beside it, so the release
#           archive is downloaded, its SHA-256 verified against the .sha256
#           published next to it, and only then unpacked. Nothing is touched
#           before the checksum passes. HERDR_MAGPIE_RELEASE_BASE overrides
#           the release server (its layout is GitHub's), and
#           HERDR_MAGPIE_VERSION pins the version instead of resolving
#           releases/latest.
SRC_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -d "$SCRIPT_DIR/layouts" ] && [ -d "$SCRIPT_DIR/mods/routing" ] && [ -d "$SCRIPT_DIR/mods/tabs-routing" ]; then
    SRC_DIR="$SCRIPT_DIR"
  fi
fi

if [ -z "$SRC_DIR" ]; then
  RELEASE_BASE="${HERDR_MAGPIE_RELEASE_BASE:-https://github.com/dorokuma/herdr-magpie/releases}"
  V="${HERDR_MAGPIE_VERSION:-}"
  if [ -z "$V" ]; then
    if ! command -v curl >/dev/null 2>&1; then
      echo "install.sh: curl is needed to download the release, and is not on PATH." >&2
      exit 1
    fi
    LATEST="$(curl -fsSLI -o /dev/null -w '%{url_effective}' --max-time 30 "$RELEASE_BASE/latest" 2>/dev/null || true)"
    case "$LATEST" in
      */tag/v*) V="${LATEST##*/tag/v}" ;;
    esac
  fi
  if ! [[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "install.sh: could not resolve a valid release version (got '${V}')." >&2
    echo "Set HERDR_MAGPIE_VERSION=X.Y.Z and run again." >&2
    exit 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "install.sh: curl is needed to download the release, and is not on PATH." >&2
    exit 1
  fi

  # a connection to GitHub that drops mid-handshake is common on some
  # networks; three tries each
  get() {
    n=0
    until curl -fsSL --max-time "$1" -o "$2" "$3"; do
      n=$((n + 1))
      [ "$n" -lt 3 ] || return 1
      sleep 2
    done
  }

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  TARBALL_URL="$RELEASE_BASE/download/v${V}/herdr-magpie-${V}.tar.gz"
  if ! get 120 "$TMP_DIR/pkg.tgz" "$TARBALL_URL" || ! get 30 "$TMP_DIR/pkg.sha256" "$TARBALL_URL.sha256"; then
    echo "install.sh: download failed: $TARBALL_URL (or its .sha256)" >&2
    exit 1
  fi

  WANT="$(cut -d' ' -f1 < "$TMP_DIR/pkg.sha256" | tr -d '[:space:]')"
  if command -v sha256sum >/dev/null 2>&1; then
    GOT="$(sha256sum "$TMP_DIR/pkg.tgz" | cut -d' ' -f1)"
  else
    GOT="$(shasum -a 256 "$TMP_DIR/pkg.tgz" | cut -d' ' -f1)"
  fi
  # the checksum gates everything below: a mismatch stops the install before
  # the archive is unpacked and long before HERDR_HOME is touched
  if [ -z "$WANT" ] || [ "$WANT" != "$GOT" ]; then
    echo "install.sh: checksum mismatch for herdr-magpie-${V}.tar.gz" >&2
    echo "  published: ${WANT:-<empty>}" >&2
    echo "  actual:    $GOT" >&2
    echo "Nothing was installed; refusing to unpack an archive that fails verification." >&2
    exit 1
  fi

  mkdir -p "$TMP_DIR/x"
  tar xzf "$TMP_DIR/pkg.tgz" -C "$TMP_DIR/x"
  SRC_DIR="$TMP_DIR/x/herdr-magpie-${V}"
  if [ ! -d "$SRC_DIR/mods/routing" ] || [ ! -d "$SRC_DIR/mods/tabs-routing" ]; then
    echo "install.sh: the release is missing its mods; nothing was installed." >&2
    exit 1
  fi
fi

# Inside WSL this install only ever reaches the Linux filesystem. When Herdr
# runs on the Windows host, it reads %USERPROFILE%\.config\herdr-app there,
# which no amount of installing here can fill -- say so, but go on: a Linux
# Herdr inside WSL is a real target too.
if [ -z "${HERDR_APP_HOME:-}" ] && { [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; }; then
  echo "install.sh: this looks like WSL. If your Herdr runs on the Windows host," >&2
  echo "install there instead: run install.ps1 in Windows PowerShell." >&2
  echo "(Continuing: this install is what a Herdr running inside WSL reads.)" >&2
fi

mkdir -p "$HERDR_HOME/layouts" "$HERDR_HOME/mods"

# Copy the contents of each folder over the install rather than the folders
# themselves, so what the release does not ship (a configured
# mods/routing/config.json, notes, other personal files) survives every
# install and re-install. mods/routing/config.json in the source is never
# copied: it is the untracked private configuration of whoever cloned the
# installer runs from (git-ignored, never in a release archive), and copying
# it would overwrite the installed one.
cp -r "$SRC_DIR/layouts/"* "$HERDR_HOME/layouts/"
mkdir -p "$HERDR_HOME/mods/routing"
for src in "$SRC_DIR/mods/routing/"*; do
  [ "$(basename "$src")" = "config.json" ] && continue
  cp -r "$src" "$HERDR_HOME/mods/routing/"
done
mkdir -p "$HERDR_HOME/mods/tabs-routing"
cp -r "$SRC_DIR/mods/tabs-routing/"* "$HERDR_HOME/mods/tabs-routing/"

# The herdr-app binary, by PATH first (so a stand-in or a fresh install is
# honoured), then the spots the installers for Linux and macOS put it.
HERDR_APP_BIN=""
if command -v herdr-app >/dev/null 2>&1; then
  HERDR_APP_BIN="herdr-app"
else
  for c in "${HOME:-}/.local/bin/herdr-app" "/opt/homebrew/bin/herdr-app" "/usr/local/bin/herdr-app"; do
    # with HOME unset this first probe is '/.local/bin/herdr-app': not a real
    # install spot, simply absent on the machines it matters on
    if [ -x "$c" ]; then HERDR_APP_BIN="$c"; break; fi
  done
fi

if [ -n "$HERDR_APP_BIN" ]; then
  "$HERDR_APP_BIN" check "$HERDR_HOME/mods/routing"
  "$HERDR_APP_BIN" check "$HERDR_HOME/mods/tabs-routing"
  "$HERDR_APP_BIN" do layout.switch '{"name":"Magpie"}' >/dev/null 2>&1 || true
fi

echo "Installed herdr-magpie into $HERDR_HOME"
