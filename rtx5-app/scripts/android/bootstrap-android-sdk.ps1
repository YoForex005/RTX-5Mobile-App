$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$tempRoot = Join-Path $env:TEMP 'rtx5-android-bootstrap'
$cmdlineToolsZip = Join-Path $tempRoot 'commandlinetools-win-14742923_latest.zip'
$platformToolsZip = Join-Path $tempRoot 'platform-tools-latest-windows.zip'
$cmdlineToolsExtractRoot = Join-Path $tempRoot 'cmdline-tools-extract'
$platformToolsExtractRoot = Join-Path $tempRoot 'platform-tools-extract'
$cmdlineToolsDestination = Join-Path $sdkRoot 'cmdline-tools'
$cmdlineToolsLatestDestination = Join-Path $cmdlineToolsDestination 'latest'
$sdkManager = Join-Path $cmdlineToolsLatestDestination 'bin\sdkmanager.bat'
$avdManager = Join-Path $cmdlineToolsLatestDestination 'bin\avdmanager.bat'
$requiredPackages = @(
  'platform-tools',
  'emulator',
  'platforms;android-36',
  'build-tools;36.0.0'
)
$defaultAvdName = 'RTX5_API_37'
$defaultSystemImagePackage = 'system-images;android-37.0;google_apis_playstore_ps16k;x86_64'

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Add-PathEntry {
  param(
    [string]$ExistingPath,
    [string]$Entry
  )

  if ([string]::IsNullOrWhiteSpace($Entry)) {
    return $ExistingPath
  }

  $parts = @()
  if (-not [string]::IsNullOrWhiteSpace($ExistingPath)) {
    $parts = $ExistingPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries)
  }

  if ($parts -notcontains $Entry) {
    $parts = @($Entry) + $parts
  }

  return ($parts -join ';')
}

function Set-UserEnvironmentVariable {
  param(
    [string]$Name,
    [string]$Value
  )

  [Environment]::SetEnvironmentVariable($Name, $Value, 'User')
  Set-Item -Path "Env:$Name" -Value $Value
}

Ensure-Directory -Path $tempRoot
Ensure-Directory -Path $sdkRoot
Ensure-Directory -Path $cmdlineToolsDestination

Write-Host "Downloading Android command-line tools..."
Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip' -OutFile $cmdlineToolsZip

if (Test-Path -LiteralPath $cmdlineToolsExtractRoot) {
  Remove-Item -LiteralPath $cmdlineToolsExtractRoot -Recurse -Force
}

Expand-Archive -Path $cmdlineToolsZip -DestinationPath $cmdlineToolsExtractRoot -Force

if (Test-Path -LiteralPath $cmdlineToolsLatestDestination) {
  Remove-Item -LiteralPath $cmdlineToolsLatestDestination -Recurse -Force
}

Ensure-Directory -Path $cmdlineToolsLatestDestination
Copy-Item -Path (Join-Path $cmdlineToolsExtractRoot 'cmdline-tools\*') -Destination $cmdlineToolsLatestDestination -Recurse -Force

Write-Host "Downloading Android platform-tools..."
Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $platformToolsZip

if (Test-Path -LiteralPath $platformToolsExtractRoot) {
  Remove-Item -LiteralPath $platformToolsExtractRoot -Recurse -Force
}

Expand-Archive -Path $platformToolsZip -DestinationPath $platformToolsExtractRoot -Force
Copy-Item -Path (Join-Path $platformToolsExtractRoot 'platform-tools') -Destination $sdkRoot -Recurse -Force

if (-not (Test-Path -LiteralPath $javaHome)) {
  throw "Android Studio JBR was not found at $javaHome"
}

Set-UserEnvironmentVariable -Name 'ANDROID_HOME' -Value $sdkRoot
Set-UserEnvironmentVariable -Name 'ANDROID_SDK_ROOT' -Value $sdkRoot
Set-UserEnvironmentVariable -Name 'JAVA_HOME' -Value $javaHome

$updatedUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$updatedUserPath = Add-PathEntry -ExistingPath $updatedUserPath -Entry (Join-Path $sdkRoot 'platform-tools')
$updatedUserPath = Add-PathEntry -ExistingPath $updatedUserPath -Entry (Join-Path $sdkRoot 'emulator')
$updatedUserPath = Add-PathEntry -ExistingPath $updatedUserPath -Entry (Join-Path $javaHome 'bin')
[Environment]::SetEnvironmentVariable('Path', $updatedUserPath, 'User')
$env:Path = Add-PathEntry -ExistingPath $env:Path -Entry (Join-Path $sdkRoot 'platform-tools')
$env:Path = Add-PathEntry -ExistingPath $env:Path -Entry (Join-Path $sdkRoot 'emulator')
$env:Path = Add-PathEntry -ExistingPath $env:Path -Entry (Join-Path $javaHome 'bin')

if (-not (Test-Path -LiteralPath $sdkManager)) {
  throw "sdkmanager was not installed at $sdkManager"
}

Write-Host "Installing required Android SDK packages..."
$licenseInput = 1..20 | ForEach-Object { 'y' }
$licenseInput | & $sdkManager --sdk_root=$sdkRoot @requiredPackages

$avdPath = Join-Path $env:USERPROFILE ".android\avd\$defaultAvdName.avd"
if (-not (Test-Path -LiteralPath $avdPath) -and (Test-Path -LiteralPath $avdManager)) {
  Write-Host "Creating default Android Virtual Device $defaultAvdName..."
  'no' | & $avdManager create avd -n $defaultAvdName -k $defaultSystemImagePackage --force
}

$androidLocalProperties = Join-Path $projectRoot 'android\local.properties'
"sdk.dir=$($sdkRoot.Replace('\', '\\'))" | Set-Content -Path $androidLocalProperties -Encoding UTF8

Write-Host ''
Write-Host 'Android SDK bootstrap completed.'
Write-Host "SDK Root: $sdkRoot"
Write-Host "JAVA_HOME: $javaHome"
Write-Host 'Open a new terminal before running npm run android if you want the persisted PATH changes to apply globally.'
