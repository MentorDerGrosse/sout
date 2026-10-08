import { app, net, powerMonitor, session } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { currentSemester, tissCourseUrl } from '../shared/tu'
import type { CalendarEvent, Course, CourseDeadline, ExamDate, ExamsData } from '../shared/types'
import { calendarChanged, calendarData } from './calendar'
import { saveCourseInfo, type CourseInfo } from './courseInfo'
import { reportChanges, type NewChange } from './changes'
import { isCoursePage, parseCourseInfo, parseExamTable, parseRegistrations, type ParsedExam, type ParsedRegistrations } from './examParser'
import { readJson, writeJson } from './jsonFile'
import { roomInfo } from './rooms'
import { getSettings } from './settings'

// Exam dates and their registration windows only reach the TISS calendar once you are registered.
// The public course pages list them, though: sout reads the pages of the courses in your TISS
// calendar – no login needed – every few hours, one page per second. Whether you are registered
// it sees in the TISS calendar.

/** Read the course pages again after this long. */
const SYNC_INTERVAL_MS = 6 * 60 * 60_000
/** A page couldn't be read (offline, TISS down): try again sooner. */
const RETRY_MS = 30 * 60_000
/** How often to look whether a sync is due – that look itself is cheap. */
const CHECK_MS = 10 * 60_000
/** Between two pages, to go easy on TISS. */
const PAUSE_MS = 1000
const MAX_DISMISSED = 500

interface StoredExam extends ParsedExam {
  courseKey: string
  semester: string
}

interface StoredRegistrations extends ParsedRegistrations {
  courseKey: string
  semester: string
}

/** A course page: one per course and semester. */
interface CoursePage {
  key: string
  semester: string
}

interface PageState {
  /** Last time the page was read (ISO); null if never. */
  readAt: string | null
  error: string | null
}

/** What the course pages said (exams.json). */
interface Cache {
  exams: StoredExam[]
  /** LVA and group registration of each page. */
  registrations: StoredRegistrations[]
  /** By "<LVA number> <semester>". */
  pages: Record<string, PageState>
  syncedAt: string | null
  /** Exams marked "Brauche ich nicht". */
  dismissed: string[]
}

const file = (): string => join(app.getPath('userData'), 'exams.json')
const EMPTY: Cache = { exams: [], registrations: [], pages: {}, syncedAt: null, dismissed: [] }

let cache: Cache | null = null
let syncing: Promise<void> | null = null
let onChange: () => void = () => {}

function loadCache(): Cache {
  cache ??= { ...EMPTY, ...(readJson(file()) as Partial<Cache> | undefined) }
  return cache
}

function saveCache(next: Cache): void {
  cache = next
  writeJson(file(), next)
  onChange()
}

/** Upcoming exams of the courses in the TISS calendar, with what the calendar says about registration. */
export function examsData(): ExamsData {
  const { events, courses } = calendarData()
  const cached = loadCache()
  const pages = coursePages(events, courses)
  const relevant = new Set(pages.map((page) => page.key))
  const now = Date.now()
  const stored = cached.exams.filter((exam) => relevant.has(exam.courseKey) && Date.parse(exam.end) > now)
  const fromCalendar = events.filter((event) => event.kind === 'exam' && event.ownId === null)
  const registered = registeredIds(stored, fromCalendar)
  const dismissed = new Set(cached.dismissed)
  /** Why an exam you aren't registered for isn't needed – so sout doesn't remind you of it. */
  const covered = (exam: StoredExam): string | null => {
    if (registered.has(exam.id)) return null
    const mine = stored.filter((other) => registered.has(other.id) && other.courseKey === exam.courseKey)
    // The same exam at the same time in another room, mode or with another examiner.
    const sameTime = mine.find((other) => overlaps(other, exam))
    if (sameTime) return `angemeldet für ${sameTime.name}`
    // Another date of the same exam.
    const sameName = mine.find((other) => simplify(other.name) === simplify(exam.name))
    if (sameName) return `angemeldet für den Termin am ${dayFormat.format(new Date(sameName.start))}`
    // Taken already: it is in the calendar in the past.
    const taken = fromCalendar.find((event) => event.courseKey === exam.courseKey && Date.parse(event.end) < now && simplify(event.detail ?? '') === simplify(exam.name))
    return taken ? `schon angetreten am ${dayFormat.format(new Date(taken.start))}` : null
  }
  const exams = stored.map(
    (exam): ExamDate => ({
      ...exam,
      rooms: exam.rooms.map((room) => {
        const info = roomInfo(room.name)
        return { name: room.name, mapCode: info?.mapCode ?? room.code, address: info?.address ?? null }
      }),
      registered: registered.has(exam.id),
      covered: covered(exam),
      dismissed: dismissed.has(exam.id)
    })
  )
  return {
    exams: exams.sort((a, b) => a.start.localeCompare(b.start)),
    deadlines: courseDeadlines(cached.registrations.filter((entry) => relevant.has(entry.courseKey)), events, dismissed, now),
    failed: pages.flatMap((page) => {
      const error = cached.pages[pageId(page)]?.error
      return error ? [{ courseKey: page.key, error }] : []
    }),
    courses: relevant.size,
    syncedAt: cached.syncedAt,
    syncing: syncing !== null
  }
}

