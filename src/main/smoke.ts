import { app, BrowserWindow, Menu, screen } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, type View } from '../shared/types'
import { autostartEntry } from './autostart'
import { registerIpc } from './ipc'
import { secretsStatus } from './secrets'
import { trayHostAvailable, windowSystem } from './system'
import { createTray } from './tray'
import { createMainWindow, createMiniWindow } from './windows'

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
    report['gpu'] = app.getGPUFeatureStatus()
    Menu.setApplicationMenu(null)
    registerIpc()
    report['trayHost'] = await trayHostAvailable()
    createTray(report['trayHost'] as boolean | null)
    const mini = createMiniWindow()
    const main = createMainWindow('today', false)
    await Promise.all([loaded(mini), loaded(main)])
    await delay(1000)

    const screenshots: Record<string, string> = { mini: await screenshot(mini, dir, 'mini') }
    for (const view of ['today', 'calendar', 'settings'] satisfies View[]) {
      main.webContents.send(IPC.navigate, view)
      await delay(500)
      screenshots[view] = await screenshot(main, dir, view)
    }
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
