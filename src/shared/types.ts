// Contract between the main process and the UI. The preload script exposes SoutApi as window.sout.

import type { ThemeMode } from './themes'

export type View = 'today' | 'calendar' | 'deadlines' | 'exams' | 'grades' | 'notes' | 'settings'

const VIEWS: readonly string[] = ['today', 'calendar', 'deadlines', 'exams', 'grades', 'notes', 'settings']

export function isView(value: unknown): value is View {
  return typeof value === 'string' && VIEWS.includes(value)
}

/** Stored in ~/.config/sout/settings.json. Autostart is not in here: its .desktop file is the source of truth. */
export interface Settings {
  /** When started by the session autostart, stay in the tray instead of opening the main window. */
  startHiddenOnAutostart: boolean
  /** Closing the main window opens the mini view (instead of only the tray icon). */
  miniOnClose: boolean
  /** The "still running in the background" notification has been shown once. */
  closeHintShown: boolean
  /** Remind about deadlines this many minutes before they are due. */
  reminders: number[]
  /** Notify when an assignment or test opens. */
  notifyOpening: boolean
  /** Folder with the notes; empty until it has been set up in the notes view. */
  notesDir: string
  /** Notify about changes in the TISS calendar: room, time, dropped, new exam dates. */
  notifyChanges: boolean
  /** Notify about new assignments and tests in TUWEL. */
  notifyNewTasks: boolean
  /** Look for new grades in TUWEL and notify. */
  notifyGrades: boolean
  /** Notify about new announcements in the TUWEL courses. */
  notifyAnnouncements: boolean
  /** Download TUWEL course files into the course's notes folder ("Unterlagen"). */
  loadMaterials: boolean
  /** Exam registrations in TISS: notify when they open, remind before they close, report new exam dates. */
  notifyExamRegistration: boolean
  /** Light, dark, or as the system says. */
  themeMode: ThemeMode
  /** Colour scheme in light and in dark mode (ids from shared/themes.ts). */
  lightPalette: string
  darkPalette: string
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
  /** 'linux', 'win32' or 'darwin' – some texts and options depend on it. */
  platform: string
  /** Installed package (AppImage, RPM, installer) rather than run from the project folder. */
  packaged: boolean
  /** Display backend requested from Chromium; 'x11' means XWayland. */
  windowSystem: 'x11' | 'wayland' | 'default'
  sessionType: string
  desktop: string
  /** Can tray icons be shown right now (StatusNotifierWatcher running)? null = could not check. */
  trayAvailable: boolean | null
  userDataDir: string
  /** Linux: the autostart .desktop file; null where the system keeps login items (Windows, macOS). */
  autostartFile: string | null
  /** Command that starts sout (for a keyboard shortcut with --mini); null if there is none to offer. */
  launcher: string | null
}

export type EventKind = 'course' | 'group' | 'exam' | 'holiday' | 'other' | 'own' | 'appointment'

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
  /** Own appointments: id of the OwnEvent this (occurrence) comes from; null for TISS. */
  ownId: string | null
  /** Appointments booked in TUWEL: with whom, and the TUWEL page. */
  with?: string | null
  url?: string | null
}

/** An own appointment as entered: study group, study block … */
export interface OwnEventInput {
  title: string
  /** ISO date-time; for all-day events YYYY-MM-DD (end exclusive). */
  start: string
  end: string
  allDay: boolean
  location: string | null
  courseKey: string | null
  /** Repeats every week up to and including this day (YYYY-MM-DD); null = once. */
  repeatWeeklyUntil: string | null
}

export interface OwnEvent extends OwnEventInput {
  id: string
  /** Days (YYYY-MM-DD) of a weekly series that were deleted on their own. */
  skip: string[]
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
  /** From the course's TISS page (null until it has been read). */
  ects: number | null
  /** The course in TUWEL, as TISS links it. */
  tuwelUrl: string | null
  /** "LectureTube Lehrveranstaltung": lectures are streamed and recorded. */
  lectureTube: boolean
}

export type CoursePatch = Partial<Pick<Course, 'shortName' | 'color' | 'hidden'>>

/** Address and TUW-Maps code of a TU room. */
export interface RoomInfo {
  address: string
  mapCode: string
  /** Live stream of the room (LectureTube), if it has one. */
  lectureTube: string | null
}

export interface CalendarData {
  /** TISS appointments and the occurrences of own ones, by start. */
  events: CalendarEvent[]
  /** Own appointments as entered (for editing). */
  own: OwnEvent[]
  courses: Course[]
  /** Known rooms by their TISS name (only those used by the events). */
  rooms: Record<string, RoomInfo>
  /** When TISS was last read successfully (ISO), null if never. */
  syncedAt: string | null
  /** Message of the last failed sync, null if it worked. */
  error: string | null
  syncing: boolean
}