/**
 * Group registration windows of courses you aren't in a group of yet (the TISS calendar has no group
 * appointments for them) – groups with the same window together; and deregistration deadlines.
 */
function courseDeadlines(registrations: StoredRegistrations[], events: CalendarEvent[], dismissed: Set<string>, now: number): CourseDeadline[] {
  const inGroup = new Set(events.filter((event) => event.kind === 'group' && event.ownId === null).map((event) => event.courseKey))
  const ahead = (iso: string | null): boolean => iso !== null && Date.parse(iso) > now
  const deadlines: CourseDeadline[] = []
  for (const { courseKey, semester, course, groups } of registrations) {
    if (!inGroup.has(courseKey)) {
      const windows = new Map<string, CourseDeadline>()
      for (const group of groups.filter((candidate) => ahead(candidate.closes))) {
        const id = `${courseKey}|group|${group.opens}|${group.closes}`
        const known = windows.get(id)
        if (known) known.groups.push(group.name)
        else windows.set(id, { id, courseKey, semester, kind: 'group', groups: [group.name], opens: group.opens, closes: group.closes, dismissed: dismissed.has(id) })
      }
      deadlines.push(...windows.values())
    }
    if (course && ahead(course.deregisterUntil)) {
      const id = `${courseKey}|deregister`
      deadlines.push({ id, courseKey, semester, kind: 'deregister', groups: [], opens: null, closes: course.deregisterUntil, dismissed: dismissed.has(id) })
    }
  }
  // A course read in two semesters lists the same windows twice. Soonest first: the opening if ahead, else the end.
  const unique = [...new Map(deadlines.map((deadline) => [deadline.id, deadline])).values()]
  const next = (deadline: CourseDeadline): string => (ahead(deadline.opens) ? deadline.opens! : deadline.closes!)
  return unique.sort((a, b) => next(a).localeCompare(next(b)))
}

/**
 * The pages to read: the courses of the TISS calendar that aren't hidden, each in the semesters its
 * lectures and groups are in – this one and later ones; for a course that is over, its last one
 * (retakes). Exams of a winter course can be in summer, so their dates don't count.
 */
export function coursePages(events: CalendarEvent[], courses: Course[], now = new Date()): CoursePage[] {
  const current = semesterOrder(currentSemester(now).code)
  return courses
    .filter((course) => !course.hidden)
    .flatMap((course) => {
      const fromTiss = events.filter((event) => event.courseKey === course.key && event.ownId === null)
      const teaching = fromTiss.filter((event) => event.kind === 'course' || event.kind === 'group')
      const semesters = [...new Set((teaching.length > 0 ? teaching : fromTiss).map((event) => currentSemester(new Date(event.start)).code))].sort(
        (a, b) => semesterOrder(a) - semesterOrder(b)
      )
      const coming = semesters.filter((code) => semesterOrder(code) >= current)
      return (coming.length > 0 ? coming : semesters.slice(-1)).map((semester) => ({ key: course.key, semester }))
    })
}

/** "2026W" → 4053, "2027S" → 4054: in time order. */
function semesterOrder(code: string): number {
  const match = /^(\d{4})([WS])$/.exec(code)
  return match ? Number(match[1]) * 2 + (match[2] === 'W' ? 1 : 0) : 0
}

const pageId = (page: CoursePage): string => `${page.key} ${page.semester}`

