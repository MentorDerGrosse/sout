import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resourcePath } from './paths'
import { startupArgs } from './system'

// Linux autostart = a .desktop file in ~/.config/autostart (XDG autostart spec).
// Electron's app.setLoginItemSettings() only covers macOS and Windows.

export const AUTOSTART_ARG = '--autostart'

export function autostartFile(): string {
  return join(app.getPath('appData'), 'autostart', 'sout.desktop')
}

export function isAutostartEnabled(): boolean {
  return existsSync(autostartFile())
}

export function setAutostart(enabled: boolean): void {
  const file = autostartFile()
  if (!enabled) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, autostartEntry())
}

/** Rewrites an existing autostart file if it is out of date (new startup flags, moved project folder). */
export function refreshAutostart(): void {
  if (!isAutostartEnabled()) return
  const entry = autostartEntry()
  if (readFileSync(autostartFile(), 'utf8') !== entry) writeFileSync(autostartFile(), entry)
}

export function autostartEntry(): string {
  // Unpackaged, the Electron binary needs the project folder as argument (runs the built app in out/).
  const command = app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()]
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=sout',
    'Comment=Studium organisieren: TISS, TUWEL, Notizen',
    `Exec=${[...command, ...startupArgs(), AUTOSTART_ARG].map(quoteExecArg).join(' ')}`,
    `Icon=${resourcePath('icon.png')}`,
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
