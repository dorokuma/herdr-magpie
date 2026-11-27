#requires -Version 5.1
# herdr-magpie installer for Windows, the install.sh counterpart.
# Copies layouts/ and mods/ next to where herdr-app reads them and validates
# both mods, keeping any mods\routing\config.json already there.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Where herdr-app looks for mods, in the order its own src/mods.rs resolves it:
#   1. a non-empty HERDR_APP_HOME
#   2. a non-empty XDG_CONFIG_HOME -> <XDG_CONFIG_HOME>\herdr-app
#   3. %USERPROFILE%\.config\herdr-app
if (-not [string]::IsNullOrEmpty($env:HERDR_APP_HOME)) {
  $HerdrHome = $env:HERDR_APP_HOME
} elseif (-not [string]::IsNullOrEmpty($env:XDG_CONFIG_HOME)) {
  $HerdrHome = Join-Path $env:XDG_CONFIG_HOME 'herdr-app'
} else {
  if ([string]::IsNullOrEmpty($env:USERPROFILE)) {
    throw 'install.ps1: USERPROFILE is unset and neither HERDR_APP_HOME nor XDG_CONFIG_HOME is set. Refusing to guess an install location: set USERPROFILE or HERDR_APP_HOME and run again.'
  }
  $HerdrHome = Join-Path (Join-Path $env:USERPROFILE '.config') 'herdr-app'
}

$SrcDir = $PSScriptRoot

# Overlay the release's files onto the install: contents are copied into the
# target folders rather than the folders replaced, so what the release does
# not ship (a configured mods\routing\config.json, notes, other personal
# files) survives every install and re-install.
#
# Everything is addressed by -LiteralPath and the copy walks the source
# children itself (no \* wildcard tails), so a path holding [ or ], a curly
# apostrophe, $ or a backtick -- all legal in a user name or a clone path --
# is copied as the plain text it is. mods\routing\config.json in the source
# (it can sit in a clone the installer runs from) is never copied: it is the
# untracked private configuration of whoever cloned there, and copying it
# would overwrite the installed one.
foreach ($d in @('layouts', 'mods\routing', 'mods\tabs-routing')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $HerdrHome $d) | Out-Null
}
Get-ChildItem -LiteralPath (Join-Path $SrcDir 'layouts') -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $HerdrHome 'layouts') -Recurse -Force
}
Get-ChildItem -LiteralPath (Join-Path $SrcDir 'mods\routing') -Force | Where-Object { $_.Name -ne 'config.json' } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $HerdrHome 'mods\routing') -Recurse -Force
}
Get-ChildItem -LiteralPath (Join-Path $SrcDir 'mods\tabs-routing') -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $HerdrHome 'mods\tabs-routing') -Recurse -Force
}

# The herdr-app binary: on PATH first, then the folder the Windows installer
# puts it in.
$HerdrAppBin = $null
$cmd = Get-Command herdr-app -ErrorAction SilentlyContinue
if ($null -ne $cmd) {
  $HerdrAppBin = $cmd.Source
} elseif (-not [string]::IsNullOrEmpty($env:LOCALAPPDATA)) {
  $candidate = Join-Path (Join-Path $env:LOCALAPPDATA 'Programs\herdr-app') 'herdr-app.exe'
  if (Test-Path -LiteralPath $candidate) { $HerdrAppBin = $candidate }
}

if ($null -ne $HerdrAppBin) {
  # herdr-app is a native command: it exits non-zero on a failed check but
  # never raises, so the exit code is what an install must fail on -- a
  # throwing stop here is what keeps "Installed" honest.
  & $HerdrAppBin check (Join-Path $HerdrHome 'mods\routing')
  if ($LASTEXITCODE -ne 0) { throw "herdr-app check failed for mods\routing (exit $LASTEXITCODE)" }
  & $HerdrAppBin check (Join-Path $HerdrHome 'mods\tabs-routing')
  if ($LASTEXITCODE -ne 0) { throw "herdr-app check failed for mods\tabs-routing (exit $LASTEXITCODE)" }
  # switching the layout is a nicety, never a reason to fail an install
  try {
    # PowerShell 5.1 (and 7.x in Legacy argument passing) strips the double
    # quotes out of a bare JSON argument; escaping them as \" is what the
    # JSON survives as there, and only there. The PSNativeCommandArgumentPassing
    # variable does not exist before 7.3, and a missing variable is exactly
    # the Legacy behaviour 7.0-7.2 ship, so absence is Legacy too.
    $argPassVar = Get-Variable -Name PSNativeCommandArgumentPassing -ErrorAction SilentlyContinue
    $legacy = ($null -eq $argPassVar) -or ($argPassVar.Value -eq 'Legacy')
    if ($legacy) {
      & $HerdrAppBin do layout.switch '{\"name\":\"Magpie\"}' *>$null
    } else {
      & $HerdrAppBin do layout.switch '{"name":"Magpie"}' *>$null
    }
  } catch { }
}

Write-Output "Installed herdr-magpie into $HerdrHome"

# a successful install ends 0: the best-effort layout.switch above may have
# left a non-zero $LASTEXITCODE behind, and it must not poison the exit code
# whoever invoked this script reads
exit 0
