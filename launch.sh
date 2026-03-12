#!/usr/bin/env bash
# ============================================================
# MADGOD — quick launcher (no Tauri build required)
# starts Python sidecar + opens Chromium in app-mode window
#
# usage:
#   bash launch.sh                 # full launch
#   bash launch.sh --sidecar-only  # start sidecar only
#   bash launch.sh --web-only      # start HTTP server only
#   bash launch.sh --no-browser    # start services, no browser
#   bash launch.sh --port 9090     # custom HTTP port
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

SIDECAR_PORT=8765
WEB_PORT=8080
CHROMIUM_BIN=""

# ── parse args ────────────────────────────────────────────
SIDECAR_ONLY=0; WEB_ONLY=0; NO_BROWSER=0
for arg in "$@"; do
  case "$arg" in
    --sidecar-only) SIDECAR_ONLY=1 ;;
    --web-only)     WEB_ONLY=1 ;;
    --no-browser)   NO_BROWSER=1 ;;
    --port)         shift; WEB_PORT="${1:-8080}" ;;
    --help|-h)
      echo "MADGOD launcher"
      echo "  --sidecar-only   start only the Python sidecar"
      echo "  --web-only       start only the HTTP server"
      echo "  --no-browser     don't auto-open browser"
      echo "  --port <n>       HTTP port (default 8080)"
      exit 0 ;;
  esac
done

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   MADGOD v0.1.0                      ║"
echo "  ║   workspace operating environment    ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── find a Chromium-based browser ────────────────────────
# ordered by preference; chromium-freeworld for Fedora, etc.
for bin in \
    chromium \
    chromium-browser \
    chromium-freeworld \
    com.github.Eloston.UngoogledChromium \
    google-chrome \
    google-chrome-stable \
    google-chrome-beta \
    brave-browser \
    microsoft-edge \
    microsoft-edge-stable; do
  if command -v "$bin" &>/dev/null; then
    CHROMIUM_BIN="$bin"
    break
  fi
done

# Flatpak fallback
if [[ -z "$CHROMIUM_BIN" ]] && command -v flatpak &>/dev/null; then
  if flatpak list --app 2>/dev/null | grep -q "org.chromium.Chromium"; then
    CHROMIUM_BIN="flatpak run org.chromium.Chromium"
  fi
fi

# ── check Python ──────────────────────────────────────────
HAS_PYTHON=0
command -v python3 &>/dev/null && HAS_PYTHON=1

# ── auto-install sidecar deps on first run ───────────────
if [[ "$HAS_PYTHON" -eq 1 && -f requirements.txt ]]; then
  if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "[*] first run: installing sidecar dependencies..."

    # detect GPU — install CPU-only torch when there is no NVIDIA GPU
    # (avoids a ~2.5 GB CUDA download on Intel/AMD machines)
    _TORCH_INDEX="https://download.pytorch.org/whl/cpu"
    if command -v lspci &>/dev/null && lspci 2>/dev/null | grep -qi nvidia; then
      _TORCH_INDEX="https://download.pytorch.org/whl/cu121"
      echo "[*] NVIDIA GPU detected — using CUDA 12.1 build of PyTorch"
    else
      echo "[*] no NVIDIA GPU detected — using CPU-only PyTorch (~280 MB)"
    fi

    if ! python3 -c "import torch" 2>/dev/null; then
      echo "[*] downloading PyTorch..."
      pip3 install torch --index-url "$_TORCH_INDEX" \
        --break-system-packages 2>/dev/null \
        || pip3 install torch --index-url "$_TORCH_INDEX"
    fi

    pip3 install -r requirements.txt --break-system-packages 2>/dev/null \
      || pip3 install -r requirements.txt
  fi
fi

# ── start Python sidecar ─────────────────────────────────
SIDECAR_PID=""
if [[ "$WEB_ONLY" -eq 0 && "$HAS_PYTHON" -eq 1 && -f main.py ]]; then
  echo "[*] starting sidecar on :$SIDECAR_PORT..."
  python3 main.py &
  SIDECAR_PID=$!
  sleep 1
  if kill -0 "$SIDECAR_PID" 2>/dev/null; then
    echo "[+] sidecar running (PID $SIDECAR_PID)"
  else
    echo "[!] sidecar failed to start — check Python deps"
    SIDECAR_PID=""
  fi
elif [[ "$HAS_PYTHON" -eq 0 ]]; then
  echo "[!] python3 not found — sidecar disabled (vault/embeddings/PIO unavailable)"
fi

# ── start HTTP server ─────────────────────────────────────
HTTP_PID=""
if [[ "$SIDECAR_ONLY" -eq 0 ]]; then
  echo "[*] starting HTTP server on :$WEB_PORT..."
  if [[ "$HAS_PYTHON" -eq 1 ]]; then
    python3 -m http.server "$WEB_PORT" --bind 127.0.0.1 &
    HTTP_PID=$!
  elif command -v npx &>/dev/null; then
    npx --yes serve -l "$WEB_PORT" --no-clipboard &
    HTTP_PID=$!
  else
    echo "[!] no HTTP server available — open index.html directly"
    HTTP_PID=""
  fi
  sleep 0.4
fi

# ── open browser ─────────────────────────────────────────
URL="http://127.0.0.1:$WEB_PORT"
if [[ "$NO_BROWSER" -eq 0 && "$SIDECAR_ONLY" -eq 0 ]]; then
  if [[ -n "$CHROMIUM_BIN" ]]; then
    echo "[*] opening $URL  (Chromium app-mode — Web Serial enabled)"
    # shellcheck disable=SC2086
    $CHROMIUM_BIN \
      --app="$URL" \
      --window-size=1600,1000 \
      --user-data-dir="$HOME/.config/madgod-chromium" \
      --no-first-run \
      --disable-translate \
      --disable-sync \
      --no-default-browser-check \
      2>/dev/null &
  elif command -v xdg-open &>/dev/null; then
    echo "[!] Chromium not found — opening with default browser"
    echo "    NOTE: Web Serial (ESP32 monitor) requires a Chromium-based browser"
    xdg-open "$URL" 2>/dev/null &
  elif command -v open &>/dev/null; then
    # macOS
    open "$URL" &
  else
    echo "[!] no browser found — open $URL manually"
  fi
fi

echo ""
echo "  MADGOD  →  $URL"
echo "  sidecar →  http://127.0.0.1:$SIDECAR_PORT"
[[ -z "$CHROMIUM_BIN" ]] && echo "  NOTE: install Chromium for Web Serial / ESP32 monitor support"
echo ""
echo "  Ctrl+C to stop all services"
echo ""

# ── cleanup on exit ───────────────────────────────────────
trap 'echo ""; echo "[*] shutting down...";
  [[ -n "$SIDECAR_PID" ]] && kill "$SIDECAR_PID" 2>/dev/null || true;
  [[ -n "$HTTP_PID"    ]] && kill "$HTTP_PID"    2>/dev/null || true;
  exit 0' INT TERM

wait
