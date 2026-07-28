[CmdletBinding()]
param(
  [switch]$CheckDependencies,
  [switch]$CheckAndroid,
  [switch]$RequireAndroidEmulator,
  [switch]$CheckEasLogin,
  [switch]$AllowToolchainDrift,
  [switch]$AllowDirtyGit,
  [switch]$FailOnSecurityWarnings
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$repoRoot = $PSScriptRoot
$toolchainPath = Join-Path $repoRoot 'WORKSPACE_TOOLCHAIN.json'
$results = New-Object System.Collections.Generic.List[object]
$blockedCount = 0
$securityWarningCount = 0

if ($RequireAndroidEmulator) {
  $CheckAndroid = $true
}

function Add-Result {
  param(
    [ValidateSet('PASS', 'WARNING', 'BLOCKED')]
    [string]$Status,
    [string]$Check,
    [string]$Detail
  )

  $script:results.Add([pscustomobject]@{
    Status = $Status
    Check = $Check
    Detail = $Detail
  })
  if ($Status -eq 'BLOCKED') {
    $script:blockedCount += 1
  }
  if ($Status -eq 'WARNING' -and $Check -eq 'tracked-feed-credential') {
    $script:securityWarningCount += 1
  }
}

function Has-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Read-NativeVersion {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList
  )

  $output = & $FilePath @ArgumentList 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $null
  }
  return ([string]$output).Trim().TrimStart('v')
}

if (-not (Test-Path -LiteralPath $toolchainPath)) {
  Write-Error "Missing $toolchainPath"
  exit 2
}

$toolchain = Get-Content -Raw -LiteralPath $toolchainPath | ConvertFrom-Json
$appRoot = Join-Path $repoRoot ([string]$toolchain.appDirectory)
$jsToolchainRoot = Join-Path $repoRoot ([string]$toolchain.jsToolchainDirectory)
$nvmPath = Join-Path $repoRoot '.nvmrc'
if (-not (Test-Path -LiteralPath $nvmPath)) {
  Add-Result 'BLOCKED' 'node-manifest' '.nvmrc is missing.'
} else {
  $nvmVersion = (Get-Content -Raw -LiteralPath $nvmPath).Trim()
  if ($nvmVersion -eq [string]$toolchain.node) {
    Add-Result 'PASS' 'node-manifest' '.nvmrc matches WORKSPACE_TOOLCHAIN.json.'
  } else {
    Add-Result 'BLOCKED' 'node-manifest' '.nvmrc differs from WORKSPACE_TOOLCHAIN.json.'
  }
}

$requiredTrackedFiles = @(
  '.github/workflows/eas-update.yml',
  '.gitattributes',
  '.nvmrc',
  'WORKSPACE_TOOLCHAIN.json',
  'SETUP_NEW_WINDOWS_MACHINE.ps1',
  'VERIFY_WORKSPACE_PARITY.ps1',
  'OTA_UPDATE_INFORMATION.md',
  'docs/guide/OTA_PRODUCTION_BASELINE.md',
  'docs/guide/NEW_WINDOWS_MACHINE_SETUP.md',
  'tools/js-toolchain/package.json',
  'tools/js-toolchain/package-lock.json',
  'rtx5-app/.env.example',
  'rtx5-app/app.json',
  'rtx5-app/eas.json',
  'rtx5-app/fingerprint.config.js',
  'rtx5-app/package.json',
  'rtx5-app/package-lock.json',
  'rtx5-app/scripts/android/bootstrap-android-sdk.ps1',
  'rtx5-app/scripts/eas-update.js',
  'rtx5-app/scripts/run-eas-cli.js',
  'rtx5-app/scripts/run-tsx-cli.js',
  'rtx5-app/scripts/ota/check-eas-env.js',
  'rtx5-app/scripts/ota/check-ota-safety.js',
  'rtx5-app/scripts/ota/print-update-context.js'
)

