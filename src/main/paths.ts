import { app } from 'electron'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Files from resources/ (icons): next to the project in development, in process.resourcesPath when packaged. */
export function resourcePath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name)
}

// Build output layout of electron-vite: out/main, out/preload, out/renderer.
export const preloadPath = (): string => join(__dirname, '../preload/index.js')
export const rendererHtml = (): string => join(__dirname, '../renderer/index.html')

/**
 * The command that starts sout, for a GNOME keyboard shortcut: the AppImage, the installed
 * package's `sout`, or from the project folder the one created by `npm run install-desktop`.
 */
export function launcherPath(): string | null {
  if (process.platform !== 'linux') return null
  if (app.isPackaged) return process.env['APPIMAGE'] ?? (existsSync('/usr/bin/sout') ? '/usr/bin/sout' : process.execPath)
  const path = join(homedir(), '.local', 'bin', 'sout')
  return existsSync(path) ? path : null
}
