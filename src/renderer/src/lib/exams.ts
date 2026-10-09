import { useEffect, useState } from 'react'
import { deadlineStatus, EXAM_URGENT_MS, examStatus, type ExamStatus } from '../../../shared/exams'
import type { CalendarData, Course, CourseDeadline, ExamDate, ExamsData } from '../../../shared/types'
import { formatTime, HOLIDAY_COLOR } from './calendar'
import { dueText, remainingText } from './tasks'

/** Exam dates with their registration windows. Reloads after a calendar sync too: that tells whether you are registered. */
export function useExams(): ExamsData | null {
  const [data, setData] = useState<ExamsData | null>(null)
  useEffect(() => {
    const load = (): void => void window.sout.getExams().then(setData)
    load()
    const offExams = window.sout.onExamsChanged(load)
    const offCalendar = window.sout.onCalendarChanged(load)
    return () => {
      offExams()
      offCalendar()
    }
  }, [])
  return data
}

export { deadlineStatus, examStatus, type ExamStatus }

export function examCourse(exam: ExamDate, calendar: CalendarData | null): { name: string; color: string; course: Course | undefined } {
  const course = calendar?.courses.find((candidate) => candidate.key === exam.courseKey)
  return { name: course?.shortName ?? exam.courseKey, color: course?.color ?? HOLIDAY_COLOR, course }
}

/** ISO dates compare as plain strings. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const byStart = (a: ExamDate, b: ExamDate): number => compare(a.start, b.start)

/**
 * The sections of the exams page: registration open now (closing soonest first), opening later
 * (opening soonest first), registered, and the rest – window over, alternative, not needed.
 */
export function splitExams(exams: ExamDate[], now: Date): { open: ExamDate[]; soon: ExamDate[]; registered: ExamDate[]; other: ExamDate[] } {
  const time = now.getTime()
  const status = (exam: ExamDate): ExamStatus => examStatus(exam, time)
  return {
    open: exams.filter((exam) => status(exam) === 'open').sort((a, b) => compare(a.closes ?? a.start, b.closes ?? b.start)),
    // Those without a registration window at the end, by date.
    soon: [
      ...exams.filter((exam) => status(exam) === 'soon').sort((a, b) => compare(a.opens!, b.opens!)),
      ...exams.filter((exam) => status(exam) === 'none').sort(byStart)
    ],
    registered: exams.filter((exam) => status(exam) === 'registered').sort(byStart),
    other: exams.filter((exam) => ['covered', 'closed', 'dismissed'].includes(status(exam))).sort(byStart)
  }
}

const DAY_MS = 24 * 60 * 60_000

/** For "Heute": registrations open now, and those opening within `days`. */
export function examsToAct(exams: ExamDate[], now: Date, days: number): ExamDate[] {
  const { open, soon } = splitExams(exams, now)
  const until = now.getTime() + days * DAY_MS
  return [...open, ...soon.filter((exam) => exam.opens && Date.parse(exam.opens) <= until)]
}

const within = (iso: string | null, now: Date, days: number): boolean => Boolean(iso) && Date.parse(iso!) - now.getTime() <= days * DAY_MS

/** For the mini window: registrations closing within three days, or opening within a day. */
export function examsDueSoon(exams: ExamDate[], now: Date): ExamDate[] {
  const { open, soon } = splitExams(exams, now)
  return [...open.filter((exam) => within(exam.closes, now, 3)), ...soon.filter((exam) => within(exam.opens, now, 1))]
}

/** Group registrations open now or opening within `days` (not marked as not needed), soonest end first. */
export function groupWindowsToAct(deadlines: CourseDeadline[], now: Date, days: number): CourseDeadline[] {
  return deadlines.filter((deadline) => {
    if (deadline.kind !== 'group') return false
    const status = deadlineStatus(deadline, now.getTime())
    return status === 'open' || (status === 'soon' && within(deadline.opens, now, days))
  })
}

