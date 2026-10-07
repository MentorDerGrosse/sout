import { useCallback, useEffect, useState } from 'react'
import { COURSE_OVERVIEW, courseKeyOfFolder, EVENT_NOTE_FOLDERS, INBOX, isSemesterFolder, NOTE_FOLDERS, safeFileName } from '../../../shared/notes'
import { NOTE_FILE_SCHEME, type CalendarData, type CalendarEvent, type Course, type NoteNode, type NotesData, type Task } from '../../../shared/types'
import { currentSemester } from '../../../shared/tu'
import { isoDate } from './calendar'

export type NoteDirNode = Extract<NoteNode, { kind: 'dir' }>
export type NoteFileNode = Extract<NoteNode, { modified: number }>

/** The notes folder; updates when files change (also outside of sout) and when the window gets focus. */
export function useNotes(): { notes: NotesData | null; reload: () => Promise<void> } {
  const [notes, setNotes] = useState<NotesData | null>(null)
  const reload = useCallback(async () => setNotes(await window.sout.getNotes()), [])
  useEffect(() => {
    void reload()
    const unsubscribe = window.sout.onNotesChanged(() => void reload())
    const onFocus = (): void => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])
  return { notes, reload }
}

export function noteFileUrl(path: string): string {
  return `${NOTE_FILE_SCHEME}://notes/${path.split('/').map(encodeURIComponent).join('/')}`
}

export const dirOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
export const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
export const isPdf = (path: string): boolean => /\.pdf$/i.test(path)
export const isTextNote = (path: string): boolean => /\.(md|markdown|txt)$/i.test(path)

/** A link or image in a note ("../Folien/VO%201.pdf"), relative to the note's folder → path in the notes folder. */
export function resolveRelative(dir: string, target: string): string {
  let decoded = target
  try {
    decoded = decodeURI(target)
  } catch {
    // Not URL-encoded after all.
  }
  const parts = decoded.startsWith('/') ? [] : dir.split('/').filter(Boolean)
  for (const part of decoded.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

export function findNode(nodes: NoteNode[], path: string): NoteNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.kind === 'dir' && path.startsWith(`${node.path}/`)) return findNode(node.children, path)
  }
  return undefined
}

/** All files below the given nodes. */
export function filesIn(nodes: NoteNode[]): NoteFileNode[] {
  return nodes.flatMap((node) => (node.kind === 'dir' ? filesIn(node.children) : [node]))
}

/** The LVA number of the course folder a path is in, if any. */
export function courseKeyOf(path: string): string | null {
  for (const part of path.split('/')) {
    const key = courseKeyOfFolder(part)
    if (key) return key
  }
  return null
}

/** Path of the course folder a path is in ("2026W/Analysis (123.456)"), if any. */
export function courseDirOf(path: string): string | null {
  const parts = path.split('/')
  const index = parts.findIndex((part) => courseKeyOfFolder(part))
  return index === -1 ? null : parts.slice(0, index + 1).join('/')
}

const isDir = (node: NoteNode): node is NoteDirNode => node.kind === 'dir'

/** The course's folder: the one of that semester, otherwise the latest. */
export function courseFolder(notes: NotesData, key: string, semester: string): NoteDirNode | undefined {
  const semesters = notes.tree.filter((node): node is NoteDirNode => isDir(node) && isSemesterFolder(node.name))
  const ordered = [...semesters.filter((node) => node.name === semester), ...semesters.filter((node) => node.name !== semester).reverse()]
  for (const folder of ordered) {
    const found = folder.children.find((node): node is NoteDirNode => isDir(node) && courseKeyOfFolder(node.name) === key)
    if (found) return found
  }
  return undefined
}

const childDir = (dir: NoteDirNode | undefined, name: string): NoteDirNode | undefined =>
  dir?.children.find((node): node is NoteDirNode => isDir(node) && node.name === name)

/** Existing notes of a calendar appointment (named after its day), or null. */
export function eventNotePath(notes: NotesData | null, event: CalendarEvent): string | null {
  const folder = EVENT_NOTE_FOLDERS[event.kind]
  if (!notes?.root || !event.courseKey || !folder) return null
  const start = new Date(event.start)
  const dir = childDir(courseFolder(notes, event.courseKey, currentSemester(start).code), folder)
  const day = isoDate(start)
  return dir?.children.find((node) => node.kind === 'note' && node.name.startsWith(day))?.path ?? null
}

/** Existing notes of an assignment, or null. */
export function taskNotePath(notes: NotesData | null, task: Task): string | null {
  if (!notes?.root) return null
  const name = `${safeFileName(task.title) || 'Aufgabe'}.md`
  const dir = task.courseKey
    ? childDir(courseFolder(notes, task.courseKey, currentSemester(task.due ? new Date(task.due) : new Date()).code), NOTE_FOLDERS.exercise)
    : notes.tree.find((node): node is NoteDirNode => isDir(node) && node.name === INBOX)
  return dir?.children.find((node) => node.name === name)?.path ?? null
}

const dayFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })
const dayYearFormat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', year: 'numeric' })

/** "2026-10-07.md" → "Mi., 7. Okt.", "_fach.md" → "Übersicht", "Blatt 1.md" → "Blatt 1". */
export function displayName(name: string): string {
  if (name === COURSE_OVERVIEW) return 'Übersicht'
  const stem = name.replace(/\.(md|markdown|txt)$/i, '')
  const match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(stem)
  if (!match) return stem
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const format = date.getFullYear() === new Date().getFullYear() ? dayFormat : dayYearFormat
  return `${format.format(date)}${match[4]}`
}

/** What to call a course folder: the short name from the calendar, otherwise its name without the LVA number. */
export function courseLabel(folderName: string, courses: Course[]): string {
  const key = courseKeyOfFolder(folderName)
  return courses.find((course) => course.key === key)?.shortName ?? folderName.replace(/\s*\([^)]*\)$/, '')
}

const FOLDER_ORDER: string[] = [NOTE_FOLDERS.lecture, NOTE_FOLDERS.exercise, NOTE_FOLDERS.exam, NOTE_FOLDERS.slides]
const DATED = /^\d{4}-\d{2}-\d{2}/

function rank(node: NoteNode): number {
  if (node.name === COURSE_OVERVIEW) return 0
  if (isDir(node)) return FOLDER_ORDER.includes(node.name) ? 1 + FOLDER_ORDER.indexOf(node.name) : 10
  return 20
}

/** Overview first, then Vorlesung/Übung/Prüfung/Folien, other folders, files; dated notes newest first. */
export function sortForDisplay(nodes: NoteNode[]): NoteNode[] {
  return [...nodes].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    if (DATED.test(a.name) && DATED.test(b.name)) return b.name.localeCompare(a.name)
    return a.name.localeCompare(b.name, 'de', { numeric: true })
  })
}

/** The lecture or group happening right now (or about to start) – the default for a new note. */
export function currentLecture(calendar: CalendarData | null, now: Date): CalendarEvent | undefined {
  const soon = new Date(now.getTime() + 15 * 60_000).toISOString()
  const iso = now.toISOString()
  return calendar?.events.find(
    (event) => (event.kind === 'course' || event.kind === 'group') && !event.allDay && event.start <= soon && event.end > iso && event.courseKey
  )
}
