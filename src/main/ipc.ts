import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC, isView, type AppInfo, type CoursePatch, type NewNote, type Result, type TodoInput } from '../shared/types'
import { autostartFile, isAutostartEnabled, setAutostart } from './autostart'
import { calendarChanged, calendarData, clearCalendar, syncCalendar, updateCourse } from './calendar'
import { changes, dismissChange } from './changes'
import { dismissExam, examsData, syncExams } from './exams'
import { chooseNotesDir, createNote, importPdfs, moveNote, noteForEvent, noteForTask, quickNote, setupNotes } from './courseNotes'
import { flushNote, notesData, readNote, renameNote, searchNotes, showInFolder, trashNote, writeNote } from './notes'
import { addOwnEvent, deleteOwnEvent, updateOwnEvent } from './ownEvents'
import { launcherPath } from './paths'
import { clearSecret, getSecret, secretsStatus, setSecret } from './secrets'
import { getSettings, updateSettings } from './settings'
import { trayHostAvailable, windowSystem } from './system'
import { addTodo, deleteTodo, loginTuwel, logoutTuwel, setTaskDone, syncTasks, tasksData } from './tasks'
import { parseTissToken, testTissFeed } from './tiss'
import { refreshTrayMenu } from './tray'
import { applyTheme, broadcast, hideMini, showMain } from './windows'

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = (error: unknown): Result<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error)
})

async function attempt<T>(action: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return ok(await action())
  } catch (error) {
    return fail(error)
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null)
const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Keep the tray menu and both windows in sync after a change. */
function changed(): void {
  refreshTrayMenu()
  broadcast(IPC.stateChanged)
}

async function appInfo(): Promise<AppInfo> {
  return {
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    packaged: app.isPackaged,
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
    // The notes folder only changes through setupNotes, which also creates it.
    const allowed = patch && typeof patch === 'object' ? { ...patch, notesDir: undefined } : patch
    const settings = updateSettings(allowed)
    applyTheme()
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
    if (key === 'tissToken') {
      clearSecret(key)
      clearCalendar()
    } else if (key === 'tuwelToken') {
      logoutTuwel()
    }
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
  // Own appointments: change, then hand back the calendar with them.
  const ownChange = (change: () => void): Promise<Result<ReturnType<typeof calendarData>>> =>
    attempt(() => {
      change()
      calendarChanged()
      return calendarData()
    })
  ipcMain.handle(IPC.addOwnEvent, (_event, input: unknown) => ownChange(() => addOwnEvent(input)))
  ipcMain.handle(IPC.updateOwnEvent, (_event, id: unknown, input: unknown) => ownChange(() => updateOwnEvent(text(id), input)))
  ipcMain.handle(IPC.deleteOwnEvent, (_event, id: unknown, day: unknown) => ownChange(() => deleteOwnEvent(text(id), stringOrNull(day))))
  ipcMain.handle(IPC.getChanges, () => changes())
  ipcMain.handle(IPC.dismissChange, (_event, id: unknown) => {
    dismissChange(stringOrNull(id))
    return changes()
  })
  ipcMain.handle(IPC.getExams, () => examsData())
  ipcMain.handle(IPC.syncExams, async () => {
    // The calendar first: it says what you are registered for.
    await syncCalendar()
    await syncExams(true)
    return examsData()
  })
  ipcMain.handle(IPC.dismissExam, (_event, id: unknown, dismissed: unknown) => {
    dismissExam(text(id), dismissed === true)
    return examsData()
  })
  ipcMain.handle(IPC.getTasks, () => tasksData())
  ipcMain.handle(IPC.syncTasks, async () => {
    await syncTasks()
    return tasksData()
  })
  ipcMain.handle(IPC.loginTuwel, async () => {
    try {
      await loginTuwel()
      changed()
      return ok(tasksData())
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle(IPC.logoutTuwel, () => {
    logoutTuwel()
    changed()
    return tasksData()
  })
  ipcMain.handle(IPC.addTodo, (_event, input: unknown) => {
    try {
      addTodo((input ?? {}) as TodoInput)
      return ok(tasksData())
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle(IPC.setTaskDone, (_event, id: unknown, done: unknown) => {
    if (typeof id === 'string') setTaskDone(id, done === true)
    return tasksData()
  })
  ipcMain.handle(IPC.deleteTodo, (_event, id: unknown) => {
    if (typeof id === 'string') deleteTodo(id)
    return tasksData()
  })
  registerNotesIpc()
  ipcMain.on(IPC.openMain, (_event, view: unknown, note: unknown) => {
    hideMini()
    showMain(isView(view) ? view : undefined, stringOrNull(note) ?? undefined)
  })
  ipcMain.on(IPC.hideMini, () => hideMini())
}

function registerNotesIpc(): void {
  ipcMain.handle(IPC.getNotes, () => notesData())
  ipcMain.handle(IPC.setupNotes, async (_event, dir: unknown) => {
    const result = await attempt(() => setupNotes(stringOrNull(dir)))
    // The notes folder is a setting: mini window and "Heute" show whether it is set up.
    changed()
    return result
  })
  ipcMain.handle(IPC.chooseNotesDir, (event) => chooseNotesDir(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle(IPC.readNote, (_event, path: unknown) => attempt(() => readNote(text(path))))
  ipcMain.handle(IPC.writeNote, (_event, path: unknown, content: unknown, base: unknown) => writeNote(text(path), text(content), numberOrNull(base)))
  ipcMain.on(IPC.flushNote, (event, path: unknown, content: unknown, base: unknown) => {
    event.returnValue = typeof content === 'string' && flushNote(text(path), content, numberOrNull(base))
  })
  ipcMain.handle(IPC.createNote, (_event, input: unknown) => attempt(() => createNote(input && typeof input === 'object' ? (input as Partial<NewNote>) : {})))
  ipcMain.handle(IPC.noteForEvent, (_event, id: unknown) => attempt(() => noteForEvent(text(id))))
  ipcMain.handle(IPC.noteForTask, (_event, id: unknown) => attempt(() => noteForTask(text(id))))
  ipcMain.handle(IPC.quickNote, (_event, content: unknown) => attempt(() => quickNote(text(content))))
  ipcMain.handle(IPC.renameNote, (_event, path: unknown, name: unknown) => attempt(() => renameNote(text(path), text(name))))
  ipcMain.handle(IPC.moveNote, (_event, path: unknown, courseKey: unknown) => attempt(() => moveNote(text(path), stringOrNull(courseKey))))
  ipcMain.handle(IPC.trashNote, (_event, path: unknown) =>
    attempt(async () => {
      await trashNote(text(path))
      return null
    })
  )
  ipcMain.handle(IPC.importPdfs, (event, courseKey: unknown, files: unknown) =>
    attempt(() =>
      importPdfs(stringOrNull(courseKey), Array.isArray(files) ? files.filter((file): file is string => typeof file === 'string') : undefined, BrowserWindow.fromWebContents(event.sender))
    )
  )
  ipcMain.on(IPC.showNoteInFolder, (_event, path: unknown) => {
    try {
      showInFolder(stringOrNull(path))
    } catch {
      // Not set up yet or outside the notes folder: nothing to show.
    }
  })
  ipcMain.handle(IPC.searchNotes, (_event, query: unknown) => searchNotes(text(query)))
}