/** For the mini window: group registrations closing within three days or opening within a day. */
export function groupWindowsDueSoon(deadlines: CourseDeadline[], now: Date): CourseDeadline[] {
  return groupWindowsToAct(deadlines, now, 1).filter((deadline) => deadlineStatus(deadline, now.getTime()) === 'soon' || within(deadline.closes, now, 3))
}

/** "Gruppenanmeldung", "LVA-Abmeldung" */
export const deadlineTitle = (deadline: CourseDeadline): string => (deadline.kind === 'group' ? 'Gruppenanmeldung' : 'LVA-Abmeldung')

/** "Mi10a, Mi10b, Mi12a und 4 weitere" */
export function groupsText(groups: string[], max = 3): string {
  return groups.length > max ? `${groups.slice(0, max).join(', ')} und ${groups.length - max} weitere` : groups.join(', ')
}

/** "bis Fr., 9. Okt., 18:00" or "öffnet Mi., 4. Nov., 08:00". */
export function deadlineText(deadline: CourseDeadline, now: Date): string {
  return deadlineStatus(deadline, now.getTime()) === 'soon' ? `öffnet ${dueText(deadline.opens!, now)}` : `bis ${dueText(deadline.closes!, now)}`
}

export function deadlineRemaining(deadline: CourseDeadline, now: Date): string {
  return remainingText(deadlineStatus(deadline, now.getTime()) === 'soon' ? deadline.opens! : deadline.closes!, now)
}

/** Ends within a day. */
export function deadlineUrgent(deadline: CourseDeadline, now: Date): boolean {
  return deadlineStatus(deadline, now.getTime()) === 'open' && Date.parse(deadline.closes!) - now.getTime() < EXAM_URGENT_MS
}

/** Registration window closes within a day. */
export function examUrgent(exam: ExamDate, status: ExamStatus, now: Date): boolean {
  return status === 'open' && Boolean(exam.closes) && Date.parse(exam.closes!) - now.getTime() < EXAM_URGENT_MS
}

/** Where the registration stands: "bis Do., 10. Dez., 23:59", "öffnet morgen, 08:00", "angemeldet" … */
export function windowText(exam: ExamDate, status: ExamStatus, now: Date): string {
  switch (status) {
    case 'open':
      return exam.closes ? `bis ${dueText(exam.closes, now)}` : 'Anmeldung offen'
    case 'soon':
      return `öffnet ${dueText(exam.opens!, now)}`
    case 'registered':
      return 'angemeldet'
    case 'covered':
      return exam.covered!
    case 'closed':
      return 'Anmeldung vorbei'
    case 'dismissed':
      return 'ausgeblendet'
    case 'none':
      return 'keine Anmeldefrist'
  }
}

/** Time left until what matters next: the window closing or opening, or the exam itself. */
export function examRemaining(exam: ExamDate, status: ExamStatus, now: Date): string | null {
  if (status === 'open' && exam.closes) return remainingText(exam.closes, now)
  if (status === 'soon') return remainingText(exam.opens!, now)
  if (status === 'registered' || status === 'covered') return remainingText(exam.start, now)
  return null
}

const dayFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })
const dayYearFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** "Do., 17. Dez., 10:00–12:00" – with the year if it isn't this one. */
export function examTimeText(exam: ExamDate, now: Date): string {
  const start = new Date(exam.start)
  const day = (start.getFullYear() === now.getFullYear() ? dayFormat : dayYearFormat).format(start)
  return exam.allDay ? day : `${day}, ${formatTime(exam.start)}–${formatTime(exam.end)}`
}

/** TUW-Maps: the room by its code, otherwise a search for its name. */
export function roomMapsUrl(room: { name: string; mapCode: string | null }, name: string): string {
  return `https://maps.tuwien.ac.at/?q=${encodeURIComponent(room.mapCode ?? name)}#map`
}
