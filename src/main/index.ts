import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC } from '../shared/types'
import { refreshAutostart, startedByAutostart } from './autostart'
import { startChanges } from './changes'
import { startCalendarSync } from './calendar'
import { syncCourseFolders } from './courseNotes'
import { startExamSync, syncExams } from './exams'
import { startNotesWatch } from './notes'
import { handleNotesScheme, registerNotesScheme } from './notesProtocol'
import { refreshUrgent, startReminders } from './reminders'
import { registerIpc } from './ipc'
import { getSettings } from './settings'
import {
  dumpExams,
  dumpTiss,
  dumpTuwel,
  examsDumpFile,
  isTuwelProbe,
  probeTuwel,
  runSmokeTest,
  smokeTestDir,
  tissDumpFile,
  tryRenewal,
  tryRenewalArg,
  tuwelCalls,
  tuwelCallsFile,
  tuwelDumpFile
} from './smoke'
import { fixCursorSize, missingStartupArgs, trayHostAvailable } from './system'
import { startTasksSync } from './tasks'
import { startTuwelExtras } from './tuwelExtras'
import { startStudies } from './studies'
import { createTray, ensureTray } from './tray'
import { applyTheme, broadcast, createMiniWindow, miniTakesOver, notifyRunningInBackground, setOnMainClosed, showMain, syncDock, toggleMini } from './windows'

/** `sout --mini` toggles the mini window – meant for a GNOME keyboard shortcut. */
const MINI_ARG = '--mini'
/** Also in electron-builder.yml (appId). */
const APP_ID = 'io.github.mentordergrosse.sout'

// Display backend and language have to come from the command line (see startupArgs). Setting them
// here with app.commandLine.appendSwitch would only reach the child processes – for the display
// backend that means windows on Wayland, a GPU process drawing for X11, and nothing shows up.
// So if sout was started without them, start it again with them. `npm run dev` passes them itself.
const missingArgs = process.env['ELECTRON_RENDERER_URL'] ? [] : missingStartupArgs(process.argv)

fixCursorSize()
registerNotesScheme()
// Windows shows notifications only for apps with an ID – the same one the installer registers.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

const smokeDir = smokeTestDir(process.argv)
const dumpFile = tissDumpFile(process.argv)
const tuwelDump = tuwelDumpFile(process.argv)
const examsDump = examsDumpFile(process.argv)
const tuwelCallsDump = tuwelCallsFile(process.argv)

if (missingArgs.length > 0) {
  // An AppImage runs from a temporary mount that is gone after exit: start the AppImage file itself again.
  app.relaunch({ execPath: process.env['APPIMAGE'] ?? process.execPath, args: [...process.argv.slice(1), ...missingArgs] })
  app.exit(0)
} else if (smokeDir) {
  void runSmokeTest(smokeDir)
} else if (dumpFile) {
  void dumpTiss(dumpFile)
} else if (tuwelDump) {
  void dumpTuwel(tuwelDump)
} else if (examsDump) {
  void dumpExams(examsDump)
} else if (tuwelCallsDump) {
  void tuwelCalls(tuwelCallsDump)
} else if (isTuwelProbe(process.argv)) {
  void probeTuwel()
} else if (tryRenewalArg(process.argv)) {
  void tryRenewal(tryRenewalArg(process.argv)!)
} else if (!app.requestSingleInstanceLock()) {
  // Already running: the first instance gets our arguments via 'second-instance'.
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes(MINI_ARG)) toggleMini()
    else showMain()
  })
  // Without a listener Electron would quit once no window is left; we keep running in the tray.
  app.on('window-all-closed', () => {})
  // macOS: a click on the Dock icon (also sent while starting – the start decides on its own then).
  app.on('activate', () => {
    if (started) showMain()
  })
  void app.whenReady().then(start)
}

let started = false

async function start(): Promise<void> {
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate(MAC_MENU) : null)
  applyTheme()
  refreshAutostart()
  registerIpc()
  handleNotesScheme()
  const trayHost = await trayHostAvailable()
  createTray(trayHost)
  createMiniWindow()
  setOnMainClosed(() => void onMainClosed())
  startNotesWatch(() => broadcast(IPC.notesChanged))
  startChanges(() => broadcast(IPC.changesChanged))
  startCalendarSync(() => {
    broadcast(IPC.calendarChanged)
    // New courses get their notes folder (once the notes are set up).
    syncCourseFolders()
    // A new course: read its exam dates. A new entry in the calendar may be an exam registration.
    void syncExams()
    refreshUrgent()
  })
  startExamSync(() => {
    broadcast(IPC.examsChanged)
    refreshUrgent()
  })
  startTasksSync(() => {
    broadcast(IPC.tasksChanged)
    refreshUrgent()
  })
  startStudies(() => broadcast(IPC.studiesChanged))
  // Announcements, Kreuzerl, grades – and booked appointments (calendar) and booking periods (tasks).
  startTuwelExtras(() => {
    broadcast(IPC.tuwelExtrasChanged)
    broadcast(IPC.calendarChanged)
    broadcast(IPC.tasksChanged)
    refreshUrgent()
  })
  startReminders()

  const autostarted = startedByAutostart()
  if (process.argv.includes(MINI_ARG)) toggleMini()
  else if (!(autostarted && getSettings().startHiddenOnAutostart && trayHost !== false)) showMain()
  // Started into the background on a Mac: no Dock icon until the main window opens.
  syncDock()
  started = true
}

/**
 * macOS needs an app menu: without "Bearbeiten" Cmd+C/V/X/A don't work in text fields. Linux and
 * Windows get no menu bar.
 */
const MAC_MENU: MenuItemConstructorOptions[] = [
  {
    label: 'sout',
    submenu: [
      { role: 'about', label: 'Über sout' },
      { type: 'separator' },
      { role: 'hide', label: 'sout ausblenden' },
      { role: 'hideOthers', label: 'Andere ausblenden' },
      { role: 'unhide', label: 'Alle einblenden' },
      { type: 'separator' },
      { role: 'quit', label: 'sout beenden' }
    ]
  },
  {
    label: 'Bearbeiten',
    submenu: [
      { role: 'undo', label: 'Widerrufen' },
      { role: 'redo', label: 'Wiederholen' },
      { type: 'separator' },
      { role: 'cut', label: 'Ausschneiden' },
      { role: 'copy', label: 'Kopieren' },
      { role: 'paste', label: 'Einsetzen' },
      { role: 'selectAll', label: 'Alles auswählen' }
    ]
  },
  {
    label: 'Fenster',
    submenu: [
      { role: 'minimize', label: 'Im Dock ablegen' },
      { role: 'close', label: 'Fenster schließen' }
    ]
  }
]

/** Without a tray icon there would be no way back into a hidden app, so then closing quits. */
async function onMainClosed(): Promise<void> {
  const trayHost = await trayHostAvailable()
  if (trayHost === false) {
    app.quit()
    return
  }
  ensureTray(trayHost)
  miniTakesOver()
  notifyRunningInBackground()
}
