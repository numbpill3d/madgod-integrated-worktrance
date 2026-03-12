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
WHT='\033[1;37m'; DIM='\033[2m'; CYN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "  ${WHT}▸${NC} $1"; }
ok()   { echo -e "  ${GRN}✓${NC} $1"; }
warn() { echo -e "  ${YLW}⚠${NC} $1"; }
die()  { echo -e "  ${RED}✗${NC} $1"; exit 1; }

step() {
  echo ""
  echo -e "  ${CYN}┌─────────────────────────────────────────────────┐${NC}"
  printf  "  ${CYN}│${NC}  ${WHT}%-47s${NC}  ${CYN}│${NC}\n" "$1"
  echo -e "  ${CYN}└─────────────────────────────────────────────────┘${NC}"
}

download_box() {
  # $1 = label  $2 = size note (optional)
  echo ""
  echo -e "  ${YLW}╔═══════════════════════════════════════════════════╗${NC}"
  printf  "  ${YLW}║${NC}  ${WHT}⬇  %-47s${YLW}║${NC}\n" "$1"
  if [[ -n "${2:-}" ]]; then
    printf "  ${YLW}║${NC}  ${DIM}%-49s${YLW}║${NC}\n" "$2"
  fi
  echo -e "  ${YLW}╚═══════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ── spinner ───────────────────────────────────────────────
_SPIN_PID=""
_spin_chars=('◐' '◓' '◑' '◒')

_spin_start() {
  local msg="$1"
  local i=0
  (
    while true; do
      printf "\r  ${YLW}%s${NC}  %s   " "${_spin_chars[$i]}" "$msg" >&2
      i=$(( (i+1) % 4 ))
      sleep 0.1
    done
  ) &
  _SPIN_PID=$!
}

_spin_stop() {
  if [[ -n "$_SPIN_PID" ]]; then
    kill "$_SPIN_PID" 2>/dev/null || true
    wait "$_SPIN_PID" 2>/dev/null || true
    _SPIN_PID=""
    printf "\r\033[K" >&2
  fi
}

# run command silently with spinner; die on failure
spin_run() {
  local msg="$1"; shift
  _spin_start "$msg"
  local log_file
  log_file=$(mktemp /tmp/madgod_XXXXXX.log)
  if "$@" >"$log_file" 2>&1; then
    _spin_stop
    ok "$msg"
    rm -f "$log_file"
  else
    _spin_stop
    echo -e "  ${RED}✗${NC} $msg failed — last lines:"
    tail -20 "$log_file" | sed 's/^/    /'
    rm -f "$log_file"
    exit 1
  fi
}

# ── parse args ────────────────────────────────────────────
NO_BUILD=0
LAUNCH_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-build)    NO_BUILD=1 ;;
    --launch-only) LAUNCH_ONLY=1 ;;
  esac
done

# ── banner ────────────────────────────────────────────────
echo ""
echo -e "${WHT}  ╔══════════════════════════════════════════════╗${NC}"
echo -e "${WHT}  ║   MADGOD  installer  v0.1.0                  ║${NC}"
echo -e "${WHT}  ║   workspace operating environment            ║${NC}"
echo -e "${WHT}  ╚══════════════════════════════════════════════╝${NC}"
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

log "platform : $PLATFORM ($ARCH_CPU)"
log "distro   : $DISTRO"

# ── detect GPU — choose PyTorch variant ──────────────────
GPU_VENDOR="cpu"
if command -v lspci &>/dev/null; then
  if lspci 2>/dev/null | grep -qi nvidia; then
    GPU_VENDOR="nvidia"
  elif lspci 2>/dev/null | grep -qi 'amd\|radeon'; then
    GPU_VENDOR="amd"
  elif lspci 2>/dev/null | grep -qi 'intel.*graphics\|intel.*uhd\|intel.*hd\|intel.*iris'; then
    GPU_VENDOR="intel"
  fi
fi

if [[ "$GPU_VENDOR" == "nvidia" ]]; then
  TORCH_INDEX="https://download.pytorch.org/whl/cu121"
  TORCH_LABEL="CUDA 12.1  (NVIDIA GPU)"
  TORCH_SIZE="~2.5 GB — this will take a while"
