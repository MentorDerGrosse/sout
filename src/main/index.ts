import { app, Menu } from 'electron'
import { IPC } from '../shared/types'
import { AUTOSTART_ARG, refreshAutostart } from './autostart'
import { startCalendarSync } from './calendar'
import { startReminders } from './reminders'
import { registerIpc } from './ipc'
import { getSettings } from './settings'
import { dumpTiss, dumpTuwel, isTuwelProbe, probeTuwel, runSmokeTest, smokeTestDir, tissDumpFile, tryRenewal, tryRenewalArg, tuwelDumpFile } from './smoke'
import { fixCursorSize, missingStartupArgs, trayHostAvailable } from './system'
import { startTasksSync } from './tasks'
import { createTray, ensureTray } from './tray'
import { broadcast, createMiniWindow, notifyRunningInBackground, setOnMainClosed, showMain, toggleMini } from './windows'

/** `sout --mini` toggles the mini window – meant for a GNOME keyboard shortcut. */
const MINI_ARG = '--mini'

// Display backend and language have to come from the command line (see startupArgs). Setting them
// here with app.commandLine.appendSwitch would only reach the child processes – for the display
// backend that means windows on Wayland, a GPU process drawing for X11, and nothing shows up.
// So if sout was started without them, start it again with them. `npm run dev` passes them itself.
const missingArgs = process.env['ELECTRON_RENDERER_URL'] ? [] : missingStartupArgs(process.argv)

fixCursorSize()

const smokeDir = smokeTestDir(process.argv)
const dumpFile = tissDumpFile(process.argv)
const tuwelDump = tuwelDumpFile(process.argv)

if (missingArgs.length > 0) {
  app.relaunch({ args: [...process.argv.slice(1), ...missingArgs] })
  app.exit(0)
} else if (smokeDir) {
  void runSmokeTest(smokeDir)
} else if (dumpFile) {
  void dumpTiss(dumpFile)
} else if (tuwelDump) {
  void dumpTuwel(tuwelDump)
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
  void app.whenReady().then(start)
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(null)
  refreshAutostart()
  registerIpc()
  const trayHost = await trayHostAvailable()
  createTray(trayHost)
  createMiniWindow()
  setOnMainClosed(() => void onMainClosed())
  startCalendarSync(() => broadcast(IPC.calendarChanged))
  startTasksSync(() => broadcast(IPC.tasksChanged))
  startReminders()

  const autostarted = process.argv.includes(AUTOSTART_ARG)
  if (process.argv.includes(MINI_ARG)) toggleMini()
  else if (!(autostarted && getSettings().startHiddenOnAutostart && trayHost !== false)) showMain()
}

/** Without a tray icon there would be no way back into a hidden app, so then closing quits. */
async function onMainClosed(): Promise<void> {
  const trayHost = await trayHostAvailable()
  if (trayHost === false) {
    app.quit()
    return
  }
  ensureTray(trayHost)
  notifyRunningInBackground()
}
