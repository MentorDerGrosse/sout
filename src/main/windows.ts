import { app, BrowserWindow, Notification, nativeTheme, screen, shell, type Rectangle } from 'electron'
import { fileURLToPath } from 'node:url'
import { IPC, type View } from '../shared/types'
import { preloadPath, rendererHtml, resourcePath } from './paths'
import { getSettings, updateSettings } from './settings'

const MINI_SIZE = { width: 360, height: 560 }
const MINI_MARGIN = 8
/** A click on the tray icon first blurs (and thereby hides) an open mini window – don't reopen it right away. */
const REOPEN_GUARD_MS = 300
/** GNOME opens the tray menu only after the double-click time; a click that just closed the mini view shouldn't bring it back with the menu. */
const MENU_REOPEN_GUARD_MS = 1500

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let miniHiddenAt = 0
let quitting = false
let onMainClosed: (() => void) | null = null
const miniListeners: (() => void)[] = []

app.on('before-quit', () => {
  quitting = true
})

/** Called when the user closes the main window (not when the app quits). */
export function setOnMainClosed(listener: () => void): void {
  onMainClosed = listener
}

function backgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#1b1c1f' : '#f5f6f8'
}

/** The URL hash tells the page which window it is and what to show: "mini", "calendar", "notes:<note path>". */
function load(win: BrowserWindow, hash: string): void {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) void win.loadURL(`${devServer}#${hash}`)
  else void win.loadFile(rendererHtml(), { hash })
}

/** Only sout's own page – not, say, a file dropped onto the window. */
function isAppUrl(url: string): boolean {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) return url.startsWith(devServer)
  try {
    return url.startsWith('file:') && fileURLToPath(url.split('#')[0]!) === rendererHtml()
  } catch {
    return false
  }
}

/** Web and mail links go to the browser or mail program. */
const isExternal = (url: string): boolean => /^(https?|mailto):/i.test(url)

/** Shared by both windows: links open in the browser, keyboard shortcuts. */
function setUpWebContents(win: BrowserWindow): void {
  const contents = win.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event) => {
    if (isAppUrl(event.url)) return
    event.preventDefault()
    if (isExternal(event.url)) void shell.openExternal(event.url)
  })
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    // Strg on Linux and Windows, Cmd on the Mac.
    const command = process.platform === 'darwin' ? input.meta : input.control
    if (command && key === 'q') {
      event.preventDefault()
      app.quit()
    } else if (command && key === 'w') {
      event.preventDefault()
      win.close()
    } else if (key === 'escape' && win === miniWindow) {
      hideMini()
    } else if (key === 'f12' && !app.isPackaged) {
      contents.toggleDevTools()
    }
  })
}

export function createMainWindow(view: View, show = true, note?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'sout',
    icon: resourcePath('icon.png'),
    backgroundColor: backgroundColor(),
    // plugins: Chromium's PDF viewer, for slides next to a note.
    webPreferences: { preload: preloadPath(), sandbox: true, contextIsolation: true, plugins: true }
  })
  if (show) win.once('ready-to-show', () => win.show())
  // Closing destroys the window to free memory; the app itself keeps running in the tray.
  win.on('closed', () => {
    mainWindow = null
    syncDock()
    if (!quitting) onMainClosed?.()
  })
  setUpWebContents(win)
  load(win, note ? `${view}:${encodeURIComponent(note)}` : view)
  mainWindow = win
  syncDock()
  return win
}

/** macOS: a Dock icon only while the main window is open – otherwise sout lives in the menu bar. */
export function syncDock(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  if (mainWindow) void app.dock.show()
  else app.dock.hide()
}

