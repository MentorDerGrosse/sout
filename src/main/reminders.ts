import { app, Notification } from 'electron'
import { join } from 'node:path'
import type { Task } from '../shared/types'
import { calendarData } from './calendar'
import { readJson, writeJson } from './jsonFile'
import { resourcePath } from './paths'
import { getSettings } from './settings'
import { tasksData } from './tasks'
import { showMain } from './windows'

// Deadline reminders as desktop notifications, e.g. 1 day and 3 hours before (configurable).
// Which reminders were shown is remembered in reminders.json, so a restart doesn't repeat them.

const file = (): string => join(app.getPath('userData'), 'reminders.json')

/** Reminder key ("taskId|due|minutes") → due date, for cleaning up. */
type Shown = Record<string, string>

export function startReminders(): void {
  setTimeout(check, 5_000)
  setInterval(check, 60_000)
}

function check(): void {
  if (!Notification.isSupported()) return
  const offsets = [...getSettings().reminders].sort((a, b) => b - a)
  if (offsets.length === 0) return
  const shown = (readJson(file()) ?? {}) as Shown
  const now = Date.now()
  let changed = false

  for (const task of tasksData().tasks) {
    if (task.status === 'done' || !task.due) continue
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

function remaining(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'Tag' : 'Tage'}`
}
