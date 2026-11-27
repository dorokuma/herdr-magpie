#!/usr/bin/env bash
# The release gate for herdr-magpie.
#
#   scripts/release-check.sh                 before tagging: may HEAD be released as v$(cat VERSION)?
#   scripts/release-check.sh --out DIR       the same, and leave the checked archive + .sha256 in DIR to upload
#   scripts/release-check.sh --published     after publishing: is v$(cat VERSION) on GitHub what was tagged,
#                                            and does the update pill get a real install onto it?
#   scripts/release-check.sh --published X.Y.Z
#
# Exits 0 only when every check passed. The last line says what that means:
#   READY           HEAD may be tagged vX.Y.Z
#   NOTHING TO DO   vX.Y.Z is already out and nothing that gets installed changed since
#   NOT READY       something failed; each failure is listed above
#
# Needs git, node 22 or newer, curl and tar. `herdr-app check` runs when Herdr
# is installed and is reported as skipped when it is not.

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
REPO="dorokuma/herdr-magpie"
# what install.sh and the update pill put on a person's machine
INSTALLED=(mods layouts install.sh install.ps1)

MODE=gate OUT="" ASKED=""
while [ $# -gt 0 ]; do
  case "$1" in
    --published) MODE=published; if [ $# -gt 1 ] && [[ "$2" != -* ]]; then ASKED="${2#v}"; shift; fi ;;
    --out) [ $# -gt 1 ] || { echo "--out needs a folder" >&2; exit 2; }; OUT="$2"; shift ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

pass=0 fail=0 skip=0
ok()      { printf '  ok    %s\n' "$1"; pass=$((pass + 1)); }
bad()     { printf '  FAIL  %s\n' "$1"; shift; for l in "$@"; do printf '        %s\n' "$l"; done; fail=$((fail + 1)); }
skipped() { printf '  skip  %s\n' "$1"; skip=$((skip + 1)); }
section() { printf '\n%s\n' "$1"; }
# check "what is true when this passes" command...
check()   { local what="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$what"; else bad "$what"; fi; }
# the connection to github.com drops now and then: four tries
retry()   { local n=0; until "$@"; do n=$((n + 1)); [ "$n" -lt 4 ] || return 1; sleep 2; done; }
sha()     { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
is_semver() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }
# newer A B: A is a later version than B
newer() {
  local a b i; IFS=. read -r -a a <<<"$1"; IFS=. read -r -a b <<<"$2"
  for i in 0 1 2; do
    [ "${a[$i]}" -gt "${b[$i]}" ] && return 0
    [ "${a[$i]}" -lt "${b[$i]}" ] && return 1
  done
  return 1
}
verdict() {
  printf '\n%d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skip"
  if [ "$fail" -gt 0 ]; then echo "NOT READY: $1"; exit 1; fi
  # a pass with something skipped says so on the line people read
  if [ "$skip" -gt 0 ]; then echo "$2 ($skip skipped, see 'skip' above)"; else echo "$2"; fi
  exit 0
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

section "Tools"
for t in git node curl tar; do command -v "$t" >/dev/null 2>&1 || bad "$t is installed"; done
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$NODE_MAJOR" -ge 22 ]; then ok "node $(node -p process.versions.node)"; else bad "node 22 or newer" "found $(node --version)"; fi
fi
git rev-parse --git-dir >/dev/null 2>&1 || bad "this is a git checkout" "the gate reads tags and history; an unpacked release archive has neither"
[ "$fail" -eq 0 ] || verdict "a tool is missing" ""

V=$(tr -d '[:space:]' < VERSION 2>/dev/null || true)

# ------------------------------------------------------------------------------
if [ "$MODE" = published ]; then
  V="${ASKED:-$V}"
  section "Published release v$V"
  is_semver "$V" || { bad "the version is X.Y.Z" "got '$V'"; verdict "no version to check" ""; }

  TAGC=$(git rev-parse -q --verify "refs/tags/v$V^{commit}" 2>/dev/null || true)
  if [ -z "$TAGC" ]; then
    bad "tag v$V exists in this checkout" "git fetch --tags, or the release has not been tagged"
    verdict "v$V is not tagged here" ""
  fi
  if [ "$(git cat-file -t "refs/tags/v$V")" = tag ]; then ok "v$V is an annotated tag"; else bad "v$V is an annotated tag" "it is a lightweight tag: git tag -a v$V -m v$V"; fi
  check "VERSION and mods/routing/VERSION at the tag are both $V" \
    test "$(git show "v$V:VERSION" | tr -d '[:space:]')/$(git show "v$V:mods/routing/VERSION" | tr -d '[:space:]')" = "$V/$V"

  REMOTE=$(retry git ls-remote origin "refs/tags/v$V" "refs/tags/v$V^{}" refs/heads/main 2>/dev/null) || REMOTE=""
  if [ -z "$REMOTE" ]; then
    bad "origin answers" "git ls-remote origin failed four times"
  else
    RTAG=$(awk -v r="refs/tags/v$V^{}" '$2 == r {print $1}' <<<"$REMOTE")
    [ -n "$RTAG" ] || RTAG=$(awk -v r="refs/tags/v$V" '$2 == r {print $1}' <<<"$REMOTE")
    RMAIN=$(awk '$2 == "refs/heads/main" {print $1}' <<<"$REMOTE")
    if [ "$RTAG" = "$TAGC" ]; then ok "origin has v$V, at the same commit as here (${TAGC:0:7})"
    elif [ -z "$RTAG" ]; then bad "origin has tag v$V" "git push origin v$V"
    else bad "origin's v$V is the commit tagged here" "origin ${RTAG:0:7}, here ${TAGC:0:7}"; fi
    if git cat-file -e "$RMAIN^{commit}" 2>/dev/null && git merge-base --is-ancestor "$TAGC" "$RMAIN"; then ok "the tagged commit is on origin/main"
    else bad "the tagged commit is on origin/main" "origin/main is ${RMAIN:0:7}; git fetch origin, or the release commit was not pushed"; fi
  fi

  LATEST=$(retry curl -fsSLI --max-time 15 -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null) || LATEST=""
  if [ "$LATEST" = "https://github.com/$REPO/releases/tag/v$V" ]; then ok "github.com/$REPO/releases/latest is v$V (published: not a draft, not a prerelease)"
  else bad "github.com/$REPO/releases/latest is v$V" "it is '${LATEST:-unreachable}'" "a draft or prerelease is never 'latest', and the update pill only looks there"; fi

  A="herdr-magpie-$V.tar.gz"
  U="https://github.com/$REPO/releases/download/v$V/$A"
  if retry curl -fsSL --max-time 120 -o "$WORK/$A" "$U" 2>/dev/null && retry curl -fsSL --max-time 30 -o "$WORK/$A.sha256" "$U.sha256" 2>/dev/null; then
    ok "the release carries $A and $A.sha256"
    # the one-line installers are release assets of their own: without them
    # curl -fsSL https://dorokuma.github.io/hm | bash has nothing to fetch.
    # The comparison reads the tagged commit's blob, never HEAD: the tag is
    # what was published, and HEAD may have moved since (or never have been
    # the release commit at all).
    for I in install.sh install.ps1; do
      if retry curl -fsSL --max-time 30 -o "$WORK/dl-$I" "https://github.com/$REPO/releases/download/v$V/$I" 2>/dev/null; then
        if git cat-file -p "${TAGC}:$I" > "$WORK/tagged-$I" 2>/dev/null && cmp -s "$WORK/dl-$I" "$WORK/tagged-$I"; then
          ok "the release carries $I, byte for byte the one tagged v$V"
        else
          bad "the release carries $I, byte for byte the one tagged v$V" "the published asset differs from what the tagged commit carries"
        fi
      else
        bad "the release carries $I, byte for byte the one tagged v$V" "could not download https://github.com/$REPO/releases/download/v$V/$I" "without it, the one-line installer has nothing to fetch"
      fi
    done
    WANT=$(cut -d' ' -f1 < "$WORK/$A.sha256")
    if [ -n "$WANT" ] && [ "$WANT" = "$(sha "$WORK/$A")" ]; then ok "the archive matches its .sha256"; else bad "the archive matches its .sha256" "published $WANT" "actual    $(sha "$WORK/$A")"; fi
    mkdir -p "$WORK/got" "$WORK/want"
    if tar xzf "$WORK/$A" -C "$WORK/got" 2>/dev/null && git archive --prefix="herdr-magpie-$V/" "v$V" | tar x -C "$WORK/want" && diff -r "$WORK/got" "$WORK/want" >"$WORK/diff" 2>&1; then
      ok "the archive unpacks to herdr-magpie-$V/ holding exactly the files tagged v$V"
    else
      bad "the archive unpacks to herdr-magpie-$V/ holding exactly the files tagged v$V" "$(head -5 "$WORK/diff" 2>/dev/null)"
    fi
  else
    bad "the release carries $A and $A.sha256" "could not download $U (or its .sha256)" "without both, every user's update pill fails"
  fi

  section "A real update, over the network"
  if [ "$fail" -gt 0 ]; then
    # never execute the remote install lines against assets that failed a
    # check above: an untrusted tarball or installer must not be run, not
    # even by the gate itself
    skipped "tests/live/published.test.mjs: assets failed verification above; the remote install lines are not executed against untrusted assets"
  elif HM_PUBLISHED="$V" node --test --test-reporter=spec tests/live/published.test.mjs >"$WORK/live" 2>&1; then
    grep -E '^✔' "$WORK/live" | sed 's/^✔ /  ok    /; s/ ([0-9.]*ms)$//'
    pass=$((pass + $(grep -cE '^✔' "$WORK/live")))
  else
    cat "$WORK/live"; bad "tests/live/published.test.mjs" "see the output above"
  fi
  verdict "v$V is not published correctly" "PUBLISHED: v$V is out and installs"
fi

# ------------------------------------------------------------------------------
section "Tree"
DIRTY=$(git status --porcelain)
if [ -z "$DIRTY" ]; then ok "the working tree is clean"
else bad "the working tree is clean" "a release is cut from a commit; commit or remove:" $(head -8 <<<"$DIRTY" | awk '{print $NF}'); fi

section "Version"
if is_semver "$V"; then ok "VERSION is $V"; else bad "VERSION is X.Y.Z" "got '$V'"; verdict "no version to check" ""; fi
MV=$(tr -d '[:space:]' < mods/routing/VERSION 2>/dev/null || true)
if [ "$MV" = "$V" ]; then ok "mods/routing/VERSION is $V too"
else bad "mods/routing/VERSION equals VERSION" "it is '${MV:-missing}': the installed panel would report the wrong version, and offer the update forever or never"; fi

HEADC=$(git rev-parse HEAD)
TAGC=$(git rev-parse -q --verify "refs/tags/v$V^{commit}" 2>/dev/null || true)
if [ -z "$TAGC" ]; then STATE=candidate
elif [ "$TAGC" = "$HEADC" ]; then STATE=tagged
elif git diff --quiet "v$V" HEAD -- "${INSTALLED[@]}"; then STATE=same
else STATE=unbumped; fi

case "$STATE" in
  candidate)
    NEWEST=""
    for t in $(git tag -l 'v*'); do
      is_semver "${t#v}" || continue
      if [ -z "$NEWEST" ] || newer "${t#v}" "$NEWEST"; then NEWEST="${t#v}"; fi
    done
    if [ -z "$NEWEST" ] || newer "$V" "$NEWEST"; then ok "$V is newer than every tag here${NEWEST:+ (newest: v$NEWEST)}"
    else bad "$V is newer than every tag here" "v$NEWEST exists"; fi
    if RT=$(retry git ls-remote origin "refs/tags/v$V" 2>/dev/null); then
      if [ -z "$RT" ]; then ok "origin has no tag v$V yet"; else bad "origin has no tag v$V yet" "a published tag is never reused: bump VERSION"; fi
    else bad "origin answers" "git ls-remote origin failed four times; the tag could not be checked against origin"; fi
    ;;
  tagged) ok "HEAD is the commit tagged v$V" ;;
  same)   ok "v$V is tagged, and nothing in ${INSTALLED[*]} changed since" ;;
  unbumped)
    bad "VERSION was bumped for what changed" "these changed since v$V, and they are what gets installed:" \
      $(git diff --name-only "v$V" HEAD -- "${INSTALLED[@]}" | head -8) \
      "bump VERSION and mods/routing/VERSION, and give the change a CHANGELOG section" ;;
