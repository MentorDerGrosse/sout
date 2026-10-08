import { useState, type FormEvent } from 'react'
import { ChevronDown, ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { CalendarData, CourseGrade, CourseGrades, StudyCourse } from '../../../shared/types'
import { Callout } from '../components'
import { useCalendar } from '../lib/calendar'
import { currentSemester } from '../lib/dates'
import { GRADE_LABELS, isPassed, recentSemesters, summary, useStudies } from '../lib/studies'
import { semesterLabel } from '../../../shared/tu'
import { useTuwelExtras } from '../lib/tuwel'

const ects = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 })
const average = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const gradedFormat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short' })

/** ECTS and grades of your courses – entered by you – and the grades and feedback TUWEL shows. */
export default function GradesView() {
  const studies = useStudies()
  const extras = useTuwelExtras()
  const calendar = useCalendar()
  if (!studies) return null

  const current = currentSemester(new Date()).code
  const total = summary(studies.courses)
  const thisSemester = studies.courses.filter((course) => course.semester === current)
  const semesters = [...new Set(studies.courses.map((course) => course.semester))]
  const tuwelGrades = (extras?.grades ?? []).filter((course) => course.items.length > 0 || course.total)
  const passed = studies.courses.filter(isPassed).length

  return (
    <>
      <header className="page-header">
        <h1>Noten</h1>
        <p>ECTS und Noten deiner LVAs – und was TUWEL an Bewertungen und Feedback zeigt.</p>
      </header>

      <div className="grade-summary">
        <Tile label="ECTS geschafft" value={ects.format(total.ects)} hint={`${lvas(passed)} abgeschlossen`} />
        <Tile
          label="Notendurchschnitt"
          value={total.average === null ? '–' : average.format(total.average)}
          hint={total.average === null ? 'noch keine Note eingetragen' : `gewichtet nach ECTS, aus ${total.graded === 1 ? 'einer Note' : `${total.graded} Noten`}`}
        />
        <Tile
          label={`ECTS ${semesterLabel(current)}`}
          value={ects.format(thisSemester.reduce((sum, course) => sum + (course.ects ?? 0), 0))}
          hint={lvas(thisSemester.length)}
        />
      </div>

      {studies.courses.length === 0 && (
        <Callout kind="info" title="Noch keine LVAs.">
          Sobald sout deinen TISS-Kalender kennt, stehen deine LVAs hier – mit ECTS aus TISS. Ältere trägst du unten selbst ein.
        </Callout>
      )}

      {semesters.map((semester) => (
        <section key={semester} className="section">
          <h2>{semesterLabel(semester)}</h2>
          <div className="rows">
            {studies.courses
              .filter((course) => course.semester === semester)
              .map((course) => (
                <StudyRow key={`${course.key} ${course.semester}`} course={course} calendar={calendar} />
              ))}
          </div>
        </section>
      ))}

      <AddCourse current={current} />
      <p className="section-hint grades-note">
        Die Noten trägst du selbst ein – TISS gibt sie nur mit Anmeldung heraus. Der Durchschnitt zählt die positiven Noten, gewichtet nach ECTS.
      </p>

      {tuwelGrades.length > 0 && (
        <section className="section">
          <h2>Bewertungen in TUWEL</h2>
          {tuwelGrades.map((course) => (
            <TuwelGrades key={course.url} grades={course} calendar={calendar} />
          ))}
          {extras?.gradesCheckedAt && <p className="section-hint">TUWEL wird alle zwei Stunden gefragt.</p>}
        </section>
      )}
    </>
  )
}

const lvas = (n: number): string => `${n} ${n === 1 ? 'LVA' : 'LVAs'}`

function Tile(props: { label: string; value: string; hint: string }) {
  return (
    <div className="card grade-tile">
      <div className="grade-tile-label">{props.label}</div>
      <div className="grade-tile-value">{props.value}</div>
      <div className="grade-tile-hint">{props.hint}</div>
    </div>
  )
}

