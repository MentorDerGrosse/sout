import type { CalendarData, ExamDate } from '../../shared/types'
import { examCourse, examRemaining, examStatus, examTimeText, examUrgent, windowText } from './lib/exams'

/** Compact list of exam registrations, used on "Heute" and (`short`, next to the tasks) in the mini window. */
export function ExamList(props: { exams: ExamDate[]; calendar: CalendarData | null; now: Date; short?: boolean }) {
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
    </div>
  )
}
