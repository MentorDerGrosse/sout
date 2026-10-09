import { useState, type FormEvent } from 'react'
import { Check, ChevronDown, ExternalLink, ListChecks, LockKeyhole, LogIn, MapPin, NotebookPen, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { CalendarData, CheckmarkSheet, NotesData, Task, TasksData, TuwelExtras, View } from '../../../shared/types'
import { Callout } from '../components'
import { roomName, useCalendar } from '../lib/calendar'
import { checkedText, sheetOf, useTuwelExtras } from '../lib/tuwel'
import { useNow } from '../lib/hooks'
import { taskNotePath, useNotes } from '../lib/notes'
import { dueText, GROUP_LABELS, groupTasks, isUrgent, opensLater, opensText, remainingText, splitTasks, taskCourse, useTasks } from '../lib/tasks'

const syncFormat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

type OpenNote = (path: string, fresh?: boolean) => void

export default function DeadlinesView({ onOpenNote, onNavigate }: { onOpenNote: OpenNote; onNavigate: (view: View) => void }) {
  const data = useTasks()
  const calendar = useCalendar()
  const extras = useTuwelExtras()
  const { notes } = useNotes()
  const now = useNow(60_000)
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  if (!data) return null

  const { open, later, done } = splitTasks(data.tasks, now)
  // Kreuzerlübungen whose deadline is over: what you ticked, for the exercise session – and the points.
  const pastSheets = (extras?.checkmarks ?? []).filter((sheet) => sheet.due && Date.parse(sheet.due) < now.getTime()).reverse()

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

      {open.length === 0 && later.length === 0 && data.connected && !data.syncing && (
        <section className="card">
          <div className="empty">
            <strong>Nichts offen</strong>
            <span>In TUWEL wartet gerade keine Abgabe und kein Test auf dich.</span>
          </div>
        </section>
      )}

      {open.length > 0 && (
        <section className="task-section">
          <h2>
            Jetzt offen <span className="group-count">{open.length}</span>
          </h2>
          <p className="section-hint">Kannst du jetzt erledigen – das Dringendste zuerst.</p>
          {/* Day labels inside, so the order stays "most urgent first". */}
          {groupTasks(open, now).map(({ key, tasks }) => (
            <div key={key} className="task-day">
              <div className={`task-day-label${key === 'overdue' ? ' overdue' : ''}`}>{GROUP_LABELS[key]}</div>
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} calendar={calendar} extras={extras} notes={notes} now={now} onOpenNote={onOpenNote} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </section>
      )}

      {later.length > 0 && (
        <section className="task-section">
          <h2>
            Noch nicht offen <span className="group-count">{later.length}</span>
          </h2>
          <p className="section-hint">Kannst du noch nicht abgeben – sortiert danach, was zuerst aufmacht.</p>
          {later.map((task) => (
            <TaskCard key={task.id} task={task} calendar={calendar} extras={extras} notes={notes} now={now} onOpenNote={onOpenNote} onNavigate={onNavigate} />
          ))}
        </section>
      )}

      {pastSheets.length > 0 && (
        <section className="task-section">
          <h2>
            Kreuzerlübungen <span className="group-count">{pastSheets.length}</span>
          </h2>
          <p className="section-hint">Was du angekreuzt hast – für die Übungseinheit. Die letzten vier Wochen, die neueste oben.</p>
          {pastSheets.map((sheet) => (
            <SheetCard key={sheet.id} sheet={sheet} calendar={calendar} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="task-section">
          <button type="button" className="group-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <ChevronDown size={14} className={showDone ? '' : 'rotated'} /> Erledigt ({done.length})
          </button>
          {showDone &&
            done.map((task) => (
              <TaskCard key={task.id} task={task} calendar={calendar} extras={extras} notes={notes} now={now} onOpenNote={onOpenNote} onNavigate={onNavigate} />
            ))}
        </section>
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
const sheetDayFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })

/** The examples of a Kreuzerlübung: ticked ones green. */
function Examples({ sheet }: { sheet: CheckmarkSheet }) {
  return (
    <ul className="examples" aria-label="Beispiele">
      {sheet.examples.map((example) => (
        <li key={example.name} className={`example${example.checked ? ' checked' : ''}`} title={example.checked ? 'angekreuzt' : 'nicht angekreuzt'}>
          {example.checked ? <Check size={12} /> : <X size={12} />} {example.name}
        </li>
      ))}
    </ul>
  )
}

/** A Kreuzerlübung whose deadline is over: what was ticked, points and feedback. */
function SheetCard({ sheet, calendar }: { sheet: CheckmarkSheet; calendar: CalendarData | null }) {
  const [expanded, setExpanded] = useState(false)
  const course = calendar?.courses.find((candidate) => candidate.key === sheet.courseKey)
  return (
    <article className={`task-card exam-card${expanded ? ' expanded' : ''}`}>
      <span className="event-bar" style={{ background: course?.color ?? 'var(--text-muted)' }} />
      <span className="exam-status open">
        <ListChecks size={16} />
      </span>
      <button type="button" className="task-body" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="task-head">
          <span className="task-title">{sheet.name}</span>
          <span className="task-when">{checkedText(sheet)}</span>
        </span>
        <span className="task-head">
          <span className="task-meta">
            {[course?.shortName ?? sheet.course, sheet.due && `fällig ${sheetDayFormat.format(new Date(sheet.due))}`].filter(Boolean).join(' · ')}
          </span>
          {sheet.grade && <span className="task-remaining">{sheet.grade} Punkte</span>}
        </span>
      </button>
      {expanded && (
        <div className="task-details">
          <Examples sheet={sheet} />
          {sheet.feedback && <p className="task-description">{sheet.feedback}</p>}
          <div className="task-actions">
            <a className="button small secondary" href={sheet.url} target="_blank" rel="noreferrer">
              <ExternalLink size={13} /> In TUWEL öffnen
            </a>
          </div>
        </div>
      )}
    </article>
  )
}

function TaskCard(props: {
  task: Task
  calendar: CalendarData | null
  extras: TuwelExtras | null
  notes: NotesData | null
  now: Date
  onOpenNote: OpenNote
  onNavigate: (view: View) => void
}) {
  const { task, calendar, now } = props
  const [expanded, setExpanded] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const notePath = taskNotePath(props.notes, task)
  const openNote = async (): Promise<void> => {
    // Without a notes folder the notes page explains how to set it up.
    if (!props.notes?.root) return props.onNavigate('notes')
    if (notePath) return props.onOpenNote(notePath)
    const result = await window.sout.noteForTask(task.id)
    if (result.ok) props.onOpenNote(result.value, true)
    else setNoteError(result.error)
  }
  const course = taskCourse(task, calendar)
  const sheet = sheetOf(task, props.extras)
  const done = task.status === 'done'
  const overdue = !done && Boolean(task.due && new Date(task.due) < now)
  const notYet = opensLater(task, now)
  const urgent = !done && !notYet && isUrgent(task, now)

  return (
    <article className={`task-card${done ? ' done' : ''}${notYet ? ' not-yet' : ''}${expanded ? ' expanded' : ''}`}>
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
          {notYet ? (
            <span className="task-when opens">
              <LockKeyhole size={12} /> {opensText(task, now)}
            </span>
          ) : (
            task.due && <span className={`task-when${overdue ? ' overdue' : urgent ? ' urgent' : ''}`}>{dueText(task.due, now)}</span>
          )}
        </span>
        <span className="task-head">
          <span className="task-meta">
            {[course.name, task.kindLabel].filter(Boolean).join(' · ')}
            {task.status === 'draft' && <span className="pill warn">Entwurf, noch nicht abgegeben</span>}
            {sheet && <span className={`pill${sheet.submitted ? ' ok' : ''}`}>{checkedText(sheet)}</span>}
            {task.room && (
              <span className="task-room">
                <MapPin size={11} /> {roomName(task.room)}
              </span>
            )}
          </span>
          {notYet
            ? task.due && <span className="task-remaining">{`${task.dueLabel} ${dueText(task.due, now)}`}</span>
            : task.due &&
              !done && (
                <span className={`task-remaining${overdue ? ' overdue' : urgent ? ' urgent' : ''}`}>{remainingText(task.due, now)}</span>
              )}
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
            {task.opens && (
              <>
                <dt>{notYet ? 'Öffnet' : 'Offen seit'}</dt>
                <dd>{longFormat.format(new Date(task.opens))}</dd>
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
            {task.room && (
              <>
                <dt>Raum</dt>
                <dd>
                  <a href={`https://maps.tuwien.ac.at/?q=${encodeURIComponent(calendar?.rooms[task.room]?.mapCode ?? roomName(task.room))}#map`} target="_blank" rel="noreferrer">
                    <MapPin size={13} /> {roomName(task.room)}
                  </a>{' '}
                  <span className="room-address">laut TISS-Kalender</span>
                </dd>
              </>
            )}
            {sheet && sheet.examples.length > 0 && (
              <>
                <dt>Angekreuzt</dt>
                <dd>
                  <Examples sheet={sheet} />
                </dd>
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
            <button type="button" className="button small secondary" onClick={() => void openNote()}>
              <NotebookPen size={13} /> {notePath ? 'Notizen öffnen' : 'Notizen anlegen'}
            </button>
            {task.source === 'own' && (
              <button type="button" className="button small danger" onClick={() => void window.sout.deleteTodo(task.id)}>
                <Trash2 size={13} /> Löschen
              </button>
            )}
          </div>
          {noteError && <Callout kind="error" title={noteError} />}
        </div>
      )}
    </article>
  )
}
