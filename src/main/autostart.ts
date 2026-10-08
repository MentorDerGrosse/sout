import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resourcePath } from './paths'
import { startupArgs } from './system'

// Start at login. Linux: a .desktop file in ~/.config/autostart (XDG autostart spec) – Electron's
// login item settings only cover Windows and macOS, which use those instead.

export const AUTOSTART_ARG = '--autostart'

const linux = process.platform === 'linux'

/** The .desktop file on Linux; null elsewhere (the system keeps the login items). */
export function autostartFile(): string | null {
  return linux ? join(app.getPath('appData'), 'autostart', 'sout.desktop') : null
}

/** Windows: start sout (in development: Electron with the project folder) with --autostart. macOS can't pass arguments. */
function loginItem(): Electron.LoginItemSettingsOptions {
  if (process.platform !== 'win32') return {}
  return { path: process.execPath, args: [...(app.isPackaged ? [] : [app.getAppPath()]), ...startupArgs(), AUTOSTART_ARG] }
}

export function isAutostartEnabled(): boolean {
  if (!linux) return app.getLoginItemSettings(loginItem()).openAtLogin
  return existsSync(autostartFile()!)
}

export function setAutostart(enabled: boolean): void {
  if (!linux) {
    app.setLoginItemSettings({ ...loginItem(), openAtLogin: enabled })
    return
  }
  const file = autostartFile()!
  if (!enabled) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, autostartEntry())
}

/** Was sout started by the login (and not by hand)? */
export function startedByAutostart(): boolean {
  if (process.argv.includes(AUTOSTART_ARG)) return true
  // macOS has no arguments for login items, but knows how it started us (if it still says so).
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true
}

/** Rewrites an existing autostart file if it is out of date (new startup flags, moved project folder). */
export function refreshAutostart(): void {
  if (!linux || !isAutostartEnabled()) return
  const entry = autostartEntry()
  const file = autostartFile()!
  if (readFileSync(file, 'utf8') !== entry) writeFileSync(file, entry)
}

export function autostartEntry(): string {
  // Unpackaged, the Electron binary needs the project folder as argument (runs the built app in out/).
  // An AppImage runs from a temporary mount: the AppImage file itself has to be started.
  const command = app.isPackaged ? [process.env['APPIMAGE'] ?? process.execPath] : [process.execPath, app.getAppPath()]
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=sout',
    'Comment=Studium organisieren: TISS, TUWEL, Notizen',
    `Exec=${[...command, ...startupArgs(), AUTOSTART_ARG].map(quoteExecArg).join(' ')}`,
    // Installed packages bring their icon along; from the project folder the file is used.
    `Icon=${app.isPackaged ? 'sout' : resourcePath('icon.png')}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    // Give GNOME Shell a moment, so the tray host is up before we register our icon.
    'X-GNOME-Autostart-Delay=5',
    ''
  ].join('\n')
}

/** Desktop Entry spec: quote arguments with special characters, then escape backslashes for the file format. */
function quoteExecArg(arg: string): string {
  if (/^[\w\-./+=:@,]+$/.test(arg)) return arg
  const quoted = `"${arg.replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%')}"`
  return quoted.replace(/\\/g, '\\\\')
}
