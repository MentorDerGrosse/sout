import { useState, type ReactNode } from 'react'
import { CalendarX2, ChevronDown, CircleCheck, CircleDashed, EyeOff, LockKeyhole, RefreshCw, Ticket, type LucideIcon } from 'lucide-react'
import type { CalendarData, ExamDate, ExamsData, View } from '../../../shared/types'
import { Callout } from '../components'
import { ExamInfo } from '../ExamInfo'
import { useCalendar } from '../lib/calendar'
import { examCourse, examRemaining, examStatus, examTimeText, examUrgent, splitExams, useExams, windowText, type ExamStatus } from '../lib/exams'
import { useNow } from '../lib/hooks'

const syncFormat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Exam dates of your courses and when to register for them – from the courses' TISS pages. */
export default function ExamsView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const data = useExams()
  const calendar = useCalendar()
  const now = useNow(60_000)
  const [showOther, setShowOther] = useState(false)
  if (!data) return null

  const { open, soon, registered, other } = splitExams(data.exams, now)
  const card = (exam: ExamDate): ReactNode => <ExamCard key={exam.id} exam={exam} calendar={calendar} now={now} />

  return (
    <>
      <header className="page-header deadlines-header">
        <div>
          <h1>Prüfungen</h1>
          <p>{statusLine(data)}</p>
        </div>
        {data.courses > 0 && (
          <div className="header-actions">
            <button type="button" className="button secondary" disabled={data.syncing} onClick={() => void window.sout.syncExams()}>
              <RefreshCw size={14} className={data.syncing ? 'spin' : undefined} /> Aktualisieren
            </button>
          </div>
        )}
      </header>

      {data.courses === 0 && (
        <Callout kind="info" title="Noch keine LVAs.">
          <p>Verbinde in den Einstellungen deinen TISS-Kalender. sout liest dann auf den TISS-Seiten deiner LVAs die Prüfungstermine und Anmeldefristen.</p>
          <button type="button" className="button small" onClick={() => onNavigate('settings')}>
            Zu den Einstellungen
          </button>
        </Callout>
      )}
      {data.failed.length > 0 && (
        <Callout kind="warn" title={`${data.failed.length === 1 ? 'Eine LVA-Seite' : `${data.failed.length} LVA-Seiten`} konnte TISS gerade nicht liefern.`}>
          <p>
            {data.failed.map(({ courseKey, error }) => `${courseName(courseKey, calendar)}: ${error}`).join(' · ')} – sout zeigt, was beim letzten Mal dort stand,
            und versucht es bald wieder.
          </p>
        </Callout>
      )}

      {data.courses > 0 && data.exams.length === 0 && !data.syncing && (
        <section className="card">
          <div className="empty">
            <strong>Keine kommenden Prüfungen</strong>
            <span>{data.syncedAt ? 'TISS listet für deine LVAs gerade keine Prüfungstermine.' : 'sout hat die TISS-Seiten deiner LVAs noch nicht gelesen.'}</span>
          </div>
        </section>
      )}

      {open.length > 0 && (
        <Section title="Anmeldung offen" count={open.length} hint="Jetzt in TISS anmelden – was zuerst schließt, steht oben.">
          {open.map(card)}
        </Section>
      )}
      {soon.length > 0 && (
        <Section title="Anmeldung noch nicht offen" count={soon.length} hint="Sortiert danach, was zuerst aufmacht.">
          {soon.map(card)}
        </Section>
      )}
      {registered.length > 0 && (
        <Section title="Angemeldet" count={registered.length} hint="Steht in deinem TISS-Kalender.">
          {registered.map(card)}
        </Section>
      )}
      {other.length > 0 && (
        <section className="task-section">
          <button type="button" className="group-toggle" aria-expanded={showOther} onClick={() => setShowOther(!showOther)}>
            <ChevronDown size={14} className={showOther ? '' : 'rotated'} /> Vorbei oder nicht nötig ({other.length})
          </button>
          {showOther && other.map(card)}
        </section>
      )}

      {data.courses > 0 && (
        <p className="section-hint exams-note">
          Die Prüfungen deiner LVAs aus dem TISS-Kalender ({data.courses}) – ausgeblendete Fächer fehlen. sout liest die TISS-Seiten alle paar Stunden; angemeldet
          bist du, sobald die Prüfung in deinem TISS-Kalender steht.
        </p>
      )}
    </>
  )
}

function statusLine(data: ExamsData): string {
  if (data.syncing) return 'Lese die TISS-Seiten deiner LVAs …'
  if (data.courses === 0) return 'Prüfungstermine und Anmeldefristen deiner LVAs.'
  return data.syncedAt ? `Stand: ${syncFormat.format(new Date(data.syncedAt))}` : 'Noch nicht gelesen'
}

function courseName(courseKey: string, calendar: CalendarData | null): string {
  return calendar?.courses.find((course) => course.key === courseKey)?.shortName ?? courseKey
}

function Section(props: { title: string; count: number; hint: string; children: ReactNode }) {
  return (
    <section className="task-section">
      <h2>
        {props.title} <span className="group-count">{props.count}</span>
      </h2>
      <p className="section-hint">{props.hint}</p>
      {props.children}
    </section>
  )
}

const STATUS_ICONS: Record<ExamStatus, LucideIcon> = {
  open: Ticket,
  soon: LockKeyhole,
  registered: CircleCheck,
  covered: CircleCheck,
  closed: CalendarX2,
  dismissed: EyeOff,
  none: CircleDashed
}

function ExamCard(props: { exam: ExamDate; calendar: CalendarData | null; now: Date }) {
  const { exam, now } = props
  const [expanded, setExpanded] = useState(false)
  const status = examStatus(exam, now.getTime())
  const course = examCourse(exam, props.calendar)
  const urgent = examUrgent(exam, status, now)
  const remaining = examRemaining(exam, status, now)
  const Icon = STATUS_ICONS[status]
  const faded = status === 'closed' || status === 'covered' || status === 'dismissed'
  return (
    <article className={`task-card exam-card${faded ? ' faded' : ''}${status === 'soon' ? ' not-yet' : ''}${expanded ? ' expanded' : ''}`}>
      <span className="event-bar" style={{ background: course.color }} />
      <span className={`exam-status ${status}${urgent ? ' urgent' : ''}`} title={windowText(exam, status, now)}>
        <Icon size={16} />
      </span>
      <button type="button" className="task-body" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="task-head">
          <span className="task-title">
            {course.name} · {exam.name}
          </span>
          <span className={`task-when exam-when ${status}${urgent ? ' urgent' : ''}`}>{windowText(exam, status, now)}</span>
        </span>
        <span className="task-head">
          <span className="task-meta">
            Prüfung {examTimeText(exam, now)}
            {exam.mode && ` · ${exam.mode}`}
          </span>
          {remaining && <span className={`task-remaining${urgent ? ' urgent' : ''}`}>{remaining}</span>}
        </span>
      </button>
      {expanded && (
        <div className="task-details">
          <ExamInfo exam={exam} calendar={props.calendar} now={now} />
        </div>
      )}
    </article>
  )
}
