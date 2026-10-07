import type { Task } from '../shared/types'
import { tuwelCall } from './tuwelApi'

// TUWEL data → tasks. fetchSnapshot() collects the raw Moodle answers, toTasks() turns them into
// our model; keeping them apart lets a saved snapshot (SOUT_TUWEL_FILE) stand in for TUWEL in tests.

export interface MoodleSnapshot {
  site: { userid: number; fullname: string }
  /** The dashboard timeline: everything still to do. Submitted work drops out by itself. */
  events: MoodleActionEvent[]
  assignments: MoodleAssignment[]
  quizzes: MoodleQuiz[]
  /** Assignment id → submission status ("new", "draft", "submitted", …). */
  submissions: Record<string, string>
}

interface MoodleCourse {
  id: number
  fullname: string
  shortname: string
  idnumber?: string
}

interface MoodleActionEvent {
  id: number
  name: string
  activityname?: string
  activitystr?: string
  description?: string
  modulename?: string
  instance?: number
  eventtype: string
  timesort: number
  overdue?: boolean
  url?: string
  course?: MoodleCourse
  action?: { name: string; url: string; actionable?: boolean }
}

interface MoodleAssignment {
  id: number
  name: string
  intro?: string
  duedate: number
  cutoffdate: number
  allowsubmissionsfromdate: number
  configs?: { plugin: string; subtype: string; name: string; value: string }[]
}

interface MoodleQuiz {
  id: number
  name: string
  intro?: string
  timeopen: number
  timeclose: number
  timelimit: number
}

const DAY = 24 * 60 * 60

export async function fetchSnapshot(token: string): Promise<MoodleSnapshot> {
  const site = await tuwelCall<MoodleSnapshot['site']>(token, 'core_webservice_get_site_info')

  // Same window as the dashboard timeline, a bit wider: overdue up to 30 days back, 6 months ahead.
  const now = Math.floor(Date.now() / 1000)
  const events: MoodleActionEvent[] = []
  let after = 0
  for (let page = 0; page < 5; page++) {
    const result = await tuwelCall<{ events: MoodleActionEvent[]; lastid?: number }>(token, 'core_calendar_get_action_events_by_timesort', {
      timesortfrom: now - 30 * DAY,
      timesortto: now + 180 * DAY,
      aftereventid: after,
      limitnum: 50,
      limittononsuspendedevents: true
    })
    events.push(...result.events)
    if (result.events.length < 50 || !result.lastid) break
    after = result.lastid
  }

  // Details are a bonus: if one of these calls fails, the timeline alone is still useful.
  const courseids = [...new Set(events.flatMap((event) => (event.course ? [event.course.id] : [])))]
  const has = (module: string): boolean => events.some((event) => event.modulename === module)
  const [assignments, quizzes] = await Promise.all([
    has('assign')
      ? tuwelCall<{ courses: { assignments: MoodleAssignment[] }[] }>(token, 'mod_assign_get_assignments', { courseids })
          .then((result) => result.courses.flatMap((course) => course.assignments))
          .catch(() => [])
      : [],
    has('quiz')
      ? tuwelCall<{ quizzes: MoodleQuiz[] }>(token, 'mod_quiz_get_quizzes_by_courses', { courseids })
          .then((result) => result.quizzes)
          .catch(() => [])
      : []
  ])

  // One call per open assignment (to spot drafts) – few at a time, to go easy on TUWEL.
  const submissions: Record<string, string> = {}
  const assignIds = [...new Set(events.filter((event) => event.modulename === 'assign' && event.instance).map((event) => event.instance!))]
  for (let i = 0; i < Math.min(assignIds.length, 30); i += 4) {
    await Promise.all(
      assignIds.slice(i, i + 4).map(async (assignid) => {
        try {
          const result = await tuwelCall<{
            lastattempt?: { submission?: { status?: string }; teamsubmission?: { status?: string } }
          }>(token, 'mod_assign_get_submission_status', { assignid })
          submissions[assignid] = result.lastattempt?.submission?.status ?? result.lastattempt?.teamsubmission?.status ?? 'new'
        } catch {
          // Unknown status: shown as open.
        }
      })
    )
  }

  return { site: { userid: site.userid, fullname: site.fullname }, events, assignments, quizzes, submissions }
}

const MODULES: Record<string, string> = {
  assign: 'Abgabe',
  quiz: 'Test',
  checkmark: 'Kreuzerlübung',
  organizer: 'Terminbuchung',
  forum: 'Forum',
  feedback: 'Feedback',
  choice: 'Abstimmung',
  workshop: 'Workshop',
  lesson: 'Lektion',
  h5pactivity: 'H5P',
  scorm: 'Lernpaket'
}

const EVENT_TYPES: Record<string, string> = {
  due: 'fällig',
  close: 'schließt',
  open: 'öffnet',
  expectcompletionon: 'erledigen bis',
  gradingdue: 'Bewertung fällig'
}

