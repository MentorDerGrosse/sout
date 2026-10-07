import { useState, type FormEvent } from 'react'
import { ChevronDown, ExternalLink, LogIn, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { CalendarData, Task, TasksData } from '../../../shared/types'
import { Callout } from '../components'
import { useCalendar } from '../lib/calendar'
import { useNow } from '../lib/hooks'
import { dueText, GROUP_LABELS, groupTasks, remainingText, taskCourse, useTasks } from '../lib/tasks'

const syncFormat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function DeadlinesView() {
  const data = useTasks()
  const calendar = useCalendar()
  const now = useNow(60_000)
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  if (!data) return null

  const groups = groupTasks(data.tasks, now)
  const open = data.tasks.filter((task) => task.status !== 'done')

  return (
    <>
      <header className="page-header deadlines-header">
        <div>
          <h1>Abgaben & Tests</h1>
          <p>{statusLine(data)}</p>
        </div>
        <div className="header-actions">
          {data.connected && (
            <button type="button" className="button secondary" disabled={data.syncing} onClick={() => void window.sout.syncTasks()}>
              <RefreshCw size={14} className={data.syncing ? 'spin' : undefined} /> Aktualisieren
            </button>
          )}
          <button type="button" className="button" onClick={() => setAdding(true)}>
            <Plus size={14} /> To-do
          </button>
        </div>
      </header>

      {!data.connected && <ConnectCard />}
      {data.connected && data.expired && <ReloginCallout />}
      {data.connected && !data.expired && data.error && <Callout kind="error" title="TUWEL konnte nicht gelesen werden.">{data.error}</Callout>}

      {adding && <TodoForm calendar={calendar} onDone={() => setAdding(false)} />}

      {open.length === 0 && data.connected && !data.syncing && (
        <section className="card">
          <div className="empty">
            <strong>Nichts offen</strong>
            <span>In TUWEL wartet gerade keine Abgabe und kein Test auf dich.</span>
          </div>
        </section>
      )}

      {groups.map(({ key, tasks }) =>
        key === 'done' ? (
          <section key={key} className="task-group">
            <button type="button" className="group-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              <ChevronDown size={14} className={showDone ? '' : 'rotated'} /> {GROUP_LABELS[key]} ({tasks.length})
            </button>
            {showDone && tasks.map((task) => <TaskCard key={task.id} task={task} calendar={calendar} now={now} />)}
          </section>
        ) : (
          <section key={key} className="task-group">
            <h2 className={key === 'overdue' ? 'overdue' : undefined}>
              {GROUP_LABELS[key]} <span className="group-count">{tasks.length}</span>
            </h2>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} calendar={calendar} now={now} />
            ))}
          </section>
        )
      )}
    </>
  )
}

function statusLine(data: TasksData): string {
  if (!data.connected) return 'Was du in TUWEL noch abgeben musst – und deine eigenen To-dos.'
  if (data.syncing) return 'Aktualisiere …'
  const parts = [data.syncedAt ? `Stand: ${syncFormat.format(new Date(data.syncedAt))}` : 'Noch nicht synchronisiert']
  if (data.user) parts.push(`TUWEL: ${data.user}`)
  return parts.join(' · ')
}

function ConnectCard() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const login = async (): Promise<void> => {
    setBusy(true)
    const result = await window.sout.loginTuwel()
    setBusy(false)
    setError(result.ok ? null : result.error)
  }
  return (
    <section className="card connect-card">
      <div className="empty">
        <strong>Mit TUWEL verbinden</strong>
        <span>
          Du meldest dich einmal über den TU-Wien-Login an, wie bei der Moodle-App. sout bekommt dann einen Zugangsschlüssel von
          TUWEL – dein Passwort sieht und speichert sout nie.
        </span>
        <button type="button" className="button" disabled={busy} onClick={() => void login()}>
          <LogIn size={14} /> {busy ? 'Anmeldung läuft …' : 'Bei TUWEL anmelden'}
        </button>
        {error && <Callout kind="error" title="Anmeldung hat nicht geklappt.">{error}</Callout>}
      </div>
    </section>
  )
}

function ReloginCallout() {
  return (
    <Callout kind="warn" title="Die TUWEL-Anmeldung ist abgelaufen.">
      <p>Die Liste zeigt den letzten bekannten Stand.</p>
      <button type="button" className="button small" onClick={() => void window.sout.loginTuwel()}>
        <LogIn size={13} /> Neu anmelden
      </button>
    </Callout>
  )
}

