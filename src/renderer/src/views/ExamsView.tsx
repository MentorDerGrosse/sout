import { useState, type ReactNode } from 'react'
import { CalendarX2, ChevronDown, CircleCheck, CircleDashed, ExternalLink, Eye, EyeOff, LockKeyhole, RefreshCw, Ticket, UserMinus, Users, type LucideIcon } from 'lucide-react'
import { tissGroupsUrl } from '../../../shared/exams'
import { tissCourseUrl } from '../../../shared/tu'
import type { CalendarData, CourseDeadline, ExamDate, ExamsData, View } from '../../../shared/types'
import { Callout } from '../components'
import { ExamInfo } from '../ExamInfo'
import { useCalendar } from '../lib/calendar'
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
  splitExams,
  useExams,
  windowText,
  type ExamStatus
} from '../lib/exams'
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
  const deadlineCard = (deadline: CourseDeadline): ReactNode => <DeadlineCard key={deadline.id} deadline={deadline} calendar={calendar} now={now} />
  // Group registrations go with the exam registrations; the earlier end (or opening) first.
  const groupsIn = (status: 'open' | 'soon'): CourseDeadline[] =>
    data.deadlines.filter((deadline) => deadline.kind === 'group' && deadlineStatus(deadline, now.getTime()) === status)
  // Plain string order: ISO dates, and "~" (after the digits) puts exams without a window last.
  const merged = (exams: ExamDate[], groups: CourseDeadline[], key: (item: ExamDate | CourseDeadline) => string): ReactNode[] =>
    [...exams, ...groups]
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
      .map((item) => ('kind' in item ? deadlineCard(item) : card(item)))
  const openItems = merged(open, groupsIn('open'), (item) => item.closes ?? ('start' in item ? item.start : ''))
  const soonItems = merged(soon, groupsIn('soon'), (item) => item.opens ?? `~${'start' in item ? item.start : ''}`)
  const deregister = data.deadlines.filter((deadline) => deadline.kind === 'deregister' && !deadline.dismissed)
  const dismissedDeadlines = data.deadlines.filter((deadline) => deadline.dismissed)
  const otherCount = other.length + dismissedDeadlines.length

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

      {openItems.length > 0 && (
        <Section title="Anmeldung offen" count={openItems.length} hint="Jetzt in TISS anmelden – was zuerst schließt, steht oben.">
          {openItems}
        </Section>
      )}
      {soonItems.length > 0 && (
        <Section title="Anmeldung noch nicht offen" count={soonItems.length} hint="Sortiert danach, was zuerst aufmacht.">
          {soonItems}
        </Section>
      )}
      {registered.length > 0 && (
        <Section title="Angemeldet" count={registered.length} hint="Steht in deinem TISS-Kalender.">
          {registered.map(card)}
        </Section>
      )}
      {deregister.length > 0 && (
        <Section title="LVA-Abmeldung" count={deregister.length} hint="Bis dahin kannst du dich in TISS von der LVA abmelden.">
          {deregister.map(deadlineCard)}
        </Section>
      )}
      {otherCount > 0 && (
        <section className="task-section">
          <button type="button" className="group-toggle" aria-expanded={showOther} onClick={() => setShowOther(!showOther)}>
            <ChevronDown size={14} className={showOther ? '' : 'rotated'} /> Vorbei oder nicht nötig ({otherCount})
          </button>
          {showOther && (
            <>
              {other.map(card)}
              {dismissedDeadlines.map(deadlineCard)}
            </>
          )}
        </section>
      )}

      {data.courses > 0 && (
        <p className="section-hint exams-note">
          Die Prüfungen deiner LVAs aus dem TISS-Kalender ({data.courses}) – ausgeblendete Fächer fehlen. sout liest die TISS-Seiten alle paar Stunden; angemeldet
          bist du, sobald die Prüfung in deinem TISS-Kalender steht. Gruppenanmeldungen zeigt sout nur bei LVAs, in denen du noch in keiner Gruppe bist.
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

const deadlineFormat = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** A group registration window or a deregistration deadline. */
function DeadlineCard(props: { deadline: CourseDeadline; calendar: CalendarData | null; now: Date }) {
  const { deadline, now } = props
  const [expanded, setExpanded] = useState(false)
  const course = props.calendar?.courses.find((candidate) => candidate.key === deadline.courseKey)
  const soon = deadlineStatus(deadline, now.getTime()) === 'soon'
  const urgent = deadlineUrgent(deadline, now)
  const group = deadline.kind === 'group'
  const Icon = deadline.dismissed ? EyeOff : group ? (soon ? LockKeyhole : Users) : UserMinus
  return (
    <article className={`task-card exam-card${deadline.dismissed ? ' faded' : ''}${soon ? ' not-yet' : ''}`}>
      <span className="event-bar" style={{ background: course?.color ?? 'var(--text-muted)' }} />
      <span className={`exam-status ${soon ? 'soon' : group ? 'open' : 'none'}${urgent ? ' urgent' : ''}`}>
        <Icon size={16} />
      </span>
      <button type="button" className="task-body" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="task-head">
          <span className="task-title">
            {course?.shortName ?? deadline.courseKey} · {deadlineTitle(deadline)}
          </span>
          <span className={`task-when exam-when ${soon ? 'soon' : ''}${urgent ? ' urgent' : ''}`}>{deadline.dismissed ? 'ausgeblendet' : deadlineText(deadline, now)}</span>
        </span>
        <span className="task-head">
          <span className="task-meta">{group ? `${deadline.groups.length === 1 ? 'Gruppe' : `${deadline.groups.length} Gruppen`}: ${groupsText(deadline.groups)}` : 'Abmelden in TISS'}</span>
          <span className={`task-remaining${urgent ? ' urgent' : ''}`}>{deadlineRemaining(deadline, now)}</span>
        </span>
      </button>
      {expanded && (
        <div className="task-details">
          <dl className="info-list">
            {group && (
              <>
                <dt>Gruppen</dt>
                <dd>{deadline.groups.join(', ')}</dd>
              </>
            )}
            <dt>{group ? 'Anmeldung' : 'Abmeldung bis'}</dt>
            <dd>
              {deadline.opens && `${deadlineFormat.format(new Date(deadline.opens))} – `}
              {deadline.closes && deadlineFormat.format(new Date(deadline.closes))}
            </dd>
            {course && (
              <>
                <dt>LVA</dt>
                <dd>
                  {course.key} {course.type} {course.title}
                </dd>
              </>
            )}
          </dl>
          <div className="task-actions">
            <a
              className={`button small${group && !soon ? '' : ' secondary'}`}
              href={group ? tissGroupsUrl(deadline.courseKey, deadline.semester) : tissCourseUrl(deadline.courseKey, deadline.semester)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} /> {group ? 'Gruppen in TISS' : 'LVA in TISS'}
            </a>
            <button type="button" className="button small secondary" onClick={() => void window.sout.dismissExam(deadline.id, !deadline.dismissed)}>
              {deadline.dismissed ? <Eye size={13} /> : <EyeOff size={13} />} {deadline.dismissed ? 'Wieder einblenden' : 'Brauche ich nicht'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
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
