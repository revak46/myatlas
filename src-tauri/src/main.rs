// Prevents a second console window on Windows in release mode.
// Harmless on macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    myatlas_lib::run()
}
