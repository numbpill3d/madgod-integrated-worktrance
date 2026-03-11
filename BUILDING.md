# MADGOD — build guide

## one-command install

**Linux / macOS**
```bash
bash install.sh
```

**Windows** (PowerShell, run as Administrator first time for deps)
```powershell
Set-ExecutionPolicy Bypass -Scope Process
.\install.ps1
```

That's it. Both scripts handle everything: Rust, Node, Python deps, PyInstaller sidecar bundle, Tauri build.

---

## what gets built

| platform | output | location |
|---|---|---|
| Linux | `MADGOD_0.1.0_amd64.AppImage` | `src-tauri/target/release/bundle/appimage/` |
| Linux | `madgod_0.1.0_amd64.deb` | `src-tauri/target/release/bundle/deb/` |
| macOS | `MADGOD_0.1.0_x64.dmg` | `src-tauri/target/release/bundle/dmg/` |
| macOS | `MADGOD.app` | `src-tauri/target/release/bundle/macos/` |
| Windows | `MADGOD_0.1.0_x64_en-US.msi` | `src-tauri/target/release/bundle/msi/` |
| Windows | `MADGOD_0.1.0_x64-setup.exe` | `src-tauri/target/release/bundle/nsis/` |

---

## how it works

```
MADGOD (Tauri shell)
├── WebKitGTK / WebView2 / WKWebView  ← renders frontend
│   ├── index.html
│   ├── tauri-bridge.js               ← IPC between JS and Rust
│   ├── state.js … visual.js          ← existing frontend unchanged
│   └── main.css
└── madgod-sidecar (PyInstaller binary)
    ├── FastAPI on localhost:8765
    ├── vault parsing + embeddings
    ├── file I/O
    └── PlatformIO subprocess
```

The sidecar is a self-contained PyInstaller binary — Python, FastAPI,
sentence-transformers, torch, all bundled in. Users need zero Python installed.

The frontend is unchanged from the browser version. `tauri-bridge.js` detects
the Tauri environment and:
- asks Rust to spawn the sidecar
- injects window control buttons (minimize/maximize/close) since decorations=false
- patches file dialogs to use native OS pickers instead of browser input[type=file]

---

## manual build steps

If you want to run each step individually:

```bash
# 1. install JS deps
npm install

# 2. install Python sidecar deps
pip3 install -r requirements.txt

# 3. bundle sidecar → src-tauri/binaries/madgod-sidecar-<triple>
npm run sidecar:bundle

# 4. build Tauri app
npm run build

# 5. find your bundle
ls src-tauri/target/release/bundle/
```

---

## dev mode (no bundle, hot-ish reload)

```bash
# terminal 1 — run sidecar directly
npm run sidecar:dev

# terminal 2 — Tauri dev window (loads frontend live)
npm run dev
```

In dev mode Tauri opens a window pointing at the local files.
Changes to JS/CSS are visible on reload (Ctrl+R).
Rust changes require `npm run dev` restart.

---

## prerequisites by platform

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```
install.sh handles this automatically.

### Linux (Arch)
```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg \
  libvips
```

### macOS
Xcode command line tools required:
```bash
xcode-select --install
```

### Windows
- Visual Studio Build Tools with "Desktop development with C++"
- WebView2 (ships with Windows 11, install.ps1 gets it on Win10)
- install.ps1 handles Rust + Node via winget

---

## cross-compilation

Tauri does not support cross-compilation out of the box.
Build each platform on its own machine or use GitHub Actions:

```yaml
# .github/workflows/release.yml
jobs:
  build:
    strategy:
      matrix:
        platform: [ubuntu-22.04, macos-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements.txt pyinstaller
      - run: npm install
      - run: node scripts/bundle-sidecar.js
      - uses: tauri-apps/tauri-action@v0
        with:
          tagName: v${{ github.ref_name }}
          releaseName: MADGOD v${{ github.ref_name }}
```

---

## adding icons

Replace the placeholder icons before shipping:
```
src-tauri/icons/
├── 32x32.png
├── 128x128.png
├── 128x128@2x.png
├── icon.icns        ← macOS
├── icon.ico         ← Windows
└── icon.png         ← tray
```

Generate all sizes from a single 1024×1024 PNG:
```bash
npm install -g @tauri-apps/cli
npx tauri icon your-icon-1024.png
```
