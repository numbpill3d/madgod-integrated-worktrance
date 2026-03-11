#!/usr/bin/env bash
# ============================================================
# MADGOD — install script
# Linux / macOS: bash install.sh
# Windows:       see instructions printed at the end
# ============================================================

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; DIM='\033[2m'; NC='\033[0m'

log()  { echo -e "${BLU}[madgod]${NC} $1"; }
ok()   { echo -e "${GRN}[  ok  ]${NC} $1"; }
warn() { echo -e "${YLW}[ warn ]${NC} $1"; }
die()  { echo -e "${RED}[ fail ]${NC} $1"; exit 1; }

echo ""
echo -e "${BLU}  ╔════════════════════════════════════════╗${NC}"
echo -e "${BLU}  ║   MADGOD  installer                    ║${NC}"
echo -e "${BLU}  ╚════════════════════════════════════════╝${NC}"
echo ""

PLATFORM="$(uname -s 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"

# ── dependency checks ─────────────────────────────────────

log "checking dependencies..."

# Rust / cargo
if ! command -v cargo &>/dev/null; then
  log "Rust not found — installing via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  source "$HOME/.cargo/env"
fi
ok "Rust $(rustc --version | cut -d' ' -f2)"

# Node / npm
if ! command -v node &>/dev/null; then
  die "Node.js not found — install from https://nodejs.org (v18+) then re-run"
fi
ok "Node $(node --version)"

# Python 3
if ! command -v python3 &>/dev/null; then
  die "Python 3 not found — install python3 then re-run"
fi
ok "Python $(python3 --version | cut -d' ' -f2)"

# PyInstaller
if ! python3 -c "import PyInstaller" 2>/dev/null; then
  log "installing PyInstaller..."
  pip3 install pyinstaller --break-system-packages 2>/dev/null \
    || pip3 install pyinstaller
fi
ok "PyInstaller ready"

# Python sidecar deps
log "installing Python sidecar dependencies..."
pip3 install -r requirements.txt --break-system-packages -q 2>/dev/null \
  || pip3 install -r requirements.txt -q
ok "Python deps installed"

# Tauri Linux system deps
if [[ "$PLATFORM" == "Linux" ]]; then
  log "checking Linux Tauri build dependencies..."
  MISSING=()
  for pkg in \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev; do
    dpkg -s "$pkg" &>/dev/null || MISSING+=("$pkg")
  done
  if [ ${#MISSING[@]} -gt 0 ]; then
    warn "missing packages: ${MISSING[*]}"
    log "installing (requires sudo)..."
    sudo apt-get update -q
    sudo apt-get install -y "${MISSING[@]}"
  fi
  ok "Linux deps satisfied"
fi

# ── node modules ──────────────────────────────────────────
log "installing npm packages..."
npm install --silent
ok "npm packages ready"

# ── bundle Python sidecar ────────────────────────────────
log "bundling Python sidecar with PyInstaller..."
log "(first run takes 60-120s — packages torch + sentence-transformers)"
node scripts/bundle-sidecar.js
ok "sidecar binary ready"

# ── build Tauri app ───────────────────────────────────────
log "building MADGOD with Tauri..."
log "(first Tauri build downloads Rust crates — ~5-10 min)"
npm run build
ok "build complete"

echo ""
echo -e "${GRN}  ╔════════════════════════════════════════╗${NC}"
echo -e "${GRN}  ║   MADGOD built successfully            ║${NC}"
echo -e "${GRN}  ╚════════════════════════════════════════╝${NC}"
echo ""

# ── show bundle location ──────────────────────────────────
BUNDLE_DIR="src-tauri/target/release/bundle"
if [[ "$PLATFORM" == "Linux" ]]; then
  echo -e "  ${DIM}AppImage:${NC} $(find $BUNDLE_DIR/appimage -name '*.AppImage' 2>/dev/null | head -1)"
  echo -e "  ${DIM}.deb:    ${NC} $(find $BUNDLE_DIR/deb -name '*.deb' 2>/dev/null | head -1)"
elif [[ "$PLATFORM" == "Darwin" ]]; then
  echo -e "  ${DIM}.dmg:    ${NC} $(find $BUNDLE_DIR/dmg -name '*.dmg' 2>/dev/null | head -1)"
  echo -e "  ${DIM}.app:    ${NC} $(find $BUNDLE_DIR/macos -name '*.app' 2>/dev/null | head -1)"
fi

echo ""
echo -e "  all bundles in: ${DIM}src-tauri/target/release/bundle/${NC}"
echo ""
echo -e "  ${DIM}to install on this machine:${NC}"

if [[ "$PLATFORM" == "Linux" ]]; then
  DEB="$(find $BUNDLE_DIR/deb -name '*.deb' 2>/dev/null | head -1)"
  APPIMG="$(find $BUNDLE_DIR/appimage -name '*.AppImage' 2>/dev/null | head -1)"
  echo -e "    .deb:      ${BLU}sudo dpkg -i $DEB${NC}"
  echo -e "    AppImage:  ${BLU}chmod +x $APPIMG && $APPIMG${NC}"
elif [[ "$PLATFORM" == "Darwin" ]]; then
  DMG="$(find $BUNDLE_DIR/dmg -name '*.dmg' 2>/dev/null | head -1)"
  echo -e "    drag .app: ${BLU}open $DMG${NC}"
fi

echo ""
echo -e "  ${DIM}Windows users:${NC} run install.ps1 in PowerShell"
echo ""