/** A room of an exam date. */
export interface ExamRoom {
  /** As TISS calls it, e.g. "GM 1 Audi. Max.- ARCH-INF". */
  name: string
  /** For the TUW-Maps link; null if unknown. */
  mapCode: string | null
  address: string | null
}

/** An exam date of one of your courses, from the course's public TISS page – with its registration window. */
export interface ExamDate {
  /** LVA number, day, time and name. */
  id: string
  courseKey: string
  /** Semester of the course page it is listed on, e.g. "2026W". */
  semester: string
  /** As TISS lists it ("Test 1", "Zwischentest"); some courses put the examiner's name here. */
  name: string
  /** "schriftlich", "mündlich" … */
  mode: string | null
  /** ISO date-times; for exams without a time 00:00–23:59 of that day. */
  start: string
  end: string
  allDay: boolean
  rooms: ExamRoom[]
  /** Registration window (ISO); null where TISS gives none. */
  opens: string | null
  closes: string | null
  /** How to register, as TISS says, e.g. "in TISS". */
  registration: string | null
  /** It is in your TISS calendar: you are registered. */
  registered: boolean
  /**
   * Not needed although you aren't registered for it – why: registered for another exam of the
   * course at the same time or another date of the same exam, or you took that exam already.
   */
  covered: string | null
  /** Marked as not needed in sout: no reminders, not on "Heute" or in the calendar. */
  dismissed: boolean
}

/**
 * Another deadline from the course page: a group registration window (only for courses you are in
 * no group of yet), or the last day to deregister from a course.
 */
export interface CourseDeadline {
  id: string
  courseKey: string
  semester: string
  kind: 'group' | 'deregister'
  /** Group registration: the groups this window is for. */
  groups: string[]
  opens: string | null
  closes: string | null
  /** Marked as not needed in sout. */
  dismissed: boolean
}

export interface ExamsData {
  /** Upcoming exam dates of the courses in the TISS calendar (hidden courses left out), by date. */
  exams: ExamDate[]
  /** Group registrations and deregistration deadlines still ahead, soonest first. */
  deadlines: CourseDeadline[]
  /** Course pages that couldn't be read the last time. */
  failed: { courseKey: string; error: string }[]
  /** How many course pages sout looks at. */
  courses: number
  syncedAt: string | null
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
  /** Tests in a lecture hall: the room, from an exam or appointment in the TISS calendar at that time. */
  room?: string | null
}

/** A post in a course's announcement forum ("Ankündigungen") in TUWEL. */
export interface Announcement {
  id: string
  courseKey: string | null
  course: string
  title: string
  /** Plain text. */
  text: string
  author: string
  at: string
  pinned: boolean
  url: string
}

/** A Kreuzerlübung in TUWEL: the examples to tick, and which ones you ticked. */
export interface CheckmarkSheet {
  id: number
  courseKey: string | null
  course: string
  name: string
  due: string | null
  cutoff: string | null
  examples: { name: string; checked: boolean }[]
  /** Something was submitted (before that nothing counts as ticked). */
  submitted: boolean
  grade: string | null
  feedback: string | null
  url: string
}

/** One graded item of a course in TUWEL. */
export interface GradeEntry {
  id: number
  name: string
  /** As TUWEL shows it, e.g. "8,50". */
  grade: string
  range: string | null
  percentage: string | null
  /** Plain text. */
  feedback: string | null
  gradedAt: string | null
}

/** A course's grades in TUWEL. */
export interface CourseGrades {
  courseKey: string | null
  course: string
  url: string
  /** Course total as TUWEL shows it; null if TUWEL doesn't show one. */
  total: string | null
  items: GradeEntry[]
}

/** A course's final grade as you enter it: 1–5, or "mit Erfolg teilgenommen". */
export type CourseGrade = '1' | '2' | '3' | '4' | '5' | 'passed'

/** A course in the ECTS and grade overview. */
export interface StudyCourse {
  key: string
  semester: string
  type: string | null
  title: string
  ects: number | null
  grade: CourseGrade | null
  /** Added by hand (not from the TISS calendar). */
  manual: boolean
}

export interface StudiesData {
  /** Newest semester first. */
  courses: StudyCourse[]
}

