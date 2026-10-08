import { useState, type FormEvent } from 'react'
import { CalendarDays, Check, ClipboardList, Maximize2, NotebookPen, Settings } from 'lucide-react'
import { DayPlan } from './DayPlan'
import { ExamList } from './ExamList'
import { TaskList } from './TaskList'
import { nextUp, useTasks } from './lib/tasks'
import { useCalendar } from './lib/calendar'
import { examsDueSoon, useExams } from './lib/exams'
import { formatShortDate } from './lib/dates'
import { useAppState, useNow } from './lib/hooks'

/** The small window below the tray icon. Closes on Esc or a click outside (handled in the main process). */
export default function Mini() {
  const now = useNow(30_000)
  const { state } = useAppState()
  const tissConnected = state?.secrets.tissToken ?? false
  const calendar = useCalendar()
  const tasks = useTasks()
  const exams = useExams()
  // Exam registrations that end soon come first; three rows in all, so the day plan keeps its room.
  const registrations = exams ? examsDueSoon(exams.exams, now).slice(0, 2) : []
  const due = tasks ? nextUp(tasks, now, 3 - registrations.length) : []

  return (
    <div className="mini">
      <header className="mini-header">
        <div>
          <div className="mini-title">Heute</div>
          <div className="mini-date">{formatShortDate(now)}</div>
        </div>
        <button type="button" className="icon-button" title="sout öffnen" aria-label="sout öffnen" onClick={() => window.sout.openMain()}>
          <Maximize2 size={16} />
        </button>
      </header>

      <section className="mini-section mini-grow">
        <h3>
          <CalendarDays size={13} /> Tagesplan
        </h3>
        <DayPlan calendar={calendar} tasks={tasks} now={now} />
        {!tissConnected && (
          <p className="mini-empty">
            <button type="button" className="link" onClick={() => window.sout.openMain('settings')}>
              TISS verbinden
            </button>
          </p>
        )}
      </section>

      <section className="mini-section">
        <h3>
          <ClipboardList size={13} /> Fällig
        </h3>
        {registrations.length > 0 && <ExamList exams={registrations} calendar={calendar} now={now} short />}
        {due.length > 0 ? (
          <TaskList tasks={due} calendar={calendar} now={now} />
        ) : registrations.length > 0 ? null : tasks?.connected ? (
          <p className="mini-empty">Nichts offen.</p>
        ) : (
          <p className="mini-empty">
            <button type="button" className="link" onClick={() => window.sout.openMain('deadlines')}>
              TUWEL verbinden
            </button>
          </p>
        )}
      </section>

      <QuickNote ready={state ? Boolean(state.settings.notesDir) : null} />

      <footer className="mini-footer">
        <button type="button" className="button" onClick={() => window.sout.openMain()}>
          sout öffnen
        </button>
        <button type="button" className="button secondary" onClick={() => window.sout.openMain('settings')}>
          <Settings size={14} /> Einstellungen
        </button>
      </footer>
    </div>
  )
}

/** A thought, a question, a to-do – straight into the notes' Inbox. Enter saves, Shift+Enter starts a new line. */
function QuickNote({ ready }: { ready: boolean | null }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (ready === false) {
    return (
      <section className="mini-section">
        <h3>
          <NotebookPen size={13} /> Schnellnotiz
        </h3>
        <p className="mini-empty">
          <button type="button" className="link" onClick={() => window.sout.openMain('notes')}>
            Notizen einrichten
          </button>
        </p>
      </section>
    )
  }

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    if (!text.trim()) return
    const result = await window.sout.quickNote(text)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setText('')
    setError(null)
    setSaved(result.value)
    setTimeout(() => setSaved(null), 4000)
  }

  return (
    <section className="mini-section">
      <h3>
        <NotebookPen size={13} /> Schnellnotiz
      </h3>
      <form className="quick-note" onSubmit={(event) => void submit(event)}>
        <textarea
          className="input"
          rows={2}
          value={text}
          placeholder="Gedanke, Frage, To-do … (Enter speichert)"
          aria-label="Schnellnotiz"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
      </form>
      {saved && (
        <p className="quick-note-saved">
          <Check size={13} /> In der Inbox gespeichert ·{' '}
          <button type="button" className="link" onClick={() => window.sout.openMain('notes', saved)}>
            öffnen
          </button>
        </p>
      )}
      {error && <p className="quick-note-error">{error}</p>}
    </section>
  )
}
