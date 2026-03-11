// ============================================================
// MADGOD — Tauri app core  (lib.rs)
// handles: sidecar lifecycle, IPC bridge, window chrome,
//          system tray, file dialogs, cross-platform quirks
// ============================================================

use std::sync::Mutex;
use tauri::{
    AppHandle, Manager, State,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// ── sidecar process state ────────────────────────────────────
struct SidecarState(Mutex<Option<CommandChild>>);

// ── Tauri IPC commands ───────────────────────────────────────

/// start the Python sidecar — called from JS on app init
#[tauri::command]
async fn start_sidecar(
    app: AppHandle,
    state: State<'_, SidecarState>,
) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // already running — return port
    if guard.is_some() {
        return Ok("8765".to_string());
    }

    let sidecar_cmd = app
        .shell()
        .sidecar("madgod-sidecar")
        .map_err(|e| format!("sidecar not found: {e}"))?;

    let (mut _rx, child) = sidecar_cmd
        .spawn()
        .map_err(|e| format!("sidecar spawn failed: {e}"))?;

    *guard = Some(child);

    // brief wait for FastAPI to come up
    tokio::time::sleep(tokio::time::Duration::from_millis(1200)).await;

    Ok("8765".to_string())
}

/// stop the sidecar — called on window close
#[tauri::command]
async fn stop_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| format!("kill failed: {e}"))?;
    }
    Ok(())
}

/// check if sidecar is alive
#[tauri::command]
fn sidecar_status(state: State<'_, SidecarState>) -> bool {
    state.0.lock().map(|g| g.is_some()).unwrap_or(false)
}

/// native file-open dialog — returns selected path(s)
#[tauri::command]
async fn dialog_open_file(
    app: AppHandle,
    title: String,
    filters: Vec<DialogFilter>,
    multiple: bool,
) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut builder = app.dialog().file().set_title(&title);
    for f in &filters {
        builder = builder.add_filter(&f.name, &f.extensions.iter().map(|s| s.as_str()).collect::<Vec<_>>());
    }
    if multiple {
        let paths = builder
            .blocking_pick_files()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.to_string())
            .collect();
        Ok(paths)
    } else {
        let path = builder
            .blocking_pick_file()
            .map(|p| vec![p.to_string()])
            .unwrap_or_default();
        Ok(path)
    }
}

/// native file-save dialog — returns chosen save path
#[tauri::command]
async fn dialog_save_file(
    app: AppHandle,
    title: String,
    default_name: String,
    filters: Vec<DialogFilter>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut builder = app
        .dialog()
        .file()
        .set_title(&title)
        .set_file_name(&default_name);
    for f in &filters {
        builder = builder.add_filter(&f.name, &f.extensions.iter().map(|s| s.as_str()).collect::<Vec<_>>());
    }
    let path = builder.blocking_save_file().map(|p| p.to_string());
    Ok(path)
}

/// native directory picker — for vault path selection
#[tauri::command]
async fn dialog_open_dir(app: AppHandle, title: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_title(&title)
        .blocking_pick_folder()
        .map(|p| p.to_string());
    Ok(path)
}

/// window controls (custom titlebar — decorations=false)
#[tauri::command]
fn window_minimize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[tauri::command]
fn window_maximize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let is_max = win.is_maximized().unwrap_or(false);
        if is_max { let _ = win.unmaximize(); } else { let _ = win.maximize(); }
    }
}

#[tauri::command]
fn window_close(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.close();
    }
}

/// open a URL in the system default browser
#[tauri::command]
async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

/// get platform string for JS feature detection
#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()  // "linux" | "windows" | "macos"
}

// ── helper types ─────────────────────────────────────────────
#[derive(serde::Deserialize)]
struct DialogFilter {
    name:       String,
    extensions: Vec<String>,
}

// ── system tray ──────────────────────────────────────────────
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show  = MenuItem::with_id(app, "show",  "Show MADGOD",  true, None::<&str>)?;
    let quit  = MenuItem::with_id(app, "quit",  "Quit",         true, None::<&str>)?;
    let menu  = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ── app entry ────────────────────────────────────────────────
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            start_sidecar,
            stop_sidecar,
            sidecar_status,
            dialog_open_file,
            dialog_save_file,
            dialog_open_dir,
            window_minimize,
            window_maximize,
            window_close,
            open_external,
            get_platform,
        ])
        .setup(|app| {
            build_tray(app.handle())?;

            // auto-start sidecar
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<SidecarState>();
                match start_sidecar(handle.clone(), state).await {
                    Ok(_)  => eprintln!("[madgod] sidecar started"),
                    Err(e) => eprintln!("[madgod] sidecar error: {e}"),
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // kill sidecar when window closes
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<SidecarState>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running MADGOD");
}