else
  TORCH_INDEX="https://download.pytorch.org/whl/cpu"
  TORCH_LABEL="CPU-only   (no NVIDIA GPU — Intel/AMD integrated)"
  TORCH_SIZE="~280 MB — much smaller than the CUDA build"
fi

log "GPU      : $GPU_VENDOR  →  PyTorch: $TORCH_LABEL"

# ── pip helper ────────────────────────────────────────────
_pip() {
  pip3 install "$@" --break-system-packages 2>/dev/null \
    || pip3 install "$@"
}

# ── quick-launch path ────────────────────────────────────
if [[ "$LAUNCH_ONLY" -eq 1 ]]; then
  log "launch-only mode — installing runtime deps and starting..."
  if [[ -f requirements.txt ]]; then
    if ! python3 -c "import torch" 2>/dev/null; then
      download_box "PyTorch ($TORCH_LABEL)" "$TORCH_SIZE"
      _pip torch --index-url "$TORCH_INDEX"
    fi
    _pip -r requirements.txt
  fi
  bash launch.sh
  exit 0
fi

# ══════════════════════════════════════════════════════════
# STEP 1 — system packages
# ══════════════════════════════════════════════════════════
step "1 / 8  ·  system packages"

_pacman_install() {
  local missing=()
  for p in "$@"; do
    pacman -Qi "$p" &>/dev/null || missing+=("$p")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    download_box "pacman: ${missing[*]}" "fetching from Arch repos"
    sudo pacman -S --needed --noconfirm "${missing[@]}"
  fi
}

_apt_install() {
  local missing=()
  for p in "$@"; do
    dpkg -s "$p" &>/dev/null 2>&1 || missing+=("$p")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    download_box "apt: ${missing[*]}" "fetching from Debian/Ubuntu repos"
    sudo apt-get update -qq
    sudo apt-get install -y "${missing[@]}"
  fi
}

_dnf_install() {
  download_box "dnf: $*" "fetching from Fedora repos"
  sudo dnf install -y "$@"
}

case "$DISTRO" in
  arch)
    _pacman_install \
      webkit2gtk-4.1 base-devel curl wget file openssl \
      gtk3 libappindicator-gtk3 librsvg \
      nodejs npm python python-pip
    pacman -Qi appmenu-gtk-module &>/dev/null \
      || sudo pacman -S --needed --noconfirm appmenu-gtk-module 2>/dev/null \
      || warn "appmenu-gtk-module not found — skipping (optional)"
    ;;
  debian)
    _apt_install \
      libwebkit2gtk-4.1-dev build-essential curl wget file \
      libssl-dev libayatana-appindicator3-dev librsvg2-dev
    if ! command -v node &>/dev/null || [[ $(node --version | cut -c2-3) -lt 18 ]]; then
      download_box "Node.js 20 via NodeSource" "~30 MB"
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
      download_box "Homebrew" "macOS package manager"
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    ;;
  *)
    warn "unknown distro — make sure Tauri prerequisites are installed manually"
    warn "see: https://tauri.app/start/prerequisites/"
    ;;
esac
ok "system packages ready"

# ══════════════════════════════════════════════════════════
# STEP 2 — Rust
# ══════════════════════════════════════════════════════════
step "2 / 8  ·  Rust toolchain"

if ! command -v cargo &>/dev/null; then
  download_box "Rust via rustup" "~80 MB — installs to ~/.cargo"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi
# ensure cargo env is loaded
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
ok "Rust $(rustc --version | cut -d' ' -f2)"

# ══════════════════════════════════════════════════════════
# STEP 3 — Node.js
# ══════════════════════════════════════════════════════════
step "3 / 8  ·  Node.js"

if ! command -v node &>/dev/null; then
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

# ══════════════════════════════════════════════════════════
# STEP 4 — Python
# ══════════════════════════════════════════════════════════
step "4 / 8  ·  Python"

if ! command -v python3 &>/dev/null; then
  die "Python 3 not found — install python3 and re-run"
fi
ok "Python $(python3 --version | cut -d' ' -f2)"

# ══════════════════════════════════════════════════════════
# STEP 5 — PyTorch (CPU vs CUDA auto-selected)
# ══════════════════════════════════════════════════════════
step "5 / 8  ·  PyTorch ($TORCH_LABEL)"

