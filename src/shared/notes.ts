import type { EventKind } from './types'

// How the notes folder is laid out. The main process creates it this way, the UI finds things by it:
//
//   <Notizordner>/Inbox/                                  quick notes, not sorted yet
//   <Notizordner>/2026W/Analysis (123.456)/_fach.md       one folder per course and semester
//                                         /Vorlesung/2026-10-07.md
//                                         /Übung/  /Prüfung/  /Folien/

export const INBOX = 'Inbox'
export const COURSE_OVERVIEW = '_fach.md'
export const NOTE_FOLDERS = { lecture: 'Vorlesung', exercise: 'Übung', exam: 'Prüfung', slides: 'Folien' } as const

/** Notes of a calendar appointment go into this folder of the course, named after the day. */
export const EVENT_NOTE_FOLDERS: Partial<Record<EventKind, string>> = {
  course: NOTE_FOLDERS.lecture,
  group: NOTE_FOLDERS.exercise,
  exam: NOTE_FOLDERS.exam
}

export const isSemesterFolder = (name: string): boolean => /^\d{4}[WS]$/.test(name)

/** Course folders end in their LVA number: "Analysis (123.456)" → "123.456". */
export function courseKeyOfFolder(name: string): string | null {
  return /\((\d{3}\.[0-9A-Z]{3})\)$/.exec(name)?.[1] ?? null
}

/** Usable as a file name on every system: no slashes or reserved characters, not too long. */
export function safeFileName(text: string, maxLength = 60): string {
  let name = text.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (name.length > maxLength) {
    const cut = name.slice(0, maxLength)
    const space = cut.lastIndexOf(' ')
    name = space > maxLength / 2 ? cut.slice(0, space) : cut
  }
  return name.replace(/^[.\s]+|[.\s]+$/g, '')
}
