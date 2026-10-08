import { ClipboardList, MapPin } from 'lucide-react'
import type { CalendarData, TasksData } from '../../shared/types'
import { courseMap, eventColor, eventLabel, formatTime, isoDate, relativeDay, roomName, visibleEvents } from './lib/calendar'
import { opensLater, taskCourse } from './lib/tasks'

interface PlanItem {
  id: string
  start: number
  end: number
  time: string
  title: string
  sub: string | null
  color: string
  deadline: boolean
}

/** Looks ahead this many days for the next day with something on it. */
const LOOKAHEAD_DAYS = 7

/** A deadline at midnight belongs to the day before (as "23:59"). */
function dueMoment(iso: string): Date {
  const due = new Date(iso)
  return due.getHours() === 0 && due.getMinutes() === 0 ? new Date(due.getTime() - 60_000) : due
}

function planFor(day: string, calendar: CalendarData | null, tasks: TasksData | null, now: Date): { items: PlanItem[]; allDay: string[] } {
  const items: PlanItem[] = []
  const allDay: string[] = []
  if (calendar) {
    const courses = courseMap(calendar)
    for (const event of visibleEvents(calendar)) {
      const course = event.courseKey ? courses.get(event.courseKey) : undefined
      if (event.allDay) {
        if (event.start <= day && day < event.end) allDay.push(eventLabel(event, course))
        continue
      }
      if (isoDate(new Date(event.start)) !== day) continue
      items.push({
        id: event.id,
        start: Date.parse(event.start),
        end: Date.parse(event.end),
        time: formatTime(event.start),
        title: eventLabel(event, course),
        sub: event.location ? roomName(event.location) : null,
        color: eventColor(event, course),
        deadline: false
      })
    }
  }
  for (const task of tasks?.tasks ?? []) {
    if (task.status === 'done' || !task.due || opensLater(task, now)) continue
    const due = dueMoment(task.due)
    if (isoDate(due) !== day) continue
    const course = taskCourse(task, calendar)
    items.push({
      id: task.id,
      start: due.getTime(),
      end: due.getTime(),
      time: formatTime(due.toISOString()),
      title: task.title,
      sub: [course.name, `${task.kindLabel} ${task.dueLabel}`, task.room && roomName(task.room)].filter(Boolean).join(' · '),
      color: course.color,
      deadline: true
    })
  }
  return { items: items.sort((a, b) => a.start - b.start), allDay }
}

/** Today at a glance – appointments and deadlines in order, a "now" line; when the day is over, the next one. */
export function DayPlan(props: { calendar: CalendarData | null; tasks: TasksData | null; now: Date }) {
  const { now } = props
  const today = planFor(isoDate(now), props.calendar, props.tasks, now)
  const nowMs = now.getTime()
  const left = today.items.filter((item) => item.end > nowMs || (item.deadline && item.start > nowMs))

  let next: { label: string; plan: ReturnType<typeof planFor> } | null = null
  if (left.length === 0) {
    for (let offset = 1; offset <= LOOKAHEAD_DAYS && !next; offset++) {
      const day = new Date(now)
      day.setDate(day.getDate() + offset)
      const plan = planFor(isoDate(day), props.calendar, props.tasks, now)
      if (plan.items.length > 0) next = { label: relativeDay(day.toISOString(), now), plan }
    }
  }

  return (
    <div className="day-plan">
      {today.allDay.map((title) => (
        <div key={title} className="plan-all-day">
          {title}
        </div>
      ))}
      {today.items.length > 0 && (
        <Rows items={today.items} nowMs={nowMs} nowLabel={formatTime(now.toISOString())} />
      )}
      {left.length === 0 && <p className="mini-empty">{today.items.length > 0 ? 'Heute steht nichts mehr an.' : 'Heute ist nichts eingetragen.'}</p>}
      {next && (
        <>
          <div className="event-day-label plan-next-day">{next.label}</div>
          {next.plan.allDay.map((title) => (
            <div key={title} className="plan-all-day">
              {title}
            </div>
          ))}
          <Rows items={next.plan.items.slice(0, 5)} nowMs={nowMs} />
        </>
      )}
    </div>
  )
}

function Rows(props: { items: PlanItem[]; nowMs: number; nowLabel?: string }) {
  // The "now" line goes before the first item that hasn't ended yet.
  const nowIndex = props.nowLabel ? props.items.findIndex((item) => item.end > props.nowMs || (item.deadline && item.start > props.nowMs)) : -1
  return (
    <div className="plan-rows">
      {props.items.map((item, index) => (
        <div key={item.id}>
          {index === nowIndex && index > 0 && (
            <div className="plan-now">
              <span>jetzt {props.nowLabel}</span>
            </div>
          )}
          <div className={`plan-row${item.end <= props.nowMs && !(item.deadline && item.start > props.nowMs) ? ' past' : ''}`} title={item.title}>
            <span className="plan-time">{item.time}</span>
            <span className="event-bar" style={{ background: item.color }} />
            <span className="plan-main">
              <span className="plan-title">
                {item.deadline && <ClipboardList size={12} />} {item.title}
              </span>
              {item.sub && (
                <span className="plan-sub">
                  {!item.deadline && <MapPin size={11} />} {item.sub}
                </span>
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
