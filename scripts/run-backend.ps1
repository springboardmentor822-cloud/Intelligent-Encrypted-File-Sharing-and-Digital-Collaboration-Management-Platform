$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot "backend"
$venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    python -m venv (Join-Path $backendPath ".venv")
    & (Join-Path $backendPath ".venv\Scripts\python.exe") -m pip install -r (Join-Path $backendPath "requirements.txt")
}

Push-Location $backendPath
try {
    & $venvPython -m uvicorn app.main:app --reload
}
finally {
    Pop-Location
}
