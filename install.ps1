# ============================================================
# MADGOD — Windows installer (PowerShell)
# Run in PowerShell (not cmd):
#   Set-ExecutionPolicy Bypass -Scope Process
#   .\install.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "MADGOD Installer"

function log  { Write-Host "[madgod] $args" -ForegroundColor Cyan }
function ok   { Write-Host "[  ok  ] $args" -ForegroundColor Green }
function warn { Write-Host "[ warn ] $args" -ForegroundColor Yellow }
function die  { Write-Host "[ fail ] $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  ╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   MADGOD  installer  (Windows)         ║" -ForegroundColor Cyan
Write-Host "  ╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── check winget / scoop ──────────────────────────────────
$HAS_WINGET = Get-Command winget -ErrorAction SilentlyContinue
$HAS_SCOOP  = Get-Command scoop  -ErrorAction SilentlyContinue

# ── Rust ──────────────────────────────────────────────────
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  log "Rust not found — installing via rustup..."
  if ($HAS_WINGET) {
    winget install --id Rustlang.Rustup -e --accept-package-agreements --accept-source-agreements
  } else {
    $rustup = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest "https://win.rustup.rs/x86_64" -OutFile $rustup
    Start-Process $rustup "-y" -Wait
    Remove-Item $rustup
  }
  $env:PATH += ";$env:USERPROFILE\.cargo\bin"
}
ok "Rust $(rustc --version)"

# ── Node.js ───────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  log "Node.js not found — installing..."
  if ($HAS_WINGET) {
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  } else {
    die "Node.js not found. Install from https://nodejs.org then re-run."
  }
  $env:PATH += ";$env:ProgramFiles\nodejs"
}
ok "Node $(node --version)"

# ── Python 3 ──────────────────────────────────────────────
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  log "Python not found — installing..."
  if ($HAS_WINGET) {
    winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
  } else {
    die "Python not found. Install from https://python.org then re-run."
  }
}
ok "Python $(python --version)"

# ── Visual C++ Build Tools (required for some Rust crates) ─
log "checking Visual C++ build tools..."
$VS_INSTALLED = Get-Command cl -ErrorAction SilentlyContinue
if (-not $VS_INSTALLED) {
  warn "Visual C++ build tools not detected"
  warn "If build fails, install: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
  warn "Select: Desktop development with C++"
}

# ── WebView2 (Tauri requires it, ships with Win11) ────────
log "checking WebView2..."
$WV2 = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
if (-not $WV2) {
  log "downloading WebView2 bootstrapper..."
  $wv2 = "$env:TEMP\MicrosoftEdgeWebview2Setup.exe"
  Invoke-WebRequest "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $wv2
  Start-Process $wv2 "/install" -Wait
  Remove-Item $wv2
}
ok "WebView2 ready"

# ── Python sidecar deps ───────────────────────────────────
log "installing Python sidecar dependencies..."
python -m pip install -r requirements.txt -q
ok "Python deps installed"

# ── PyInstaller ───────────────────────────────────────────
$PYI = python -c "import PyInstaller; print('ok')" 2>$null
if ($PYI -ne "ok") {
  log "installing PyInstaller..."
  python -m pip install pyinstaller -q
}
ok "PyInstaller ready"

# ── npm ───────────────────────────────────────────────────
log "installing npm packages..."
npm install --silent
ok "npm packages ready"

# ── bundle sidecar ────────────────────────────────────────
log "bundling Python sidecar with PyInstaller (60-120s)..."
node scripts/bundle-sidecar.js
ok "sidecar binary ready"

# ── Tauri build ───────────────────────────────────────────
log "building MADGOD with Tauri (first run: ~5-10 min)..."
npm run build
ok "build complete"

Write-Host ""
Write-Host "  ╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║   MADGOD built successfully            ║" -ForegroundColor Green
Write-Host "  ╚════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

$BUNDLE = "src-tauri\target\release\bundle"
$MSI    = Get-ChildItem "$BUNDLE\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$NSIS   = Get-ChildItem "$BUNDLE\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($MSI)  { Write-Host "  .msi installer: $($MSI.FullName)" -ForegroundColor DarkCyan }
if ($NSIS) { Write-Host "  .exe installer: $($NSIS.FullName)" -ForegroundColor DarkCyan }
Write-Host ""
Write-Host "  Double-click the installer to install MADGOD." -ForegroundColor White
Write-Host ""