$gitAvailable = Has-Command 'git'
foreach ($relativePath in $requiredTrackedFiles) {
  $fullPath = Join-Path $repoRoot ($relativePath -replace '/', '\')
  if (-not (Test-Path -LiteralPath $fullPath)) {
    Add-Result 'BLOCKED' "file:$relativePath" 'Required file is missing.'
    continue
  }

  if (-not $gitAvailable) {
    Add-Result 'BLOCKED' "file:$relativePath" 'Git is unavailable, so tracked state cannot be proven.'
    continue
  }

  $trackedPath = & git -C $repoRoot ls-files -- $relativePath 2>$null
  if ($trackedPath) {
    Add-Result 'PASS' "file:$relativePath" 'Present and tracked.'
  } else {
    Add-Result 'BLOCKED' "file:$relativePath" 'Present but not tracked.'
  }
}

$machineLocalPaths = @(
  '.claude/settings.local.json',
  'rtx5-app/.netlify/netlify.toml',
  'rtx5-app/.netlify/state.json',
  'ACCESS_PHONE_LOCAL.ps1',
  'phone-uinput-tap',
  'rtx5-app/google-services.json'
)
foreach ($relativePath in $machineLocalPaths) {
  if (-not $gitAvailable) {
    Add-Result 'BLOCKED' "local-only:$relativePath" 'Git is unavailable, so ignore/tracked state cannot be proven.'
    continue
  }
  $trackedPath = & git -C $repoRoot ls-files -- $relativePath 2>$null
  if ($trackedPath) {
    Add-Result 'BLOCKED' "local-only:$relativePath" 'Machine-local or credential material is tracked.'
  } else {
    & git -C $repoRoot check-ignore --quiet -- $relativePath
    if ($LASTEXITCODE -eq 0) {
      Add-Result 'PASS' "local-only:$relativePath" 'Not tracked and covered by repository ignore rules.'
    } else {
      Add-Result 'BLOCKED' "local-only:$relativePath" 'Not tracked, but not covered by repository ignore rules.'
    }
  }
}

if ($gitAvailable) {
  $currentBranch = ([string](& git -C $repoRoot branch --show-current 2>$null)).Trim()
  $originUrl = ([string](& git -C $repoRoot remote get-url origin 2>$null)).Trim()
  $expectedRepositoryPattern = "[/:]$([regex]::Escape([string]$toolchain.gitRepository))(?:\.git)?$"
  if ($currentBranch -eq [string]$toolchain.gitBranch) {
    Add-Result 'PASS' 'git-branch' "Active branch is $currentBranch."
  } else {
    Add-Result 'BLOCKED' 'git-branch' "Expected branch $($toolchain.gitBranch); found $currentBranch."
  }
  if ($originUrl -match $expectedRepositoryPattern) {
    Add-Result 'PASS' 'git-origin' 'Origin matches the repository manifest.'
  } else {
    Add-Result 'BLOCKED' 'git-origin' 'Origin does not match the repository manifest.'
  }

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & git -C $repoRoot fetch --quiet --prune origin 2>$null
  $fetchExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorPreference
  if ($fetchExitCode -eq 0) {
    Add-Result 'PASS' 'git-fetch' 'Origin tracking state was refreshed.'
  } else {
    Add-Result 'BLOCKED' 'git-fetch' 'Could not refresh origin; remote parity is not proven.'
  }

  $head = ([string](& git -C $repoRoot rev-parse HEAD 2>$null)).Trim()
  $upstream = & git -C $repoRoot rev-parse --abbrev-ref '@{upstream}' 2>$null
  if (
    $LASTEXITCODE -ne 0 -or
    ([string]$upstream).Trim() -ne "origin/$($toolchain.gitBranch)"
  ) {
    Add-Result 'BLOCKED' 'git-upstream' 'No configured upstream branch was found.'
  } else {
    $counts = ([string](& git -C $repoRoot rev-list --left-right --count 'HEAD...@{upstream}' 2>$null)).Trim() -split '\s+'
    if ($LASTEXITCODE -eq 0 -and $counts.Count -eq 2 -and $counts[0] -eq '0' -and $counts[1] -eq '0') {
      Add-Result 'PASS' 'git-upstream' "HEAD is aligned with $($upstream.Trim())."
    } else {
      Add-Result 'BLOCKED' 'git-upstream' 'HEAD is ahead of or behind its upstream.'
    }
  }

  $pending = & git -C $repoRoot status --porcelain --untracked-files=normal
  if ($LASTEXITCODE -ne 0) {
    Add-Result 'BLOCKED' 'git-worktree' 'Could not inspect the worktree.'
  } elseif (-not $pending) {
    Add-Result 'PASS' 'git-worktree' "Tracked source is clean at $($head.Substring(0, 12))."
  } elseif ($AllowDirtyGit) {
    Add-Result 'WARNING' 'git-worktree' 'Local changes exist; release parity is not proven.'
  } else {
    Add-Result 'BLOCKED' 'git-worktree' 'Local changes exist.'
  }

  $autoCrlf = ([string](& git -C $repoRoot config --get core.autocrlf 2>$null)).Trim()
  if ($autoCrlf -eq 'false') {
    Add-Result 'PASS' 'git-line-endings' 'Machine conversion is disabled; .gitattributes owns checkout bytes.'
  } else {
    Add-Result 'BLOCKED' 'git-line-endings' 'Run the setup script so .gitattributes alone owns checkout bytes.'
  }

  $longPaths = ([string](& git -C $repoRoot config --local --get core.longpaths 2>$null)).Trim()
  if ($longPaths -eq 'true') {
    Add-Result 'PASS' 'git-long-paths' 'Repository-local long-path support is enabled.'
  } else {
    Add-Result 'BLOCKED' 'git-long-paths' 'Run the setup script to enable repository-local long paths.'
  }
} else {
  Add-Result 'BLOCKED' 'git' 'Git is not installed or not on PATH.'
}

if (Has-Command 'node') {
  $nodeVersion = Read-NativeVersion -FilePath 'node' -ArgumentList @('--version')
  if ($nodeVersion -eq [string]$toolchain.node) {
    Add-Result 'PASS' 'node' "Pinned Node $nodeVersion is active."
  } elseif ($AllowToolchainDrift) {
    Add-Result 'WARNING' 'node' "Active Node $nodeVersion differs from pinned Node $($toolchain.node)."
  } else {
    Add-Result 'BLOCKED' 'node' "Active Node $nodeVersion differs from pinned Node $($toolchain.node)."
  }
} else {
  Add-Result 'BLOCKED' 'node' 'Node.js is not installed or not on PATH.'
}

if (Has-Command 'npm.cmd') {
  $npmVersion = Read-NativeVersion -FilePath 'npm.cmd' -ArgumentList @('--version')
  if ($npmVersion -eq [string]$toolchain.npm) {
    Add-Result 'PASS' 'npm' "Pinned npm $npmVersion is active."
  } elseif ($AllowToolchainDrift) {
    Add-Result 'WARNING' 'npm' "Active npm $npmVersion differs from pinned npm $($toolchain.npm)."
  } else {
    Add-Result 'BLOCKED' 'npm' "Active npm $npmVersion differs from pinned npm $($toolchain.npm)."
  }
} else {
  Add-Result 'BLOCKED' 'npm' 'npm is not installed or not on PATH.'
}

$appJson = Get-Content -Raw -LiteralPath (Join-Path $appRoot 'app.json') | ConvertFrom-Json
$easJson = Get-Content -Raw -LiteralPath (Join-Path $appRoot 'eas.json') | ConvertFrom-Json
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $appRoot 'package.json') | ConvertFrom-Json
$packageLockText = Get-Content -Raw -LiteralPath (Join-Path $appRoot 'package-lock.json')
$jsToolPackage = Get-Content -Raw -LiteralPath (Join-Path $jsToolchainRoot 'package.json') | ConvertFrom-Json
$jsToolLockText = Get-Content -Raw -LiteralPath (Join-Path $jsToolchainRoot 'package-lock.json')

