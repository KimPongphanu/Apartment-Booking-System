# Local preview for the localStorage-only app
# Serves public/app on http://localhost:3002 without Express or MySQL.
# Usage: powershell -ExecutionPolicy Bypass -File script\run_preview.ps1

param(
    [int]$Port = 3002
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptDir
$serverFile = Join-Path $scriptDir 'preview-server.js'

if (-not (Test-Path $serverFile)) {
    Write-Host "[preview] missing file: $serverFile" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '[preview] node is not installed or not in PATH.' -ForegroundColor Red
    Write-Host '[preview] install Node.js from https://nodejs.org and try again.'
    exit 1
}

$inUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
    Write-Host "[preview] port $Port is already in use (PID $($inUse[0].OwningProcess))." -ForegroundColor Yellow
    Write-Host "[preview] stop it first, or run with another port:"
    Write-Host "          powershell -ExecutionPolicy Bypass -File script\run_preview.ps1 -Port 3003"
    exit 1
}

Write-Host ''
Write-Host '  Kab Apartment - localStorage preview' -ForegroundColor Green
Write-Host '  ---------------------------------------------' -ForegroundColor DarkGray
Write-Host "  url        : http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "  serving    : $projectRoot\public\app"
Write-Host '  backend    : none (no Express, no MySQL)'
Write-Host '  data store : browser localStorage, session 1 day'
Write-Host '  stop       : Ctrl+C'
Write-Host ''
Write-Host '  demo accounts'
Write-Host '    admin : admin@kab.local / admin1234'
Write-Host '    user  : user@kab.local  / user1234'
Write-Host ''

Push-Location $projectRoot
try {
    & node $serverFile $Port
} finally {
    Pop-Location
}
