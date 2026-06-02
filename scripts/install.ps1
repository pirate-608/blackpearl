#!/usr/bin/env pwsh
#Requires -Version 5.1

<#
.SYNOPSIS
    Install blackpearl to ~/.local/bin

.DESCRIPTION
    Downloads the latest release archive for Windows x64,
    extracts blackpearl.exe into ~/.local/bin, and adds it to PATH.

.EXAMPLE
    irm https://raw.githubusercontent.com/pirate-608/ai-group-work/main/scripts/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$Repo = $env:BLACKPEARL_REPO
if (-not $Repo) {
    $Repo = "pirate-608/ai-group-work"
}

$Platform = "windows-x64"
$ArchiveName = "blackpearl-$Platform.zip"
$BinaryName = "blackpearl.exe"
$InstallDir = "$env:USERPROFILE\.local\bin"

function Get-LatestReleaseUrl {
    $apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
    Write-Host "Fetching latest release from $apiUrl ..."
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "blackpearl-installer" }
    $asset = $release.assets | Where-Object { $_.name -eq $ArchiveName } | Select-Object -First 1
    if (-not $asset) {
        throw "Could not find asset '$ArchiveName' in latest release."
    }
    return $asset.browser_download_url
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -Path $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
        Write-Host "Created directory: $Path"
    }
}

function Add-ToPath {
    param([string]$Dir)
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $normalizedUserPath = ";$userPath;" -replace '\\', '/'
    $normalizedDir = $Dir -replace '\\', '/'
    if ($normalizedUserPath -notlike "*;$normalizedDir;*") {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$Dir", "User")
        Write-Host "Added $Dir to your user PATH."
        Write-Host "Please restart your terminal or run the following to use blackpearl immediately:"
        Write-Host "  `$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User')"
    }
}

# Main
Write-Host "Installing blackpearl (Windows x64) ..."

Ensure-Directory -Path $InstallDir

$downloadUrl = Get-LatestReleaseUrl
$tmpFile = Join-Path $env:TEMP $ArchiveName

Write-Host "Downloading from $downloadUrl ..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpFile -UseBasicParsing

Write-Host "Extracting to $InstallDir ..."
Expand-Archive -Path $tmpFile -DestinationPath $InstallDir -Force

Remove-Item -Path $tmpFile -Force

Add-ToPath -Dir $InstallDir

$binaryPath = Join-Path $InstallDir $BinaryName
if (Test-Path -Path $binaryPath) {
    Write-Host "blackpearl installed successfully to $binaryPath"
    Write-Host "Run 'blackpearl --help' to get started."
} else {
    throw "Installation failed: $BinaryName not found after extraction."
}