/** More from TUWEL than deadlines: announcements, Kreuzerlübungen, grades. */
export interface TuwelExtras {
  announcements: Announcement[]
  checkmarks: CheckmarkSheet[]
  grades: CourseGrades[]
  gradesCheckedAt: string | null
  syncedAt: string | null
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

/** Something that changed since the last sync, shown on "Heute" until dismissed. */
export interface Change {
  id: string
  /** When sout noticed it (ISO). */
  at: string
  kind: 'room' | 'time' | 'cancelled' | 'added' | 'exam' | 'task' | 'grade' | 'announcement' | 'material'
  title: string
  detail: string
  /** Where a click leads: a view of sout, or a TUWEL page. */
  view: View | null
  url: string | null
}

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

/** New versions from the GitHub releases. */
export interface UpdateState {
  current: string
  /** Newest version found; null if not known (yet). */
  latest: string | null
  /** available: newer version, to install by hand (macOS, RPM); ready: downloaded, installs on quit. */
  status: 'idle' | 'checking' | 'downloading' | 'available' | 'ready'
  /** This installation updates itself (Windows installer, Linux AppImage). */
  automatic: boolean
  error: string | null
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
  addOwnEvent(input: OwnEventInput): Promise<Result<CalendarData>>
  updateOwnEvent(id: string, input: OwnEventInput): Promise<Result<CalendarData>>
  /** With `day`, only that occurrence of a weekly series goes. */
  deleteOwnEvent(id: string, day: string | null): Promise<Result<CalendarData>>
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
  getChanges(): Promise<Change[]>
  /** One change, or with null all. */
  dismissChange(id: string | null): Promise<Change[]>
  onChangesChanged(listener: () => void): () => void
  getStudies(): Promise<StudiesData>
  updateStudyCourse(key: string, semester: string, patch: { grade?: CourseGrade | null; ects?: number | null }): Promise<StudiesData>
  /** Looks the course up in TISS (title, ECTS). */
  addStudyCourse(key: string, semester: string): Promise<Result<StudiesData>>
  removeStudyCourse(key: string, semester: string): Promise<StudiesData>
  onStudiesChanged(listener: () => void): () => void
  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  /** Quits and installs the downloaded version (Windows, AppImage). */
  installUpdate(): void
  /** Opens the download page or the update guide. */
  openUpdateHelp(): void
  onUpdateChanged(listener: () => void): () => void
  getTuwelExtras(): Promise<TuwelExtras>
  onTuwelExtrasChanged(listener: () => void): () => void
  getExams(): Promise<ExamsData>
  /** Reads the TISS calendar and the course pages again now. */
  syncExams(): Promise<ExamsData>
  /** "Brauche ich nicht" – or with false back again. */
  dismissExam(id: string, dismissed: boolean): Promise<ExamsData>
  onExamsChanged(listener: () => void): () => void
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
  /** A pasted picture, saved next to the note; returns its path relative to the note's folder. */
  saveNoteImage(path: string, data: Uint8Array, type: string): Promise<Result<string>>
  /** Creates the note a [[link]] points to, in folder `dir`. */
  createLinkedNote(dir: string, title: string): Promise<Result<string>>
  /** Saves the note as PDF (asks where); returns the file or null if cancelled. */
  exportNotePdf(path: string): Promise<Result<string | null>>
  /** The print page tells it's ready to be printed. */
  printReady(): void
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
  addOwnEvent: 'sout:add-own-event',
  updateOwnEvent: 'sout:update-own-event',
  deleteOwnEvent: 'sout:delete-own-event',
  calendarChanged: 'sout:calendar-changed',
  getTasks: 'sout:get-tasks',
  syncTasks: 'sout:sync-tasks',
  loginTuwel: 'sout:login-tuwel',
  logoutTuwel: 'sout:logout-tuwel',
  addTodo: 'sout:add-todo',
  setTaskDone: 'sout:set-task-done',
  deleteTodo: 'sout:delete-todo',
  tasksChanged: 'sout:tasks-changed',
  getChanges: 'sout:get-changes',
  dismissChange: 'sout:dismiss-change',
  changesChanged: 'sout:changes-changed',
  getStudies: 'sout:get-studies',
  updateStudyCourse: 'sout:update-study-course',
  addStudyCourse: 'sout:add-study-course',
  removeStudyCourse: 'sout:remove-study-course',
  studiesChanged: 'sout:studies-changed',
  getUpdateState: 'sout:get-update-state',
  checkForUpdates: 'sout:check-for-updates',
  installUpdate: 'sout:install-update',
  openUpdateHelp: 'sout:open-update-help',
  updateChanged: 'sout:update-changed',
  getTuwelExtras: 'sout:get-tuwel-extras',
  tuwelExtrasChanged: 'sout:tuwel-extras-changed',
  getExams: 'sout:get-exams',
  syncExams: 'sout:sync-exams',
  dismissExam: 'sout:dismiss-exam',
  examsChanged: 'sout:exams-changed',
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
  saveNoteImage: 'sout:save-note-image',
  createLinkedNote: 'sout:create-linked-note',
  exportNotePdf: 'sout:export-note-pdf',
  printReady: 'sout:print-ready',
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