const LVA = /\b(\d{3}\.[0-9A-Z]{3})\b/

export function toTasks(snapshot: MoodleSnapshot): Task[] {
  const assignments = new Map(snapshot.assignments.map((assignment) => [assignment.id, assignment]))
  const quizzes = new Map(snapshot.quizzes.map((quiz) => [quiz.id, quiz]))

  // The timeline lists opening and closing of an activity as two events ("öffnet", "schließt");
  // they become one task.
  const activities = new Map<string, MoodleActionEvent[]>()
  for (const event of snapshot.events) {
    const key = event.modulename && event.instance ? `${event.modulename}:${event.instance}` : `event:${event.id}`
    activities.set(key, [...(activities.get(key) ?? []), event])
  }

  return [...activities.values()].map((events): Task => {
    const opening = events.find((event) => event.eventtype === 'open')
    const closing = events.find((event) => event.eventtype !== 'open')
    const event = closing ?? opening!
    const module = event.modulename ?? null
    const assignment = module === 'assign' && event.instance ? assignments.get(event.instance) : undefined
    const quiz = module === 'quiz' && event.instance ? quizzes.get(event.instance) : undefined
    const status = module === 'assign' && event.instance ? snapshot.submissions[event.instance] : undefined
    const opens = opening?.timesort || quiz?.timeopen || assignment?.allowsubmissionsfromdate || 0
    const due = closing?.timesort || quiz?.timeclose || assignment?.duedate || 0
    return {
      id: `tuwel:${event.id}`,
      source: 'tuwel',
      title: cleanText(event.activityname || event.name),
      kindLabel: (module && MODULES[module]) || event.activitystr || 'Aktivität',
      module,
      dueLabel: closing ? (EVENT_TYPES[closing.eventtype] ?? 'fällig') : module === 'quiz' ? 'schließt' : 'fällig',
      courseKey: event.course ? lvaNumber(event.course) : null,
      courseName: event.course ? cleanText(event.course.fullname) : null,
      due: due ? isoTime(due) : null,
      cutoff: assignment?.cutoffdate ? isoTime(assignment.cutoffdate) : null,
      opens: opens ? isoTime(opens) : null,
      actionable: event.action ? event.action.actionable !== false : null,
      timeLimitMinutes: quiz?.timelimit ? Math.round(quiz.timelimit / 60) : null,
      description: htmlToText(assignment?.intro || quiz?.intro || event.description || '') || null,
      submission: assignment ? submissionTypes(assignment) : [],
      fileTypes: (assignment && submissionConfig(assignment, 'file', 'filetypeslist')) || null,
      status: status === 'draft' ? 'draft' : 'open',
      overdue: Boolean(event.overdue),
      url: event.url || event.action?.url || null,
      actionLabel: event.action?.name ? cleanText(event.action.name) : null
    }
  })
}

const isoTime = (seconds: number): string => new Date(seconds * 1000).toISOString()

/** TUWEL course names usually contain the LVA number ("123.456-2026W", "123.456 Titel …"). */
function lvaNumber(course: MoodleCourse): string | null {
  for (const text of [course.shortname, course.idnumber, course.fullname]) {
    const match = text ? LVA.exec(text) : null
    if (match) return match[1]!
  }
  return null
}

function submissionConfig(assignment: MoodleAssignment, plugin: string, name: string): string {
  return assignment.configs?.find((c) => c.subtype === 'assignsubmission' && c.plugin === plugin && c.name === name)?.value ?? ''
}

function submissionTypes(assignment: MoodleAssignment): string[] {
  const types: string[] = []
  if (submissionConfig(assignment, 'file', 'enabled') === '1') {
    const max = Number(submissionConfig(assignment, 'file', 'maxfilesubmissions'))
    types.push(max ? `Datei-Upload (max. ${max} ${max === 1 ? 'Datei' : 'Dateien'})` : 'Datei-Upload')
  }
  if (submissionConfig(assignment, 'onlinetext', 'enabled') === '1') types.push('Online-Text')
  return types
}

// ---------- Moodle text ----------

/** Keeps the German part of bilingual Moodle text ({mlang} filter and multilang spans). */
function germanOnly(text: string): string {
  return text
    .replace(/\{mlang\s+(?!de\b)[^}]*\}[\s\S]*?\{mlang\}/gi, '')
    .replace(/\{mlang[^}]*\}/gi, '')
    .replace(/<span(?=[^>]*\bmultilang\b)(?=[^>]*\blang="(?!de\b)[^"]*")[^>]*>[\s\S]*?<\/span>/gi, '')
}

function cleanText(text: string): string {
  return decodeEntities(germanOnly(text).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

export function htmlToText(html: string): string {
  const text = germanOnly(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h\d|tr|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“',
  rdquo: '”', lsquo: '‘', rsquo: '’', euro: '€'
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
    }
    return ENTITIES[entity] ?? match
  })
}
