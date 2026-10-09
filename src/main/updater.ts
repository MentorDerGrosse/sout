import { app, net, Notification, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '../shared/types'
import { resourcePath } from './paths'
import { showMain } from './windows'

// New versions come from the GitHub releases of sout. Windows (installer) and Linux (AppImage)
// update themselves: download in the background, install when sout quits – or right away with
// "Jetzt neu starten". macOS and the RPM can't do that without a paid signature or root rights:
// there sout only says that there is a new version and leads to the download.

const OWNER = 'MentorDerGrosse'
const REPO = 'sout'
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases/latest`
/** The README part that explains updating by hand. */
const HOW_TO = `https://github.com/${OWNER}/${REPO}#aktualisieren`
const CHECK_INTERVAL_MS = 6 * 60 * 60_000

let state: UpdateState = { current: app.getVersion(), latest: null, status: 'idle', automatic: false, error: null }
let onChange: () => void = () => {}
let notified: string | null = null

export const updateState = (): UpdateState => ({ ...state })

/** The installer on Windows and the AppImage on Linux can replace themselves. */
const canSelfUpdate = (): boolean => app.isPackaged && (process.platform === 'win32' || (process.platform === 'linux' && Boolean(process.env['APPIMAGE'])))

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  onChange()
}

export function startUpdates(listener: () => void): void {
  onChange = listener
  // Only installed versions; one run from the project folder is updated with git.
  if (!app.isPackaged) return
  state.automatic = canSelfUpdate()
  if (state.automatic) {
    const { autoUpdater } = electronUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    // For trying updates out: a folder with a newer build served over http.
    const testFeed = process.env['SOUT_UPDATE_URL']
    if (testFeed) autoUpdater.setFeedURL({ provider: 'generic', url: testFeed })
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
    autoUpdater.on('update-not-available', () => set({ status: 'idle' }))
    autoUpdater.on('update-available', (info) => set({ status: 'downloading', latest: info.version }))
    autoUpdater.on('update-downloaded', (info) => {
      set({ status: 'ready', latest: info.version })
      tell(info.version, `sout ${info.version} ist geladen und wird beim Beenden installiert – oder gleich in den Einstellungen.`)
    })
    autoUpdater.on('error', (error) => set({ status: 'idle', error: error.message }))
  }
  setTimeout(() => void checkForUpdates(), 30_000)
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return updateState()
  try {
    if (state.automatic) {
      if (state.status !== 'ready' && state.status !== 'downloading') await electronUpdater.autoUpdater.checkForUpdates()
    } else {
      set({ status: 'checking', error: null })
      const latest = await latestRelease()
      const newer = latest !== null && isNewer(latest, state.current)
      set({ status: newer ? 'available' : 'idle', latest })
      if (newer) tell(latest, `sout ${latest} ist da. Klick hier – die README erklärt, wie du aktualisierst.`)
    }
  } catch (error) {
    set({ status: 'idle', error: error instanceof Error ? error.message : String(error) })
  }
  return updateState()
}

/** Windows and AppImage: quit and install the downloaded version. */
export function installUpdate(): void {
  if (state.status === 'ready') electronUpdater.autoUpdater.quitAndInstall()
}

export function openUpdateHelp(): void {
  void shell.openExternal(state.automatic ? RELEASES : HOW_TO)
}

/** The newest release on GitHub, e.g. "0.3.0"; null if there is none. */
async function latestRelease(): Promise<string | null> {
  const response = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20_000)
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub antwortet mit HTTP ${response.status}.`)
  const release = (await response.json()) as { tag_name?: string }
  return release.tag_name?.replace(/^v/, '') ?? null
}

/** "0.10.0" is newer than "0.9.1". */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (version: string): number[] => version.split(/[.-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0)
  const [a, b] = [parts(candidate), parts(current)]
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return false
}

/** Once per version. */
function tell(version: string, body: string): void {
  if (notified === version || !Notification.isSupported()) return
  notified = version
  const notification = new Notification({ title: `Neue Version von sout: ${version}`, body, icon: resourcePath('icon.png') })
  notification.on('click', () => (state.automatic ? showMain('settings') : openUpdateHelp()))
  notification.show()
}
