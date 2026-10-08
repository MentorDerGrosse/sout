import { useEffect, useState } from 'react'
import type { CalendarData, CalendarEvent, Course, EventKind } from '../../../shared/types'
import { currentSemester, roomName, tissCourseUrl as courseUrl } from '../../../shared/tu'

/** The cached TISS calendar; updates when a sync finishes or a course is changed. */
export function useCalendar(): CalendarData | null {
  const [data, setData] = useState<CalendarData | null>(null)
  useEffect(() => {
    const load = (): void => void window.sout.getCalendar().then(setData)
    load()
    return window.sout.onCalendarChanged(load)
  }, [])
  return data
}

export const KIND_LABELS: Record<EventKind, string> = {
  course: 'Lehrveranstaltung',
  group: 'Gruppe',
  exam: 'Prüfung',
  holiday: 'vorlesungsfrei',
  other: 'Termin',
  own: 'Eigener Termin'
}

export const HOLIDAY_COLOR = '#8a8f98'
/** Own appointments without a course. */
export const OWN_COLOR = '#64748b'

/** Colour of the course; grey for holidays, slate for own appointments without a course. */
export function eventColor(event: CalendarEvent, course: Course | undefined): string {
  return course?.color ?? (event.kind === 'own' ? OWN_COLOR : HOLIDAY_COLOR)
}

export function courseMap(data: CalendarData): Map<string, Course> {
  return new Map(data.courses.map((course) => [course.key, course]))
}

/** Short title for lists and the calendar grid, e.g. "Analysis · Übungsgruppe 4". */
export function eventLabel(event: CalendarEvent, course: Course | undefined): string {
  if (!course) return event.title.replace(/, vorlesungsfrei$/, '')
  return event.kind === 'course' ? course.shortName : `${course.shortName} · ${event.detail ?? KIND_LABELS[event.kind]}`
}

/** Events that should be shown: hidden courses left out. */
export function visibleEvents(data: CalendarData): CalendarEvent[] {
  const courses = courseMap(data)
  return data.events.filter((event) => !event.courseKey || !courses.get(event.courseKey)?.hidden)
}

/**
 * Appointments that overlap another one – TISS and own ones, timed, holidays and hidden courses left
 * out. By id, with the appointments they clash with.
 */
export function overlapping(data: CalendarData): Map<string, CalendarEvent[]> {
  const timed = visibleEvents(data)
    .filter((event) => !event.allDay && event.kind !== 'holiday')
    .map((event) => ({ event, start: Date.parse(event.start), end: Date.parse(event.end) }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start)
  const result = new Map<string, CalendarEvent[]>()
  const add = (id: string, other: CalendarEvent): void => {
    result.set(id, [...(result.get(id) ?? []), other])
  }
  for (const [index, item] of timed.entries()) {
    // Sorted by start: everything starting before this one ends overlaps it.
    for (const other of timed.slice(index + 1)) {
      if (other.start >= item.end) break
      add(item.event.id, other.event)
      add(other.event.id, item.event)
    }
  }
  return result
}

/** Timed course appointments that haven't ended yet, soonest first. */
export function upcoming(data: CalendarData, now: Date, limit: number): CalendarEvent[] {
  const iso = now.toISOString()
  return visibleEvents(data)
    .filter((event) => !event.allDay && event.end > iso)
    .slice(0, limit)
}

/** Holiday covering the given day, if any. */
export function holidayOn(data: CalendarData, day: Date): CalendarEvent | undefined {
  const date = isoDate(day)
  return data.events.find((event) => event.kind === 'holiday' && event.start <= date && date < event.end)
}

export function isoDate(day: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

export { roomName }

/** TUW-Maps link: exact room if it's in the room list, otherwise a search for its name. */
export function mapsUrl(data: CalendarData, location: string): string {
  const query = data.rooms[location]?.mapCode ?? roomName(location)
  return `https://maps.tuwien.ac.at/?q=${encodeURIComponent(query)}#map`
}

export function tissCourseUrl(courseKey: string, date: Date): string {
  return courseUrl(courseKey, currentSemester(date).code)
}

const time = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' })
const dayLabel = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatTime = (iso: string): string => time.format(new Date(iso))

/** "Heute", "Morgen" or "Donnerstag, 8. Oktober". */
export function relativeDay(iso: string, now: Date): string {
  const day = isoDate(new Date(iso))
  if (day === isoDate(now)) return 'Heute'
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (day === isoDate(tomorrow)) return 'Morgen'
  return dayLabel.format(new Date(iso))
}

/** "läuft", "in 25 min", "in 3 h" – or null if it's more than a day away. */
export function countdown(event: CalendarEvent, now: Date): string | null {
  const start = new Date(event.start).getTime()
  if (start <= now.getTime()) return 'läuft'
  const minutes = Math.round((start - now.getTime()) / 60_000)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `in ${hours} h` : null
}

const syncFormat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function syncStatus(data: CalendarData): string {
  if (data.syncing) return 'Aktualisiere …'
  if (!data.syncedAt) return 'Noch nicht synchronisiert'
  return `Stand: ${syncFormat.format(new Date(data.syncedAt))}`
}
