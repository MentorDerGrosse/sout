import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Entry points follow the electron-vite defaults:
// src/main/index.ts, src/preload/index.ts, src/renderer/index.html → out/
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
