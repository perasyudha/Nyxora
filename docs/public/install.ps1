# =============================================================================
#  Nyxora Installer — Windows (PowerShell)
#  https://perasyudha.github.io/Nyxora/install.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$NYXORA_VERSION  = "latest"
$REQUIRED_NODE   = 22
$REQUIRED_PYTHON = "3.10"

function Write-Step   { param($msg) Write-Host "`n━━━ $msg " -ForegroundColor Cyan }
function Write-Info   { param($msg) Write-Host "[Nyxora] $msg" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "[Nyxora] ✅ $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "[Nyxora] ⚠️  $msg" -ForegroundColor Yellow }
function Write-Fail   { param($msg) Write-Host "[Nyxora] ❌ $msg" -ForegroundColor Red; exit 1 }

# ── Banner ───────────────────────────────────────────────────────────────────
Write-Host @"

    ███╗   ██╗██╗   ██╗██╗  ██╗ ██████╗ ██████╗  █████╗
    ████╗  ██║╚██╗ ██╔╝╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗
    ██╔██╗ ██║ ╚████╔╝  ╚███╔╝ ██║   ██║██████╔╝███████║
    ██║╚██╗██║  ╚██╔╝   ██╔██╗ ██║   ██║██╔══██╗██╔══██║
    ██║ ╚████║   ██║   ██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║
    ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝

"@ -ForegroundColor Cyan
Write-Host "  Your Personal Web3 Assistant" -ForegroundColor DarkGray
Write-Host "  https://github.com/perasyudha/Nyxora`n" -ForegroundColor DarkGray

# ═════════════════════════════════════════════════════════════════════════════
#  STEP 1 — Node.js
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Step 1/3 — Checking Node.js"

$nodeInstalled = $false
try {
    $nodeVer = (node --version 2>$null).TrimStart("v")
    $nodeMajor = [int]($nodeVer.Split(".")[0])
    if ($nodeMajor -ge $REQUIRED_NODE) {
        Write-Ok "Node.js v$nodeVer — OK"
        $nodeInstalled = $true
    } else {
        Write-Warn "Node.js v$nodeMajor found, but Nyxora requires v${REQUIRED_NODE}+."
    }
} catch {}

if (-not $nodeInstalled) {
    Write-Info "Installing Node.js ${REQUIRED_NODE} via winget..."
    try {
        winget install --id OpenJS.NodeJS.LTS --version "${REQUIRED_NODE}.*" --accept-source-agreements --accept-package-agreements --silent
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Ok "Node.js installed."
    } catch {
        Write-Warn "winget install failed. Attempting via Chocolatey..."
        try {
            choco install nodejs-lts --version "${REQUIRED_NODE}" -y
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-Ok "Node.js installed via Chocolatey."
        } catch {
            Write-Fail "Could not auto-install Node.js. Please install manually: https://nodejs.org"
        }
    }
}

# ═════════════════════════════════════════════════════════════════════════════
#  STEP 2 — Install Nyxora (zero warnings)
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Step 2/3 — Installing Nyxora"

Write-Info "Installing nyxora@${NYXORA_VERSION} from npm registry..."
Write-Info "Using --allow-scripts to ensure all components install correctly..."

$allowScripts = "nyxora,@whiskeysockets/baileys,node-pty,unicode-animations,protobufjs"

npm install -g `
    "--allow-scripts=$allowScripts" `
    "nyxora@$NYXORA_VERSION"

if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed." }
Write-Ok "Nyxora installed successfully!"

# ═════════════════════════════════════════════════════════════════════════════
#  STEP 3 — Python / ML Engine
# ═════════════════════════════════════════════════════════════════════════════
Write-Step "Step 3/3 — Checking Python (for ML Engine)"

$pythonCmd = $null
$mlSkip = $false

foreach ($cmd in @("python", "python3", "py")) {
    try {
        $pyVer = & $cmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        $parts = $pyVer.Split(".")
        if ([int]$parts[0] -ge 3 -and [int]$parts[1] -ge 10) {
            $pythonCmd = $cmd
            Write-Ok "Python $pyVer found — OK"
            break
        }
    } catch {}
}

if (-not $pythonCmd) {
    Write-Warn "Python 3.10+ not found. ML Engine features will be unavailable."
    Write-Warn "Install Python 3.10+ from https://python.org and run: nyxora setup"
    $mlSkip = $true
}

if (-not $mlSkip) {
    $nyxoraDir  = Join-Path $env:USERPROFILE ".nyxora"
    $mlDir      = Join-Path $nyxoraDir "ml-engine"
    $venvDir    = Join-Path $mlDir "venv"

    if (-not (Test-Path $venvDir)) {
        Write-Info "Setting up ML Engine virtual environment..."
        New-Item -ItemType Directory -Force -Path $mlDir | Out-Null
        & $pythonCmd -m venv $venvDir

        $pip = Join-Path $venvDir "Scripts\pip.exe"
        & $pip install --upgrade pip --quiet

        $npmRoot = npm root -g 2>$null
        $reqPath = Join-Path $npmRoot "nyxora\packages\ml-engine\requirements.txt"

        if (Test-Path $reqPath) {
            Write-Info "Installing Python ML dependencies (this may take a few minutes)..."
            & $pip install -r $reqPath --quiet
            Write-Ok "ML Engine dependencies installed!"
        } else {
            Write-Warn "requirements.txt not found. Run 'nyxora setup' to complete ML Engine setup."
        }
    } else {
        Write-Ok "ML Engine already installed — skipping."
    }
}

# ═════════════════════════════════════════════════════════════════════════════
#  Done
# ═════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   ✨  Nyxora installed successfully!                 ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Run the setup wizard:   nyxora setup" -ForegroundColor Cyan
Write-Host "  2. Start the daemon:        nyxora start" -ForegroundColor Cyan
Write-Host "  3. Open the dashboard:      nyxora dashboard" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Docs: https://perasyudha.github.io/Nyxora/" -ForegroundColor DarkGray
Write-Host ""