if ([string]$appJson.expo.extra.eas.projectId -eq [string]$toolchain.easProjectId) {
  Add-Result 'PASS' 'eas-project' 'The tracked EAS project ID matches the toolchain manifest.'
} else {
  Add-Result 'BLOCKED' 'eas-project' 'The EAS project ID differs from the toolchain manifest.'
}

if ([string]$easJson.cli.version -eq [string]$toolchain.easCli) {
  Add-Result 'PASS' 'eas-cli-contract' "eas.json requires EAS CLI $($toolchain.easCli)."
} else {
  Add-Result 'BLOCKED' 'eas-cli-contract' 'eas.json does not require the tracked EAS CLI version.'
}

$lockedToolRootDependencies = ''
if ($jsToolLockText -match '(?s)"packages"\s*:\s*\{\s*""\s*:\s*\{.*?"dependencies"\s*:\s*\{(.*?)\}\s*,') {
  $lockedToolRootDependencies = $matches[1]
}
if (
  [string]$jsToolPackage.dependencies.'eas-cli' -eq [string]$toolchain.easCli -and
  [string]$jsToolPackage.dependencies.tsx -eq [string]$toolchain.tsx -and
  [string]$jsToolPackage.dependencies.typescript -eq [string]$toolchain.jsToolchainTypescript -and
  $lockedToolRootDependencies -match "`"eas-cli`"\s*:\s*`"$([regex]::Escape([string]$toolchain.easCli))`"" -and
  $lockedToolRootDependencies -match "`"tsx`"\s*:\s*`"$([regex]::Escape([string]$toolchain.tsx))`"" -and
  $lockedToolRootDependencies -match "`"typescript`"\s*:\s*`"$([regex]::Escape([string]$toolchain.jsToolchainTypescript))`""
) {
  Add-Result 'PASS' 'js-tool-lock' "EAS CLI $($toolchain.easCli), tsx $($toolchain.tsx), and its TypeScript peer are lockfile-pinned."
} else {
  Add-Result 'BLOCKED' 'js-tool-lock' 'The JavaScript tool package or lockfile differs from WORKSPACE_TOOLCHAIN.json.'
}

