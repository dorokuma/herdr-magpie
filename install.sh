#!/usr/bin/env bash
set -euo pipefail

HERDR_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$HERDR_HOME/layouts" "$HERDR_HOME/mods"

cp -r "$SRC_DIR/layouts/"* "$HERDR_HOME/layouts/"
cp -r "$SRC_DIR/mods/routing" "$HERDR_HOME/mods/"
cp -r "$SRC_DIR/mods/tabs-routing" "$HERDR_HOME/mods/"

if command -v herdr-app >/dev/null 2>&1; then
  herdr-app check "$HERDR_HOME/mods/routing"
  herdr-app check "$HERDR_HOME/mods/tabs-routing"
  herdr-app do layout.switch '{"name":"Magpie"}' >/dev/null 2>&1 || true
fi

echo "Installed herdr-magpie into $HERDR_HOME"
