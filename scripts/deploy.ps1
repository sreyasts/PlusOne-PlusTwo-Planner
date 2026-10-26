# ==============================================================================
# +1 & +2 Planner - 1-Click Build & Deploy Script for Firebase Hosting
# ==============================================================================

# Switch to project directory automatically
Set-Location -Path (Split-Path -Parent $PSScriptRoot)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  +1 & +2 Planner - Deploy to Firebase   " -ForegroundColor Cyan
Write-Host "  Target 1: https://hss-planner.web.app" -ForegroundColor Cyan
Write-Host "  Target 2: https://mission-plustwo.web.app" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Build the latest production bundle
Write-Host "`n[1/2] Building production bundle..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Build failed! Deployment aborted." -ForegroundColor Red
    Exit 1
}

# 2. Deploy to Firebase Hosting
Write-Host "`n[2/2] Deploying to Firebase Hosting..." -ForegroundColor Yellow
npx -y firebase-tools@latest deploy --only hosting

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully deployed to:" -ForegroundColor Green
    Write-Host "   👉 https://hss-planner.web.app" -ForegroundColor Green
    Write-Host "   👉 https://mission-plustwo.web.app" -ForegroundColor Green
} else {
    Write-Host "`n❌ Deployment failed. If not logged in, run: npx -y firebase-tools@latest login" -ForegroundColor Red
}
