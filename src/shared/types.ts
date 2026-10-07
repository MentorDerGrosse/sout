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

export type EventKind = 'course' | 'group' | 'exam' | 'holiday' | 'other'

/** One appointment from the TISS calendar. */
export interface CalendarEvent {
  id: string
  kind: EventKind
  /** ISO date-time for timed events; YYYY-MM-DD for all-day events (end is exclusive). */
  start: string
  end: string
  allDay: boolean
  /** LVA number, e.g. "104.633"; null for holidays. */
  courseKey: string | null
  /** The raw title from TISS. */
  title: string
  /** What kind of appointment within the course, e.g. "Übungsgruppe 4" or "Vorlesung - Zusatztermin". */
  detail: string | null
  location: string | null
  /** Overflow rooms: TISS lists a lecture once per room ("Ausweich Räumlichkeiten", "Übertragung"). */
  otherLocations: string[]
}

/** A course ("Fach"), recognised from the LVA number in the TISS titles. */
export interface Course {
  key: string
  /** LVA type such as VO, UE, VU. */
  type: string | null
  title: string
  shortName: string
  color: string
  hidden: boolean
}

export type CoursePatch = Partial<Pick<Course, 'shortName' | 'color' | 'hidden'>>

/** Address and TUW-Maps code of a TU room. */
export interface RoomInfo {
  address: string
  mapCode: string
}

export interface CalendarData {
  events: CalendarEvent[]
  courses: Course[]
  /** Known rooms by their TISS name (only those used by the events). */
  rooms: Record<string, RoomInfo>
  /** When TISS was last read successfully (ISO), null if never. */
  syncedAt: string | null
  /** Message of the last failed sync, null if it worked. */
  error: string | null
  syncing: boolean
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
  getCalendar(): Promise<CalendarData>
  /** Reads TISS again now. */
  syncCalendar(): Promise<CalendarData>
  updateCourse(key: string, patch: CoursePatch): Promise<CalendarData>
  onCalendarChanged(listener: () => void): () => void
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
  getCalendar: 'sout:get-calendar',
  syncCalendar: 'sout:sync-calendar',
  updateCourse: 'sout:update-course',
  calendarChanged: 'sout:calendar-changed',
  openMain: 'sout:open-main',
  hideMini: 'sout:hide-mini',
  navigate: 'sout:navigate',
  stateChanged: 'sout:state-changed'
} as const