if ([string]$appJson.expo.updates.url -match [regex]::Escape([string]$toolchain.easProjectId)) {
  Add-Result 'PASS' 'eas-update-url' 'The update URL belongs to the tracked EAS project.'
} else {
  Add-Result 'BLOCKED' 'eas-update-url' 'The update URL does not match the tracked EAS project.'
}

if ([string]$appJson.expo.runtimeVersion.policy -eq [string]$toolchain.runtimeVersionPolicy) {
  Add-Result 'PASS' 'runtime-policy' "Runtime policy is $($toolchain.runtimeVersionPolicy)."
} else {
  Add-Result 'BLOCKED' 'runtime-policy' 'Runtime policy differs from the toolchain manifest.'
}

if ([string]$packageJson.version -eq [string]$appJson.expo.version) {
  Add-Result 'PASS' 'app-version' "package.json and app.json agree on $($packageJson.version)."
} else {
  Add-Result 'BLOCKED' 'app-version' 'package.json and app.json versions differ.'
}

$lockRootVersion = ''
if ($packageLockText -match '(?s)"packages"\s*:\s*\{\s*""\s*:\s*\{.*?"version"\s*:\s*"([^"]+)"') {
  $lockRootVersion = $matches[1]
}
if ($lockRootVersion -eq [string]$packageJson.version) {
  Add-Result 'PASS' 'lock-metadata' 'Lockfile root metadata matches package.json.'
} else {
  Add-Result 'WARNING' 'lock-metadata' 'Lockfile dependency resolution is usable, but its root version metadata is stale.'
}