/**
 * Which exams are in the TISS calendar: same course, overlapping time. If several fit (two rooms
 * or modes at the same time), the one whose name is in the calendar entry.
 */
function registeredIds(exams: StoredExam[], feed: CalendarEvent[]): Set<string> {
  const result = new Set<string>()
  for (const event of feed) {
    const candidates = exams.filter((exam) => exam.courseKey === event.courseKey && overlaps(exam, event))
    const label = simplify(event.detail ?? event.title)
    const exact = candidates.filter((exam) => simplify(exam.name) === label)
    const partial = candidates.filter((exam) => label.includes(simplify(exam.name)))
    for (const exam of exact.length > 0 ? exact : partial.length > 0 ? partial : candidates) result.add(exam.id)
  }
  return result
}

/** Time ranges overlap; an entry without length counts as one minute. */
function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  const range = (item: { start: string; end: string }): [number, number] => {
    const start = Date.parse(item.start)
    return [start, Math.max(Date.parse(item.end), start + 60_000)]
  }
  const [aStart, aEnd] = range(a)
  const [bStart, bEnd] = range(b)
  return aStart < bEnd && bStart < aEnd
}

const simplify = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim()

/** Reads the course pages if it is time – or now with `force` (the "Aktualisieren" button). */
export function syncExams(force = false): Promise<void> {
  if (syncing) return syncing
  const { events, courses } = calendarData()
  const pages = coursePages(events, courses)
  if (!force && !isDue(pages)) return Promise.resolve()
  syncing = (async () => {
    onChange()
    const devDir = devPagesDir()
    const previous = loadCache()
    const seen = new Set(previous.exams.map((exam) => exam.id))
    const now = new Date().toISOString()
    // By id: a course read in two semesters may list the same exam twice.
    const exams = new Map<string, StoredExam>()
    const registrations: StoredRegistrations[] = []
    const infos: Record<string, CourseInfo> = {}
    const states: Record<string, PageState> = {}
    const added: StoredExam[] = []
    for (const [index, page] of pages.entries()) {
      if (index > 0 && !devDir) await delay(PAUSE_MS)
      const before = previous.pages[pageId(page)]
      try {
        const html = await readCoursePage(page.key, page.semester)
        const found = parseExamTable(html, page.key)
        registrations.push({ ...parseRegistrations(html), courseKey: page.key, semester: page.semester })
        // The first page of a course is its current semester.
        if (!infos[page.key]) {
          const info = parseCourseInfo(html)
          infos[page.key] = { ...info, semester: page.semester, tuwelUrl: info.tuwelUrl ?? (devDir ? null : await tuwelLinkFromApi(page)) }
        }
        for (const exam of found) {
          if (exams.has(exam.id)) continue
          exams.set(exam.id, { ...exam, courseKey: page.key, semester: page.semester })
          // New since the last read of this page: TISS added an exam. The first read only looks.
          if (before?.readAt && !seen.has(exam.id)) added.push(exams.get(exam.id)!)
        }
        states[pageId(page)] = { readAt: now, error: null }
      } catch (error) {
        // Keep what the page said last time: still the best we have when offline.
        for (const exam of previous.exams) {
          if (exam.courseKey === page.key && exam.semester === page.semester && !exams.has(exam.id)) exams.set(exam.id, exam)
        }
        registrations.push(...(previous.registrations ?? []).filter((entry) => entry.courseKey === page.key && entry.semester === page.semester))
        states[pageId(page)] = { readAt: before?.readAt ?? null, error: error instanceof Error ? error.message : String(error) }
      }
    }
    const upcoming = (exam: StoredExam): boolean => Date.parse(exam.end) > Date.now()
    // Read again: "Brauche ich nicht" may have been clicked in the meantime.
    saveCourseInfo(infos)
    // ECTS and TUWEL links are part of the course list.
    calendarChanged()
    saveCache({ ...loadCache(), exams: [...exams.values()].filter(upcoming), registrations, pages: states, syncedAt: now })
    reportChanges(added.filter(upcoming).map(examChange), getSettings().notifyExamRegistration)
  })().finally(() => {
    syncing = null
    onChange()
  })
  return syncing
}

