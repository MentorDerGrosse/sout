// Contract between the main process and the UI. The preload script exposes SoutApi as window.sout.

export type View = 'today' | 'calendar' | 'deadlines' | 'notes' | 'settings'

const VIEWS: readonly string[] = ['today', 'calendar', 'deadlines', 'notes', 'settings']

export function isView(value: unknown): value is View {
  return typeof value === 'string' && VIEWS.includes(value)
}

/** Stored in ~/.config/sout/settings.json. Autostart is not in here: its .desktop file is the source of truth. */
export interface Settings {
  /** When started by the session autostart, stay in the tray instead of opening the main window. */
  startHiddenOnAutostart: boolean
  /** The "still running in the background" notification has been shown once. */
  closeHintShown: boolean
}

export type SecretKey = 'tissToken' | 'tuwelToken'

export interface SecretsStatus {
  tissToken: boolean
  tuwelToken: boolean
  /** Where Electron keeps its encryption key, e.g. 'gnome_libsecret'. 'basic_text' means unprotected. */
  backend: string
  secure: boolean
}

export interface AppInfo {
  version: string
  electronVersion: string
  /** Display backend requested from Chromium; 'x11' means XWayland. */
  windowSystem: 'x11' | 'wayland' | 'default'
  sessionType: string
  desktop: string
  /** Can tray icons be shown right now (StatusNotifierWatcher running)? null = could not check. */
  trayAvailable: boolean | null
  userDataDir: string
  autostartFile: string
  /** The `sout` command from `npm run install-desktop`, if installed. */
  launcher: string | null
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface SoutApi {
  getInfo(): Promise<AppInfo>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  getAutostart(): Promise<boolean>
  setAutostart(enabled: boolean): Promise<Result<boolean>>
  getSecretsStatus(): Promise<SecretsStatus>
  /** Accepts the calendar URL copied from TISS or just its token. */
  saveTissToken(input: string): Promise<Result<SecretsStatus>>
  /** Downloads the TISS feed once and counts its events. */
  testTiss(): Promise<Result<{ events: number }>>
  clearSecret(key: SecretKey): Promise<SecretsStatus>
  openMain(view?: View): void
  hideMini(): void
  onNavigate(listener: (view: View) => void): () => void
  /** Settings, autostart or tokens changed, possibly from the tray menu or the other window. */
  onStateChanged(listener: () => void): () => void
}

export const IPC = {
  getInfo: 'sout:get-info',
  getSettings: 'sout:get-settings',
  updateSettings: 'sout:update-settings',
  getAutostart: 'sout:get-autostart',
  setAutostart: 'sout:set-autostart',
  getSecretsStatus: 'sout:get-secrets-status',
  saveTissToken: 'sout:save-tiss-token',
  testTiss: 'sout:test-tiss',
  clearSecret: 'sout:clear-secret',
  openMain: 'sout:open-main',
  hideMini: 'sout:hide-mini',
  navigate: 'sout:navigate',
  stateChanged: 'sout:state-changed'
} as const
