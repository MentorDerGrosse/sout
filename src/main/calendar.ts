import { app, powerMonitor } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CalendarData, CalendarEvent, Course, CoursePatch, EventKind } from '../shared/types'
import { parseIcal, type IcalEvent } from './ical'
import { courseInfo } from './courseInfo'
import { readJson, writeJson } from './jsonFile'
import { reportChanges } from './changes'
import { ownEvents, ownOccurrences } from './ownEvents'
import { scheduleChanges } from './scheduleChanges'
import { getSettings } from './settings'
import { roomInfo } from './rooms'
import { getSecret } from './secrets'
import { fetchTissFeed } from './tiss'

const SYNC_INTERVAL_MS = 60 * 60 * 1000
/** Colours handed out to new courses in turn; changeable per course in the settings. */
const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']

interface Cache {
  events: CalendarEvent[]
  syncedAt: string | null
  error: string | null
}

type CourseOverrides = Record<string, { shortName?: string; color: string; hidden?: boolean }>

const cacheFile = (): string => join(app.getPath('userData'), 'calendar.json')
const coursesFile = (): string => join(app.getPath('userData'), 'courses.json')

let cache: Cache | null = null
let syncing: Promise<void> | null = null
let onChange: () => void = () => {}

function loadCache(): Cache {
  if (!cache) {
    const data = readJson(cacheFile()) as Partial<Cache> | undefined
    // Caches written by older versions lack fields that were added later.
    const events = (data?.events ?? []).map((event) => ({ ...event, id: stableId(event.id), otherLocations: event.otherLocations ?? [], ownId: null }))
    cache = { events, syncedAt: data?.syncedAt ?? null, error: data?.error ?? null }
  }
  return cache
}

function saveCache(next: Cache): void {
  cache = next
  writeJson(cacheFile(), next)
  onChange()
}

export function calendarData(): CalendarData {
  const { events, syncedAt, error } = loadCache()
  const rooms: CalendarData['rooms'] = {}
  for (const name of events.flatMap((event) => [event.location, ...event.otherLocations])) {
    const info = name ? roomInfo(name) : null
    if (name && info) rooms[name] = info
  }
  const all = [...events, ...ownOccurrences()].sort((a, b) => a.start.localeCompare(b.start))
  return { events: all, own: ownEvents(), courses: courses(events), rooms, syncedAt, error, syncing: syncing !== null }
}

/** Something changed outside of a sync (own appointments): tell the windows. */
export function calendarChanged(): void {
  onChange()
}

/** Reads TISS (or, in development, the file in SOUT_TISS_FILE) and replaces the cached events. */
export function syncCalendar(): Promise<void> {
  syncing ??= (async () => {
    onChange()
    const devFile = app.isPackaged ? undefined : process.env['SOUT_TISS_FILE']
    const token = getSecret('tissToken')
    try {
      if (!devFile && !token) return
      const feed = devFile ? readFileSync(devFile, 'utf8') : await fetchTissFeed(token!)
      const before = loadCache().events
      saveCache({ events: toEvents(parseIcal(feed)), syncedAt: new Date().toISOString(), error: null })
      reportChanges(scheduleChanges(before, loadCache().events, calendarData().courses), getSettings().notifyChanges)
    } catch (error) {
      // Keep the old events: they are still the best we have when offline.
      saveCache({ ...loadCache(), error: error instanceof Error ? error.message : String(error) })
    }
  })().finally(() => {
    syncing = null
    onChange()
  })
  return syncing
}

/** Forget the events, e.g. after the TISS token was removed. */
export function clearCalendar(): void {
  saveCache({ events: [], syncedAt: null, error: null })
}

export function updateCourse(key: string, patch: CoursePatch): void {
  const overrides = loadOverrides()
  const current = overrides[key]
  if (!current) return
  if (typeof patch.shortName === 'string') current.shortName = patch.shortName.trim() || undefined
  if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) current.color = patch.color
  if (typeof patch.hidden === 'boolean') current.hidden = patch.hidden
  writeJson(coursesFile(), overrides)
  onChange()
}

/** Sync now (if there is a token), every hour, and after waking up from standby. */
export function startCalendarSync(listener: () => void): void {
  onChange = listener
  void syncCalendar()
  setInterval(() => void syncCalendar(), SYNC_INTERVAL_MS)
  powerMonitor.on('resume', () => {
    // The network usually needs a moment after waking up.
    setTimeout(() => void syncCalendar(), 10_000)
  })
}

// ---------- TISS events → our model ----------

const KINDS: Record<string, EventKind> = { COURSE: 'course', GROUP: 'group', EXAM_SLOT: 'exam', HOLIDAY: 'holiday' }

/**
 * TISS UIDs look like "20261007T101500Z-1234567@tiss.tuwien.ac.at"; the part before the dash
 * changes with every download, the rest stays. Only the stable part can recognise an appointment.
 */
function stableId(uid: string): string {
  return /^\d{8}T\d{6}Z?-(.+)$/.exec(uid)?.[1] ?? uid
}
/** "123.456 VU Titel …" → LVA number, optional type, rest. */
const SUMMARY = /^(\d{3}\.[0-9A-Z]{3})\s+(?:([A-Z]{2})\s+)?(.*)$/

