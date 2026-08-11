#!/usr/bin/env bash
# =============================================================================
#  Nyxora Installer — Linux & macOS
#  https://perasyudha.github.io/Nyxora/install.sh
# =============================================================================
set -euo pipefail

NYXORA_VERSION="latest"
REQUIRED_NODE_MAJOR=22
REQUIRED_PYTHON_MINOR=10

# ── Colors ──────────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
DIM="\033[2m"

info()    { echo -e "${CYAN}${BOLD}[Nyxora]${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}[Nyxora]${RESET} ✅ $*"; }
warn()    { echo -e "${YELLOW}${BOLD}[Nyxora]${RESET} ⚠️  $*"; }
error()   { echo -e "${RED}${BOLD}[Nyxora]${RESET} ❌ $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}━━━ $* ${RESET}"; }

# ── Banner ───────────────────────────────────────────────────────────────────
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
    ███╗   ██╗██╗   ██╗██╗  ██╗ ██████╗ ██████╗  █████╗
    ████╗  ██║╚██╗ ██╔╝╚██╗██╔╝██╔═══██╗██╔══██╗██╔══██╗
    ██╔██╗ ██║ ╚████╔╝  ╚███╔╝ ██║   ██║██████╔╝███████║
    ██║╚██╗██║  ╚██╔╝   ██╔██╗ ██║   ██║██╔══██╗██╔══██║
    ██║ ╚████║   ██║   ██╔╝ ██╗╚██████╔╝██║  ██║██║  ██║
    ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
EOF
echo -e "${RESET}"
echo -e "  ${DIM}Your Personal Web3 Assistant${RESET}"
echo -e "  ${DIM}https://github.com/perasyudha/Nyxora${RESET}\n"

# ── OS Detection ─────────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux*)  PLATFORM="linux";;
  Darwin*) PLATFORM="macos";;
  *)       error "Unsupported OS: $OS. Use install.ps1 on Windows.";;
esac

info "Platform: ${PLATFORM} (${ARCH})"

# ═════════════════════════════════════════════════════════════════════════════
#  STEP 1 — Node.js
# ═════════════════════════════════════════════════════════════════════════════
step "Step 1/3 — Checking Node.js"

install_node_via_nvm() {
  info "Installing Node.js ${REQUIRED_NODE_MAJOR} via nvm..."
  # Install nvm if not present
  if ! command -v nvm &>/dev/null && [ ! -f "$HOME/.nvm/nvm.sh" ]; then
    info "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  # Source nvm
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install "${REQUIRED_NODE_MAJOR}"
  nvm use "${REQUIRED_NODE_MAJOR}"
  nvm alias default "${REQUIRED_NODE_MAJOR}"
  success "Node.js $(node --version) installed via nvm."
}

if command -v node &>/dev/null; then
  NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge "$REQUIRED_NODE_MAJOR" ]; then
    success "Node.js $(node --version) — OK"
  else
    warn "Node.js v${NODE_MAJOR} found, but Nyxora requires v${REQUIRED_NODE_MAJOR}+."
    install_node_via_nvm
  fi
else
  warn "Node.js not found."
  install_node_via_nvm
fi

# Reload PATH after potential nvm install
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

command -v node &>/dev/null || error "Node.js installation failed. Please install Node.js ${REQUIRED_NODE_MAJOR}+ manually: https://nodejs.org"
command -v npm  &>/dev/null || error "npm not found after Node.js install."

# ═════════════════════════════════════════════════════════════════════════════
#  STEP 2 — Install Nyxora (zero warnings)
# ═════════════════════════════════════════════════════════════════════════════
step "Step 2/3 — Installing Nyxora"

info "Installing nyxora@${NYXORA_VERSION} from npm registry..."
info "Using --allow-scripts to ensure all components install correctly..."

# Explicitly allow all packages that require install scripts.
# This prevents npm's allow-scripts warnings while keeping security intent clear.
npm install -g \
  --allow-scripts=nyxora,@whiskeysockets/baileys,node-pty,unicode-animations,protobufjs \
  "nyxora@${NYXORA_VERSION}" \
  2>&1

success "Nyxora installed successfully!"

# ═════════════════════════════════════════════════════════════════════════════
#  STEP 3 — Python / ML Engine (optional but recommended)
# ═════════════════════════════════════════════════════════════════════════════
step "Step 3/3 — Checking Python (for ML Engine)"

PYTHON_CMD=""
ML_SKIP=false

for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    PY_VERSION=$($cmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge "$REQUIRED_PYTHON_MINOR" ]; then
      PYTHON_CMD="$cmd"
      success "Python ${PY_VERSION} found — OK"
      break
    fi
  fi
done

if [ -z "$PYTHON_CMD" ]; then
  warn "Python 3.${REQUIRED_PYTHON_MINOR}+ not found. ML Engine features will be unavailable."
  warn "Install Python 3.${REQUIRED_PYTHON_MINOR}+ and run: nyxora setup"
  ML_SKIP=true
fi

if [ "$ML_SKIP" = false ]; then
  NYXORA_DIR="$HOME/.nyxora"
  ML_ENGINE_DIR="$NYXORA_DIR/ml-engine"
  VENV_DIR="$ML_ENGINE_DIR/venv"

  if [ ! -d "$VENV_DIR" ]; then
    info "Setting up ML Engine virtual environment..."
    mkdir -p "$ML_ENGINE_DIR"
    $PYTHON_CMD -m venv "$VENV_DIR"

    PIP="$VENV_DIR/bin/pip"
    "$PIP" install --upgrade pip --quiet

    # Find requirements.txt from global npm install location
    NPM_ROOT=$(npm root -g 2>/dev/null || echo "")
    REQ_PATH=""
    if [ -n "$NPM_ROOT" ] && [ -f "$NPM_ROOT/nyxora/packages/ml-engine/requirements.txt" ]; then
      REQ_PATH="$NPM_ROOT/nyxora/packages/ml-engine/requirements.txt"
    fi

    if [ -n "$REQ_PATH" ]; then
      info "Installing Python ML dependencies (this may take a few minutes)..."
      "$PIP" install -r "$REQ_PATH" --quiet
      success "ML Engine dependencies installed!"
    else
      warn "requirements.txt not found. Run 'nyxora setup' to complete ML Engine setup."
    fi
  else
    success "ML Engine already installed — skipping."
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
#  Done
# ═════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   ✨  Nyxora installed successfully!                 ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  ${CYAN}1.${RESET} Run the setup wizard:   ${BOLD}nyxora setup${RESET}"
echo -e "  ${CYAN}2.${RESET} Start the daemon:        ${BOLD}nyxora start${RESET}"
echo -e "  ${CYAN}3.${RESET} Open the dashboard:      ${BOLD}nyxora dashboard${RESET}"
echo ""
echo -e "  ${DIM}Docs: https://perasyudha.github.io/Nyxora/${RESET}"
echo ""

# Remind user to reload shell if nvm was freshly installed
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  echo -e "  ${YELLOW}${BOLD}Note:${RESET} If 'nyxora' command is not found, reload your shell:"
  echo -e "  ${DIM}source ~/.bashrc   # or ~/.zshrc${RESET}"
  echo ""
fi
