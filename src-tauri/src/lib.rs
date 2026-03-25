use std::fs;
use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::Manager;

/// Homebrew-aware PATH — includes the versioned libexec path where python@3.11 lives.
const HOMEBREW_PATH: &str =
    "/opt/homebrew/opt/python@3.11/libexec/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin";

/// Wait until a TCP port accepts connections (up to `max_secs`).
/// Returns true if the port opened, false if timed out.
fn wait_for_port(port: u16, max_secs: u64) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    let deadline = std::time::Instant::now() + Duration::from_secs(max_secs);
    while std::time::Instant::now() < deadline {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

/// Start a Helm service (if not already running) then open it in a
/// frameless Chrome --app window — same pattern as Helm System's own launcher.
#[tauri::command]
fn launch_service(service: String) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;

    let (script, port, url) = match service.as_str() {
        "helm_capture" => (
            format!("{}/Project_Atlas/helm-capture/helm_web.py", home),
            7777u16,
            "http://localhost:7777",
        ),
        "helm_system" => (
            format!("{}/Project_Atlas/helm-system/helm_system.py", home),
            7778u16,
            "http://localhost:7778",
        ),
        _ => return Err(format!("Unknown service: {}", service)),
    };

    // Only spawn if the port isn't already open
    if TcpStream::connect(format!("127.0.0.1:{}", port)).is_err() {
        // Use `python3` with explicit PATH so Homebrew's python3 (which has Flask)
        // is found even in a GUI-launched process where PATH is minimal.
        Command::new("python3")
            .arg(&script)
            .env("PATH", HOMEBREW_PATH)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not spawn python3: {}", e))?;

        // Wait up to 15 seconds for Flask to bind the port
        let ready = wait_for_port(port, 15);
        if !ready {
            return Err(format!(
                "Service timed out on port {}. Is Flask installed? Try: python3 -c 'import flask'",
                port
            ));
        }
    }

    // Open Chrome in --app mode (frameless) — identical to Helm System's launcher
    Command::new("open")
        .args([
            "-na", "Google Chrome",
            "--args",
            &format!("--app={}", url),
            "--window-size=1060,760",
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(format!("{} live on :{}", service, port))
}

/// Read the Helm System auth token from its token file.
/// Returns the token string, or an empty string if the file doesn't exist yet.
#[tauri::command]
fn read_helm_token() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let token_path = format!("{}/.helm_token", home);
    // Also check the canonical location inside Project_Atlas
    let canonical = format!("{}/Project_Atlas/helm-system/.helm_token", home);
    for path in [&canonical, &token_path] {
        if let Ok(t) = fs::read_to_string(path) {
            let trimmed = t.trim().to_string();
            if !trimmed.is_empty() {
                return Ok(trimmed);
            }
        }
    }
    Ok(String::new())  // Helm not started yet — MyAtlas will retry
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![launch_service, read_helm_token])
        .run(tauri::generate_context!())
        .expect("error while running MyAtlas");
}
