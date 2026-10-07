import { app } from 'electron'
import { execFile, execFileSync } from 'node:child_process'
import type { AppInfo } from '../shared/types'

export const X11_FLAG = '--ozone-platform=x11'

/**
 * Under XWayland with fractional scaling, X11 apps draw at 2x and GNOME scales them down. Chromium
 * then loads the mouse cursor at the unscaled size, so it shrinks over our windows. GNOME publishes
 * the right X11 size as the Xcursor.size resource; hand it to Chromium via XCURSOR_SIZE.
 */
export function fixCursorSize(): void {
  if (process.env['XCURSOR_SIZE'] || !process.argv.includes(X11_FLAG)) return
  try {
    const resources = execFileSync('xrdb', ['-query'], { encoding: 'utf8', timeout: 2000 })
    const size = /^Xcursor\.size:\s*(\d+)/m.exec(resources)?.[1]
    if (size) process.env['XCURSOR_SIZE'] = size
  } catch {
    // No xrdb: keep Chromium's default size.
  }
}

/**
 * Command line flags sout needs. Wayland doesn't let apps place their own windows, but the mini
 * window has to sit under the tray icon – through XWayland it can. Electron picks the display
 * backend before any of our code runs, so this only works as a real command line flag.
 */
export function displayArgs(): string[] {
  return process.platform === 'linux' && process.env['DISPLAY'] ? [X11_FLAG] : []
}

/**
 * Is anything running that can show tray icons? GNOME only has that with the AppIndicator
 * extension, which provides org.kde.StatusNotifierWatcher on the session bus. null = could not check.
 */
export function trayHostAvailable(): Promise<boolean | null> {
  if (process.platform !== 'linux') return Promise.resolve(true)
  return new Promise((resolve) => {
    execFile(
      'gdbus',
      [
        'call', '--session',
        '--dest', 'org.freedesktop.DBus',
        '--object-path', '/org/freedesktop/DBus',
        '--method', 'org.freedesktop.DBus.NameHasOwner',
        'org.kde.StatusNotifierWatcher'
      ],
      { timeout: 3000 },
      (error, stdout) => resolve(error ? null : stdout.includes('true'))
    )
  })
}

export function windowSystem(): AppInfo['windowSystem'] {
  const platform = app.commandLine.getSwitchValue('ozone-platform')
  return platform === 'x11' || platform === 'wayland' ? platform : 'default'
}
