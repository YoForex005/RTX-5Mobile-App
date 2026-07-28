[CmdletBinding()]
param(
  [switch]$SkipPull,
  [switch]$SkipDependencyInstall,
  [switch]$SkipTypecheck,
  [switch]$FullValidation,
  [switch]$ConfigureAndroid,
  [switch]$WithAndroidEmulator,
  [switch]$CheckAndroidDevice,
  [switch]$CheckEasLogin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$repoRoot = $PSScriptRoot
$toolchainPath = Join-Path $repoRoot 'WORKSPACE_TOOLCHAIN.json'

if ($WithAndroidEmulator -and -not $ConfigureAndroid) {
  throw '-WithAndroidEmulator requires -ConfigureAndroid.'
}

if (-not (Test-Path -LiteralPath $toolchainPath)) {
  throw "Missing toolchain manifest: $toolchainPath"
}

$toolchain = Get-Content -Raw -LiteralPath $toolchainPath | ConvertFrom-Json
$appRoot = Join-Path $repoRoot ([string]$toolchain.appDirectory)
$jsToolchainRoot = Join-Path $repoRoot ([string]$toolchain.jsToolchainDirectory)
$parityScript = Join-Path $repoRoot 'VERIFY_WORKSPACE_PARITY.ps1'

function Require-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed. $InstallHint"
  }
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory = $repoRoot
  )

  Push-Location $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "$FilePath failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Read-Version {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList
  )

  $output = & $FilePath @ArgumentList 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not read the version from $FilePath."
  }
  return ([string]$output).Trim().TrimStart('v')
}

Write-Host 'RTX5 new-machine setup'
Write-Host "Repository: $repoRoot"
Write-Host "Application: $appRoot"
Write-Host ''

Require-Command -Name 'git' -InstallHint 'Install Git for Windows, then reopen PowerShell.'
Require-Command -Name 'node' -InstallHint "Install Node $($toolchain.node)."
Require-Command -Name 'npm.cmd' -InstallHint "Install npm $($toolchain.npm) with Node $($toolchain.node)."

$resolvedGitRoot = ([string](& git -C $repoRoot rev-parse --show-toplevel 2>$null)).Trim()
if (
  $LASTEXITCODE -ne 0 -or
  [System.IO.Path]::GetFullPath($resolvedGitRoot).TrimEnd('\') -ne
    [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
) {
  throw 'Run this script from a Git clone of RTX-5Mobile-App.'
}
if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'package-lock.json'))) {
  throw "The application lockfile is missing from $appRoot."
}
if (-not (Test-Path -LiteralPath (Join-Path $jsToolchainRoot 'package-lock.json'))) {
  throw "The locked JavaScript toolchain is missing from $jsToolchainRoot."
}

Invoke-Checked -FilePath 'git' -ArgumentList @('config', '--local', 'core.autocrlf', 'false')
Invoke-Checked -FilePath 'git' -ArgumentList @('config', '--local', 'core.longpaths', 'true')
Invoke-Checked -FilePath 'git' -ArgumentList @('config', '--local', 'pull.ff', 'only')

$currentBranch = ([string](& git -C $repoRoot branch --show-current)).Trim()
$originUrl = ([string](& git -C $repoRoot remote get-url origin)).Trim()
$expectedRepositoryPattern = "[/:]$([regex]::Escape([string]$toolchain.gitRepository))(?:\.git)?$"
$configuredUpstream = ([string](& git -C $repoRoot rev-parse --abbrev-ref '@{upstream}' 2>$null)).Trim()
if ($currentBranch -ne [string]$toolchain.gitBranch) {
  throw "Expected branch $($toolchain.gitBranch), but the active branch is $currentBranch."
}
if ($originUrl -notmatch $expectedRepositoryPattern) {
  throw 'The origin remote is not the repository declared in WORKSPACE_TOOLCHAIN.json.'
}
if ($configuredUpstream -ne "origin/$($toolchain.gitBranch)") {
  throw "Expected upstream origin/$($toolchain.gitBranch), but found $configuredUpstream."
}

