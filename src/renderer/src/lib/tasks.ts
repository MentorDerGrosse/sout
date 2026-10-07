import { useEffect, useState } from 'react'
import type { CalendarData, Task, TasksData } from '../../../shared/types'
import { HOLIDAY_COLOR, isoDate } from './calendar'

/** Tasks from TUWEL plus own to-dos; updates after every sync or change. */
export function useTasks(): TasksData | null {
  const [data, setData] = useState<TasksData | null>(null)
  useEffect(() => {
    const load = (): void => void window.sout.getTasks().then(setData)
    load()
    return window.sout.onTasksChanged(load)
  }, [])
  return data
}

export const openTasks = (data: TasksData): Task[] => data.tasks.filter((task) => task.status !== 'done')

/** Colour and short name of the course from the TISS calendar; otherwise the TUWEL course name. */
export function taskCourse(task: Task, calendar: CalendarData | null): { name: string | null; color: string } {
  const course = task.courseKey ? calendar?.courses.find((c) => c.key === task.courseKey) : undefined
  return { name: course?.shortName ?? task.courseName, color: course?.color ?? HOLIDAY_COLOR }
}

export type GroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'undated' | 'done'

export const GROUP_LABELS: Record<GroupKey, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  tomorrow: 'Morgen',
  week: 'Diese Woche',
  later: 'Später',
  undated: 'Ohne Termin',
  done: 'Erledigt'
}

const ORDER: GroupKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'undated', 'done']

export function groupTasks(tasks: Task[], now: Date): { key: GroupKey; tasks: Task[] }[] {
  const today = isoDate(now)
  const tomorrow = isoDate(addDays(now, 1))
  const sunday = isoDate(addDays(now, (7 - now.getDay()) % 7))
  const groups = new Map<GroupKey, Task[]>()
  for (const task of tasks) {
    const key = groupOf(task)
    groups.set(key, [...(groups.get(key) ?? []), task])
  }
  return ORDER.filter((key) => groups.has(key)).map((key) => ({ key, tasks: groups.get(key)! }))

  function groupOf(task: Task): GroupKey {
    if (task.status === 'done') return 'done'
    if (!task.due) return 'undated'
    if (new Date(task.due) < now) return 'overdue'
    const day = isoDate(new Date(task.due))
    if (day === today) return 'today'
    if (day === tomorrow) return 'tomorrow'
    return day <= sunday ? 'week' : 'later'
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const time = new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' })
const dayAndTime = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** "heute, 23:59", "morgen, 12:00" or "Fr., 10. Okt., 23:59". */
export function dueText(iso: string, now: Date): string {
  const date = new Date(iso)
  const day = isoDate(date)
  if (day === isoDate(now)) return `heute, ${time.format(date)}`
  if (day === isoDate(addDays(now, 1))) return `morgen, ${time.format(date)}`
  return dayAndTime.format(date)
}

/** "in 45 min", "in 5 h", "in 3 Tagen", "seit 2 Tagen überfällig". */
export function remainingText(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime()
  const minutes = Math.round(Math.abs(ms) / 60_000)
  const span =
    minutes < 60 ? `${minutes} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} Tagen`
  return ms >= 0 ? `in ${span}` : `seit ${span} überfällig`
}
