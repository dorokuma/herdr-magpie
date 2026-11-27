#requires -Version 5.1
# herdr-magpie installer for Windows, the install.sh counterpart.
# Copies layouts/ and mods/ next to where herdr-app reads them and validates
# both mods, keeping any mods\routing\config.json already there.
#
# Two modes: run from a clone or an unpacked release it installs the tree it
# sits in; piped into PowerShell (irm https://dorokuma.github.io/hm.ps1 | iex)
# there is no tree, so the release archive is downloaded with
# System32\curl.exe, its SHA-256 verified with Get-FileHash, unpacked with
# System32\tar.exe, and only then installed -- all inside this one script,
# because a .ps1 file downloaded to disk would not run under the default
# Restricted execution policy that irm | iex works around. The whole body
# sits in one script block so a failure throws without ever calling `exit`:
# inside irm | iex a bare exit would close the person's PowerShell window.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# resolved before the wrapper: inside the script block $PSScriptRoot is read
# through this copy, so the local-mode probe answers the same either way
$InstallerScriptRoot = $PSScriptRoot

& {
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

  # local mode: the script sits next to the tree a clone or an unpacked
  # release carries
  $SrcDir = $null
  if (-not [string]::IsNullOrEmpty($InstallerScriptRoot)) {
    if ((Test-Path -LiteralPath (Join-Path $InstallerScriptRoot 'layouts')) -and
        (Test-Path -LiteralPath (Join-Path $InstallerScriptRoot 'mods\routing')) -and
        (Test-Path -LiteralPath (Join-Path $InstallerScriptRoot 'mods\tabs-routing'))) {
      $SrcDir = $InstallerScriptRoot
    }
  }

  $Tmp = $null
  try {
    if ($null -eq $SrcDir) {
      # remote bootstrap: HERDR_MAGPIE_RELEASE_BASE overrides the release
      # server (its layout is GitHub's), HERDR_MAGPIE_VERSION pins the version
      # instead of resolving releases/latest. curl.exe and tar.exe are named
      # by their full System32 path because the ones Git for Windows ships
      # parse a path with a drive letter as scp syntax.
      $ReleaseBase = if (-not [string]::IsNullOrEmpty($env:HERDR_MAGPIE_RELEASE_BASE)) { $env:HERDR_MAGPIE_RELEASE_BASE } else { 'https://github.com/dorokuma/herdr-magpie/releases' }
      $V = $env:HERDR_MAGPIE_VERSION
      $Curl = Join-Path $env:SystemRoot 'System32\curl.exe'
      $Tar = Join-Path $env:SystemRoot 'System32\tar.exe'
      if ([string]::IsNullOrEmpty($V)) {
        $Url = & $Curl -fsSLI -o NUL -w '%{url_effective}' --max-time 30 "$ReleaseBase/latest"
        if ($LASTEXITCODE -ne 0) { throw "install.ps1: could not resolve the latest release (curl exit $LASTEXITCODE)" }
        if (([string]$Url) -match '/tag/v([0-9]+\.[0-9]+\.[0-9]+)$') { $V = $Matches[1] }
      }
      if ([string]::IsNullOrEmpty($V) -or $V -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
        throw 'install.ps1: could not resolve a valid release version. Set HERDR_MAGPIE_VERSION=X.Y.Z and run again.'
      }

      $Tmp = Join-Path ([IO.Path]::GetTempPath()) ('herdr-magpie-' + [Guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

      # a connection to GitHub that drops mid-handshake is common on some
      # networks; three tries each, checking the exit code of a native
      # command that never raises
      function Get-File($Timeout, $Out, $Url) {
        for ($n = 0; $n -lt 3; $n++) {
          & $Curl -fsSL --max-time $Timeout -o "$Out" $Url
          if ($LASTEXITCODE -eq 0) { return }
          Start-Sleep -Seconds 2
        }
        throw "install.ps1: download failed: $Url"
      }

      $TarballUrl = "$ReleaseBase/download/v$V/herdr-magpie-$V.tar.gz"
      Get-File 120 (Join-Path $Tmp 'pkg.tgz') $TarballUrl
      Get-File 30 (Join-Path $Tmp 'pkg.sha256') ($TarballUrl + '.sha256')

      # the checksum gates everything below: a mismatch stops the install
      # before the archive is unpacked and long before the install directory
      # is touched. An empty checksum file reads back as $null; the cast
      # keeps it a string, so the comparison below -- not a null-method
      # error -- is what reports the mismatch.
      $Want = (([string](Get-Content -Raw -LiteralPath (Join-Path $Tmp 'pkg.sha256'))) -split '\s+')[0]
      if ($null -ne $Want) { $Want = $Want.ToLowerInvariant() }
      $Got = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Tmp 'pkg.tgz')).Hash.ToLowerInvariant()
      if ([string]::IsNullOrEmpty($Want) -or $Want -ne $Got) {
        throw "install.ps1: checksum mismatch for herdr-magpie-$V.tar.gz (published: $Want, actual: $Got). Nothing was installed."
      }

      $X = Join-Path $Tmp 'x'
      New-Item -ItemType Directory -Force -Path $X | Out-Null
      & $Tar xzf (Join-Path $Tmp 'pkg.tgz') -C $X
      if ($LASTEXITCODE -ne 0) { throw "install.ps1: could not unpack the release (tar exit $LASTEXITCODE)" }
      $SrcDir = Join-Path $X "herdr-magpie-$V"
      if (-not ((Test-Path -LiteralPath (Join-Path $SrcDir 'mods\routing')) -and (Test-Path -LiteralPath (Join-Path $SrcDir 'mods\tabs-routing')))) {
        throw 'install.ps1: the release is missing its mods; nothing was installed.'
      }
    }

    # Overlay the release's files onto the install: contents are copied into
    # the target folders rather than the folders replaced, so what the
    # release does not ship (a configured mods\routing\config.json, notes,
    # other personal files) survives every install and re-install.
    #
    # Everything is addressed by -LiteralPath and the copy walks the source
    # children itself (no \* wildcard tails), so a path holding [ or ], a
    # curly apostrophe, $ or a backtick -- all legal in a user name or a clone
    # path -- is copied as the plain text it is. mods\routing\config.json in
    # the source (it can sit in a clone the installer runs from) is never
    # copied: it is the untracked private configuration of whoever cloned
    # there, and copying it would overwrite the installed one.
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

    # The herdr-app binary: on PATH first, then the folder the Windows
    # installer puts it in.
    $HerdrAppBin = $null
    $cmd = Get-Command herdr-app -ErrorAction SilentlyContinue
    if ($null -ne $cmd) {
      $HerdrAppBin = $cmd.Source
    } elseif (-not [string]::IsNullOrEmpty($env:LOCALAPPDATA)) {
      $candidate = Join-Path (Join-Path $env:LOCALAPPDATA 'Programs\herdr-app') 'herdr-app.exe'
      if (Test-Path -LiteralPath $candidate) { $HerdrAppBin = $candidate }
    }

    if ($null -ne $HerdrAppBin) {
      # herdr-app is a native command: it exits non-zero on a failed check
      # but never raises, so the exit code is what an install must fail on --
      # a throwing stop here is what keeps "Installed" honest.
      & $HerdrAppBin check (Join-Path $HerdrHome 'mods\routing')
      if ($LASTEXITCODE -ne 0) { throw "herdr-app check failed for mods\routing (exit $LASTEXITCODE)" }
      & $HerdrAppBin check (Join-Path $HerdrHome 'mods\tabs-routing')
      if ($LASTEXITCODE -ne 0) { throw "herdr-app check failed for mods\tabs-routing (exit $LASTEXITCODE)" }
      # switching the layout is a nicety, never a reason to fail an install
      try {
        # PowerShell 5.1 (and 7.x in Legacy argument passing) strips the
        # double quotes out of a bare JSON argument; escaping them as \" is
        # what the JSON survives as there, and only there. The
        # PSNativeCommandArgumentPassing variable does not exist before 7.3,
        # and a missing variable is exactly the Legacy behaviour 7.0-7.2
        # ship, so absence is Legacy too.
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
  } finally {
    if ($null -ne $Tmp) {
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath $Tmp
    }
  }

  # a successful install ends 0: the best-effort layout.switch above may have
  # left a non-zero $LASTEXITCODE behind, and it must not poison the exit
  # code whoever invoked this script reads. Resetting the variable -- rather
  # than calling `exit` -- is what keeps `irm ... | iex` from closing the
  # person's PowerShell window: a bare exit inside iex terminates the host
  # shell itself.
  $global:LASTEXITCODE = 0
  return
}
