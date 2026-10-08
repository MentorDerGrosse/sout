import type { CalendarData, CourseDeadline, ExamDate } from '../../shared/types'
import {
  deadlineRemaining,
  deadlineStatus,
  deadlineText,
  deadlineTitle,
  deadlineUrgent,
  examCourse,
  examRemaining,
  examStatus,
  examTimeText,
  examUrgent,
  groupsText,
  windowText
} from './lib/exams'

/**
 * Compact list of exam and group registrations, used on "Heute" and (`short`, next to the tasks)
 * in the mini window.
 */
export function ExamList(props: { exams: ExamDate[]; deadlines?: CourseDeadline[]; calendar: CalendarData | null; now: Date; short?: boolean }) {
  const courseName = (key: string): string => props.calendar?.courses.find((course) => course.key === key)?.shortName ?? key
  return (
    <div className="task-list">
      {props.exams.map((exam) => {
        const status = examStatus(exam, props.now.getTime())
        const course = examCourse(exam, props.calendar)
        const urgent = examUrgent(exam, status, props.now)
        const remaining = examRemaining(exam, status, props.now)
        return (
          <div key={exam.id} className={`task-row${status === 'soon' ? ' not-yet' : ''}`} title={`${course.name} · ${exam.name}`}>
            <span className="event-bar" style={{ background: course.color }} />
            <span className="task-main">
              <span className="task-title">{exam.name}</span>
              <span className="task-meta">
                {course.name} · {props.short ? 'Prüfungsanmeldung' : `Prüfung ${examTimeText(exam, props.now)}`}
              </span>
            </span>
            <span className={`task-due${status === 'soon' ? ' opens' : urgent ? ' urgent' : ''}`}>
              <span>{windowText(exam, status, props.now)}</span>
              {remaining && <span className="task-remaining">{remaining}</span>}
            </span>
          </div>
        )
      })}
      {props.deadlines?.map((deadline) => {
        const soon = deadlineStatus(deadline, props.now.getTime()) === 'soon'
        const urgent = deadlineUrgent(deadline, props.now)
        const color = props.calendar?.courses.find((course) => course.key === deadline.courseKey)?.color ?? 'var(--text-muted)'
        return (
          <div key={deadline.id} className={`task-row${soon ? ' not-yet' : ''}`} title={`${courseName(deadline.courseKey)} · ${deadlineTitle(deadline)}`}>
            <span className="event-bar" style={{ background: color }} />
            <span className="task-main">
              <span className="task-title">{deadlineTitle(deadline)}</span>
              <span className="task-meta">
                {courseName(deadline.courseKey)}
                {!props.short && deadline.groups.length > 0 && ` · ${groupsText(deadline.groups, 2)}`}
              </span>
            </span>
            <span className={`task-due${soon ? ' opens' : urgent ? ' urgent' : ''}`}>
              <span>{deadlineText(deadline, props.now)}</span>
              <span className="task-remaining">{deadlineRemaining(deadline, props.now)}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
