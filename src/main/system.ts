import { app } from 'electron'
import { execFile } from 'node:child_process'
import type { AppInfo } from '../shared/types'

export const X11_FLAG = '--ozone-platform=x11'

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