esac

section "Changelog"
TOP=$(grep -m1 -E '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md || true)
if [[ "$TOP" =~ ^##\ \[$V\]\ -\ [0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then ok "the newest section is '$TOP'"
else bad "the newest CHANGELOG section is '## [$V] - YYYY-MM-DD'" "it is '${TOP:-missing}'"; fi
BODY=$(awk -v h="## [$V]" 'index($0, h) == 1 {on = 1; next} on && /^## \[/ {exit} on && NF' CHANGELOG.md | wc -l)
if [ "$BODY" -gt 0 ]; then ok "the $V section says what changed"; else bad "the $V section says what changed" "it is empty: this text is the release notes"; fi
UNREL=$(awk '/^## \[Unreleased\]/ {on = 1; next} on && /^## \[/ {exit} on && NF' CHANGELOG.md | wc -l)
if [ "$STATE" = candidate ] || [ "$STATE" = tagged ]; then
  if [ "$UNREL" -eq 0 ]; then ok "nothing is left under [Unreleased]"
  else bad "nothing is left under [Unreleased]" "move those $UNREL lines into the $V section: they ship with this release"; fi
fi

section "Docs"
PINNED=$(grep -nE 'releases/download/v[0-9]|img\.shields\.io/badge/release-|herdr-magpie-[0-9]+\.[0-9]+\.[0-9]+' README.md README.zh-CN.md RECIPE.md || true)
if [ -z "$PINNED" ]; then ok "README and RECIPE name no release version (badge and install lines read releases/latest)"
else bad "README and RECIPE name no release version" "these would go stale at the next release:" $(cut -d: -f1,2 <<<"$PINNED"); fi

section "Sources"
for f in mods/routing/main.js mods/tabs-routing/main.js; do
  if ERR=$(node --check "$f" 2>&1); then ok "$f parses"; else bad "$f parses" "$(head -3 <<<"$ERR")"; fi
done
for f in layouts/Magpie.json mods/routing/mod.json mods/tabs-routing/mod.json mods/routing/demo.json mods/routing/config.example.json; do
  check "$f is valid JSON" node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$f"
done
if command -v herdr-app >/dev/null 2>&1; then
  for m in mods/routing mods/tabs-routing; do
    if ERR=$(herdr-app check "$m" 2>&1); then ok "herdr-app check $m"; else bad "herdr-app check $m" "$(tail -5 <<<"$ERR")"; fi
  done
else
  skipped "herdr-app check (Herdr is not installed here): run this gate once on a machine that has it"
fi

section "Archive"
A="herdr-magpie-$V.tar.gz"
if git archive --format=tar.gz --prefix="herdr-magpie-$V/" -o "$WORK/$A" HEAD 2>"$WORK/err"; then
  printf '%s  %s\n' "$(sha "$WORK/$A")" "$A" > "$WORK/$A.sha256"
  ok "packed HEAD as $A, the way a release is packed ($(sha "$WORK/$A" | cut -c1-12)…)"
  INV=$(tar xzOf "$WORK/$A" "herdr-magpie-$V/mods/routing/VERSION" 2>/dev/null | tr -d '[:space:]')
  if [ "$INV" = "$V" ]; then ok "the archive's mods/routing/VERSION is $V"; else bad "the archive's mods/routing/VERSION is $V" "it is '${INV:-missing}': is the file committed?"; fi
else
  bad "git archive packs HEAD" "$(head -3 "$WORK/err")"
fi

section "Tests"
# HM_RELEASE_DIR: the update tests install the archive packed above rather than
# packing the working tree again. HM_REQUIRE_UPDATERS: finding no released
# updater in git history fails instead of being skipped.
if HM_RELEASE_DIR="$WORK" HM_REQUIRE_UPDATERS=1 node --test --test-reporter=spec tests/*.test.mjs >"$WORK/tests" 2>&1; then
  N=$(awk '$1 == "ℹ" && $2 == "pass" {print $3}' "$WORK/tests")
  S=$(awk '$1 == "ℹ" && $2 == "skipped" {print $3}' "$WORK/tests")
  grep -E '^ +✔ v[0-9]' "$WORK/tests" | sed -E 's/^ *✔ (v[0-9.]+) → ([0-9.]+).*/  ok    the updater shipped in \1 installs \2/'
  if [ "${S:-0}" -eq 0 ]; then ok "node --test tests/*.test.mjs: $N passed"; else bad "no test is skipped under the gate" "$S skipped:" "$(grep -E '^﹣' "$WORK/tests" | head -5)"; fi
else
  cat "$WORK/tests"
  bad "node --test tests/*.test.mjs" "see the output above"
fi

if [ -n "$OUT" ] && [ "$fail" -eq 0 ]; then
  # every step of the export is checked on its own: a failed write must
  # never end up behind a READY verdict. install.sh and install.ps1 are
  # read out of the HEAD commit, not the working tree, so a dirty or
  # newline-mangled working file cannot slip into the upload set.
  EXPORTED=yes
  if ! mkdir -p "$OUT" 2>"$WORK/out-err"; then
    bad "the export folder $OUT can be created" "$(head -2 "$WORK/out-err")"
    EXPORTED=no
  fi
  if [ "$EXPORTED" = yes ]; then
    for I in "$WORK/$A" "$WORK/$A.sha256"; do
      if ! cp "$I" "$OUT/" 2>"$WORK/out-err"; then
        bad "$(basename "$I") is exported to $OUT" "$(head -2 "$WORK/out-err")"
        EXPORTED=no
      fi
    done
  fi
  if [ "$EXPORTED" = yes ]; then
    for I in install.sh install.ps1; do
      if ! git show "HEAD:$I" > "$OUT/$I" 2>"$WORK/out-err"; then
        bad "$I is exported to $OUT from the HEAD commit" "$(head -2 "$WORK/out-err")"
        EXPORTED=no
      fi
    done
    chmod +x "$OUT/install.sh" 2>/dev/null || true
  fi
  if [ "$EXPORTED" = yes ]; then
    printf '\nLeft in %s:\n  %s\n  %s\n  %s\n  %s\n' "$OUT" "$A" "$A.sha256" install.sh install.ps1
  fi
fi

case "$STATE" in
  candidate) verdict "HEAD is not ready to be v$V" "READY: tag HEAD as v$V (git tag -a v$V -m v$V), publish, then run: scripts/release-check.sh --published" ;;
  tagged)    verdict "v$V is tagged here, but the tree it tags does not pass" "READY: HEAD is already tagged v$V. After publishing, run: scripts/release-check.sh --published" ;;
  same)      verdict "the tree does not pass" "NOTHING TO DO: v$V is already out and nothing that gets installed changed since. To release, bump VERSION first." ;;
  unbumped)  verdict "what gets installed changed since v$V, but VERSION is still $V" "" ;;
esac
