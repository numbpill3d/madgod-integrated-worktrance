#!/usr/bin/env bash
# ============================================================
# MADGOD — installer
# supports: Arch Linux · Debian/Ubuntu · Fedora/RHEL · macOS
# usage:    bash install.sh
#           bash install.sh --no-build    (deps + sidecar only)
#           bash install.sh --launch-only (skip build, use launch.sh)
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

# ── colours ───────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
WHT='\033[1;37m'; DIM='\033[2m'; NC='\033[0m'

log()  { echo -e "${WHT}[madgod]${NC} $1"; }
ok()   { echo -e "${GRN}[  ok  ]${NC} $1"; }
warn() { echo -e "${YLW}[ warn ]${NC} $1"; }
die()  { echo -e "${RED}[ fail ]${NC} $1"; exit 1; }
step() { echo -e "\n${DIM}──────────────────────────────────────────${NC}"; log "$1"; }

NO_BUILD=0
LAUNCH_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-build)    NO_BUILD=1 ;;
    --launch-only) LAUNCH_ONLY=1 ;;
  esac
done

echo ""
echo -e "${WHT}  ╔════════════════════════════════════════╗${NC}"
echo -e "${WHT}  ║   MADGOD  installer  v0.1.0            ║${NC}"
echo -e "${WHT}  ╚════════════════════════════════════════╝${NC}"
echo ""

# ── detect OS / distro ────────────────────────────────────
PLATFORM="$(uname -s)"
ARCH_CPU="$(uname -m)"
DISTRO="unknown"

if [[ "$PLATFORM" == "Linux" ]]; then
  if [[ -f /etc/arch-release ]] || command -v pacman &>/dev/null; then
    DISTRO="arch"
  elif [[ -f /etc/debian_version ]] || command -v apt-get &>/dev/null; then
    DISTRO="debian"
  elif [[ -f /etc/fedora-release ]] || command -v dnf &>/dev/null; then
    DISTRO="fedora"
  elif command -v zypper &>/dev/null; then
    DISTRO="suse"
  fi
elif [[ "$PLATFORM" == "Darwin" ]]; then
  DISTRO="macos"
fi

log "platform: $PLATFORM ($ARCH_CPU)  distro: $DISTRO"

# ── quick-launch path: no build, just run in browser ──────
if [[ "$LAUNCH_ONLY" -eq 1 ]]; then
  log "launch-only mode — installing runtime deps and starting..."
  if [[ -f requirements.txt ]]; then
    pip3 install -r requirements.txt --break-system-packages -q 2>/dev/null \
      || pip3 install -r requirements.txt -q
  fi
  bash launch.sh
  exit 0
fi

# ── 1. SYSTEM PACKAGES ────────────────────────────────────
step "installing system dependencies"

_pacman_install() {
  local pkgs=("$@")
  local missing=()
  for p in "${pkgs[@]}"; do
    pacman -Qi "$p" &>/dev/null || missing+=("$p")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log "installing (pacman): ${missing[*]}"
    sudo pacman -S --needed --noconfirm "${missing[@]}"
  fi
}

_apt_install() {
  local pkgs=("$@")
  local missing=()
  for p in "${pkgs[@]}"; do
    dpkg -s "$p" &>/dev/null 2>&1 || missing+=("$p")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log "installing (apt): ${missing[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y -qq "${missing[@]}"
  fi
}

_dnf_install() {
  local pkgs=("$@")
  log "installing (dnf): ${pkgs[*]}"
  sudo dnf install -y "${pkgs[@]}"
}

case "$DISTRO" in
  arch)
    # Tauri 2 prerequisites for Arch Linux
    _pacman_install \
      webkit2gtk-4.1 base-devel curl wget file openssl \
      gtk3 libappindicator-gtk3 librsvg \
      nodejs npm python python-pip
    # appmenu-gtk-module is optional (app-menu integration)
    pacman -Qi appmenu-gtk-module &>/dev/null \
      || sudo pacman -S --needed --noconfirm appmenu-gtk-module 2>/dev/null \
      || warn "appmenu-gtk-module not found — skipping (optional)"
    ;;
  debian)
    _apt_install \
      libwebkit2gtk-4.1-dev build-essential curl wget file \
      libssl-dev libayatana-appindicator3-dev librsvg2-dev
    # nodejs — prefer NodeSource 20.x if packaged version is too old
    if ! command -v node &>/dev/null || [[ $(node --version | cut -c2-3) -lt 18 ]]; then
      log "installing Node.js 20 via NodeSource..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi
    ;;
  fedora)
    _dnf_install \
      webkit2gtk4.1-devel openssl-devel curl wget file \
      libappindicator-gtk3-devel librsvg2-devel \
      nodejs npm python3 python3-pip
    ;;
  suse)
    warn "openSUSE detected — ensure webkit2gtk3-soup2-devel and libappindicator3-devel are installed"
    ;;
  macos)
    if ! command -v brew &>/dev/null; then
      log "Homebrew not found — installing..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    ;;
  *)
    warn "unknown distro — make sure Tauri prerequisites are installed manually"
    warn "see: https://tauri.app/start/prerequisites/"
    ;;
esac
ok "system packages ready"

# ── 2. RUST ───────────────────────────────────────────────
step "checking Rust toolchain"
if ! command -v cargo &>/dev/null; then
  log "Rust not found — installing via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi
# source cargo env if not in PATH yet
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
ok "Rust $(rustc --version | cut -d' ' -f2)"

# ── 3. NODE ───────────────────────────────────────────────
step "checking Node.js"
if ! command -v node &>/dev/null; then
  # try nvm
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.nvm/nvm.sh"
  fi
  command -v node &>/dev/null || die "Node.js not found — install nodejs (v18+) and re-run"
