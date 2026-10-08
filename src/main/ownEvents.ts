import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { CalendarEvent, OwnEvent, OwnEventInput } from '../shared/types'
import { isCourseKey } from '../shared/tu'
import { readJson, writeJson } from './jsonFile'

// Own appointments – study group, study blocks – in events.json, next to the TISS calendar.
// They can repeat weekly; single days of a series can be deleted on their own.

const file = (): string => join(app.getPath('userData'), 'events.json')
/** Weekly series stop after this many occurrences (two years). */
const MAX_OCCURRENCES = 104

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function ownEvents(): OwnEvent[] {
  const data = readJson(file())
  return Array.isArray(data) ? (data as OwnEvent[]).filter((event) => event && typeof event.id === 'string') : []
}

const save = (events: OwnEvent[]): void => writeJson(file(), events)

export function addOwnEvent(input: unknown): void {
  save([...ownEvents(), { id: randomUUID(), ...validate(input), skip: [] }])
}

export function updateOwnEvent(id: string, input: unknown): void {
  const events = ownEvents()
  const index = events.findIndex((event) => event.id === id)
  if (index === -1) throw new Error('Diesen Termin gibt es nicht mehr.')
  const next = validate(input)
  // Deleted days of a series stay deleted, as long as it stays a series.
  events[index] = { ...events[index]!, ...next, skip: next.repeatWeeklyUntil ? events[index]!.skip : [] }
  save(events)
}

/** The whole appointment, or with `day` just that occurrence of a weekly series. */
export function deleteOwnEvent(id: string, day: string | null): void {
  const events = ownEvents()
  const event = events.find((candidate) => candidate.id === id)
  if (!event) return
  if (day && DAY.test(day) && event.repeatWeeklyUntil) event.skip = [...new Set([...event.skip, day])]
  else events.splice(events.indexOf(event), 1)
  save(events)
}

function validate(input: unknown): OwnEventInput {
  const value = (input ?? {}) as Partial<Record<keyof OwnEventInput, unknown>>
  const text = (field: unknown, max: number): string => (typeof field === 'string' ? field.trim().slice(0, max) : '')
  const title = text(value.title, 200)
  if (!title) throw new Error('Bitte einen Titel eingeben.')
  const allDay = value.allDay === true
  const start = text(value.start, 40)
  const end = text(value.end, 40)
  if (allDay ? !DAY.test(start) || !DAY.test(end) : Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    throw new Error('Datum oder Uhrzeit fehlt.')
  }
  if ((allDay ? end <= start : Date.parse(end) <= Date.parse(start))) throw new Error('Das Ende liegt vor dem Beginn.')
  const until = text(value.repeatWeeklyUntil, 10)
  if (until && (!DAY.test(until) || until < localDay(start, allDay))) throw new Error('„Wiederholen bis“ liegt vor dem ersten Termin.')
  return {
    title,
    start: allDay ? start : new Date(start).toISOString(),
    end: allDay ? end : new Date(end).toISOString(),
    allDay,
    location: text(value.location, 200) || null,
    courseKey: isCourseKey(value.courseKey) ? value.courseKey : null,
    repeatWeeklyUntil: until || null
  }
}

/** YYYY-MM-DD in local time. */
function isoDay(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const localDay = (value: string, allDay: boolean): string => (allDay ? value : isoDay(new Date(value)))

/** All occurrences as calendar entries; weekly ones week by week (same local time, also across DST). */
export function ownOccurrences(): CalendarEvent[] {
  const result: CalendarEvent[] = []
  for (const event of ownEvents()) {
    const base = {
      kind: 'own' as const,
      allDay: event.allDay,
      courseKey: event.courseKey,
      title: event.title,
      detail: event.title,
      location: event.location,
      otherLocations: [],
      ownId: event.id
    }
    if (!event.repeatWeeklyUntil) {
      result.push({ ...base, id: `own:${event.id}`, start: event.start, end: event.end })
      continue
    }
    const skip = new Set(event.skip)
    for (let week = 0; week < MAX_OCCURRENCES; week++) {
      const start = shift(event.start, event.allDay, week)
      const day = localDay(start, event.allDay)
      if (day > event.repeatWeeklyUntil) break
      if (skip.has(day)) continue
      result.push({ ...base, id: `own:${event.id}:${day}`, start, end: shift(event.end, event.allDay, week) })
    }
  }
  return result
}

/** The same date and wall-clock time, `weeks` later. */
function shift(value: string, allDay: boolean, weeks: number): string {
  if (allDay) {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number]
    return new Date(Date.UTC(year, month - 1, day + weeks * 7)).toISOString().slice(0, 10)
  }
  const date = new Date(value)
  date.setDate(date.getDate() + weeks * 7)
  return date.toISOString()
}