if python3 -c "import torch" 2>/dev/null; then
  ok "PyTorch already installed — skipping"
else
  download_box "PyTorch  ($TORCH_LABEL)" "$TORCH_SIZE — one-time download"
  log "index: $TORCH_INDEX"
  echo ""
  _pip torch --index-url "$TORCH_INDEX"
  ok "PyTorch installed (${TORCH_LABEL})"
fi

# ══════════════════════════════════════════════════════════
# STEP 6 — Python sidecar deps
# ══════════════════════════════════════════════════════════
step "6 / 8  ·  Python sidecar dependencies"

download_box "pip: requirements.txt" "fastapi, uvicorn, sentence-transformers, watchdog..."
echo ""
_pip -r requirements.txt
ok "Python deps ready"

# ══════════════════════════════════════════════════════════
# STEP 7 — npm
# ══════════════════════════════════════════════════════════
step "7 / 8  ·  npm packages"

download_box "npm install" "Tauri CLI + API  (~50 MB on first run)"
echo ""
npm install
ok "npm packages ready"

# ── skip build? ───────────────────────────────────────────
if [[ "$NO_BUILD" -eq 1 ]]; then
  warn "--no-build set — skipping sidecar bundle and Tauri build"
  log "to build later: npm run sidecar:bundle && npm run build"
  exit 0
fi

# ══════════════════════════════════════════════════════════
# STEP 8a — PyInstaller sidecar bundle
# ══════════════════════════════════════════════════════════
step "8a/ 8  ·  PyInstaller sidecar bundle"

if ! python3 -c "import PyInstaller" 2>/dev/null; then
  spin_run "installing PyInstaller" _pip pyinstaller
fi

download_box "PyInstaller bundle" "packing Python runtime into binary (~60-120 s)"
echo ""
node scripts/bundle-sidecar.js
ok "sidecar binary ready"

# ══════════════════════════════════════════════════════════
# STEP 8b — Tauri build
# ══════════════════════════════════════════════════════════
step "8b/ 8  ·  Tauri build"

download_box "npm run build  (Tauri + Rust)" "first build: ~5-10 min — grab a coffee"
echo ""
npm run build
ok "Tauri build complete"

# ══════════════════════════════════════════════════════════
# INSTALL to system
# ══════════════════════════════════════════════════════════
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
  spin_run "copying binary to $DEST" cp "$APPIMAGE" "$DEST"
  chmod +x "$DEST"

  if [[ -f "$ICON_SRC" ]]; then
    spin_run "installing icon" cp "$ICON_SRC" "$ICON_DIR/madgod.png"
  fi

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
    spin_run "copying $APP to /Applications" cp -r "$APP" /Applications/
    ok "MADGOD.app installed to /Applications"
  fi
fi

# ══════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════
echo ""
echo -e "${GRN}  ╔══════════════════════════════════════════════╗${NC}"
echo -e "${GRN}  ║   MADGOD installed successfully  ✓           ║${NC}"
echo -e "${GRN}  ╚══════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$PLATFORM" == "Linux" ]]; then
  echo -e "  ${DIM}launch via app menu  or:${NC}"
  echo -e "  ${WHT}$HOME/Applications/MADGOD.AppImage${NC}"
  echo ""
  echo -e "  ${DIM}quick dev launch (no rebuild needed):${NC}"
  echo -e "  ${WHT}bash launch.sh${NC}"
  echo ""
  if [[ "$DISTRO" == "arch" ]]; then
    echo -e "  ${DIM}Arch tip:${NC} MADGOD appears in your app launcher (rofi/wofi/KDE/GNOME)"
    echo -e "  ${DIM}          log out and back in if the icon doesn't appear immediately${NC}"
    echo ""
  fi
elif [[ "$PLATFORM" == "Darwin" ]]; then
  echo -e "  ${DIM}launch from:${NC} /Applications/MADGOD.app"
  echo ""
fi

echo -e "  ${DIM}GPU used: ${NC}${GPU_VENDOR}  →  PyTorch: ${TORCH_LABEL}"
echo -e "  ${DIM}bundles: ${NC}src-tauri/target/release/bundle/"
echo ""