function StudyRow({ course, calendar }: { course: StudyCourse; calendar: CalendarData | null }) {
  const color = calendar?.courses.find((candidate) => candidate.key === course.key)?.color
  const update = (patch: { grade?: CourseGrade | null; ects?: number | null }): void => void window.sout.updateStudyCourse(course.key, course.semester, patch)
  return (
    <div className="row study-row">
      <span className="chip-dot" style={{ background: color ?? 'var(--border)' }} />
      <div className="row-text">
        <div className="row-title">{course.title}</div>
        <div className="row-desc">
          {course.key} {course.type}
          {course.manual && ' · selbst eingetragen'}
        </div>
      </div>
      <label className="study-ects">
        <input
          key={course.ects ?? 'leer'}
          className="input"
          type="number"
          min={0}
          max={60}
          step={0.5}
          defaultValue={course.ects ?? ''}
          aria-label={`ECTS von ${course.title}`}
          onBlur={(event) => {
            const value = event.target.value === '' ? null : Number(event.target.value)
            if (value !== course.ects) update({ ects: value })
          }}
        />
        ECTS
      </label>
      <select
        className={`input study-grade${course.grade ? ` grade-${course.grade}` : ''}`}
        value={course.grade ?? ''}
        aria-label={`Note für ${course.title}`}
        onChange={(event) => update({ grade: (event.target.value || null) as CourseGrade | null })}
      >
        <option value="">Keine Note</option>
        {(Object.keys(GRADE_LABELS) as CourseGrade[]).map((grade) => (
          <option key={grade} value={grade}>
            {GRADE_LABELS[grade]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-button"
        title="Aus der Liste nehmen"
        aria-label={`${course.title} aus der Liste nehmen`}
        onClick={() => void window.sout.removeStudyCourse(course.key, course.semester)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

/** A course from an earlier semester (or one that isn't in the TISS calendar). */
function AddCourse({ current }: { current: string }) {
  const [key, setKey] = useState('')
  const [semester, setSemester] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    const result = await window.sout.addStudyCourse(key, semester)
    setBusy(false)
    setError(result.ok ? null : result.error)
    if (result.ok) setKey('')
  }
  return (
    <form className="card todo-form add-course" onSubmit={(event) => void submit(event)}>
      <input className="input" placeholder="LVA-Nummer, z. B. 123.456" aria-label="LVA-Nummer" value={key} onChange={(event) => setKey(event.target.value)} />
      <select className="input course-select" aria-label="Semester" value={semester} onChange={(event) => setSemester(event.target.value)}>
        {recentSemesters(current).map((code) => (
          <option key={code} value={code}>
            {semesterLabel(code)}
          </option>
        ))}
      </select>
      <button type="submit" className="button" disabled={busy || !key.trim()}>
        <Plus size={14} /> {busy ? 'Suche in TISS …' : 'LVA hinzufügen'}
      </button>
      {error && <Callout kind="error" title={error} />}
    </form>
  )
}

/** A course's grades in TUWEL: the total, every graded item, feedback on click. */
function TuwelGrades({ grades, calendar }: { grades: CourseGrades; calendar: CalendarData | null }) {
  const [open, setOpen] = useState(false)
  const course = calendar?.courses.find((candidate) => candidate.key === grades.courseKey)
  return (
    <article className={`task-card exam-card${open ? ' expanded' : ''}`}>
      <span className="event-bar" style={{ background: course?.color ?? 'var(--text-muted)' }} />
      <span className="exam-status open">
        <ChevronDown size={16} className={open ? '' : 'rotated'} />
      </span>
      <button type="button" className="task-body" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="task-head">
          <span className="task-title">{course?.shortName ?? grades.course}</span>
          {grades.total && <span className="task-when">Gesamt: {grades.total}</span>}
        </span>
        <span className="task-head">
          <span className="task-meta">
            {grades.items.length === 1 ? 'eine Bewertung' : `${grades.items.length} Bewertungen`}
            {grades.items.some((item) => item.feedback) && ' · mit Feedback'}
          </span>
        </span>
      </button>
      {open && (
        <div className="task-details">
          <ul className="grade-items">
            {grades.items.map((item) => (
              <li key={item.id} className="grade-item">
                <div className="grade-item-head">
                  <span className="grade-item-name">{item.name}</span>
                  <span className="grade-item-grade">
                    {item.grade}
                    {item.range && <span className="grade-item-range"> ({item.range})</span>}
                    {item.percentage && <span className="grade-item-range"> · {item.percentage}</span>}
                  </span>
                </div>
                {item.gradedAt && <div className="grade-item-date">bewertet am {gradedFormat.format(new Date(item.gradedAt))}</div>}
                {item.feedback && <p className="grade-feedback">{item.feedback}</p>}
              </li>
            ))}
          </ul>
          <div className="task-actions">
            <a className="button small secondary" href={grades.url} target="_blank" rel="noreferrer">
              <ExternalLink size={13} /> Bewertungen in TUWEL
            </a>
          </div>
        </div>
      )}
    </article>
  )
}
