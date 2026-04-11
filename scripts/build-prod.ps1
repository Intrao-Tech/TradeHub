# TradeHub - Production Build
# Usage: .\scripts\build-prod.ps1
# Prereq: fill backend\.env.prod with real credentials

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== TradeHub Prod Build ===" -ForegroundColor Cyan

# Backend
Write-Host "`n[1/4] Backend: install + build..." -ForegroundColor Yellow
Set-Location "$root\backend"
if (-not (Test-Path ".env.prod")) { Write-Host "ERROR: backend\.env.prod not found. Fill it first." -ForegroundColor Red; exit 1 }
Copy-Item ".env.prod" ".env" -Force
npm ci --silent
npx prisma generate
npm run build
Write-Host "  -> backend/dist/ ready" -ForegroundColor Green

# Migrate (optional, run on deploy target)
Write-Host "[2/4] Prisma migration..." -ForegroundColor Yellow
npx prisma migrate deploy
Write-Host "  -> migrations applied" -ForegroundColor Green

# Frontend
Write-Host "[3/4] Frontend: install + build..." -ForegroundColor Yellow
Set-Location "$root\web"
npm ci --silent
npm run build
Write-Host "  -> web/dist/ ready" -ForegroundColor Green

# Summary
Write-Host "`n[4/4] Build complete." -ForegroundColor Green
Write-Host ""
Write-Host "Deploy artifacts:"
Write-Host "  Backend:  backend/dist/ + backend/node_modules/ + backend/prisma/"
Write-Host "  Frontend: web/dist/ (static files, serve via nginx/Vercel/Netlify)"
Write-Host ""
Write-Host "Start backend in prod:"
Write-Host "  cd backend && node dist/main.js"
