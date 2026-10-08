import { app, Notification } from 'electron'
import { join } from 'node:path'
import { EXAM_URGENT_MS, examStatus } from '../shared/exams'
import type { ExamDate, Task } from '../shared/types'
import { calendarData } from './calendar'
import { examsData } from './exams'
import { readJson, writeJson } from './jsonFile'
import { resourcePath } from './paths'
import { getSettings } from './settings'
import { tasksData } from './tasks'
import { setTrayUrgent } from './tray'
import { showMain } from './windows'

// Deadline reminders as desktop notifications, e.g. 1 day and 3 hours before (configurable) – for
// assignments and tests and for exam registrations in TISS (also when one opens). Which reminders
// were shown is remembered in reminders.json, so a restart doesn't repeat them.

const file = (): string => join(app.getPath('userData'), 'reminders.json')

/** Reminder key ("taskId|due|minutes") → due date, for cleaning up. */
type Shown = Record<string, string>

export function startReminders(): void {
  setTimeout(check, 5_000)
  setInterval(check, 60_000)
}

/** Opening notices only for things that opened in the last two hours (not after a long pause). */
const OPENED_WINDOW_MS = 2 * 60 * 60_000

const DAY_MS = 24 * 60 * 60_000

/** Open, already possible and due within 24 hours – the tray icon gets a red dot for these. */
export function refreshUrgent(): void {
  const now = Date.now()
  const urgent = tasksData().tasks.filter((task) => {
    if (task.status === 'done' || !task.due || task.actionable === false) return false
    if (task.opens && Date.parse(task.opens) > now) return false
    const due = Date.parse(task.due)
    return due > now && due - now <= DAY_MS
  })
  // Exam registrations that close within a day and you aren't registered for.
  const closing = examsData().exams.filter((exam) => examStatus(exam, now) === 'open' && exam.closes && Date.parse(exam.closes) - now <= EXAM_URGENT_MS)
  setTrayUrgent(urgent.length + closing.length)
}

function check(): void {
  refreshUrgent()
  if (!Notification.isSupported()) return
  const settings = getSettings()
  const offsets = [...settings.reminders].sort((a, b) => b - a)
  const shown = (readJson(file()) ?? {}) as Shown
  const now = Date.now()
  let changed = false

  for (const task of tasksData().tasks) {
    if (task.status === 'done') continue
    if (settings.notifyOpening && task.opens) {
      const opens = Date.parse(task.opens)
      const key = `${task.id}|opens|${task.opens}`
      if (opens <= now && now - opens < OPENED_WINDOW_MS && !shown[key]) {
        notifyOpened(task)
        shown[key] = task.opens
        changed = true
      }
    }
    if (!task.due || offsets.length === 0) continue
    const due = Date.parse(task.due)
    if (due <= now) continue
    // Reminder times already reached; after a longer pause only the most urgent one is shown.
    const reached = offsets.filter((minutes) => now >= due - minutes * 60_000)
    if (reached.length === 0) continue
    const keys = reached.map((minutes) => `${task.id}|${task.due}|${minutes}`)
    if (!shown[keys[keys.length - 1]!]) notify(task, due - now)
    for (const key of keys) {
      if (!shown[key]) {
        shown[key] = task.due
        changed = true
      }
    }
  }

  if (settings.notifyExamRegistration) {
    for (const exam of examsData().exams) {
      // Open now and not registered (nor marked as not needed).
      if (examStatus(exam, now) !== 'open') continue
      if (exam.opens) {
        const key = `exam:${exam.id}|opens|${exam.opens}`
        if (now - Date.parse(exam.opens) < OPENED_WINDOW_MS && !shown[key]) {
          notifyExamOpened(exam)
          shown[key] = exam.opens
          changed = true
        }
      }
      if (!exam.closes || offsets.length === 0) continue
      const closes = Date.parse(exam.closes)
      const reached = offsets.filter((minutes) => now >= closes - minutes * 60_000)
      if (reached.length === 0) continue
      const keys = reached.map((minutes) => `exam:${exam.id}|${exam.closes}|${minutes}`)
      if (!shown[keys[keys.length - 1]!]) notifyExamClosing(exam, closes - now)
      for (const key of keys) {
        if (!shown[key]) {
          shown[key] = exam.closes
          changed = true
        }
      }
    }
  }

  // Forget reminders for deadlines more than a week in the past.
  for (const [key, due] of Object.entries(shown)) {
    if (Date.parse(due) < now - 7 * 24 * 60 * 60_000) {
      delete shown[key]
      changed = true
    }
  }
  if (changed) writeJson(file(), shown)
}

const timeFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'long', hour: '2-digit', minute: '2-digit' })

function notify(task: Task, remainingMs: number): void {
  const course = task.courseKey ? calendarData().courses.find((c) => c.key === task.courseKey)?.shortName : null
  const notification = new Notification({
    title: `${task.title} – noch ${remaining(remainingMs)}`,
    body: `${[course ?? task.courseName, task.kindLabel].filter(Boolean).join(' · ')} ${task.dueLabel} ${timeFormat.format(new Date(task.due!))}`,
    icon: resourcePath('icon.png')
  })
  notification.on('click', () => showMain('deadlines'))
  notification.show()
}

function notifyOpened(task: Task): void {
  const course = task.courseKey ? calendarData().courses.find((c) => c.key === task.courseKey)?.shortName : null
  const notification = new Notification({
    title: `${task.title} ist jetzt offen`,
    body: [
      [course ?? task.courseName, task.kindLabel].filter(Boolean).join(' · '),
      task.due ? `${task.dueLabel} ${timeFormat.format(new Date(task.due))}` : null
    ]
      .filter(Boolean)
      .join(' – '),
    icon: resourcePath('icon.png')
  })
  notification.on('click', () => showMain('deadlines'))
  notification.show()
}

const dateFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })

/** "EB · Test 1" */
function examLabel(exam: ExamDate): string {
  const course = calendarData().courses.find((c) => c.key === exam.courseKey)?.shortName ?? exam.courseKey
  return `${course} · ${exam.name}`
}

/** "Prüfung Do., 17. Dez., 10:00" */
const examWhen = (exam: ExamDate): string => `Prüfung ${(exam.allDay ? dayFormat : dateFormat).format(new Date(exam.start))}`

function notifyExamOpened(exam: ExamDate): void {
  const until = exam.closes ? ` bis ${dateFormat.format(new Date(exam.closes))}` : ''
  const notification = new Notification({
    title: `Prüfungsanmeldung offen: ${examLabel(exam)}`,
    body: `Anmelden ${exam.registration ?? ''}${until}`.replace(/\s+/g, ' ') + ` – ${examWhen(exam)}`,
    icon: resourcePath('icon.png')
  })
  notification.on('click', () => showMain('exams'))
  notification.show()
}

function notifyExamClosing(exam: ExamDate, remainingMs: number): void {
  const notification = new Notification({
    title: `Prüfungsanmeldung endet in ${remaining(remainingMs)}: ${examLabel(exam)}`,
    body: `Anmeldeschluss ${dateFormat.format(new Date(exam.closes!))} – ${examWhen(exam)}`,
    icon: resourcePath('icon.png')
  })
  notification.on('click', () => showMain('exams'))
  notification.show()
}

function remaining(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'Tag' : 'Tage'}`
}
