import type { CalendarEvent, Course } from '../shared/types'
import { roomName } from '../shared/tu'
import type { NewChange } from './changes'

// Compares two TISS syncs: moved appointments, room changes, dropped ones, new ones and exam
// registrations. Only what is coming up in the next two weeks – plus every exam registered for.

const SOON_MS = 14 * 24 * 60 * 60_000
/** More dropped appointments of one course than this: probably deregistered, one summary. */
const MAX_SINGLE_DROPS = 3

const whenFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })

const when = (event: CalendarEvent): string => (event.allDay ? dayFormat : whenFormat).format(new Date(event.allDay ? `${event.start}T00:00` : event.start))
const where = (event: CalendarEvent): string => (event.location ? ` · ${roomName(event.location)}` : '')

export function scheduleChanges(before: CalendarEvent[], after: CalendarEvent[], courses: Course[], now = new Date()): NewChange[] {
  // No comparison against nothing: first sync, or TISS answered with an empty calendar.
  if (before.length === 0 || after.length === 0) return []
  const relevant = (event: CalendarEvent): boolean => event.courseKey !== null && ['course', 'group', 'exam'].includes(event.kind)
  const soon = (event: CalendarEvent): boolean => {
    const start = Date.parse(event.start)
    return start > now.getTime() && start < now.getTime() + SOON_MS
  }
  const courseName = (key: string | null): string => courses.find((course) => course.key === key)?.shortName ?? key ?? ''
  const label = (event: CalendarEvent): string =>
    event.kind === 'course' ? courseName(event.courseKey) : `${courseName(event.courseKey)} · ${event.detail ?? (event.kind === 'exam' ? 'Prüfung' : 'Gruppe')}`

  const old = new Map(before.filter(relevant).map((event) => [event.id, event]))
  const next = new Map(after.filter(relevant).map((event) => [event.id, event]))
  const found: NewChange[] = []
  const dropped = new Map<string, CalendarEvent[]>()

  for (const [id, event] of old) {
    if (!soon(event)) continue
    const current = next.get(id)
    if (!current) {
      dropped.set(event.courseKey!, [...(dropped.get(event.courseKey!) ?? []), event])
    } else if (current.start !== event.start || current.end !== event.end) {
      found.push({ kind: 'time', title: `Verschoben: ${label(current)}`, detail: `${when(event)} → ${when(current)}${where(current)}`, view: 'calendar', url: null })
    } else if (current.location && current.location !== event.location) {
      const previous = event.location ? ` (bisher ${roomName(event.location)})` : ''
      found.push({ kind: 'room', title: `Raumwechsel: ${label(current)}`, detail: `${when(current)} in ${roomName(current.location)}${previous}`, view: 'calendar', url: null })
    }
  }
  for (const [courseKey, events] of dropped) {
    if (events.length > MAX_SINGLE_DROPS) {
      found.push({
        kind: 'cancelled',
        title: `${events.length} Termine von ${courseName(courseKey)} sind weg`,
        detail: 'Sie stehen nicht mehr im TISS-Kalender – abgemeldet oder abgesagt?',
        view: 'calendar',
        url: null
      })
    } else {
      for (const event of events) {
        found.push({ kind: 'cancelled', title: `Entfällt: ${label(event)}`, detail: `${when(event)} steht nicht mehr im TISS-Kalender.`, view: 'calendar', url: null })
      }
    }
  }
  for (const [id, event] of next) {
    if (old.has(id)) continue
    if (event.kind === 'exam' && Date.parse(event.start) > now.getTime()) {
      // Exam dates reach the TISS calendar when you register for them.
      found.push({ kind: 'exam', title: `Zur Prüfung angemeldet: ${courseName(event.courseKey)}`, detail: `${event.detail ?? 'Prüfung'} – ${when(event)}${where(event)}`, view: 'calendar', url: null })
    } else if (soon(event)) {
      found.push({ kind: 'added', title: `Neuer Termin: ${label(event)}`, detail: `${when(event)}${where(event)}`, view: 'calendar', url: null })
    }
  }
  return found
}
