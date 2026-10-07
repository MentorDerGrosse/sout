import { app, dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import { COURSE_OVERVIEW, EVENT_NOTE_FOLDERS, INBOX, NOTE_FOLDERS, safeFileName } from '../shared/notes'
import type { CalendarEvent, NewNote, NoteTemplate, NotesData } from '../shared/types'
import { currentSemester, isCourseKey } from '../shared/tu'
import { calendarData } from './calendar'
import { readJson, writeJson } from './jsonFile'
import {
  copyIntoNotes,
  createNoteFile,
  findCourseDir,
  findFile,
  joinRel,
  moveNoteTo,
  notesChanged,
  notesData,
  notesRoot,
  suggestedRoot,
  watchNotes
} from './notes'
import { blankNote, courseOverview, eventNote, exerciseNote, isoDate, lectureNote, summaryNote, taskNote, type CourseInfo } from './noteTemplates'
import { updateSettings } from './settings'
import { tasksData } from './tasks'

// Notes that belong to courses: the folder per course and semester, notes for calendar events and
// assignments, templates, quick notes into the Inbox, slides.
// The folder layout is described in src/shared/notes.ts.

const FOLDERS = NOTE_FOLDERS
const TEMPLATE_FOLDERS: Record<NoteTemplate, string> = { lecture: FOLDERS.lecture, exercise: FOLDERS.exercise, summary: FOLDERS.exam, blank: '' }
const TEMPLATES = Object.keys(TEMPLATE_FOLDERS) as NoteTemplate[]

/** Which course folders sout has created already – so a folder the user deleted stays deleted. */
interface State {
  root: string
  created: string[]
}

const stateFile = (): string => join(app.getPath('userData'), 'notes.json')

function loadState(root: string): State {
  const data = readJson(stateFile()) as Partial<State> | undefined
  return data?.root === root && Array.isArray(data.created) ? { root, created: data.created } : { root, created: [] }
}

/** Creates the notes folder (or uses an existing one) with the Inbox and this semester's course folders. */
export function setupNotes(dir: string | null): NotesData {
  const root = dir ?? suggestedRoot()
  if (!isAbsolute(root)) throw new Error('Bitte einen vollständigen Pfad angeben.')
  if (existsSync(root) && !statSync(root).isDirectory()) throw new Error('Dort liegt eine Datei, kein Ordner.')
  mkdirSync(join(root, INBOX), { recursive: true })
  updateSettings({ notesDir: root })
  syncCourseFolders()
  watchNotes()
  notesChanged()
  return notesData()
}

export async function chooseNotesDir(parent: BrowserWindow | null): Promise<string | null> {
  const options: OpenDialogOptions = { title: 'Ordner für die Notizen', defaultPath: notesRoot() ?? suggestedRoot(), properties: ['openDirectory', 'createDirectory'] }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** A folder for every course that has lectures or groups this semester – each one created once only. */
export function syncCourseFolders(): void {
  const root = notesRoot()
  if (!root || !existsSync(root)) return
  const semester = currentSemester(new Date()).code
  const data = calendarData()
  const current = new Set(
    data.events
      .filter((event) => event.courseKey && (event.kind === 'course' || event.kind === 'group') && currentSemester(new Date(event.start)).code === semester)
      .map((event) => event.courseKey!)
  )
  const state = loadState(root)
  let changed = false
  for (const course of data.courses) {
    const id = `${semester}/${course.key}`
    if (course.hidden || !current.has(course.key) || state.created.includes(id)) continue
    if (!findCourseDir(course.key, semester, true)) createCourseDir(course, semester)
    state.created.push(id)
    changed = true
  }
  if (changed) writeJson(stateFile(), state)
}

function createCourseDir(course: CourseInfo, semester: string): string {
  // TU titles often end in "für Informatik und Wirtschaftsinformatik" – too long for a folder name.
  const dir = `${semester}/${safeFileName(course.title.split(' für ')[0]!) || 'Fach'} (${course.key})`
  createNoteFile(dir, COURSE_OVERVIEW, courseOverview(course, semester))
  return dir
}

/** The course's folder (its semester's, or else its latest one), created if there is none yet. */
function courseDir(course: CourseInfo, date: Date): string {
  const semester = currentSemester(date).code
  return findCourseDir(course.key, semester) ?? createCourseDir(course, semester)
}

/** Name and type from the calendar; for TUWEL courses without TISS appointments the TUWEL name. */
function courseInfo(key: string): CourseInfo {
  const course = calendarData().courses.find((candidate) => candidate.key === key)
  if (course) return course
  const task = tasksData().tasks.find((candidate) => candidate.courseKey === key && candidate.courseName)
  return { key, title: task?.courseName ?? key, type: null }
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** Lecture notes are named after their day; an existing one is reused instead of starting a second. */
function noteOfDay(dir: string, date: Date): string | null {
  const day = isoDate(date)
  return findFile(dir, (name) => name.startsWith(day) && name.endsWith('.md'))
}

export function createNote(input: Partial<NewNote>): string {
  const template = input.template && TEMPLATES.includes(input.template) ? input.template : 'blank'
  const date = isDay(input.date) ? new Date(`${input.date}T12:00`) : new Date()
  const course = isCourseKey(input.courseKey) ? courseInfo(input.courseKey) : null
  const dir = course ? joinRel(courseDir(course, date), TEMPLATE_FOLDERS[template]) : INBOX
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const file = (fallback: string): string => `${safeFileName(title) || fallback}.md`

  switch (template) {
    case 'lecture': {
      const existing = noteOfDay(dir, date)
      if (existing) return existing
      const event = course ? eventOn(course.key, date) : undefined
      const content = event && course ? eventNote(event, course) : lectureNote(date, course)
      return createNoteFile(dir, course ? `${isoDate(date)}.md` : `Vorlesung ${isoDate(date)}.md`, content)
    }
    case 'exercise':
      return createNoteFile(dir, file('Übung'), exerciseNote(title || 'Übung', course))
    case 'summary':
      return createNoteFile(dir, file('Zusammenfassung'), summaryNote(title || 'Zusammenfassung', course, course ? nextExam(course.key) : undefined))
    case 'blank':
      return createNoteFile(dir, file('Notiz'), blankNote(title || 'Notiz'))
  }
}

/** The lecture of that course on that day, if the calendar has one. */
function eventOn(courseKey: string, date: Date): CalendarEvent | undefined {
  const day = isoDate(date)
  return calendarData().events.find((event) => event.courseKey === courseKey && event.kind === 'course' && isoDate(new Date(event.start)) === day)
}

function nextExam(courseKey: string): CalendarEvent | undefined {
  const now = new Date().toISOString()
  return calendarData().events.find((event) => event.courseKey === courseKey && event.kind === 'exam' && event.end > now)
}

/** The notes for an appointment (lecture, group, exam): opened if they exist, created otherwise. */
export function noteForEvent(eventId: string): string {
  const event = calendarData().events.find((candidate) => candidate.id === eventId)
  const folder = event && EVENT_NOTE_FOLDERS[event.kind]
  if (!event?.courseKey || !folder) throw new Error('Zu diesem Termin gibt es kein Fach.')
  const course = courseInfo(event.courseKey)
  const start = new Date(event.start)
  const dir = joinRel(courseDir(course, start), folder)
  return noteOfDay(dir, start) ?? createNoteFile(dir, `${isoDate(start)}.md`, eventNote(event, course))
}

/** The notes for an assignment, in the course's Übung folder (Inbox without course). */
export function noteForTask(taskId: string): string {
  const task = tasksData().tasks.find((candidate) => candidate.id === taskId)
  if (!task) throw new Error('Diese Aufgabe gibt es nicht mehr.')
  const course = isCourseKey(task.courseKey) ? courseInfo(task.courseKey) : null
  const dir = course ? joinRel(courseDir(course, task.due ? new Date(task.due) : new Date()), FOLDERS.exercise) : INBOX
  const name = `${safeFileName(task.title) || 'Aufgabe'}.md`
  return findFile(dir, (candidate) => candidate === name) ?? createNoteFile(dir, name, taskNote(task, course))
}

/** From the mini window: straight into the Inbox, named after its first line. */
export function quickNote(text: string): string {
  const content = typeof text === 'string' ? text.trim() : ''
  if (!content) throw new Error('Die Notiz ist leer.')
  // The file is named after the first line, without Markdown marks ("# ", "- [ ] ") and tags.
  const firstLine = content
    .split('\n')[0]!
    .replace(/^\s*(?:#+|[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/(^|\s)#\p{L}[\p{L}\p{N}_/-]*/gu, ' ')
  return createNoteFile(INBOX, `${safeFileName(firstLine, 50) || 'Schnellnotiz'}.md`, `${content}\n`)
}

/** Into a course folder (PDFs into its Folien), or with null back into the Inbox. */
export function moveNote(path: string, courseKey: string | null): string {
  if (!isCourseKey(courseKey)) return moveNoteTo(path, INBOX)
  const dir = courseDir(courseInfo(courseKey), new Date())
  return moveNoteTo(path, extname(path).toLowerCase() === '.pdf' ? joinRel(dir, FOLDERS.slides) : dir)
}

/** Slides into the course's Folien folder. Without `files` a file picker opens. */
export async function importPdfs(courseKey: string | null, files: string[] | undefined, parent: BrowserWindow | null): Promise<string[]> {
  let sources = files
  if (!sources) {
    const options: OpenDialogOptions = { title: 'PDFs hinzufügen', properties: ['openFile', 'multiSelections'], filters: [{ name: 'PDF', extensions: ['pdf'] }] }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return []
    sources = result.filePaths
  }
  const pdfs = sources.filter(
    (file) => typeof file === 'string' && isAbsolute(file) && extname(file).toLowerCase() === '.pdf' && existsSync(file) && statSync(file).isFile()
  )
  if (pdfs.length === 0) throw new Error('Nur PDF-Dateien lassen sich hier ablegen.')
  const dir = isCourseKey(courseKey) ? joinRel(courseDir(courseInfo(courseKey), new Date()), FOLDERS.slides) : INBOX
  return copyIntoNotes(pdfs, dir)
}
