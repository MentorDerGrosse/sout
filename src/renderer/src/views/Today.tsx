import type { ReactNode } from 'react'
import { Bell, CalendarClock, CalendarDays, CalendarPlus, CalendarX2, Circle, CircleCheck, ClipboardList, Clock, DoorOpen, GraduationCap, PartyPopper, X, type LucideIcon } from 'lucide-react'
import type { CalendarData, Change, View } from '../../../shared/types'
import { ago, useChanges } from '../lib/changes'
import { EventList } from '../EventList'
import { ExamList } from '../ExamList'
import { examsToAct, groupWindowsToAct, useExams } from '../lib/exams'
import { TaskList } from '../TaskList'
import { nextUp, useTasks } from '../lib/tasks'
import { holidayOn, upcoming, useCalendar } from '../lib/calendar'
import { formatLongDate, greeting } from '../lib/dates'
import { useAppState, useNow } from '../lib/hooks'
import { trayPlace } from '../lib/platform'

export default function Today({ onNavigate }: { onNavigate: (view: View) => void }) {
  const now = useNow(60_000)
  const { state } = useAppState()
  const calendar = useCalendar()
  const next = calendar ? upcoming(calendar, now, 6) : []
  const holiday = calendar ? holidayOn(calendar, now) : undefined
  const tasks = useTasks()
  const due = tasks ? nextUp(tasks, now, 5) : []
  const tissConnected = state?.secrets.tissToken ?? false
  const toSettings = (
    <button type="button" className="button small secondary" onClick={() => onNavigate('settings')}>
      Einstellungen
    </button>
  )

  return (
    <>
      <header className="page-header">
        <h1>{greeting(now)}</h1>
        <p>{formatLongDate(now)}</p>
      </header>

      <div className="grid">
        <News now={now} onNavigate={onNavigate} />
        <ExamRegistrations calendar={calendar} now={now} onNavigate={onNavigate} />

        <section className="card">
          <h2 className="card-title">
            <CalendarDays size={16} /> Nächste Termine
          </h2>
          {holiday && (
            <p className="holiday-note">
              <PartyPopper size={14} /> {holiday.title}
            </p>
          )}
          {calendar && next.length > 0 ? (
            <>
              <EventList data={calendar} events={next} now={now} />
              <button type="button" className="link" onClick={() => onNavigate('calendar')}>
                Zum Kalender
              </button>
            </>
          ) : (
          <div className="empty">
            <strong>Noch keine Termine</strong>
            {tissConnected ? (
              <span>{calendar?.error ? `TISS konnte nicht gelesen werden: ${calendar.error}` : 'In deinem TISS-Kalender steht nichts Kommendes.'}</span>
            ) : (
              <>
                <span>Verbinde deinen TISS-Kalender, dann siehst du hier, was als Nächstes ansteht.</span>
                <button type="button" className="button small" onClick={() => onNavigate('settings')}>
                  TISS verbinden
                </button>
              </>
            )}
          </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">
            <ClipboardList size={16} /> Fällig
          </h2>
          {due.length > 0 ? (
            <>
              <TaskList tasks={due} calendar={calendar} now={now} />
              <button type="button" className="link" onClick={() => onNavigate('deadlines')}>
                Alle Abgaben
              </button>
            </>
          ) : tasks?.connected ? (
            <div className="empty">
              <strong>Nichts offen</strong>
              <span>In TUWEL wartet gerade nichts auf dich.</span>
            </div>
          ) : (
            <div className="empty">
              <strong>Noch keine Abgaben</strong>
              <span>Verbinde TUWEL, dann siehst du hier, was du noch abgeben musst.</span>
              <button type="button" className="button small" onClick={() => onNavigate('deadlines')}>
                TUWEL verbinden
              </button>
            </div>
          )}
        </section>

        {state && (
          <section className="card span-2">
            <h2 className="card-title">Einrichtung</h2>
            <ul className="steps">
              <Step
                status={state.info.trayAvailable ? 'done' : 'todo'}
                title={`Symbol ${trayPlace(state.info.platform)}`}
                hint={
                  state.info.trayAvailable
                    ? 'Schließen versteckt sout nur – ein Klick aufs Symbol öffnet die Mini-Ansicht.'
                    : 'GNOME braucht dafür die AppIndicator-Erweiterung. Anleitung in den Einstellungen.'
                }
                action={state.info.trayAvailable ? undefined : toSettings}
              />
              <Step
                status={state.autostart ? 'done' : 'todo'}
                title="Startet beim Anmelden"
                hint={state.autostart ? 'sout startet automatisch mit deinem Laptop.' : 'Lässt sich in den Einstellungen einschalten.'}
                action={state.autostart ? undefined : toSettings}
              />
              <Step
                status={tissConnected ? 'done' : 'todo'}
                title="TISS-Kalender verbunden"
                hint={tissConnected ? 'Der Token ist verschlüsselt gespeichert.' : 'In TISS unter Kalender ganz unten die Kalender-URL erzeugen.'}
                action={tissConnected ? undefined : toSettings}
              />
              <Step
                status={state.settings.notesDir ? 'done' : 'todo'}
                title="Notizordner eingerichtet"
                hint={state.settings.notesDir ? `Deine Notizen liegen in ${state.settings.notesDir}.` : 'Ein Ordner mit Unterordnern für jedes Fach.'}
                action={
                  state.settings.notesDir ? undefined : (
                    <button type="button" className="button small secondary" onClick={() => onNavigate('notes')}>
                      Einrichten
                    </button>
                  )
                }
              />
              <Step
                status={tasks?.connected ? 'done' : 'todo'}
                title="TUWEL verbunden"
                hint={tasks?.connected ? `Angemeldet${tasks.user ? ` als ${tasks.user}` : ''}.` : 'Einmal über den TU-Wien-Login anmelden.'}
                action={
                  tasks?.connected ? undefined : (
                    <button type="button" className="button small secondary" onClick={() => onNavigate('deadlines')}>
                      Verbinden
                    </button>
                  )
                }
              />
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

const CHANGE_ICONS: Record<Change['kind'], LucideIcon> = {
  room: DoorOpen,
  time: CalendarClock,
  cancelled: CalendarX2,
  added: CalendarPlus,
  exam: CalendarPlus,
  task: ClipboardList,
  grade: GraduationCap
}

/** Changes since the last syncs: room, time, dropped appointments, new exams, assignments, grades. */
function News({ now, onNavigate }: { now: Date; onNavigate: (view: View) => void }) {
  const changes = useChanges()
  if (changes.length === 0) return null
  const open = (change: Change): void => {
    if (change.url) window.open(change.url)
    else if (change.view) onNavigate(change.view)
  }
  return (
    <section className="card span-2 news">
      <h2 className="card-title">
        <Bell size={16} /> Neuigkeiten
        <button type="button" className="link news-clear" onClick={() => void window.sout.dismissChange(null)}>
          Alle gelesen
        </button>
      </h2>
      <ul className="news-list">
        {changes.slice(0, 8).map((change) => {
          const Icon = CHANGE_ICONS[change.kind]
          return (
            <li key={change.id} className={`news-item ${change.kind}`}>
              <Icon size={16} />
              <button type="button" className="news-text" onClick={() => open(change)}>
                <span className="news-title">{change.title}</span>
                <span className="news-detail">{change.detail}</span>
              </button>
              <span className="news-when">{ago(change.at, now)}</span>
              <button type="button" className="icon-button" aria-label="Gelesen" title="Gelesen" onClick={() => void window.sout.dismissChange(change.id)}>
                <X size={14} />
              </button>
            </li>
          )
        })}
      </ul>
      {changes.length > 8 && <p className="section-hint">und {changes.length - 8} weitere</p>}
    </section>
  )
}

/** Exam and group registrations open now or opening within a week – only when there are some. */
function ExamRegistrations({ calendar, now, onNavigate }: { calendar: CalendarData | null; now: Date; onNavigate: (view: View) => void }) {
  const data = useExams()
  const exams = data ? examsToAct(data.exams, now, 7) : []
  const groups = data ? groupWindowsToAct(data.deadlines, now, 7) : []
  const total = exams.length + groups.length
  if (total === 0) return null
  const shownExams = exams.slice(0, 4)
  const shownGroups = groups.slice(0, 4 - shownExams.length)
  return (
    <section className="card span-2">
      <h2 className="card-title">
        <GraduationCap size={16} /> {groups.length > 0 ? 'Anmeldungen' : 'Prüfungsanmeldungen'}
      </h2>
      <ExamList exams={shownExams} deadlines={shownGroups} calendar={calendar} now={now} />
      <button type="button" className="link" onClick={() => onNavigate('exams')}>
        {total > 4 ? `Alle Prüfungen (${total} Anmeldungen offen oder bald)` : 'Alle Prüfungen'}
      </button>
    </section>
  )
}

const STEP_ICONS = { done: CircleCheck, todo: Circle, later: Clock }

function Step(props: { status: keyof typeof STEP_ICONS; title: string; hint: string; action?: ReactNode }) {
  const Icon = STEP_ICONS[props.status]
  return (
    <li className="step">
      <span className={`step-icon ${props.status}`}>
        <Icon size={16} />
      </span>
      <div className="step-text">
        <div className="step-title">{props.title}</div>
        <div className="step-hint">{props.hint}</div>
      </div>
      {props.action}
    </li>
  )
}
