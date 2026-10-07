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
  /** Remind about deadlines this many minutes before they are due. */
  reminders: number[]
  /** Notify when an assignment or test opens. */
  notifyOpening: boolean
  /** Folder with the notes; empty until it has been set up in the notes view. */
  notesDir: string
}

/** Reminder times offered in the settings: minutes before a deadline → label. */
export const REMINDER_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 4320, label: '3 Tage' },
  { minutes: 1440, label: '1 Tag' },
  { minutes: 180, label: '3 Stunden' },
  { minutes: 60, label: '1 Stunde' }
]

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
  /** LVA number, e.g. "123.456"; null for holidays. */
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

/** Something to hand in or do: from TUWEL or an own to-do. */
export interface Task {
  id: string
  source: 'tuwel' | 'own'
  title: string
  /** What kind of activity, e.g. "Abgabe", "Test", "Kreuzerlübung", "To-do". */
  kindLabel: string
  /** Moodle module name ("assign", "quiz", …); null for own to-dos. */
  module: string | null
  /** What happens at `due`: "fällig", "schließt", … */
  dueLabel: string
  /** LVA number, e.g. "123.456" – links the task to the course from the TISS calendar. */
  courseKey: string | null
  /** Course name from TUWEL, for courses that aren't in the TISS calendar. */
  courseName: string | null
  due: string | null
  /** Last possible submission (Moodle "cut-off date"). */
  cutoff: string | null
  /** When the activity opens (tests, assignments) – in the future means it can't be done yet. */
  opens: string | null
  /** TUWEL says the next step is possible right now (false e.g. before it opens); null if unknown. */
  actionable: boolean | null
  timeLimitMinutes: number | null
  description: string | null
  /** How to hand in, e.g. "Datei-Upload (max. 1 Datei)", "Online-Text". */
  submission: string[]
  fileTypes: string | null
  status: 'open' | 'draft' | 'done'
  overdue: boolean
  url: string | null
  /** Moodle's label for the next step, e.g. "Abgabe hinzufügen". */
  actionLabel: string | null
}

export interface TasksData {
  tasks: Task[]
  /** A TUWEL token is stored. */
  connected: boolean
  /** Name of the TUWEL account. */
  user: string | null
  syncedAt: string | null
  error: string | null
  /** TUWEL rejected the token – log in again. */
  expired: boolean
  syncing: boolean
}

