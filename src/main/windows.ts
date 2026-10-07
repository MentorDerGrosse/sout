import { app, BrowserWindow, Notification, nativeTheme, screen, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { IPC, type View } from '../shared/types'
import { preloadPath, rendererHtml, resourcePath } from './paths'
import { getSettings, updateSettings } from './settings'

const MINI_SIZE = { width: 360, height: 560 }
const MINI_MARGIN = 8
/** A click on the tray icon first blurs (and thereby hides) an open mini window – don't reopen it right away. */
const REOPEN_GUARD_MS = 300

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let miniHiddenAt = 0
let quitting = false
let onMainClosed: (() => void) | null = null

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
    if (input.control && key === 'q') {
      event.preventDefault()
      app.quit()
    } else if (input.control && key === 'w') {
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
    if (!quitting) onMainClosed?.()
  })
  setUpWebContents(win)
  load(win, note ? `${view}:${encodeURIComponent(note)}` : view)
  mainWindow = win
  return win
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

/** Top right, just below GNOME's top bar – where the tray icons are. Needs X11/XWayland to have an effect. */
export function positionMini(win: BrowserWindow): void {
  const { workArea } = screen.getPrimaryDisplay()
  win.setPosition(workArea.x + workArea.width - MINI_SIZE.width - MINI_MARGIN, workArea.y + MINI_MARGIN)
}

export function toggleMini(): void {
  const win = miniWindow ?? createMiniWindow()
  if (win.isVisible()) {
    hideMini()
    return
  }
  if (Date.now() - miniHiddenAt < REOPEN_GUARD_MS) return
  positionMini(win)
  win.show()
  // Window managers may place a newly mapped window themselves; insist on our spot.
  positionMini(win)
  win.focus()
}

export function hideMini(): void {
  if (!miniWindow?.isVisible()) return
  miniWindow.hide()
  miniHiddenAt = Date.now()
}

export function notifyRunningInBackground(): void {
  if (getSettings().closeHintShown || !Notification.isSupported()) return
  new Notification({
    title: 'sout läuft im Hintergrund weiter',
    body: 'Das Symbol oben rechts öffnet die Mini-Ansicht. Ganz beenden: Strg+Q oder „Beenden“ im Menü des Symbols.',
    icon: resourcePath('icon.png')
  }).show()
  updateSettings({ closeHintShown: true })
}

export function broadcast(channel: string): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel)
}