/** A page that wasn't read yet (new course or semester), the last read is long ago, or a page failed a while ago. */
function isDue(pages: CoursePage[]): boolean {
  if (pages.length === 0) return false
  const { syncedAt, pages: states } = loadCache()
  if (!syncedAt || pages.some((page) => !states[pageId(page)])) return true
  const age = Date.now() - Date.parse(syncedAt)
  return age > SYNC_INTERVAL_MS || (age > RETRY_MS && pages.some((page) => states[pageId(page)]?.error))
}

/** Development: course pages from files, <SOUT_TISS_PAGES>/<LVA number without dot>.html. */
const devPagesDir = (): string | undefined => (app.isPackaged ? undefined : process.env['SOUT_TISS_PAGES'])

/** The public TISS page of a course (German). */
export async function readCoursePage(courseKey: string, semester: string): Promise<string> {
  const devDir = devPagesDir()
  const html = devDir ? readFileSync(join(devDir, `${courseKey.replace('.', '')}.html`), 'utf8') : await fetchCoursePage(courseKey, semester)
  if (!isCoursePage(html, courseKey)) throw new Error('TISS hat statt der LVA-Seite etwas anderes geliefert.')
  return html
}

async function fetchCoursePage(courseKey: string, semester: string): Promise<string> {
  // TISS hands out the page only to a "browser window" it knows: a window id in the address and
  // in a cookie, as its script would set them. An own session keeps these cookies out of the rest.
  const pages = session.fromPartition('tiss-pages')
  const requestId = String(100 + Math.floor(Math.random() * 900))
  const windowId = String(1000 + Math.floor(Math.random() * 9000))
  const cookie = `dsrwid-${requestId}`
  await pages.cookies.set({ url: 'https://tiss.tuwien.ac.at', name: cookie, value: windowId, path: '/' })
  try {
    let response: Response
    try {
      response = await pages.fetch(`${tissCourseUrl(courseKey, semester)}&locale=de&dsrid=${requestId}&dswid=${windowId}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(20_000)
      })
    } catch {
      throw new Error('TISS ist nicht erreichbar – bist du online?')
    }
    if (!response.ok) throw new Error(`TISS antwortet mit HTTP ${response.status}.`)
    return await response.text()
  } finally {
    await pages.cookies.remove('https://tiss.tuwien.ac.at', cookie).catch(() => {})
  }
}

/** Some course pages don't link the TUWEL course; TISS's public course API has it ("eLearning"). */
async function tuwelLinkFromApi(page: CoursePage): Promise<string | null> {
  try {
    const response = await net.fetch(`https://tiss.tuwien.ac.at/api/course/${page.key.replace('.', '')}-${page.semester}`, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return null
    const link = /<(?:\w+:)?eLearning>\s*(https:\/\/tuwel\.tuwien\.ac\.at\/course\/view\.php\?id=\d+)\s*</.exec(await response.text())
    return link?.[1] ?? null
  } catch {
    return null
  }
}

export function dismissExam(id: string, dismissed: boolean): void {
  const current = loadCache()
  const rest = current.dismissed.filter((other) => other !== id)
  saveCache({ ...current, dismissed: dismissed ? [...rest, id].slice(-MAX_DISMISSED) : rest })
}

const whenFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })

function examChange(exam: StoredExam): NewChange {
  const course = calendarData().courses.find((candidate) => candidate.key === exam.courseKey)?.shortName ?? exam.courseKey
  const now = Date.now()
  const window =
    exam.opens && Date.parse(exam.opens) > now
      ? ` · Anmeldung ab ${whenFormat.format(new Date(exam.opens))}`
      : exam.closes && Date.parse(exam.closes) > now
        ? ` · Anmeldung bis ${whenFormat.format(new Date(exam.closes))}`
        : ''
  return {
    kind: 'exam',
    title: `Neue Prüfung in TISS: ${course} · ${exam.name}`,
    detail: `${(exam.allDay ? dayFormat : whenFormat).format(new Date(exam.start))}${window}`,
    view: 'exams',
    url: null
  }
}

/** Looks every few minutes whether the pages are due, and after waking up from standby. */
export function startExamSync(listener: () => void): void {
  onChange = listener
  setTimeout(() => void syncExams(), 5_000)
  setInterval(() => void syncExams(), CHECK_MS)
  powerMonitor.on('resume', () => {
    setTimeout(() => void syncExams(), 30_000)
  })
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
