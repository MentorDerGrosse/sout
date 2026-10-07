import type { CalendarData, Task } from '../../shared/types'
import { dueText, isUrgent, opensLater, opensText, remainingText, taskCourse } from './lib/tasks'

/** Compact list of open tasks, used on "Heute" and in the mini window. */
export function TaskList(props: { tasks: Task[]; calendar: CalendarData | null; now: Date }) {
  return (
    <div className="task-list">
      {props.tasks.map((task) => {
        const course = taskCourse(task, props.calendar)
        const overdue = Boolean(task.due && new Date(task.due) < props.now)
        const notYet = opensLater(task, props.now)
        const urgent = !notYet && isUrgent(task, props.now)
        return (
          <div key={task.id} className={`task-row${notYet ? ' not-yet' : ''}`} title={task.title}>
            <span className="event-bar" style={{ background: course.color }} />
            <span className="task-main">
              <span className="task-title">{task.title}</span>
              <span className="task-meta">{[course.name, task.kindLabel].filter(Boolean).join(' · ')}</span>
            </span>
            {notYet ? (
              <span className="task-due opens">
                <span>{opensText(task, props.now)}</span>
                {task.due && <span className="task-remaining">{`${task.dueLabel} ${dueText(task.due, props.now)}`}</span>}
              </span>
            ) : (
              task.due && (
                <span className={`task-due${overdue ? ' overdue' : urgent ? ' urgent' : ''}`}>
                  <span>{dueText(task.due, props.now)}</span>
                  <span className="task-remaining">{remainingText(task.due, props.now)}</span>
                </span>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