$requiredEnvNames = @(
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL',
  'EXPO_PUBLIC_DEMO_API_BASE_URL',
  'EXPO_PUBLIC_FEED_BROKER_ID',
  'EXPO_PUBLIC_CANDLE_HISTORY_PATH',
  'EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE',
  'EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL'
)
$envPath = Join-Path $appRoot '.env'
$envLines = @()
if (Test-Path -LiteralPath $envPath) {
  $envLines = Get-Content -LiteralPath $envPath
  Add-Result 'PASS' 'local-env' 'Local app configuration exists; values were not printed.'
} else {
  Add-Result 'BLOCKED' 'local-env' 'rtx5-app/.env is missing. Restore approved configuration locally.'
}
$envNames = New-Object System.Collections.Generic.HashSet[string]
foreach ($line in $envLines) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
    [void]$envNames.Add($matches[1])
  }
}
$missingEnvNames = @($requiredEnvNames | Where-Object { -not $envNames.Contains($_) })
if ($missingEnvNames.Count -eq 0) {
  Add-Result 'PASS' 'env-key-shape' 'All required public configuration names are present; values were not printed.'
} else {
  Add-Result 'BLOCKED' 'env-key-shape' ("Missing names: " + ($missingEnvNames -join ', '))
}

$hasTrackedFeedCredential = [bool]($envLines | Where-Object {
  $_ -match '^\s*EXPO_PUBLIC_FEED_BROKER_TOKEN\s*=\s*\S+'
})
if ($hasTrackedFeedCredential) {
  if ($FailOnSecurityWarnings) {
    Add-Result 'BLOCKED' 'tracked-feed-credential' 'A nonempty public feed credential is still tracked. Rotate/migrate it before release.'
  } else {
    Add-Result 'WARNING' 'tracked-feed-credential' 'A nonempty public feed credential is still tracked. Rotate/migrate it separately; it was not copied into the template.'
  }
} else {
  Add-Result 'PASS' 'tracked-feed-credential' 'No nonempty public feed credential was detected in the tracked env file.'
}

$releaseFiles = @(
  (Join-Path $repoRoot '.github\workflows\eas-update.yml'),
  (Join-Path $appRoot 'scripts\eas-update.js'),
  (Join-Path $appRoot 'scripts\ota\check-eas-env.js')
)
$releaseText = ($releaseFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_ }) -join "`n"
$workflowText = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '.github\workflows\eas-update.yml')
if ($workflowText -match "node-version:\s*$([regex]::Escape([string]$toolchain.node))") {
  Add-Result 'PASS' 'workflow-node-pin' "GitHub OTA uses Node $($toolchain.node)."
} else {
  Add-Result 'BLOCKED' 'workflow-node-pin' 'GitHub OTA Node does not match the tracked toolchain.'
}
if ($releaseText -match 'eas-cli@latest') {
  Add-Result 'BLOCKED' 'eas-cli-pin' 'An active OTA path still uses eas-cli@latest.'
} elseif (
  $releaseText -match 'WORKSPACE_TOOLCHAIN\.json' -and
  $releaseText -match 'easCli'
) {
  Add-Result 'PASS' 'eas-cli-pin' "OTA paths resolve EAS CLI $($toolchain.easCli) from the tracked manifest."
} else {
  Add-Result 'BLOCKED' 'eas-cli-pin' 'OTA paths do not use the tracked EAS CLI manifest.'
}

$easScriptNames = @(
  'build:dev',
  'build:preview',
  'build:staging',
  'build:prod',
  'build:prod:no-ota',
  'build:android:prod',
  'build:android:prod-apk',
  'build:android:prod-no-ota-apk',
  'build:android',
  'build:ios',
  'submit:ios',
  'submit:android',
  'submit:all'
)
$incorrectEasScripts = @($easScriptNames | Where-Object {
  [string]$packageJson.scripts.$_ -notmatch '^node \./scripts/run-eas-cli\.js '
})
if ($incorrectEasScripts.Count -eq 0) {
  Add-Result 'PASS' 'eas-package-scripts' 'All build and submit scripts use the locked EAS wrapper.'
} else {
  Add-Result 'BLOCKED' 'eas-package-scripts' ("Scripts bypassing the locked EAS wrapper: " + ($incorrectEasScripts -join ', '))
}