if (-not $SkipPull) {
  $pending = & git -C $repoRoot status --porcelain --untracked-files=normal
  if ($LASTEXITCODE -ne 0) {
    throw 'Git status failed.'
  }
  if ($pending) {
    throw 'The worktree has local changes. Commit, stash, or remove them before the setup script pulls.'
  }

  Write-Host 'Pulling the configured upstream with fast-forward-only safety...'
  Invoke-Checked -FilePath 'git' -ArgumentList @(
    '-C', $repoRoot, 'pull', '--ff-only', 'origin', [string]$toolchain.gitBranch
  )
}

$actualNode = Read-Version -FilePath 'node' -ArgumentList @('--version')
$actualNpm = Read-Version -FilePath 'npm.cmd' -ArgumentList @('--version')

if ($actualNode -ne [string]$toolchain.node) {
  throw @"
Node $actualNode is installed, but this repository requires Node $($toolchain.node).
On a new Windows machine run:
  winget install --id OpenJS.NodeJS.22 --version $($toolchain.node) --exact
Then reopen PowerShell and run this setup script again.
"@
}

if ($actualNpm -ne [string]$toolchain.npm) {
  throw @"
npm $actualNpm is installed, but this repository requires npm $($toolchain.npm).
Run:
  npm.cmd install --global npm@$($toolchain.npm)
Then reopen PowerShell and run this setup script again.
"@
}

$appJson = Get-Content -Raw -LiteralPath (Join-Path $appRoot 'app.json') | ConvertFrom-Json
$projectId = [string]$appJson.expo.extra.eas.projectId
$runtimePolicy = [string]$appJson.expo.runtimeVersion.policy
if ($projectId -ne [string]$toolchain.easProjectId) {
  throw 'The EAS project ID does not match WORKSPACE_TOOLCHAIN.json.'
}
if ($runtimePolicy -ne [string]$toolchain.runtimeVersionPolicy) {
  throw 'The Expo runtime policy does not match WORKSPACE_TOOLCHAIN.json.'
}

$envPath = Join-Path $appRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'rtx5-app/.env is missing. Restore approved configuration without placing secrets in Git.'
}

if (-not $SkipDependencyInstall) {
  Write-Host 'Installing the locked test/release command-line tools with npm ci...'
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('ci', '--no-audit', '--no-fund') -WorkingDirectory $jsToolchainRoot
  Write-Host 'Installing the exact application dependency tree with npm ci...'
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('ci', '--no-audit', '--no-fund') -WorkingDirectory $appRoot
}

if (-not $SkipTypecheck) {
  Write-Host 'Running TypeScript validation...'
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('run', 'typecheck') -WorkingDirectory $appRoot
}

if ($FullValidation) {
  Write-Host 'Running the full application test suite...'
  Invoke-Checked -FilePath 'npm.cmd' -ArgumentList @('test') -WorkingDirectory $appRoot
}

if ($ConfigureAndroid) {
  $androidArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $appRoot 'scripts\android\bootstrap-android-sdk.ps1')
  )
  if ($WithAndroidEmulator) {
    $androidArgs += '-WithEmulator'
  }
  Invoke-Checked -FilePath 'powershell.exe' -ArgumentList $androidArgs -WorkingDirectory $appRoot
}

$parityArgs = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', $parityScript,
  '-CheckDependencies'
)
if ($CheckAndroidDevice -or $ConfigureAndroid) {
  $parityArgs += '-CheckAndroid'
}
if ($WithAndroidEmulator) {
  $parityArgs += '-RequireAndroidEmulator'
}
if ($CheckEasLogin) {
  $parityArgs += '-CheckEasLogin'
}

Write-Host 'Running final workspace parity verification...'
Invoke-Checked -FilePath 'powershell.exe' -ArgumentList $parityArgs

Write-Host ''
Write-Host 'SETUP COMPLETE: tracked source and required tool versions were verified.'
Write-Host 'Review every WARNING, including the known legacy public-feed credential exception.'
Write-Host 'No build or OTA update was started.'
