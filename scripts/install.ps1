#!/usr/bin/env pwsh
#Requires -Version 5.1

<#
.SYNOPSIS
    Install blackpearl to ~/.local/bin

.DESCRIPTION
    Downloads the latest release archive for Windows x64,
    extracts blackpearl.exe into ~/.local/bin, and adds it to PATH.

.EXAMPLE
    irm https://pirate-608.github.io/blackpearl/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$PagesBase = "https://pirate-608.github.io/blackpearl"
$ReleasesBase = "https://github.com/pirate-608/blackpearl/releases/download"

$Platform = "windows-x64"
$ArchiveName = "blackpearl-$Platform.zip"
$BinaryName = "blackpearl.exe"
$InstallDir = "$env:USERPROFILE\.local\bin"

function Get-DownloadUrl {
    $version = $env:BLACKPEARL_VERSION
    if ($version) {
        return "$ReleasesBase/$version/$ArchiveName"
    }
    return "$PagesBase/$ArchiveName"
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

$downloadUrl = Get-DownloadUrl
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