function toEvents(raw: IcalEvent[]): CalendarEvent[] {
  const parsed = raw.map((event) => ({ event, kind: KINDS[event.categories ?? ''] ?? 'other', match: SUMMARY.exec(event.summary) }))
  // Course titles come from the regular course appointments, the others are matched against them.
  const titles = new Map<string, string>()
  for (const { kind, match } of parsed) {
    if (kind === 'course' && match?.[1] && match[2] && match[3]) titles.set(match[1], match[3])
  }

  const events = parsed.map(({ event, kind, match }): CalendarEvent => {
    const courseKey = match?.[1] ?? null
    const rest = match?.[3] ?? ''
    const title = courseKey ? titles.get(courseKey) : undefined
    let detail: string | null = null
    if (kind === 'course') {
      // DESCRIPTION says what kind of lecture it is ("Vorlesung - Zusatztermin"), unless it only repeats the title.
      detail = event.description && !SUMMARY.test(event.description) ? event.description.replace(/\s+/g, ' ').trim() : null
    } else if (courseKey) {
      detail = (title && rest.startsWith(title) ? rest.slice(title.length) : rest).replace(/^\s*-\s*/, '').trim() || null
    }
    return {
      id: stableId(event.uid),
      kind,
      start: event.start.value,
      end: event.end.value,
      allDay: event.start.allDay,
      courseKey,
      title: event.summary,
      detail,
      location: event.location,
      otherLocations: [],
      ownId: null
    }
  })
  return mergeRooms(events).sort((a, b) => a.start.localeCompare(b.start))
}

/** Overflow rooms ("Ausweich Räumlichkeiten", "Übertragung") are separate events in TISS. */
const OVERFLOW = /ausweich|übertragung/i

/** One event per course and time slot; the extra rooms go into otherLocations. */
function mergeRooms(events: CalendarEvent[]): CalendarEvent[] {
  const slots = new Map<string, CalendarEvent[]>()
  const result: CalendarEvent[] = []
  for (const event of events) {
    if (!event.courseKey) {
      result.push(event)
      continue
    }
    const key = [event.courseKey, event.kind, event.start, event.end].join('|')
    slots.set(key, [...(slots.get(key) ?? []), event])
  }
  for (const group of slots.values()) {
    const main = group.find((event) => !OVERFLOW.test(event.detail ?? '')) ?? group[0]!
    const rooms = new Set(group.map((event) => event.location).filter((room): room is string => Boolean(room)))
    if (main.location) rooms.delete(main.location)
    result.push({ ...main, otherLocations: [...rooms] })
  }
  return result
}

// ---------- Courses ----------

function loadOverrides(): CourseOverrides {
  const data = readJson(coursesFile())
  return data && typeof data === 'object' ? (data as CourseOverrides) : {}
}

function courses(events: CalendarEvent[]): Course[] {
  const found = new Map<string, { type: string | null; title: string }>()
  for (const event of events) {
    if (!event.courseKey) continue
    const match = SUMMARY.exec(event.title)
    const known = found.get(event.courseKey)
    if (event.kind === 'course' && match?.[2]) {
      found.set(event.courseKey, { type: match[2], title: match[3] ?? event.title })
    } else if (!known) {
      found.set(event.courseKey, { type: null, title: match?.[3] ?? event.title })
    }
  }

  // New courses get the next colour; remembering it keeps colours stable across syncs.
  const overrides = loadOverrides()
  let changed = false
  const keys = [...found.keys()].sort()
  for (const key of keys) {
    if (overrides[key]) continue
    const used = new Set(Object.values(overrides).map((entry) => entry.color))
    overrides[key] = { color: PALETTE.find((color) => !used.has(color)) ?? PALETTE[Object.keys(overrides).length % PALETTE.length]! }
    changed = true
  }
  if (changed) writeJson(coursesFile(), overrides)

  return keys.map((key) => {
    const { type, title } = found.get(key)!
    const override = overrides[key]!
    const info = courseInfo(key)
    return {
      key,
      type,
      title,
      shortName: override.shortName ?? defaultShortName(title),
      color: override.color,
      hidden: override.hidden ?? false,
      ects: info?.ects ?? null,
      tuwelUrl: info?.tuwelUrl ?? null,
      lectureTube: info?.lectureTube ?? false
    }
  })
}

const SMALL_WORDS = new Set(['und', 'in', 'die', 'der', 'das', 'des', 'den', 'dem', 'für', 'von', 'mit', 'zu', 'zur', 'zum', 'im', 'am', 'an', 'auf', 'aus', 'bei', 'ein', 'eine', 'and', 'of', 'for', 'the', 'to'])

/**
 * Short names as students use them: "Analysis" stays, long titles become initials –
 * "Grundlagen der Beispielkunde für …" → "GB", "Einführung in die Beispielkunde 1" → "EB1".
 */
function defaultShortName(title: string): string {
  const name = title.split(' für ')[0]!.trim()
  if (name.length <= 16) return name
  const initials = name
    .split(/\s+/)
    .filter((word) => !SMALL_WORDS.has(word.toLowerCase()))
    .map((word) => (/^\d+$/.test(word) ? word : word[0]!.toUpperCase()))
    .join('')
  return initials.length >= 2 ? initials : name
}
