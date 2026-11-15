# TrustShare - clean update. Run it from the project folder in the VS Code terminal:
#     powershell -ExecutionPolicy Bypass -File .\update.ps1
# It makes sure you are in the NEW folder, rebuilds every image from scratch and checks that the running backend is the new version.
$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "TrustShare update - working in: $((Get-Location).Path)" -ForegroundColor Cyan

if (-not (Test-Path "frontend\src\version.js") -or -not (Test-Path "backend\app\core\version.py")) {
    Write-Host "STOP: this folder does not contain the new version files." -ForegroundColor Red
    Write-Host "You are probably inside the OLD project folder. Unzip the newest trustshare-v2.zip and open THAT folder in VS Code." -ForegroundColor Red
    exit 1
}
$expected = (Select-String -Path "backend\app\core\version.py" -Pattern 'APP_VERSION = "(.+)"').Matches[0].Groups[1].Value
Write-Host "Version in these files: $expected"

if (-not (Test-Path ".env")) { Write-Host "No .env file here. Copy your old .env into this folder first." -ForegroundColor Red; exit 1 }

# 0/4  The frontend needs vite 5 with the React plugin. A newer vite (8.x) makes "npm install" fail with ERESOLVE, so repair it.
$pkgPath = "frontend\package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if (-not ($pkg.devDependencies.vite -like "^5*")) {
    Write-Host "0/4 Repairing frontend\package.json (vite $($pkg.devDependencies.vite) -> ^5.4.11)..." -ForegroundColor Yellow
    $pkg.devDependencies.vite = "^5.4.11"
    $pkg.devDependencies."@vitejs/plugin-react" = "^4.3.4"
    $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8
    Remove-Item "frontend\package-lock.json" -ErrorAction SilentlyContinue
    Remove-Item "frontend\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "1/4 Stopping old containers (your data is kept)..." -ForegroundColor Yellow
docker compose down
Write-Host "2/4 Rebuilding everything from scratch (no cache). This takes a few minutes..." -ForegroundColor Yellow
docker compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "The BUILD FAILED, so the old containers would keep running. Scroll up for the red error and send it to me." -ForegroundColor Red
    exit 1
}
Write-Host "3/4 Starting..." -ForegroundColor Yellow
docker compose up -d

Write-Host "4/4 Waiting for the backend..." -ForegroundColor Yellow
$r = $null
for ($i = 0; $i -lt 45; $i++) {
    try { $r = Invoke-RestMethod "http://localhost:8000/" -TimeoutSec 2; break } catch { Start-Sleep -Seconds 2 }
}
if ($null -eq $r) { Write-Host "The backend did not answer. Run: docker compose logs backend --tail 60" -ForegroundColor Red; exit 1 }
Write-Host "Backend answers with version $($r.version) ($($r.build))"
if ($r.version -ne $expected) {
    Write-Host "MISMATCH: the running backend is $($r.version) but these files are $expected. Another copy may still be running on port 8000." -ForegroundColor Red
    docker ps
    exit 1
}
Write-Host ""
Write-Host "OK. Open http://localhost:3000 and press Ctrl+Shift+R." -ForegroundColor Green
Write-Host "In the sidebar footer you should read:  TRUSTSHARE v$expected" -ForegroundColor Green
Start-Process "http://localhost:3000"