function TodoForm({ calendar, onDone }: { calendar: CalendarData | null; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [courseKey, setCourseKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    // datetime-local is local time; the main process stores ISO (UTC).
    const result = await window.sout.addTodo({ title, due: due ? new Date(due).toISOString() : null, courseKey: courseKey || null })
    if (result.ok) onDone()
    else setError(result.error)
  }

  return (
    <form className="card todo-form" onSubmit={(event) => void submit(event)}>
      <input className="input" placeholder="Was ist zu tun? (z. B. Für Test 1 lernen)" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <input className="input date-input" type="datetime-local" aria-label="Fällig am" value={due} onChange={(e) => setDue(e.target.value)} />
      <select className="input course-select" aria-label="Fach" value={courseKey} onChange={(e) => setCourseKey(e.target.value)}>
        <option value="">Kein Fach</option>
        {calendar?.courses.map((course) => (
          <option key={course.key} value={course.key}>
            {course.shortName}
          </option>
        ))}
      </select>
      <button type="submit" className="button" disabled={!title.trim()}>
        Hinzufügen
      </button>
      <button type="button" className="button secondary" onClick={onDone}>
        Abbrechen
      </button>
      {error && <Callout kind="error" title={error} />}
    </form>
  )
}

const longFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

function TaskCard({ task, calendar, now }: { task: Task; calendar: CalendarData | null; now: Date }) {
  const [expanded, setExpanded] = useState(false)
  const course = taskCourse(task, calendar)
  const done = task.status === 'done'
  const overdue = !done && Boolean(task.due && new Date(task.due) < now)
  const opensLater = task.opens && new Date(task.opens) > now

  return (
    <article className={`task-card${done ? ' done' : ''}${expanded ? ' expanded' : ''}`}>
      <span className="event-bar" style={{ background: course.color }} />
      <input
        type="checkbox"
        className="task-check"
        checked={done}
        aria-label={done ? 'Wieder offen' : 'Erledigt'}
        title={task.source === 'tuwel' ? 'Als erledigt markieren (nur in sout)' : 'Erledigt'}
        onChange={(event) => void window.sout.setTaskDone(task.id, event.target.checked)}
      />
      <button type="button" className="task-body" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="task-head">
          <span className="task-title">{task.title}</span>
          {task.due && <span className={`task-when${overdue ? ' overdue' : ''}`}>{dueText(task.due, now)}</span>}
        </span>
        <span className="task-head">
          <span className="task-meta">
            {[course.name, task.kindLabel].filter(Boolean).join(' · ')}
            {task.status === 'draft' && <span className="pill warn">Entwurf, noch nicht abgegeben</span>}
          </span>
          {task.due && !done && <span className={`task-remaining${overdue ? ' overdue' : ''}`}>{remainingText(task.due, now)}</span>}
        </span>
      </button>

      {expanded && (
        <div className="task-details">
          <dl className="info-list">
            {task.due && (
              <>
                <dt>{task.dueLabel === 'fällig' ? 'Fällig' : `${task.kindLabel} ${task.dueLabel}`}</dt>
                <dd>{longFormat.format(new Date(task.due))}</dd>
              </>
            )}
            {task.cutoff && task.cutoff !== task.due && (
              <>
                <dt>Letzte Abgabe</dt>
                <dd>{longFormat.format(new Date(task.cutoff))}</dd>
              </>
            )}
            {opensLater && (
              <>
                <dt>Ab</dt>
                <dd>{longFormat.format(new Date(task.opens!))}</dd>
              </>
            )}
            {task.timeLimitMinutes && (
              <>
                <dt>Zeitlimit</dt>
                <dd>{task.timeLimitMinutes} Minuten</dd>
              </>
            )}
            {task.submission.length > 0 && (
              <>
                <dt>Abgabe als</dt>
                <dd>{task.submission.join(', ')}</dd>
              </>
            )}
            {task.fileTypes && (
              <>
                <dt>Dateitypen</dt>
                <dd>{task.fileTypes}</dd>
              </>
            )}
          </dl>
          {task.description && <p className="task-description">{task.description}</p>}
          <div className="task-actions">
            {task.url && (
              <a className="button small" href={task.url} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> {task.actionLabel ?? 'In TUWEL öffnen'}
              </a>
            )}
            {task.source === 'own' && (
              <button type="button" className="button small danger" onClick={() => void window.sout.deleteTodo(task.id)}>
                <Trash2 size={13} /> Löschen
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