$fingerprintConfigText = Get-Content -Raw -LiteralPath (Join-Path $appRoot 'fingerprint.config.js')
if ($fingerprintConfigText -match 'PackageJsonAndroidAndIosScriptsIfNotContainRun') {
  Add-Result 'PASS' 'package-script-fingerprint-policy' 'Tool-only package script edits are excluded by the tracked fingerprint policy.'
} else {
  Add-Result 'BLOCKED' 'package-script-fingerprint-policy' 'The tracked fingerprint policy does not protect tool-only package script edits.'
}

if ($CheckDependencies -and -not (Has-Command 'npm.cmd')) {
  Add-Result 'BLOCKED' 'dependencies' 'npm is not installed, so dependency parity cannot be checked.'
} elseif ($CheckDependencies) {
  $jsToolsNodeModulesPath = Join-Path $jsToolchainRoot 'node_modules'
  $installedEasPackagePath = Join-Path $jsToolsNodeModulesPath 'eas-cli\package.json'
  $installedTsxPackagePath = Join-Path $jsToolsNodeModulesPath 'tsx\package.json'
  if (
    -not (Test-Path -LiteralPath $installedEasPackagePath) -or
    -not (Test-Path -LiteralPath $installedTsxPackagePath)
  ) {
    Add-Result 'BLOCKED' 'js-tools' 'Locked JavaScript tools are absent. Run SETUP_NEW_WINDOWS_MACHINE.ps1.'
  } else {
    $installedEasVersion = [string](Get-Content -Raw -LiteralPath $installedEasPackagePath | ConvertFrom-Json).version
    $installedTsxVersion = [string](Get-Content -Raw -LiteralPath $installedTsxPackagePath | ConvertFrom-Json).version
    if (
      $installedEasVersion -eq [string]$toolchain.easCli -and
      $installedTsxVersion -eq [string]$toolchain.tsx
    ) {
      Push-Location $jsToolchainRoot
      try {
        & npm.cmd ls --depth=0 --silent *> $null
        if ($LASTEXITCODE -eq 0) {
          Add-Result 'PASS' 'js-tools' "Installed EAS CLI $installedEasVersion and tsx $installedTsxVersion match a complete dependency tree."
        } else {
          Add-Result 'BLOCKED' 'js-tools' 'The locked JavaScript tool dependency tree is incomplete or invalid.'
        }
      } finally {
        Pop-Location
      }
    } else {
      Add-Result 'BLOCKED' 'js-tools' 'Installed JavaScript tool versions differ from the manifest.'
    }
  }

  $nodeModulesPath = Join-Path $appRoot 'node_modules'
  if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
    Add-Result 'BLOCKED' 'dependencies' 'node_modules is absent. Run SETUP_NEW_WINDOWS_MACHINE.ps1.'
  } else {
    Push-Location $appRoot
    try {
      & npm.cmd ls --depth=0 --silent *> $null
      if ($LASTEXITCODE -eq 0) {
        Add-Result 'PASS' 'dependencies' 'npm dependency tree is complete.'
      } else {
        Add-Result 'BLOCKED' 'dependencies' 'npm dependency tree is incomplete or invalid.'
      }

      & npm.cmd run typecheck --silent *> $null
      if ($LASTEXITCODE -eq 0) {
        Add-Result 'PASS' 'typecheck' 'TypeScript validation passed.'
      } else {
        Add-Result 'BLOCKED' 'typecheck' 'TypeScript validation failed.'
      }
    } finally {
      Pop-Location
    }
  }
}

