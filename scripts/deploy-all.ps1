# ==============================================================================
# HSS Planner - Zero-Error Dual-Domain Deployment Script
# Deploys to BOTH:
# 1. Firebase Hosting (https://hss-planner.web.app & https://mission-plustwo.web.app)
# 2. GitHub Pages (https://sreyasts.github.io/hss-planner/)
# ==============================================================================

# Ensure we are in project root directory
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  HSS Planner - Zero-Error Dual-Domain Deployment     " -ForegroundColor Cyan
Write-Host "  Domain 1: https://hss-planner.web.app        " -ForegroundColor Cyan
Write-Host "  Domain 2: https://sreyasts.github.io/ (GitHub Pages)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Step 1: Run Vitest Unit Tests
Write-Host "`n[1/4] Running Vitest Unit Tests..." -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Vitest tests failed! Deployment aborted." -ForegroundColor Red
    Exit 1
}

# Step 2: Run 550+ Engine Invariant Tests
Write-Host "`n[2/4] Running Engine Invariant Tests..." -ForegroundColor Yellow
npm run test:legacy
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Invariant tests failed! Deployment aborted." -ForegroundColor Red
    Exit 1
}

# Step 3: Production Build
Write-Host "`n[3/4] Building Production Bundle with Vite..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Build failed! Deployment aborted." -ForegroundColor Red
    Exit 1
}

# Step 4A: Deploy to Firebase Hosting
Write-Host "`n[4A/4] Deploying to Firebase Hosting (hss-planner.web.app)..." -ForegroundColor Yellow
npx -y firebase-tools@latest deploy --only hosting
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n⚠️ Firebase deploy warning or error. Ensure you are logged in via: npx -y firebase-tools@latest login" -ForegroundColor Red
} else {
    Write-Host "✅ Firebase Hosting deploy complete!" -ForegroundColor Green
}

# Step 4B: Push to GitHub to trigger GitHub Pages Deployment
Write-Host "`n[4B/4] Pushing to GitHub (triggers GitHub Pages deploy)..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Pushed to GitHub main branch! GitHub Actions will update GitHub Pages." -ForegroundColor Green
} else {
    Write-Host "⚠️ Git push returned an error. Check git status." -ForegroundColor Yellow
}

Write-Host "`n🎉 DUAL-DOMAIN DEPLOYMENT PIPELINE COMPLETE!" -ForegroundColor Green
Write-Host "• Firebase Hosting : https://hss-planner.web.app" -ForegroundColor Cyan
Write-Host "• GitHub Pages     : https://sreyasts.github.io/hss-planner/" -ForegroundColor Cyan
