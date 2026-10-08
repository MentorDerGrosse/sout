import { app } from 'electron'
import { join } from 'node:path'
import type { Announcement, CalendarEvent, CheckmarkSheet, CourseGrades, GradeEntry, Task, TuwelExtras } from '../shared/types'
import type { NewChange } from './changes'
import { readJson, writeJson } from './jsonFile'
import { TUWEL_URL, tuwelCall } from './tuwelApi'
import { htmlToText, lvaNumber } from './tuwelTasks'

// More from TUWEL than the deadlines, with the token of each tasks sync: announcements of the
// courses, Kreuzerlübungen (which examples are ticked), booked appointments and booking periods
// ("Terminbuchung"), and the grades with feedback. Raw answers (RawExtras) are kept apart from
// what sout makes of them, so test data can stand in for TUWEL.

const DAY = 24 * 60 * 60
/** Grades change rarely – a look every two hours is plenty. */
const GRADES_INTERVAL_MS = 2 * 60 * 60 * 1000
const ANNOUNCEMENTS_PER_COURSE = 8

interface EnrolledCourse {
  id: number
  fullname: string
  shortname: string
  idnumber?: string
  enddate?: number
}

interface RawForum {
  id: number
  course: number
  type: string
}

interface RawDiscussion {
  discussion: number
  name: string
  subject?: string
  message: string
  created: number
  userfullname: string
  pinned?: boolean
}

interface RawCheckmark {
  id: number
  instance?: number
  course: number
  name: string
  timedue?: number
  cutoffdate?: number
  submission_timemodified?: number
  examples?: { id: number; name: string; checked?: number }[]
  feedback?: { grade?: string; feedback?: string } | null
}

interface RawCalendarEvent {
  id: number
  name: string
  description?: string
  courseid: number
  modulename?: string
  instance?: number
  eventtype: string
  timestart: number
  timeduration: number
}

interface RawGradeItem {
  id: number
  itemname: string | null
  itemtype: string
  graderaw?: number | null
  gradeformatted?: string
  rangeformatted?: string
  percentageformatted?: string
  feedback?: string
  gradedategraded?: number | null
  gradeishidden?: boolean
}

/** What TUWEL answered – saved test data (SOUT_TUWEL_FILE, key "extras") has the same shape. */
export interface RawExtras {
  courses: EnrolledCourse[]
  forums: RawForum[]
  /** Newest discussions by forum id. */
  discussions: Record<string, RawDiscussion[]>
  checkmarks: RawCheckmark[]
  /** Calendar events of the courses: the appointments ("Terminbuchung") among them. */
  calendar: RawCalendarEvent[]
  /** Grade items by course id; missing when they weren't asked for this time. */
  grades?: Record<string, RawGradeItem[]>
}

/** An appointment booked in TUWEL (Terminbuchung), e.g. for an Abgabegespräch. */
interface Appointment {
  id: string
  courseKey: string | null
  title: string
  start: string
  end: string
  location: string | null
  with: string | null
  url: string
}

/** A booking period of a Terminbuchung you haven't booked yet. */
interface Booking {
  id: string
  courseKey: string | null
  course: string
  title: string
  opens: string | null
  closes: string
  url: string
}

interface StoredAnnouncement extends Announcement {
  courseId: number
}

/** tuwel-extras.json */
interface Cache extends TuwelExtras {
  announcements: StoredAnnouncement[]
  appointments: Appointment[]
  bookings: Booking[]
  /** Announcements and grades already seen – anything else is new. Missing until the first look. */
  seenAnnouncements?: string[]
  seenGrades?: string[]
}

const file = (): string => join(app.getPath('userData'), 'tuwel-extras.json')
const EMPTY: Cache = { announcements: [], checkmarks: [], grades: [], appointments: [], bookings: [], gradesCheckedAt: null, syncedAt: null }

let cache: Cache | null = null
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

export function startTuwelExtras(listener: () => void): void {
  onChange = listener
}

export function tuwelExtras(): TuwelExtras {
  const { announcements, checkmarks, grades, gradesCheckedAt, syncedAt } = loadCache()
  return { announcements: announcements.map(({ courseId: _courseId, ...announcement }) => announcement), checkmarks, grades, gradesCheckedAt, syncedAt }
}

/** Forget everything, e.g. after logging out of TUWEL. */
export function clearTuwelExtras(): void {
  saveCache(EMPTY)
}

/** Grades are asked for every two hours (and only if wanted). */
export function gradesDue(): boolean {
  const checked = loadCache().gradesCheckedAt
  return !checked || Date.now() - Date.parse(checked) > GRADES_INTERVAL_MS
}

