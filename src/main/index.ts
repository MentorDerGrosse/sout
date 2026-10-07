import { app, Menu } from 'electron'
import { IPC } from '../shared/types'
import { AUTOSTART_ARG } from './autostart'
import { startCalendarSync } from './calendar'
import { registerIpc } from './ipc'
import { getSettings } from './settings'
import { dumpTiss, runSmokeTest, smokeTestDir, tissDumpFile } from './smoke'
import { displayArgs, fixCursorSize, trayHostAvailable } from './system'
import { createTray, ensureTray } from './tray'
import { broadcast, createMiniWindow, notifyRunningInBackground, setOnMainClosed, showMain, toggleMini } from './windows'

/** `sout --mini` toggles the mini window – meant for a GNOME keyboard shortcut. */
const MINI_ARG = '--mini'

// The display backend has to come from the command line (see displayArgs). Setting it here with
// app.commandLine.appendSwitch would only reach the child processes: the windows would live on
// Wayland while the GPU process draws for X11, and nothing shows up. So if sout was started
// without a choice, start it again with the flag. `npm run dev` passes the flag itself.
const restartWithFlags =
  displayArgs().length > 0 &&
  !process.argv.some((arg) => arg.startsWith('--ozone-platform=')) &&
  !process.env['ELECTRON_RENDERER_URL']

fixCursorSize()

const smokeDir = smokeTestDir(process.argv)
const dumpFile = tissDumpFile(process.argv)

if (restartWithFlags) {
  app.relaunch({ args: [...process.argv.slice(1), ...displayArgs()] })
  app.exit(0)
} else if (smokeDir) {
  void runSmokeTest(smokeDir)
} else if (dumpFile) {
  void dumpTiss(dumpFile)
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
  registerIpc()
  const trayHost = await trayHostAvailable()
  createTray(trayHost)
  createMiniWindow()
  setOnMainClosed(() => void onMainClosed())
  startCalendarSync(() => broadcast(IPC.calendarChanged))

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