if ($CheckAndroid) {
  $sdkRoot = $env:ANDROID_HOME
  if ([string]::IsNullOrWhiteSpace($sdkRoot)) {
    $sdkRoot = $env:ANDROID_SDK_ROOT
  }
  if ([string]::IsNullOrWhiteSpace($sdkRoot)) {
    $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  }

  $adbPath = Join-Path $sdkRoot 'platform-tools\adb.exe'
  $buildToolsPath = Join-Path $sdkRoot "build-tools\$($toolchain.androidBuildTools)"
  $platformPath = Join-Path $sdkRoot "platforms\$($toolchain.androidPlatform)"
  $javaPath = 'C:\Program Files\Android\Android Studio\jbr\bin\java.exe'

  if (Test-Path -LiteralPath $adbPath) {
    $adbVersionText = (& $adbPath version 2>$null | Out-String)
    if (
      $LASTEXITCODE -eq 0 -and
      $adbVersionText -match "Version\s+$([regex]::Escape([string]$toolchain.androidPlatformToolsVersion))(?:-|\s|$)"
    ) {
      Add-Result 'PASS' 'android-adb' "Android Platform-Tools $($toolchain.androidPlatformToolsVersion) are installed."
    } elseif ($AllowToolchainDrift) {
      Add-Result 'WARNING' 'android-adb' "Android Platform-Tools differ from pinned $($toolchain.androidPlatformToolsVersion)."
    } else {
      Add-Result 'BLOCKED' 'android-adb' "Android Platform-Tools differ from pinned $($toolchain.androidPlatformToolsVersion)."
    }
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $adbPath
    $processInfo.Arguments = 'devices'
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $adbProcess = New-Object System.Diagnostics.Process
    $adbProcess.StartInfo = $processInfo
    [void]$adbProcess.Start()
    if (-not $adbProcess.WaitForExit(5000)) {
      try {
        $adbProcess.Kill()
      } catch {
        # The process may have exited between the timeout and Kill().
      }
      Add-Result 'WARNING' 'android-device' 'ADB device discovery timed out after 5 seconds.'
    } else {
      $deviceLines = $adbProcess.StandardOutput.ReadToEnd() -split "`r?`n"
      $authorizedDeviceCount = @($deviceLines | Where-Object { $_ -match "`tdevice$" }).Count
      if ($authorizedDeviceCount -gt 0) {
        Add-Result 'PASS' 'android-device' "$authorizedDeviceCount authorized physical/emulated device(s) detected; serials were not printed."
      } else {
        Add-Result 'WARNING' 'android-device' 'No authorized device is connected. USB authorization is machine-specific.'
      }
    }
  } else {
    Add-Result 'BLOCKED' 'android-adb' 'Android Platform-Tools are missing.'
  }

  $buildToolsPropertiesPath = Join-Path $buildToolsPath 'source.properties'
  if (
    (Test-Path -LiteralPath $buildToolsPropertiesPath) -and
    (Get-Content -LiteralPath $buildToolsPropertiesPath) -contains "Pkg.Revision=$($toolchain.androidBuildTools)"
  ) {
    Add-Result 'PASS' 'android-build-tools' "Build-Tools $($toolchain.androidBuildTools) are installed."
  } else {
    Add-Result 'BLOCKED' 'android-build-tools' "Build-Tools $($toolchain.androidBuildTools) are missing or differ from the pinned revision."
  }

  $platformPropertiesPath = Join-Path $platformPath 'source.properties'
  if (
    (Test-Path -LiteralPath $platformPropertiesPath) -and
    (Get-Content -LiteralPath $platformPropertiesPath) -contains "Pkg.Revision=$($toolchain.androidPlatformRevision)"
  ) {
    Add-Result 'PASS' 'android-platform' "$($toolchain.androidPlatform) revision $($toolchain.androidPlatformRevision) is installed."
  } else {
    Add-Result 'BLOCKED' 'android-platform' "$($toolchain.androidPlatform) is missing or differs from revision $($toolchain.androidPlatformRevision)."
  }

  if (Test-Path -LiteralPath $javaPath) {
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $javaPath
    $processInfo.Arguments = '-version'
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $javaProcess = New-Object System.Diagnostics.Process
    $javaProcess.StartInfo = $processInfo
    [void]$javaProcess.Start()
    if (-not $javaProcess.WaitForExit(5000)) {
      try {
        $javaProcess.Kill()
      } catch {
        # The process may have exited between the timeout and Kill().
      }
      Add-Result 'BLOCKED' 'android-java' 'Android Studio Java version check timed out after 5 seconds.'
    } else {
      $javaVersionText = $javaProcess.StandardError.ReadToEnd()
      if ($javaVersionText -match "version `"$([regex]::Escape([string]$toolchain.androidJavaMajor))\.") {
        Add-Result 'PASS' 'android-java' "Android Studio Java major $($toolchain.androidJavaMajor) is installed."
      } else {
        Add-Result 'BLOCKED' 'android-java' "Android Studio Java major differs from $($toolchain.androidJavaMajor)."
      }
    }
  } else {
    Add-Result 'BLOCKED' 'android-java' 'Android Studio bundled Java runtime is missing.'
  }

  if ($RequireAndroidEmulator) {
    $emulatorPath = Join-Path $sdkRoot 'emulator\emulator.exe'
    $avdPath = Join-Path $env:USERPROFILE ".android\avd\$($toolchain.androidDefaultAvdName).avd"
    if (Test-Path -LiteralPath $emulatorPath) {
      Add-Result 'PASS' 'android-emulator' 'Android Emulator is installed.'
    } else {
      Add-Result 'BLOCKED' 'android-emulator' 'Android Emulator was requested but is missing.'
    }
    if (Test-Path -LiteralPath $avdPath) {
      Add-Result 'PASS' 'android-avd' "Default AVD $($toolchain.androidDefaultAvdName) exists."
    } else {
      Add-Result 'BLOCKED' 'android-avd' "Default AVD $($toolchain.androidDefaultAvdName) is missing."
    }
  }
}