/**
 * Asks TUWEL. `courseKeys`: the LVAs of the TISS calendar – only their courses count (all current
 * courses if there is no TISS calendar). Each part on its own: a failing one leaves the others.
 */
export async function fetchExtras(token: string, userid: number, courseKeys: Set<string>, withGrades: boolean): Promise<RawExtras> {
  const enrolled = await tuwelCall<EnrolledCourse[]>(token, 'core_enrol_get_users_courses', { userid })
  const now = Date.now() / 1000
  const courses = enrolled
    .filter((course) => !course.enddate || course.enddate > now - 90 * DAY)
    .filter((course) => courseKeys.size === 0 || courseKeys.has(lvaNumber(course) ?? ''))
    .slice(0, 20)
  const courseids = courses.map((course) => course.id)
  const raw: RawExtras = { courses, forums: [], discussions: {}, checkmarks: [], calendar: [] }
  if (courseids.length === 0) return raw

  raw.forums = await tuwelCall<RawForum[]>(token, 'mod_forum_get_forums_by_courses', { courseids }).then(
    (forums) => forums.filter((forum) => forum.type === 'news'),
    () => []
  )
  for (const forum of raw.forums) {
    try {
      // 3: newest first by creation; pinned ones come first anyway.
      const result = await tuwelCall<{ discussions: RawDiscussion[] }>(token, 'mod_forum_get_forum_discussions', {
        forumid: forum.id,
        sortorder: 3,
        page: 0,
        perpage: ANNOUNCEMENTS_PER_COURSE
      })
      raw.discussions[forum.id] = result.discussions
    } catch {
      // This course's announcements stay as they were.
    }
  }
  raw.checkmarks = await tuwelCall<{ checkmarks: RawCheckmark[] }>(token, 'mod_checkmark_get_checkmarks_by_courses', { courseids }).then(
    (result) => result.checkmarks,
    () => []
  )
  // Terminbuchung has no web service of its own; its appointments and booking periods are calendar events.
  raw.calendar = await tuwelCall<{ events: RawCalendarEvent[] }>(token, 'core_calendar_get_calendar_events', {
    events: { courseids },
    options: { userevents: true, siteevents: false, timestart: Math.floor(now - DAY), timeend: Math.floor(now + 180 * DAY), ignorehidden: true }
  }).then(
    (result) => result.events.filter((event) => event.modulename === 'organizer'),
    () => []
  )
  if (withGrades) {
    raw.grades = {}
    for (const course of courses) {
      try {
        const result = await tuwelCall<{ usergrades?: { gradeitems?: RawGradeItem[] }[] }>(token, 'gradereport_user_get_grade_items', { courseid: course.id, userid })
        raw.grades[course.id] = result.usergrades?.[0]?.gradeitems ?? []
      } catch {
        // Grades not shown in this course.
      }
    }
  }
  return raw
}

/**
 * Turns TUWEL's answers into what sout shows; returns what is new (announcements, grades).
 * `label`: how sout calls a course (its short name).
 */
