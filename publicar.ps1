# Publica una versión nueva de la app en GitHub Pages con un solo comando:
#     .\publicar.ps1 "describe tu cambio"
#
# Qué hace:
#   1. Pone una versión nueva (fecha y hora) en sw.js y js/version.js.
#      Así el iPhone sabe que hay algo nuevo y se actualiza solo.
#   2. git add + git commit + git push.
#   3. GitHub Pages publica en 1-2 minutos.

param([string]$Mensaje = "Actualizar app")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$version = Get-Date -Format "yyyy.MM.dd-HHmm"
foreach ($archivo in @("sw.js", "js/version.js")) {
    $texto = [IO.File]::ReadAllText("$PSScriptRoot/$archivo")
    $texto = $texto -replace "VERSION = '[^']*'", "VERSION = '$version'"
    [IO.File]::WriteAllText("$PSScriptRoot/$archivo", $texto, (New-Object Text.UTF8Encoding $false))
}
Write-Host "Version nueva: $version" -ForegroundColor Cyan

git add -A
git commit -m "$Mensaje (v$version)"
git push

Write-Host "Listo. En 1-2 minutos estara en GitHub Pages; el iPhone se actualiza al abrir la app." -ForegroundColor Green
