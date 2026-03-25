#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup_tauri.sh — One-command setup for MyAtlas desktop app
#
# Run from your Mac terminal:
#   chmod +x ~/myatlas/src-tauri/setup_tauri.sh
#   ~/myatlas/src-tauri/setup_tauri.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
MYATLAS="$HOME/myatlas"
cd "$MYATLAS"

echo ""
echo "⬡ MyAtlas Desktop App — Setup"
echo "══════════════════════════════════════════════"
echo ""

# ── 1. Xcode Command Line Tools ───────────────────────────────────────────────
if ! xcode-select -p &>/dev/null; then
  echo "→ Installing Xcode Command Line Tools…"
  xcode-select --install
  echo "  ⚠  Install Xcode tools, then re-run this script."
  exit 1
fi
echo "✓ Xcode CLI tools"

# ── 2. Rust ───────────────────────────────────────────────────────────────────
if ! command -v rustc &>/dev/null; then
  echo "→ Installing Rust (rustup)…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
echo "✓ Rust $(rustc --version)"

# Ensure cargo is on PATH
export PATH="$HOME/.cargo/bin:$PATH"

# ── 3. Node packages ──────────────────────────────────────────────────────────
echo "→ Installing npm packages (incl. @tauri-apps/cli)…"
npm install
echo "✓ npm packages"

# ── 4. Generate app icons ─────────────────────────────────────────────────────
echo "→ Generating icons…"
python3 src-tauri/gen_icons.py
echo "✓ Icons"

# ── 5. Choose: dev mode or full build ─────────────────────────────────────────
echo ""
echo "Setup complete! What do you want to do?"
echo ""
echo "  [1] Dev mode  — hot-reload window (fastest for testing)"
echo "  [2] Full build — create MyAtlas.app you can put in /Applications"
echo ""
read -r -p "Enter 1 or 2: " CHOICE

case "$CHOICE" in
  1)
    echo ""
    echo "→ Launching dev window…"
    npm run tauri:dev
    ;;
  2)
    echo ""
    echo "→ Building MyAtlas.app…  (first build takes 3–5 min — Rust compiling)"
    npm run tauri:build
    echo ""
    APP_PATH=$(find "$MYATLAS/src-tauri/target/release/bundle/macos" -name "*.app" 2>/dev/null | head -1)
    if [ -n "$APP_PATH" ]; then
      echo "✓ Built: $APP_PATH"
      echo ""
      echo "→ Copying to ~/Applications…"
      mkdir -p "$HOME/Applications"
      cp -r "$APP_PATH" "$HOME/Applications/"
      echo "✓ MyAtlas.app is in ~/Applications"
      echo ""
      echo "  Open it:  open ~/Applications/MyAtlas.app"
      echo "  Dock it:  drag it from ~/Applications into your Dock"
      echo ""
      open "$HOME/Applications/MyAtlas.app" 2>/dev/null || true
    else
      echo "⚠  Could not find .app bundle — check src-tauri/target/release/bundle/"
    fi
    ;;
  *)
    echo "No action taken."
    ;;
esac
