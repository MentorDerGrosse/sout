import { app, BrowserWindow, Menu, nativeTheme, screen } from 'electron'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, type View } from '../shared/types'
import { autostartEntry } from './autostart'
import { startCalendarSync, syncCalendar } from './calendar'
import { startTasksSync, syncTasks } from './tasks'
import { TuwelError } from './tuwelApi'
import { fetchSnapshot } from './tuwelTasks'
import { registerIpc } from './ipc'
import { getSecret, secretsStatus } from './secrets'
import { trayHostAvailable, windowSystem } from './system'
import { fetchTissFeed } from './tiss'
import { createTray } from './tray'
import { broadcast, createMainWindow, createMiniWindow } from './windows'

// `--smoke-test=<dir>` (development only): starts everything without showing a window, takes
// screenshots of the views, writes report.json and quits. Uses its own data folder and no keyring.

const FLAG = '--smoke-test='

export function smokeTestDir(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith(FLAG))
  return arg && !app.isPackaged ? arg.slice(FLAG.length) : null
}

export async function runSmokeTest(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  app.setPath('userData', join(dir, 'userData'))
  app.commandLine.appendSwitch('password-store', 'basic')

  const report: Record<string, unknown> = { windowSystem: windowSystem() }
  const messages: string[] = []
  const finish = (code: number): void => {
    report['messages'] = messages
    writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    app.exit(code)
  }
  setTimeout(() => {
    report['error'] = 'timeout'
    finish(1)
  }, 30_000)

  app.on('child-process-gone', (_e, details) => messages.push(`[child-gone] ${details.type}: ${details.reason} (${details.exitCode})`))
  app.on('browser-window-created', (_e, win) => {
    const id = win.id
    win.on('closed', () => messages.push(`[window-closed] #${id}`))
  })
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', (details) => messages.push(`[${details.level}] ${details.message}`))
    contents.on('preload-error', (_e, path, error) => messages.push(`[preload-error] ${path}: ${error.message}`))
    contents.on('render-process-gone', (_e, details) => messages.push(`[renderer-gone] ${details.reason}`))
    contents.on('did-fail-load', (_e, code, description, url) => messages.push(`[load-failed] ${code} ${description} ${url}`))
  })

  try {
    await app.whenReady()
    // SOUT_SMOKE_THEME=light|dark checks the other colour scheme without touching the GNOME setting.
    const theme = process.env['SOUT_SMOKE_THEME']
    if (theme === 'light' || theme === 'dark') nativeTheme.themeSource = theme
    report['gpu'] = app.getGPUFeatureStatus()
    Menu.setApplicationMenu(null)
    registerIpc()
    startCalendarSync(() => broadcast(IPC.calendarChanged))
    startTasksSync(() => broadcast(IPC.tasksChanged))
    await Promise.all([syncCalendar(), syncTasks()])
    report['trayHost'] = await trayHostAvailable()
    createTray(report['trayHost'] as boolean | null)
    const mini = createMiniWindow()
    const main = createMainWindow('today', false)
    // Hidden windows otherwise stop painting, and screenshots show an old frame.
    for (const win of [mini, main]) win.webContents.setBackgroundThrottling(false)
    await Promise.all([loaded(mini), loaded(main)])
    await delay(1000)

    const screenshots: Record<string, string> = { mini: await screenshot(mini, dir, 'mini') }
    for (const view of ['today', 'calendar', 'deadlines', 'settings'] satisfies View[]) {
      main.webContents.send(IPC.navigate, view)
      await delay(500)
      screenshots[view] = await screenshot(main, dir, view)
    }
    // Calendar details and the other views (only meaningful with events, e.g. via SOUT_TISS_FILE).
    main.webContents.send(IPC.navigate, 'calendar')
    await delay(500)
    const click = (selector: string): Promise<unknown> =>
      main.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`)
    await click('.fc-timegrid-event')
    await delay(300)
    screenshots['calendar-details'] = await screenshot(main, dir, 'calendar-details')
    for (const view of ['dayGridMonth', 'listMonth']) {
      await click(`.fc-${view}-button`)
      await delay(400)
      screenshots[view] = await screenshot(main, dir, view)
    }
    main.webContents.send(IPC.navigate, 'deadlines')
    await delay(400)
    await main.webContents.executeJavaScript(`[...document.querySelectorAll('.task-section')].at(1)?.scrollIntoView()`)
    await delay(1500)
    screenshots['deadlines-later'] = await screenshot(main, dir, 'deadlines-later')
    await main.webContents.executeJavaScript('document.querySelector(".content").scrollTo(0, 0)')
    await click('.task-card:nth-of-type(1) .task-body')
    await main.webContents.executeJavaScript(`[...document.querySelectorAll('.task-body')].find((b) => b.textContent.includes('Übungsblatt'))?.click()`)
    await click('.header-actions .button:last-child')
    // Clicks done through executeJavaScript take a moment to show up in a hidden window.
    await delay(1500)
    screenshots['deadlines-open'] = await screenshot(main, dir, 'deadlines-open')
    main.webContents.send(IPC.navigate, 'settings')
    await delay(400)
    await main.webContents.executeJavaScript('document.querySelector(".reminder-choices")?.scrollIntoView()')
    await delay(200)
    screenshots['settings-middle'] = await screenshot(main, dir, 'settings-middle')
    await main.webContents.executeJavaScript('document.querySelector(".content").scrollTo(0, 1e6)')
    await delay(300)
    screenshots['settings-bottom'] = await screenshot(main, dir, 'settings-bottom')
    report['screenshots'] = screenshots

    const display = screen.getPrimaryDisplay()
    report['display'] = { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor }
    report['gpuAfterLoad'] = app.getGPUFeatureStatus().gpu_compositing
    report['secrets'] = secretsStatus()
    report['autostartEntry'] = autostartEntry()
    finish(0)
  } catch (error) {
    report['error'] = error instanceof Error ? error.stack : String(error)
    finish(1)
  }
}

function loaded(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => resolve())
    win.webContents.once('did-fail-load', () => resolve())
  })
}

async function screenshot(win: BrowserWindow, dir: string, name: string): Promise<string> {
  try {
    // Hidden windows repaint lazily; ask for a fresh frame first.
    win.webContents.invalidate()
    await delay(250)
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) return 'empty'
    writeFileSync(join(dir, `${name}.png`), image.toPNG())
    const { width, height } = image.getSize()
    return `${width}x${height}`
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The dump tools run next to a running sout: a temporary profile folder of their own (two
 * processes on one profile block each other), but the encrypted tokens from the real one.
 */
function useOwnProfile(): { realUserData: string; done: () => void } {
  const realUserData = app.getPath('userData')
  // Chromium may still write into the folder while exiting; clean up leftovers of earlier runs.
  for (const entry of readdirSync(app.getPath('temp'))) {
    if (entry.startsWith('sout-dump-')) rmSync(join(app.getPath('temp'), entry), { recursive: true, force: true })
  }
  const temp = join(app.getPath('temp'), `sout-dump-${process.pid}`)
  app.setPath('userData', temp)
  return { realUserData, done: () => rmSync(temp, { recursive: true, force: true }) }
}

/** `--dump-tiss=<file>` (development only): saves the raw TISS feed, to look at its format. */
export function tissDumpFile(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith('--dump-tiss='))
  return arg && !app.isPackaged ? arg.slice('--dump-tiss='.length) : null
}

export async function dumpTiss(file: string): Promise<void> {
  const profile = useOwnProfile()
  await app.whenReady()
  const token = getSecret('tissToken', profile.realUserData)
  if (token) writeFileSync(file, await fetchTissFeed(token))
  else console.error('Kein TISS-Token gespeichert.')
  profile.done()
  app.exit(token ? 0 : 1)
}

/** `--dump-tuwel=<file>` (development only): saves what TUWEL returns, for SOUT_TUWEL_FILE. */
export function tuwelDumpFile(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith('--dump-tuwel='))
  return arg && !app.isPackaged ? arg.slice('--dump-tuwel='.length) : null
}

export async function dumpTuwel(file: string): Promise<void> {
  const profile = useOwnProfile()
  await app.whenReady()
  const token = getSecret('tuwelToken', profile.realUserData)
  let code = 0
  try {
    if (!token) throw new Error('Nicht bei TUWEL angemeldet.')
    // Only the shape, never the token itself: Moodle tokens are 32 hex characters.
    console.error(`[dump] token: ${token.length} characters, hex: ${/^[0-9a-f]+$/.test(token)}`)
    writeFileSync(file, `${JSON.stringify(await fetchSnapshot(token), null, 2)}\n`)
    console.error(`[dump] saved ${file}`)
  } catch (error) {
    console.error('[dump] failed:', error instanceof TuwelError ? `${error.code}: ${error.message}` : error)
    code = 1
  } finally {
    profile.done()
    app.exit(code)
  }
}
