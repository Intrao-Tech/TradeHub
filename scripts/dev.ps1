# TradeHub - Local Development Startup
# Usage: .\scripts\dev.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== TradeHub Dev ===" -ForegroundColor Cyan

# Docker
Write-Host "`n[1/5] Starting PostgreSQL..." -ForegroundColor Yellow
docker compose -f "$root\docker-compose.yml" up -d
Start-Sleep -Seconds 3

# Backend deps
Write-Host "[2/5] Installing backend deps..." -ForegroundColor Yellow
Set-Location "$root\backend"
if (-not (Test-Path ".env")) { Copy-Item ".env.dev" ".env"; Write-Host "  Copied .env.dev -> .env" }
npm install --silent

# Prisma
Write-Host "[3/5] Prisma generate + migrate..." -ForegroundColor Yellow
npx prisma generate
npx prisma migrate dev --name init 2>$null
npm run db:seed 2>$null

# Backend (background)
Write-Host "[4/5] Starting backend on :8081..." -ForegroundColor Yellow
$backend = Start-Process -PassThru -NoNewWindow npm -ArgumentList "run","start:dev" -WorkingDirectory "$root\backend"

# Frontend
Write-Host "[5/5] Starting frontend on :3000..." -ForegroundColor Yellow
Set-Location "$root\web"
npm install --silent
Start-Process -NoNewWindow npm -ArgumentList "run","dev" -WorkingDirectory "$root\web"

Write-Host "`n=== Ready ===" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend:  http://localhost:8081/api"
Write-Host "Swagger:  http://localhost:8081/api/docs"
Write-Host "Login:    mike.builder@example.com / Password123!"
Write-Host "`nPress Ctrl+C to stop."

Wait-Process -Id $backend.Id
