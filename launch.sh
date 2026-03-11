#!/usr/bin/env bash
# ============================================================
# MADGOD launcher
# starts Python sidecar + opens browser
# ============================================================

set -e
cd "$(dirname "$0")"

SIDECAR_PORT=8765
WEB_PORT=8080
CHROMIUM_BIN=""

# ── find chromium/chrome ──────────────────────────────────
for bin in chromium chromium-browser google-chrome google-chrome-stable; do
  if command -v "$bin" &>/dev/null; then CHROMIUM_BIN="$bin"; break; fi
done

# ── parse args ────────────────────────────────────────────
SIDECAR_ONLY=0
WEB_ONLY=0
NO_BROWSER=0
for arg in "$@"; do
  case "$arg" in
    --sidecar-only) SIDECAR_ONLY=1 ;;
    --web-only)     WEB_ONLY=1 ;;
    --no-browser)   NO_BROWSER=1 ;;
    --help|-h)
      echo "MADGOD launcher"
      echo "  --sidecar-only   start only the Python sidecar"
      echo "  --web-only       start only the HTTP server"
      echo "  --no-browser     don't auto-open browser"
      exit 0 ;;
  esac
done

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   MADGOD v0.1.0                      ║"
echo "  ║   workspace operating environment    ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── check Python ──────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "[!] python3 not found — sidecar will not start"
  echo "    basic mode (no vault/embeddings/PIO) will still work"
  SIDECAR_ONLY=0
fi

# ── install sidecar deps (first run) ─────────────────────
if [ -f sidecar/requirements.txt ] && command -v python3 &>/dev/null; then
  if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "[*] installing sidecar dependencies..."
    pip3 install -r sidecar/requirements.txt --quiet --break-system-packages 2>/dev/null \
      || pip3 install -r sidecar/requirements.txt --quiet
  fi
fi

# ── start sidecar ─────────────────────────────────────────
SIDECAR_PID=""
if [ "$WEB_ONLY" -eq 0 ] && command -v python3 &>/dev/null && [ -f sidecar/main.py ]; then
  echo "[*] starting sidecar on port $SIDECAR_PORT..."
  python3 sidecar/main.py &
  SIDECAR_PID=$!
  sleep 1
  if kill -0 "$SIDECAR_PID" 2>/dev/null; then
    echo "[+] sidecar running (PID $SIDECAR_PID)"
  else
    echo "[!] sidecar failed to start (check Python deps)"
    SIDECAR_PID=""
  fi
fi

# ── start HTTP server ─────────────────────────────────────
if [ "$SIDECAR_ONLY" -eq 0 ]; then
  echo "[*] starting HTTP server on port $WEB_PORT..."
  if command -v python3 &>/dev/null; then
    python3 -m http.server $WEB_PORT --bind 127.0.0.1 &
    HTTP_PID=$!
  elif command -v npx &>/dev/null; then
    npx serve -l $WEB_PORT &
    HTTP_PID=$!
  else
    echo "[!] no HTTP server found — open index.html directly in Chromium"
    HTTP_PID=""
  fi
  sleep 0.5
fi

# ── open browser ──────────────────────────────────────────
URL="http://localhost:$WEB_PORT"
if [ "$NO_BROWSER" -eq 0 ] && [ "$SIDECAR_ONLY" -eq 0 ]; then
  if [ -n "$CHROMIUM_BIN" ]; then
    echo "[*] opening $URL in Chromium (Web Serial enabled)"
    "$CHROMIUM_BIN" --app="$URL" \
      --window-size=1600,1000 \
      --disable-web-security \
      --user-data-dir=/tmp/madgod-profile \
      --no-first-run \
      --disable-translate \
      --disable-extensions \
      2>/dev/null &
  elif command -v xdg-open &>/dev/null; then
    echo "[!] Chromium not found — opening with default browser"
    echo "    NOTE: Web Serial (ESP32 monitor) requires Chromium"
    xdg-open "$URL" 2>/dev/null &
  elif command -v firefox &>/dev/null; then
    echo "[!] opening in Firefox — Web Serial NOT available"
    firefox "$URL" &
  else
    echo "[!] no browser found — open $URL manually"
  fi
fi

echo ""
echo "  MADGOD running at $URL"
echo "  sidecar API: http://localhost:$SIDECAR_PORT"
[ -z "$CHROMIUM_BIN" ] && echo "  NOTE: install Chromium for full Web Serial / ESP32 support"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

# ── wait / cleanup ────────────────────────────────────────
trap 'echo ""; echo "[*] shutting down..."; [ -n "$SIDECAR_PID" ] && kill "$SIDECAR_PID" 2>/dev/null; [ -n "$HTTP_PID" ] && kill "$HTTP_PID" 2>/dev/null; exit 0' INT TERM

wait