if ($CheckEasLogin) {
  if (-not (Has-Command 'node')) {
    Add-Result 'BLOCKED' 'eas-login' 'Node.js is not installed.'
  } else {
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = (Get-Command 'node').Source
    $easWrapperPath = Join-Path $appRoot 'scripts\run-eas-cli.js'
    $processInfo.Arguments = "`"$easWrapperPath`" whoami"
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $easProcess = New-Object System.Diagnostics.Process
    $easProcess.StartInfo = $processInfo
    [void]$easProcess.Start()
    if (-not $easProcess.WaitForExit(30000)) {
      try {
        $easProcess.Kill()
      } catch {
        # The process may have exited between the timeout and Kill().
      }
      Add-Result 'BLOCKED' 'eas-login' 'EAS authentication check timed out after 30 seconds.'
    } elseif ($easProcess.ExitCode -eq 0) {
      Add-Result 'PASS' 'eas-login' 'EAS authentication is active; account identity was not printed.'
    } else {
      Add-Result 'BLOCKED' 'eas-login' 'EAS authentication is missing or invalid.'
    }
  }
}

Write-Host ''
Write-Host 'RTX5 workspace parity report'
Write-Host ($results | Format-Table -AutoSize -Wrap | Out-String)

if ($blockedCount -gt 0) {
  Write-Host "BLOCKED: $blockedCount required parity check(s) failed."
  exit 2
}

if ($securityWarningCount -gt 0) {
  Write-Host 'PASS WITH SECURITY EXCEPTION: required parity checks passed, but the tracked legacy public-feed credential still requires migration/rotation.'
} else {
  Write-Host 'PASS: Required tracked source/config and requested machine checks are aligned.'
}
Write-Host 'This verifier never publishes an OTA or starts a build.'