export function showMain(view?: View, note?: string): void {
  if (!mainWindow) {
    createMainWindow(view ?? 'today', true, note)
    return
  }
  if (view) mainWindow.webContents.send(IPC.navigate, view, note)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** The small Toolbox-like window. Created once and only hidden, so it opens instantly. */
export function createMiniWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...MINI_SIZE,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'sout',
    backgroundColor: backgroundColor(),
    webPreferences: { preload: preloadPath(), sandbox: true, contextIsolation: true }
  })
  win.on('blur', () => hideMini())
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    hideMini()
  })
  win.on('closed', () => {
    miniWindow = null
  })
  setUpWebContents(win)
  load(win, 'mini')
  miniWindow = win
  return win
}

/**
 * Under the tray icon: Windows and macOS tell where it is (the Windows taskbar is usually at the
 * bottom, so then the window opens above it). Otherwise top right, below GNOME's top bar – or
 * bottom right on Windows. Needs X11/XWayland on Linux to have an effect.
 */
export function positionMini(win: BrowserWindow, anchor?: Rectangle): void {
  const display = anchor ? screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y }) : screen.getPrimaryDisplay()
  const area = display.workArea
  const right = area.x + area.width - MINI_SIZE.width - MINI_MARGIN
  const atBottom = anchor ? anchor.y > area.y + area.height / 2 : process.platform === 'win32'
  const x = anchor ? Math.round(anchor.x + anchor.width / 2 - MINI_SIZE.width / 2) : right
  win.setPosition(
    Math.min(Math.max(x, area.x + MINI_MARGIN), right),
    atBottom ? area.y + area.height - MINI_SIZE.height - MINI_MARGIN : area.y + MINI_MARGIN
  )
}

export const isMiniVisible = (): boolean => miniWindow?.isVisible() ?? false

/** Called whenever the mini window appears or goes (the tray menu shows it as a tick). */
export function onMiniVisibility(listener: () => void): void {
  miniListeners.push(listener)
}

/** `focus`: false keeps the focus where it is, e.g. in GNOME's open tray menu. */
function showMini(anchor: Rectangle | undefined, focus: boolean): void {
  const win = miniWindow ?? createMiniWindow()
  positionMini(win, anchor)
  if (focus) win.show()
  else win.showInactive()
  // Window managers may place a newly mapped window themselves; insist on our spot.
  positionMini(win, anchor)
  if (focus) win.focus()
  for (const listener of miniListeners) listener()
}

/** `anchor`: where the tray icon is, if the system says so. */
export function toggleMini(anchor?: Rectangle): void {
  if (isMiniVisible()) {
    hideMini()
    return
  }
  if (Date.now() - miniHiddenAt < REOPEN_GUARD_MS) return
  showMini(anchor, true)
}

/**
 * GNOME: a click on the tray icon opened its menu – the mini view comes along. It doesn't take
 * the focus from the menu, so it stays until it is unticked there ("Mini-Ansicht"), or until it
 * was clicked into and then away from.
 */
export function showMiniWithMenu(): void {
  if (isMiniVisible() || Date.now() - miniHiddenAt < MENU_REOPEN_GUARD_MS) return
  showMini(undefined, false)
}

export function hideMini(): void {
  if (!miniWindow?.isVisible()) return
  miniWindow.hide()
  miniHiddenAt = Date.now()
  for (const listener of miniListeners) listener()
}

/** Where the tray icon sits, for texts. */
export function trayPlace(): string {
  if (process.platform === 'win32') return 'unten rechts in der Taskleiste (eventuell hinter dem Pfeil ^)'
  if (process.platform === 'darwin') return 'oben rechts in der Menüleiste'
  return 'oben rechts in der Leiste'
}

export function notifyRunningInBackground(): void {
  if (getSettings().closeHintShown || !Notification.isSupported()) return
  const quit = process.platform === 'darwin' ? 'Cmd+Q' : 'Strg+Q'
  new Notification({
    title: 'sout läuft im Hintergrund weiter',
    body: `Das Symbol ${trayPlace()} öffnet die Mini-Ansicht. Ganz beenden: ${quit} oder „Beenden“ im Menü des Symbols.`,
    icon: resourcePath('icon.png')
  }).show()
  updateSettings({ closeHintShown: true })
}

export function broadcast(channel: string): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel)
}
