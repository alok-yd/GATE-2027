$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ApiOut = Join-Path $Root "achiever-ai-gateway.out.log"
$ApiErr = Join-Path $Root "achiever-ai-gateway.err.log"

Write-Host "Starting Achiever AI Gateway on 127.0.0.1:8787"
$Api = Start-Process -FilePath "node" -ArgumentList @("server/ai-gateway.mjs") -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $ApiOut -RedirectStandardError $ApiErr -PassThru

Write-Host "Gateway PID: $($Api.Id)"
Write-Host "Starting Vite on http://localhost:3000"
npm run dev
