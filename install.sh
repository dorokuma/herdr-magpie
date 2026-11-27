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

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