export function applyExtras(raw: RawExtras, notifyGrades: boolean, label: (courseKey: string | null, fallback: string) => string): NewChange[] {
  const previous = loadCache()
  const courses = new Map(raw.courses.map((course) => [course.id, course]))
  const courseKey = (id: number): string | null => {
    const course = courses.get(id)
    return course ? lvaNumber(course) : null
  }
  const courseName = (id: number): string => clean(courses.get(id)?.fullname ?? '')

  // Announcements: courses whose forum couldn't be read keep the old ones.
  const forumCourse = new Map(raw.forums.map((forum) => [String(forum.id), forum.course]))
  const readCourses = new Set(Object.keys(raw.discussions).map((id) => forumCourse.get(id)))
  const announcements: StoredAnnouncement[] = [
    ...previous.announcements.filter((announcement) => courses.has(announcement.courseId) && !readCourses.has(announcement.courseId)),
    ...Object.entries(raw.discussions).flatMap(([forumId, discussions]) =>
      discussions.map((discussion): StoredAnnouncement => {
        const course = forumCourse.get(forumId) ?? 0
        return {
          id: String(discussion.discussion),
          courseId: course,
          courseKey: courseKey(course),
          course: courseName(course),
          title: clean(discussion.name || discussion.subject || 'Ankündigung'),
          text: htmlToText(discussion.message),
          author: clean(discussion.userfullname),
          at: iso(discussion.created)!,
          pinned: Boolean(discussion.pinned),
          url: `${TUWEL_URL}/mod/forum/discuss.php?d=${discussion.discussion}`
        }
      })
    )
  ].sort((a, b) => b.at.localeCompare(a.at))

  const now = Date.now() / 1000
  const checkmarks: CheckmarkSheet[] = raw.checkmarks
    // The recent and the coming ones: due within the last 30 days or later.
    .filter((sheet) => !sheet.timedue || sheet.timedue > now - 30 * DAY)
    .map((sheet) => {
      const submitted = Boolean(sheet.submission_timemodified) || (sheet.examples ?? []).some((example) => example.checked !== undefined)
      const graded = sheet.feedback && sheet.feedback.grade !== undefined && Number(sheet.feedback.grade) >= 0
      return {
        id: sheet.id,
        courseKey: courseKey(sheet.course),
        course: courseName(sheet.course),
        name: clean(sheet.name),
        due: iso(sheet.timedue),
        cutoff: iso(sheet.cutoffdate),
        examples: (sheet.examples ?? []).map((example) => ({ name: clean(example.name), checked: Boolean(example.checked) })),
        submitted,
        grade: graded ? formatNumber(Number(sheet.feedback!.grade)) : null,
        feedback: sheet.feedback?.feedback ? htmlToText(sheet.feedback.feedback) || null : null,
        url: `${TUWEL_URL}/mod/checkmark/view.php?id=${sheet.id}`
      }
    })
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))

  const { appointments, bookings } = organizerEvents(raw.calendar, courseKey, courseName)

  const grades = raw.grades ? toGrades(raw.grades, courses) : previous.grades
  const changes: NewChange[] = []
  // The first look only remembers what is there.
  const seenAnnouncements = new Set(previous.seenAnnouncements ?? [])
  if (previous.seenAnnouncements) {
    for (const announcement of announcements.filter((candidate) => !seenAnnouncements.has(candidate.id))) changes.push(announcementChange(announcement, label))
  }
  const gradeKeys = (list: CourseGrades[]): string[] => list.flatMap((course) => course.items.map((item) => `${item.id}:${item.gradedAt}`))
  if (raw.grades && notifyGrades && previous.seenGrades) {
    const seen = new Set(previous.seenGrades)
    for (const course of grades) {
      for (const item of course.items) if (!seen.has(`${item.id}:${item.gradedAt}`)) changes.push(gradeChange(course, item, label))
    }
  }

  saveCache({
    announcements: announcements.slice(0, 80),
    checkmarks,
    grades,
    appointments,
    bookings,
    gradesCheckedAt: raw.grades ? new Date().toISOString() : previous.gradesCheckedAt,
    syncedAt: new Date().toISOString(),
    seenAnnouncements: [...new Set([...seenAnnouncements, ...announcements.map((announcement) => announcement.id)])].slice(-500),
    seenGrades: raw.grades ? [...new Set([...(previous.seenGrades ?? []), ...gradeKeys(grades)])].slice(-1000) : previous.seenGrades
  })
  return changes
}

/**
 * Terminbuchung ("organizer") puts a booked slot into the calendar as an "Appointment" event – where
 * and with whom is only in its description – and, while nothing is booked, the booking period as
 * "Instance" events (start and end).
 */
function organizerEvents(
  events: RawCalendarEvent[],
  courseKey: (id: number) => string | null,
  courseName: (id: number) => string
): { appointments: Appointment[]; bookings: Booking[] } {
  const appointments: Appointment[] = []
  const periods = new Map<string, RawCalendarEvent[]>()
  for (const event of events) {
    const type = event.eventtype.toLowerCase()
    if (type === 'appointment') {
      const text = htmlToText(event.description ?? '')
      appointments.push({
        id: `organizer:${event.id}`,
        courseKey: courseKey(event.courseid),
        title: appointmentTitle(event.name),
        start: iso(event.timestart)!,
        end: iso(event.timestart + Math.max(event.timeduration, 0))!,
        location: /(?:Location|Ort|Raum)\s*:\s*([^\n]+)/i.exec(text)?.[1]?.trim() || null,
        with: /(?:Appointment with|Termin mit)\s+([^\n]+)/i.exec(text)?.[1]?.replace(/[.:]\s*$/, '').trim() || null,
        url: `${TUWEL_URL}/course/view.php?id=${event.courseid}`
      })
    } else if (type === 'instance' && event.instance) {
      const key = `${event.courseid}:${event.instance}`
      periods.set(key, [...(periods.get(key) ?? []), event])
    }
  }
  const now = Date.now() / 1000
  const bookings: Booking[] = []
  for (const [key, list] of periods) {
    const sorted = [...list].sort((a, b) => a.timestart - b.timestart)
    const end = sorted[sorted.length - 1]!
    if (end.timestart < now) continue
    bookings.push({
      id: `organizer:${key}`,
      courseKey: courseKey(end.courseid),
      course: courseName(end.courseid),
      title: periodTitle(end.name),
      opens: sorted.length > 1 ? iso(sorted[0]!.timestart) : null,
      closes: iso(end.timestart)!,
      url: `${TUWEL_URL}/course/view.php?id=${end.courseid}`
    })
  }
  return { appointments, bookings }
}

