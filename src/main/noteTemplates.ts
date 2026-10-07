import type { CalendarEvent, Course, Task } from '../shared/types'
import { roomName, semesterLabel, tissCourseUrl } from '../shared/tu'

// What a new note starts with. Plain Markdown: a title, one line about what it belongs to, sections.

export type CourseInfo = Pick<Course, 'key' | 'title' | 'type'>

const longDate = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const time = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' })

/** Local calendar day as YYYY-MM-DD – lecture notes are named after it. */
export function isoDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const infoLine = (...parts: (string | null | undefined | false)[]): string => parts.filter(Boolean).join(' · ')

function when(event: CalendarEvent): string {
  const start = new Date(event.start)
  if (event.allDay) return shortDate.format(start)
  return `${shortDate.format(start)}, ${time.format(start)}–${time.format(new Date(event.end))}`
}

const sections = (...titles: string[]): string[] => titles.flatMap((title) => [`## ${title}`, '', '', ''])

function note(title: string, info: string, body: string[]): string {
  return [`# ${title}`, '', ...(info ? [info, ''] : []), ...body].join('\n').replace(/\n+$/, '\n')
}

/** _fach.md: which course this folder belongs to and where to find more. */
export function courseOverview(course: CourseInfo, semester: string): string {
  return note(course.title, infoLine(`LVA ${course.key}${course.type ? ` ${course.type}` : ''}`, semesterLabel(semester), `[TISS](${tissCourseUrl(course.key, semester)})`), [
    '## Infos',
    '',
    '- Beurteilung:',
    '- Prüfung:',
    '- Unterlagen:',
    '- Kontakt:',
    ''
  ])
}

const LECTURE_SECTIONS = ['Notizen', 'Offene Fragen']
const EXERCISE_SECTIONS = ['Aufgabe 1']
const SUMMARY_SECTIONS = ['Überblick', 'Definitionen', 'Sätze und Formeln', 'Beispiele', 'Offene Fragen']

/** Notes for a calendar appointment: lecture, exercise group, or preparing for an exam. */
export function eventNote(event: CalendarEvent, course: CourseInfo): string {
  const day = longDate.format(new Date(event.start))
  const info = infoLine(`**${course.title}**`, when(event), event.location && roomName(event.location))
  if (event.kind === 'exam') return note(`Prüfung ${day}`, info, sections(...SUMMARY_SECTIONS))
  if (event.kind === 'group') return note(`${event.detail ?? 'Übung'} ${day}`, info, sections(...LECTURE_SECTIONS))
  return note(`Vorlesung ${day}`, info, sections(...LECTURE_SECTIONS))
}

/** Lecture notes for a day without a matching appointment in the calendar. */
export function lectureNote(date: Date, course: CourseInfo | null): string {
  return note(`Vorlesung ${longDate.format(date)}`, infoLine(course && `**${course.title}**`, shortDate.format(date)), sections(...LECTURE_SECTIONS))
}

const dueFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Working on an assignment from TUWEL (or an own to-do). */
export function taskNote(task: Task, course: CourseInfo | null): string {
  const info = infoLine(
    course ? `**${course.title}**` : task.courseName && `**${task.courseName}**`,
    task.due ? `${task.kindLabel} ${task.dueLabel} ${dueFormat.format(new Date(task.due))}` : task.kindLabel,
    task.url && `[In TUWEL öffnen](${task.url})`
  )
  return note(task.title, info, sections(...EXERCISE_SECTIONS))
}

export function exerciseNote(title: string, course: CourseInfo | null): string {
  return note(title, infoLine(course && `**${course.title}**`), sections(...EXERCISE_SECTIONS))
}

/** For exam preparation; mentions the next exam of the course if the calendar knows one. */
export function summaryNote(title: string, course: CourseInfo | null, exam: CalendarEvent | undefined): string {
  return note(title, infoLine(course && `**${course.title}**`, exam && `Prüfung ${when(exam)}`, exam?.location && roomName(exam.location)), sections(...SUMMARY_SECTIONS))
}

export function blankNote(title: string): string {
  return `# ${title}\n\n`
}
