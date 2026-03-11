# MADGOD — build & install guide

## TL;DR — one command

```bash
bash install.sh
```

That's it. Handles everything: system packages, Rust, Node, Python sidecar bundle, Tauri build, `.desktop` launcher registration.

After it finishes MADGOD appears in your application launcher (Rofi, wofi, KDE, GNOME, etc.).

---

## Arch Linux (primary target)

```bash
# clone
git clone https://github.com/numbpill3d/madgod-integrated-worktrance
cd madgod-integrated-worktrance

# install everything and register as native app
bash install.sh
```

The installer installs the required Tauri 2 build dependencies via `pacman`:

```
webkit2gtk-4.1  base-devel  openssl  curl  wget  file
gtk3  libappindicator-gtk3  librsvg  nodejs  npm  python  python-pip
```

After the build it:
- copies the AppImage to `~/Applications/MADGOD.AppImage`
- writes `~/.local/share/applications/madgod.desktop`
- installs the icon to `~/.local/share/icons/hicolor/128x128/apps/madgod.png`
- runs `update-desktop-database` so the launcher picks it up immediately

**Quick dev launch** (no Tauri build, opens in Chromium app-mode):
```bash
bash launch.sh
```

---

## Other Linux (Debian / Ubuntu / Fedora)

Same command — `install.sh` detects your distro and uses the right package manager:

| distro | package manager | key dep |
|---|---|---|
| Arch / Manjaro | `pacman` | `webkit2gtk-4.1` |
| Ubuntu 22+ / Debian 12+ | `apt` | `libwebkit2gtk-4.1-dev` |
| Fedora 38+ | `dnf` | `webkit2gtk4.1-devel` |

---

## macOS

```bash
bash install.sh
```

Requires Xcode command line tools (`xcode-select --install`). The installer puts
`MADGOD.app` in `/Applications`.

---

## Windows

```powershell
Set-ExecutionPolicy Bypass -Scope Process
.\install.ps1
```

---

## What gets built

| platform | output | location |
|---|---|---|
| Linux | `MADGOD_0.1.0_amd64.AppImage` | `src-tauri/target/release/bundle/appimage/` |
| Linux | `madgod_0.1.0_amd64.deb` | `src-tauri/target/release/bundle/deb/` |
| macOS | `MADGOD_0.1.0_aarch64.dmg` | `src-tauri/target/release/bundle/dmg/` |
| macOS | `MADGOD.app` | `src-tauri/target/release/bundle/macos/` |
| Windows | `MADGOD_0.1.0_x64_en-US.msi` | `src-tauri/target/release/bundle/msi/` |
| Windows | `MADGOD_0.1.0_x64-setup.exe` | `src-tauri/target/release/bundle/nsis/` |

---

## Architecture

```
MADGOD (Tauri 2 shell)
├── WebKitGTK / WebView2 / WKWebView  ← renders frontend
│   ├── index.html
│   ├── tauri-bridge.js               ← IPC: JS ↔ Rust
│   ├── graph.js / visual.js / ...    ← frontend modules
│   └── main.css
└── madgod-sidecar  (PyInstaller binary — zero Python install required)
    ├── FastAPI on localhost:8765
    ├── vault parsing + semantic embeddings
    ├── file I/O
    └── PlatformIO subprocess (ESP32)
```

`tauri-bridge.js` detects the Tauri environment and:
- asks Rust to spawn the sidecar automatically on launch
- injects window controls (minimize / maximize / close) for the custom titlebar
- patches file dialogs to native OS pickers

---

## Manual build steps

```bash
# 1. install JS deps
npm install

# 2. install Python sidecar deps
pip3 install -r requirements.txt

# 3. bundle sidecar → src-tauri/binaries/madgod-sidecar-<triple>
npm run sidecar:bundle

# 4. build Tauri app
npm run build

# 5. locate bundles
ls src-tauri/target/release/bundle/
```

---

## Dev mode (live reload, no bundle)

```bash
# terminal 1 — Python sidecar
npm run sidecar:dev

# terminal 2 — Tauri dev window (loads local files, Ctrl+R to reload)
npm run dev
```

Or the simpler browser-only dev loop:

```bash
bash launch.sh
```

---

## Syncing to GitHub

```bash
bash sync.sh                      # auto commit message + push
bash sync.sh "feat: my change"    # custom commit message
bash sync.sh --tag v0.2.0         # tag → triggers GitHub Actions release build
```

---

## GitHub Actions — automated releases

On every `git push origin main`: runs `cargo check` + `npm install` (fast CI).

On every version tag (`v*`): builds release binaries for Linux / macOS arm / macOS x86 / Windows and attaches them to a GitHub Release automatically.

```bash
# example: publish v0.2.0
bash sync.sh --tag v0.2.0
```

Watch the build at: https://github.com/numbpill3d/madgod-integrated-worktrance/actions

---

## Prerequisites summary

### Arch Linux
All installed automatically by `install.sh`. Manual equivalent:
```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg \
  nodejs npm python python-pip
```

### Ubuntu 22.04+
```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Fedora 38+
```bash
sudo dnf install -y \
  webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel nodejs npm python3 python3-pip
```

### macOS
```bash
xcode-select --install
```

### Windows
- Visual Studio Build Tools → "Desktop development with C++"
- WebView2 (ships with Win11; `install.ps1` handles Win10)
- `install.ps1` installs Rust + Node via winget automatically

---

## Icons

Replace placeholder icons before shipping:
```
src-tauri/icons/
├── 32x32.png
├── 128x128.png
├── 128x128@2x.png
├── icon.icns     ← macOS
├── icon.ico      ← Windows
└── icon.png      ← tray + Linux
```

Generate all sizes from a single 1024×1024 PNG:
```bash
npx tauri icon your-icon-1024.png
```

---

## Cross-compilation

Tauri does not support cross-compilation. Use GitHub Actions (included in `.github/workflows/release.yml`) to build each platform in CI:

```
.github/workflows/release.yml
├── check job     — cargo check + npm install on every push to main
└── release job   — full build for Linux / macOS arm+x86 / Windows on version tags
```