/** "Kurs / Abgabegespräche: Appointment" → "Abgabegespräche". */
function appointmentTitle(name: string): string {
  const text = clean(name)
  const organizer = text.includes(' / ') ? text.slice(text.indexOf(' / ') + 3) : text
  return organizer.replace(/:\s*[^:]*$/, '').trim() || text
}

/** "Registration end: Abgabegespräche" → "Abgabegespräche". */
function periodTitle(name: string): string {
  const text = clean(name)
  return text.replace(/^[^:]*:\s*/, '').trim() || text
}

function toGrades(raw: Record<string, RawGradeItem[]>, courses: Map<number, EnrolledCourse>): CourseGrades[] {
  return Object.entries(raw).map(([id, items]) => {
    const course = courses.get(Number(id))
    const total = items.find((item) => item.itemtype === 'course')
    const entries: GradeEntry[] = items
      .filter((item) => item.itemtype !== 'course' && item.itemtype !== 'category' && !item.gradeishidden)
      .filter((item) => item.graderaw !== null && item.graderaw !== undefined && item.gradedategraded)
      .map((item) => ({
        id: item.id,
        name: clean(item.itemname || 'Bewertung'),
        grade: clean(item.gradeformatted ?? ''),
        range: item.rangeformatted ? clean(item.rangeformatted) : null,
        percentage: item.percentageformatted ? clean(item.percentageformatted) : null,
        feedback: item.feedback ? htmlToText(item.feedback) || null : null,
        gradedAt: iso(item.gradedategraded)
      }))
      .sort((a, b) => (b.gradedAt ?? '').localeCompare(a.gradedAt ?? ''))
    const totalText = total?.gradeformatted ? clean(total.gradeformatted) : ''
    return {
      courseKey: course ? lvaNumber(course) : null,
      course: clean(course?.fullname ?? ''),
      url: `${TUWEL_URL}/grade/report/user/index.php?id=${id}`,
      total: totalText && totalText !== '-' ? totalText : null,
      items: entries
    }
  })
}

/** Booked appointments for the calendar. */
export function appointmentEvents(): CalendarEvent[] {
  return loadCache().appointments.map((appointment) => ({
    id: appointment.id,
    kind: 'appointment',
    start: appointment.start,
    end: appointment.end,
    allDay: false,
    courseKey: appointment.courseKey,
    title: appointment.title,
    detail: appointment.title,
    location: appointment.location,
    otherLocations: [],
    ownId: null,
    with: appointment.with,
    url: appointment.url
  }))
}

/** Booking periods you haven't booked a slot in yet, as tasks ("Termin buchen"). */
export function bookingTasks(): Task[] {
  return loadCache().bookings.map((booking) => ({
    id: booking.id,
    source: 'tuwel',
    title: booking.title,
    kindLabel: 'Terminbuchung',
    module: 'organizer',
    dueLabel: 'Buchung bis',
    courseKey: booking.courseKey,
    courseName: booking.course || null,
    due: booking.closes,
    cutoff: null,
    opens: booking.opens,
    actionable: null,
    timeLimitMinutes: null,
    description: 'Einen Termin in TUWEL buchen.',
    submission: [],
    fileTypes: null,
    status: 'open',
    overdue: false,
    url: booking.url,
    actionLabel: 'In TUWEL buchen'
  }))
}

type Label = (courseKey: string | null, fallback: string) => string

function announcementChange(announcement: Announcement, label: Label): NewChange {
  return {
    kind: 'announcement',
    title: `Neue Ankündigung: ${announcement.title}`,
    detail: `${label(announcement.courseKey, announcement.course)} · ${announcement.author}: ${announcement.text.replace(/\s+/g, ' ').slice(0, 120)}`,
    view: null,
    url: announcement.url
  }
}

function gradeChange(course: CourseGrades, item: GradeEntry, label: Label): NewChange {
  return {
    kind: 'grade',
    title: `Neue Bewertung: ${item.name}`,
    detail: `${label(course.courseKey, course.course)}: ${item.grade}${item.range ? ` (${item.range})` : ''}`,
    view: 'grades',
    url: null
  }
}

const iso = (seconds: number | null | undefined): string | null => (seconds ? new Date(seconds * 1000).toISOString() : null)
const clean = (text: string): string => htmlToText(text).replace(/\s+/g, ' ').trim()
const formatNumber = (value: number): string => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(value)
