$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $repoRoot "frontend"

Push-Location $frontendPath
try {
    if (-not (Test-Path (Join-Path $frontendPath "node_modules"))) {
        npm install
    }
    npm run dev
}
finally {
    Pop-Location
}