export interface TodoInput {
  title: string
  /** ISO date-time or null. */
  due: string | null
  courseKey: string | null
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** Files in the notes folder are served to the UI as sout-file://notes/<path> (PDF viewer, images). */
export const NOTE_FILE_SCHEME = 'sout-file'

/** A file or folder in the notes folder. Paths are relative to it, separated by '/'. */
export type NoteNode =
  | { kind: 'dir'; path: string; name: string; children: NoteNode[] }
  | { kind: 'note' | 'pdf' | 'file'; path: string; name: string; modified: number }

export interface NotesData {
  /** The notes folder; null until it has been set up. */
  root: string | null
  /** Proposed when setting up. */
  suggestedRoot: string
  /** Set up, but the folder is gone (deleted, drive not mounted). */
  missing: boolean
  /** Current semester, e.g. "2026W"; its course folders are shown first. */
  semester: string
  tree: NoteNode[]
  tags: { tag: string; count: number }[]
}

export interface NoteDoc {
  path: string
  content: string
  /** mtime when read; saving checks it to not overwrite changes made outside of sout. */
  modified: number
}

export type SaveResult = { ok: true; modified: number } | { ok: false; conflict: boolean; error: string }

export type NoteTemplate = 'lecture' | 'exercise' | 'summary' | 'blank'

export interface NewNote {
  /** LVA number; null puts the note into the Inbox. */
  courseKey: string | null
  template: NoteTemplate
  title: string
  /** Day of the lecture (YYYY-MM-DD), for the lecture template. */
  date?: string
}

export interface SearchHit {
  path: string
  /** First matching line (1-based) and its text. */
  line: number
  snippet: string
  /** How often the search words occur. */
  count: number
}

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
  getTasks(): Promise<TasksData>
  syncTasks(): Promise<TasksData>
  /** Opens the TU Wien login and stores the TUWEL token. */
  loginTuwel(): Promise<Result<TasksData>>
  logoutTuwel(): Promise<TasksData>
  addTodo(input: TodoInput): Promise<Result<TasksData>>
  setTaskDone(id: string, done: boolean): Promise<TasksData>
  deleteTodo(id: string): Promise<TasksData>
  onTasksChanged(listener: () => void): () => void
  getNotes(): Promise<NotesData>
  /** Creates the notes folder (null: the suggested one) with Inbox and course folders. */
  setupNotes(dir: string | null): Promise<Result<NotesData>>
  /** Folder picker; returns the chosen folder without using it yet. */
  chooseNotesDir(): Promise<string | null>
  readNote(path: string): Promise<Result<NoteDoc>>
  /** `baseModified` from readNote/writeNote: refuses to overwrite changes made outside of sout. */
  writeNote(path: string, content: string, baseModified: number | null): Promise<SaveResult>
  /** Last save when the window closes – synchronous, so it finishes before the page is gone. */
  flushNote(path: string, content: string, baseModified: number | null): boolean
  createNote(input: NewNote): Promise<Result<string>>
  /** The note for a calendar event (lecture notes and the like) – opened or created. */
  noteForEvent(eventId: string): Promise<Result<string>>
  /** The note for an assignment – opened or created. */
  noteForTask(taskId: string): Promise<Result<string>>
  /** Saves a quick note into the Inbox. */
  quickNote(text: string): Promise<Result<string>>
  renameNote(path: string, name: string): Promise<Result<string>>
  /** Into a course folder, or with null into the Inbox. */
  moveNote(path: string, courseKey: string | null): Promise<Result<string>>
  trashNote(path: string): Promise<Result<null>>
  /** Copies PDFs into the course's Folien folder (Inbox without course); without files a picker opens. */
  importPdfs(courseKey: string | null, files?: string[]): Promise<Result<string[]>>
  /** Shows the file (or with null the notes folder) in the file manager. */
  showNoteInFolder(path: string | null): void
  searchNotes(query: string): Promise<SearchHit[]>
  onNotesChanged(listener: () => void): () => void
  /** Path of a file dropped onto the window. */
  filePath(file: File): string
  openMain(view?: View, note?: string): void
  hideMini(): void
  /** Switch the main window to a view; `note` opens that note in the notes view. */
  onNavigate(listener: (view: View, note?: string) => void): () => void
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
  getTasks: 'sout:get-tasks',
  syncTasks: 'sout:sync-tasks',
  loginTuwel: 'sout:login-tuwel',
  logoutTuwel: 'sout:logout-tuwel',
  addTodo: 'sout:add-todo',
  setTaskDone: 'sout:set-task-done',
  deleteTodo: 'sout:delete-todo',
  tasksChanged: 'sout:tasks-changed',
  getNotes: 'sout:get-notes',
  setupNotes: 'sout:setup-notes',
  chooseNotesDir: 'sout:choose-notes-dir',
  readNote: 'sout:read-note',
  writeNote: 'sout:write-note',
  flushNote: 'sout:flush-note',
  createNote: 'sout:create-note',
  noteForEvent: 'sout:note-for-event',
  noteForTask: 'sout:note-for-task',
  quickNote: 'sout:quick-note',
  renameNote: 'sout:rename-note',
  moveNote: 'sout:move-note',
  trashNote: 'sout:trash-note',
  importPdfs: 'sout:import-pdfs',
  showNoteInFolder: 'sout:show-note-in-folder',
  searchNotes: 'sout:search-notes',
  notesChanged: 'sout:notes-changed',
  openMain: 'sout:open-main',
  hideMini: 'sout:hide-mini',
  navigate: 'sout:navigate',
  stateChanged: 'sout:state-changed'
} as const
