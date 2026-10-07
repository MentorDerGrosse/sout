import { app, ipcMain } from 'electron'
import { IPC, isView, type AppInfo, type CoursePatch, type Result } from '../shared/types'
import { autostartFile, isAutostartEnabled, setAutostart } from './autostart'
import { calendarData, clearCalendar, syncCalendar, updateCourse } from './calendar'
import { launcherPath } from './paths'
import { clearSecret, getSecret, secretsStatus, setSecret } from './secrets'
import { getSettings, updateSettings } from './settings'
import { trayHostAvailable, windowSystem } from './system'
import { parseTissToken, testTissFeed } from './tiss'
import { refreshTrayMenu } from './tray'
import { broadcast, hideMini, showMain } from './windows'

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = (error: unknown): Result<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error)
})

/** Keep the tray menu and both windows in sync after a change. */
function changed(): void {
  refreshTrayMenu()
  broadcast(IPC.stateChanged)
}

async function appInfo(): Promise<AppInfo> {
  return {
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    windowSystem: windowSystem(),
    sessionType: process.env['XDG_SESSION_TYPE'] ?? '',
    desktop: process.env['XDG_CURRENT_DESKTOP'] ?? '',
    trayAvailable: await trayHostAvailable(),
    userDataDir: app.getPath('userData'),
    autostartFile: autostartFile(),
    launcher: launcherPath()
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.getInfo, () => appInfo())
  ipcMain.handle(IPC.getSettings, () => getSettings())
  ipcMain.handle(IPC.updateSettings, (_event, patch: unknown) => {
    const settings = updateSettings(patch)
    changed()
    return settings
  })
  ipcMain.handle(IPC.getAutostart, () => isAutostartEnabled())
  ipcMain.handle(IPC.setAutostart, (_event, enabled: unknown) => {
    try {
      setAutostart(enabled === true)
      return ok(isAutostartEnabled())
    } catch (error) {
      return fail(error)
    } finally {
      changed()
    }
  })
  ipcMain.handle(IPC.getSecretsStatus, () => secretsStatus())
  ipcMain.handle(IPC.saveTissToken, (_event, input: unknown) => {
    const token = typeof input === 'string' ? parseTissToken(input) : null
    if (!token) return fail('Das sieht nicht nach der TISS-Kalender-URL (oder ihrem Token) aus.')
    try {
      setSecret('tissToken', token)
      changed()
      void syncCalendar()
      return ok(secretsStatus())
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle(IPC.testTiss, async () => {
    const token = getSecret('tissToken')
    if (!token) return fail('Es ist kein TISS-Token gespeichert.')
    try {
      return ok(await testTissFeed(token))
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle(IPC.clearSecret, (_event, key: unknown) => {
    if (key === 'tissToken' || key === 'tuwelToken') clearSecret(key)
    if (key === 'tissToken') clearCalendar()
    changed()
    return secretsStatus()
  })
  ipcMain.handle(IPC.getCalendar, () => calendarData())
  ipcMain.handle(IPC.syncCalendar, async () => {
    await syncCalendar()
    return calendarData()
  })
  ipcMain.handle(IPC.updateCourse, (_event, key: unknown, patch: unknown) => {
    if (typeof key === 'string' && patch && typeof patch === 'object') updateCourse(key, patch as CoursePatch)
    return calendarData()
  })
  ipcMain.on(IPC.openMain, (_event, view: unknown) => {
    hideMini()
    showMain(isView(view) ? view : undefined)
  })
  ipcMain.on(IPC.hideMini, () => hideMini())
}
