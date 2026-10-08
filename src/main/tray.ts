import { app, Menu, nativeImage, Tray, type NativeImage, type Rectangle } from 'electron'
import { IPC } from '../shared/types'
import { isAutostartEnabled, setAutostart } from './autostart'
import { resourcePath } from './paths'
import { stopWatchingTrayMenu, watchTrayMenu } from './trayMenuWatch'
import { broadcast, isMiniVisible, onMiniVisibility, showMain, showMiniWithMenu, toggleMini } from './windows'

let tray: Tray | null = null
let createdWithHost = false
let listening = false
/** Deadlines within the next 24 hours: the icon gets a red dot. */
let urgent = 0

/** Per system: white glyph for GNOME's dark top bar, template image for macOS, coloured icon for Windows. */
function trayImage(): NativeImage {
  if (process.platform === 'darwin') {
    const image = nativeImage.createFromPath(resourcePath('trayTemplate.png'))
    image.setTemplateImage(true)
    return image
  }
  const name = process.platform === 'win32' ? 'tray-win' : 'tray'
  return nativeImage.createFromPath(resourcePath(`${name}${urgent > 0 ? '-urgent' : ''}.png`))
}

export function createTray(hostAvailable: boolean | null): void {
  tray?.destroy()
  tray = new Tray(trayImage())
  createdWithHost = hostAvailable !== false
  // Left click. GNOME's AppIndicator extension sends it as "activate"; Windows and macOS say where the icon is.
  // (Linux passes no bounds.)
  tray.on('click', (_event, bounds?: Rectangle) => toggleMini(bounds && bounds.width > 0 ? bounds : undefined))
  // macOS opens a context menu on left click as well – there it comes with the right click only.
  if (process.platform === 'darwin') tray.on('right-click', () => tray?.popUpContextMenu(menu()))
  if (!listening) {
    listening = true
    // The tick at "Mini-Ansicht" follows the mini window.
    onMiniVisibility(refreshTrayMenu)
    // GNOME opens the menu on a single click – the mini view comes along (see trayMenuWatch.ts).
    watchTrayMenu(showMiniWithMenu)
    app.on('before-quit', stopWatchingTrayMenu)
  }
  refreshTrayMenu()
  showStatus()
}

/** The tray host (GNOME AppIndicator extension) may have been switched on after we started. */
export function ensureTray(hostAvailable: boolean | null): void {
  if (hostAvailable && !createdWithHost) createTray(hostAvailable)
}

export function refreshTrayMenu(): void {
  // On Linux, menu changes only show up after calling setContextMenu again.
  if (tray && process.platform !== 'darwin') tray.setContextMenu(menu())
}

function menu(): Menu {
  return Menu.buildFromTemplate([
    // Ticked while the mini view is open; unticking closes it.
    { label: 'Mini-Ansicht', type: 'checkbox', checked: isMiniVisible(), click: () => toggleMini() },
    { label: 'sout öffnen', click: () => showMain() },
    { label: 'Einstellungen', click: () => showMain('settings') },
    { type: 'separator' },
    {
      label: 'Beim Anmelden starten',
      type: 'checkbox',
      checked: isAutostartEnabled(),
      click: (item) => {
        try {
          setAutostart(item.checked)
        } finally {
          refreshTrayMenu()
          broadcast(IPC.stateChanged)
        }
      }
    },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() }
  ])
}

/** How many deadlines are within the next 24 hours; the icon shows a red dot (macOS: the number). */
export function setTrayUrgent(count: number): void {
  if (count === urgent) return
  urgent = count
  showStatus()
}

export const trayUrgent = (): number => urgent

function showStatus(): void {
  if (!tray) return
  tray.setImage(trayImage())
  if (process.platform === 'darwin') tray.setTitle(urgent > 0 ? String(urgent) : '')
  tray.setToolTip(urgent > 0 ? `sout – ${urgent} ${urgent === 1 ? 'Abgabe' : 'Abgaben'} in den nächsten 24 Stunden` : 'sout')
}
