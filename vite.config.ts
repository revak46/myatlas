import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Note: port 5173 is fixed so Tauri knows where to connect during `tauri dev`.
export default defineConfig({
  plugins: [react()],

  // Vite dev server — Tauri expects this exact port
  server: {
    port: 5173,
    strictPort: true,        // abort if port is taken (don't silently switch)
    host: 'localhost',
    watch: {
      // Tauri's file watcher handles reloads; this prevents double-triggers
      ignored: ['**/src-tauri/**'],
    },
  },

  // Tauri uses the dist/ folder for the production bundle
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Improve compatibility with Tauri's WebView
    target: ['es2021', 'chrome105', 'safari15'],
  },

  // Allow imports from src/
  resolve: {
    alias: {
      '@': '/src',
    },
  },

  // Prevent Vite from hiding Rust errors
  clearScreen: false,
})
