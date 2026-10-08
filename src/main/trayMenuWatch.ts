import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

// GNOME's AppIndicator extension opens the tray menu on a single click; the "activate" that
// Electron reports as 'click' (and that Windows and macOS send on a single click) only comes with
// a double click there. Electron doesn't tell when its tray menu opens either. So on Linux sout
// watches the session bus for the menu's "opened" call addressed to its own process (busctl
// monitor, part of systemd) – then the mini view opens together with the menu. Without busctl,
// or if the bus doesn't allow watching, nothing happens and the menu works as before.

let monitor: ChildProcess | null = null
/** Bus names of this process (unique names and the tray's well-known name). */
let ownNames = new Set<string>()
let namesCheckedAt = 0
let lastOpened = 0

interface BusMessage {
  member?: string
  destination?: string
  payload?: { data?: unknown[] }
}

export function watchTrayMenu(onOpened: () => void): void {
  if (process.platform !== 'linux' || monitor) return
  try {
    monitor = spawn('busctl', ['--user', 'monitor', '--json=short', '--match', "type='method_call',interface='com.canonical.dbusmenu'"], {
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch {
    return
  }
  // No busctl, or it ended: then the menu simply works as before.
  monitor.on('error', () => {
    monitor = null
  })
  monitor.on('exit', () => {
    monitor = null
  })
  createInterface({ input: monitor.stdout! }).on('line', (line) => {
    const message = parse(line)
    if (!message || !opensMenu(message)) return
    void isOwn(message.destination ?? '').then((own) => {
      if (!own || Date.now() - lastOpened < 1000) return
      lastOpened = Date.now()
      onOpened()
    })
  })
}

export function stopWatchingTrayMenu(): void {
  monitor?.kill()
  monitor = null
}

function parse(line: string): BusMessage | null {
  try {
    return JSON.parse(line) as BusMessage
  } catch {
    return null
  }
}

/**
 * The top-level menu (id 0) opened: Event(0, "opened", …). Not AboutToShow(0) – the extension
 * sends that also when it picks up the icon (at every start), without opening anything.
 */
function opensMenu(message: BusMessage): boolean {
  const data = message.payload?.data ?? []
  return message.member === 'Event' && data[0] === 0 && data[1] === 'opened'
}

/** Addressed to this process? The well-known name contains our PID; unique names are looked up. */
async function isOwn(destination: string): Promise<boolean> {
  if (destination.startsWith(`org.freedesktop.StatusNotifierItem-${process.pid}-`) || ownNames.has(destination)) return true
  if (!destination.startsWith(':') || Date.now() - namesCheckedAt < 5000) return false
  namesCheckedAt = Date.now()
  ownNames = await namesOfThisProcess()
  return ownNames.has(destination)
}

function namesOfThisProcess(): Promise<Set<string>> {
  return new Promise((resolve) => {
    execFile('busctl', ['--user', 'list', '--json=short'], { timeout: 3000 }, (error, stdout) => {
      try {
        const entries = error ? [] : (JSON.parse(stdout) as { name: string; pid?: number }[])
        resolve(new Set(entries.filter((entry) => entry.pid === process.pid).map((entry) => entry.name)))
      } catch {
        resolve(new Set())
      }
    })
  })
}
