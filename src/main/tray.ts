import { app, Menu, nativeImage, Tray } from 'electron'
import { IPC } from '../shared/types'
import { isAutostartEnabled, setAutostart } from './autostart'
import { resourcePath } from './paths'
import { broadcast, showMain, toggleMini } from './windows'

let tray: Tray | null = null
let createdWithHost = false

export function createTray(hostAvailable: boolean | null): void {
  tray?.destroy()
  tray = new Tray(nativeImage.createFromPath(resourcePath('tray.png')))
  createdWithHost = hostAvailable !== false
  tray.setToolTip('sout')
  // Left click. GNOME's AppIndicator extension sends it as "activate"; some setups open the menu instead.
  tray.on('click', () => toggleMini())
  refreshTrayMenu()
}

/** The tray host (GNOME AppIndicator extension) may have been switched on after we started. */
export function ensureTray(hostAvailable: boolean | null): void {
  if (hostAvailable && !createdWithHost) createTray(hostAvailable)
}

export function refreshTrayMenu(): void {
  if (!tray) return
  // On Linux, menu changes only show up after calling setContextMenu again.
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mini-Ansicht', click: () => toggleMini() },
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
  )
}