fi
NODE_VER=$(node --version | tr -d 'v' | cut -d. -f1)
if [[ "$NODE_VER" -lt 18 ]]; then
  die "Node.js $(node --version) is too old — need v18+. Update nodejs."
fi
ok "Node $(node --version)"

# ── 4. PYTHON ─────────────────────────────────────────────
step "checking Python"
if ! command -v python3 &>/dev/null; then
  die "Python 3 not found — install python3 and re-run"
fi
ok "Python $(python3 --version | cut -d' ' -f2)"

# pip: prefer pipx-safe install, fall back to --break-system-packages
_pip() {
  pip3 install "$@" --break-system-packages -q 2>/dev/null \
    || pip3 install "$@" -q
}

# ── 5. PYTHON DEPS ────────────────────────────────────────
step "installing Python sidecar dependencies"
_pip -r requirements.txt
ok "Python deps ready"

# ── 6. NPM PACKAGES ───────────────────────────────────────
step "installing npm packages"
npm install --silent
ok "npm packages ready"

# ── 7. SKIP BUILD? ────────────────────────────────────────
if [[ "$NO_BUILD" -eq 1 ]]; then
  warn "--no-build set — skipping sidecar bundle and Tauri build"
  log "to build later: npm run sidecar:bundle && npm run build"
  exit 0
fi

# ── 8. PYINSTALLER + SIDECAR ─────────────────────────────
step "bundling Python sidecar (PyInstaller)"
if ! python3 -c "import PyInstaller" 2>/dev/null; then
  log "installing PyInstaller..."
  _pip pyinstaller
fi
log "building sidecar binary (~60-120s first time)..."
node scripts/bundle-sidecar.js
ok "sidecar binary ready"

# ── 9. BUILD TAURI APP ────────────────────────────────────
step "building MADGOD with Tauri (first build ~5-10 min)"
npm run build
ok "Tauri build complete"

# ── 10. INSTALL TO SYSTEM ────────────────────────────────
step "installing MADGOD as native app"

BUNDLE_DIR="src-tauri/target/release/bundle"
APPIMAGE="$(find "$BUNDLE_DIR/appimage" -name '*.AppImage' 2>/dev/null | head -1)"
ICON_SRC="src-tauri/icons/128x128.png"

if [[ -z "$APPIMAGE" && "$PLATFORM" == "Linux" ]]; then
  warn "AppImage not found — looking for raw binary..."
  APPIMAGE="src-tauri/target/release/madgod"
fi

if [[ "$PLATFORM" == "Linux" && -n "$APPIMAGE" && -f "$APPIMAGE" ]]; then
  APP_INSTALL_DIR="$HOME/Applications"
  ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
  DESKTOP_DIR="$HOME/.local/share/applications"

  mkdir -p "$APP_INSTALL_DIR" "$ICON_DIR" "$DESKTOP_DIR"

  DEST="$APP_INSTALL_DIR/MADGOD.AppImage"
  cp "$APPIMAGE" "$DEST"
  chmod +x "$DEST"
  ok "binary → $DEST"

  if [[ -f "$ICON_SRC" ]]; then
    cp "$ICON_SRC" "$ICON_DIR/madgod.png"
    ok "icon → $ICON_DIR/madgod.png"
  fi

  # write .desktop file
  cat > "$DESKTOP_DIR/madgod.desktop" <<DESK
[Desktop Entry]
Name=MADGOD
GenericName=Workspace Environment
Comment=knowledge graph · AI chat · generative visuals · ESP32 dev
Exec=$DEST
Icon=madgod
Type=Application
Categories=Utility;Development;Graphics;
Keywords=madgod;graph;obsidian;ai;esp32;
StartupNotify=true
StartupWMClass=MADGOD
Terminal=false
DESK

  ok ".desktop → $DESKTOP_DIR/madgod.desktop"
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
  ok "application launcher updated"

elif [[ "$PLATFORM" == "Darwin" ]]; then
  APP="$(find "$BUNDLE_DIR/macos" -name '*.app' 2>/dev/null | head -1)"
  if [[ -n "$APP" ]]; then
    log "copying $APP → /Applications..."
    cp -r "$APP" /Applications/
    ok "MADGOD.app installed to /Applications"
  fi
fi

# ── DONE ─────────────────────────────────────────────────
echo ""
echo -e "${WHT}  ╔════════════════════════════════════════╗${NC}"
echo -e "${WHT}  ║   MADGOD installed successfully        ║${NC}"
echo -e "${WHT}  ╚════════════════════════════════════════╝${NC}"
echo ""

if [[ "$PLATFORM" == "Linux" ]]; then
  echo -e "  ${DIM}launch via app menu  or:${NC}"
  echo -e "  ${WHT}$HOME/Applications/MADGOD.AppImage${NC}"
  echo ""
  echo -e "  ${DIM}quick dev launch (no rebuild needed):${NC}"
  echo -e "  ${WHT}bash launch.sh${NC}"
  echo ""
  if [[ "$DISTRO" == "arch" ]]; then
    echo -e "  ${DIM}Arch tip:${NC} MADGOD appears in your application launcher (rofi/wofi/bemenu/KDE/GNOME)"
    echo -e "  ${DIM}         log out and back in if the icon doesn't appear immediately${NC}"
    echo ""
  fi
elif [[ "$PLATFORM" == "Darwin" ]]; then
  echo -e "  ${DIM}launch from:${NC} /Applications/MADGOD.app"
  echo ""
fi

echo -e "  ${DIM}bundles also available in:${NC} src-tauri/target/release/bundle/"
echo ""
