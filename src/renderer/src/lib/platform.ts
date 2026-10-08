// Texts that differ between Linux, Windows and macOS.

const mac = /Mac/.test(navigator.userAgent)

/** "Strg" – or "Cmd" on a Mac. */
export const MOD = mac ? 'Cmd' : 'Strg'

/** The Strg key (Cmd on a Mac) is held down. */
export const modKey = (event: KeyboardEvent): boolean => (mac ? event.metaKey : event.ctrlKey)

/** Where the tray icon sits. */
export function trayPlace(platform: string): string {
  if (platform === 'win32') return 'unten rechts in der Taskleiste'
  if (platform === 'darwin') return 'oben in der Menüleiste'
  return 'oben in der Leiste'
}

/** Where the tokens' key is kept. */
export function keyStore(platform: string): string {
  if (platform === 'win32') return 'bei deinem Windows-Benutzerkonto'
  if (platform === 'darwin') return 'im macOS-Schlüsselbund'
  return 'im GNOME-Schlüsselbund'
}
