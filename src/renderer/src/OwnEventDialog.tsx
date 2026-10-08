import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { Course, OwnEvent, OwnEventInput } from '../../shared/types'
import { Callout } from './components'
import { isoDate } from './lib/calendar'

/** The form's state: everything as the inputs show it. */
export interface OwnEventDraft {
  title: string
  courseKey: string
  day: string
  allDay: boolean
  from: string
  to: string
  location: string
  repeat: boolean
  until: string
}

const SUGGESTIONS = ['Lerngruppe', 'Lernblock', 'Tutorium', 'Sprechstunde']

const time = (date: Date): string => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/** Weekly series end with the lecture period by default: end of January or end of June. */
function lecturePeriodEnd(day: Date): string {
  const year = day.getFullYear()
  const month = day.getMonth() + 1
  if (month >= 10) return `${year + 1}-01-31`
  if (month <= 1) return `${year}-01-31`
  if (month === 2) return `${year}-02-28`
  return month <= 6 ? `${year}-06-30` : `${year}-09-30`
}

/** A new appointment: from a time range picked in the calendar, or tomorrow 14–16 h. */
export function newDraft(start?: Date, end?: Date, allDay = false): OwnEventDraft {
  const from = new Date(start ?? Date.now() + 24 * 60 * 60_000)
  // Without a time (button, day in the month view): 14 h, not an all-day appointment.
  if (!start || allDay) from.setHours(14, 0, 0, 0)
  const to = end && !allDay ? end : new Date(from.getTime() + 2 * 60 * 60_000)
  return {
    title: '',
    courseKey: '',
    day: isoDate(from),
    allDay: false,
    from: time(from),
    to: time(to),
    location: '',
    repeat: false,
    until: lecturePeriodEnd(from)
  }
}

export function draftOf(event: OwnEvent): OwnEventDraft {
  const start = event.allDay ? new Date(`${event.start}T00:00`) : new Date(event.start)
  const end = event.allDay ? start : new Date(event.end)
  return {
    title: event.title,
    courseKey: event.courseKey ?? '',
    day: isoDate(start),
    allDay: event.allDay,
    from: event.allDay ? '14:00' : time(start),
    to: event.allDay ? '16:00' : time(end),
    location: event.location ?? '',
    repeat: event.repeatWeeklyUntil !== null,
    until: event.repeatWeeklyUntil ?? lecturePeriodEnd(start)
  }
}

function inputOf(draft: OwnEventDraft): OwnEventInput {
  const nextDay = new Date(`${draft.day}T12:00`)
  nextDay.setDate(nextDay.getDate() + 1)
  return {
    title: draft.title,
    // Local wall-clock time; the main process stores it as an instant.
    start: draft.allDay ? draft.day : new Date(`${draft.day}T${draft.from}`).toISOString(),
    end: draft.allDay ? isoDate(nextDay) : new Date(`${draft.day}T${draft.to}`).toISOString(),
    allDay: draft.allDay,
    location: draft.location || null,
    courseKey: draft.courseKey || null,
    repeatWeeklyUntil: draft.repeat ? draft.until : null
  }
}

/** Create or edit an own appointment. Enter saves, Esc closes. */
export function OwnEventDialog(props: { courses: Course[]; initial: OwnEventDraft; editingId?: string; onClose: () => void }) {
  const [draft, setDraft] = useState(props.initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose
  const set = <K extends keyof OwnEventDraft>(key: K, value: OwnEventDraft[K]): void => setDraft((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    const input = inputOf(draft)
    const result = props.editingId ? await window.sout.updateOwnEvent(props.editingId, input) : await window.sout.addOwnEvent(input)
    setBusy(false)
    if (result.ok) props.onClose()
    else setError(result.error)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <form className="modal card" onSubmit={(event) => void submit(event)} aria-label={props.editingId ? 'Termin bearbeiten' : 'Neuer Termin'}>
        <div className="modal-head">
          <h2>{props.editingId ? 'Termin bearbeiten' : 'Eigener Termin'}</h2>
          <button type="button" className="icon-button" aria-label="Schließen" onClick={props.onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="field">
          <span>Was</span>
          <input
            className="input"
            value={draft.title}
            placeholder="z. B. Lerngruppe"
            onChange={(event) => set('title', event.target.value)}
            autoFocus
            required
          />
          <span className="suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="tag" onClick={() => set('title', suggestion)}>
                {suggestion}
              </button>
            ))}
          </span>
        </label>

        <label className="field">
          <span>Fach</span>
          <select className="input" value={draft.courseKey} onChange={(event) => set('courseKey', event.target.value)}>
            <option value="">Kein Fach</option>
            {props.courses.map((course) => (
              <option key={course.key} value={course.key}>
                {course.shortName === course.title ? course.title : `${course.shortName} – ${course.title}`}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Wann</span>
          <div className="field-row">
            <input className="input date-input" type="date" value={draft.day} onChange={(event) => set('day', event.target.value)} required aria-label="Tag" />
            {!draft.allDay && (
              <>
                <input className="input time-input" type="time" value={draft.from} onChange={(event) => set('from', event.target.value)} required aria-label="Beginn" />
                <span className="field-sep">bis</span>
                <input className="input time-input" type="time" value={draft.to} onChange={(event) => set('to', event.target.value)} required aria-label="Ende" />
              </>
            )}
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={draft.allDay} onChange={(event) => set('allDay', event.target.checked)} /> ganztägig
          </label>
        </div>

        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={draft.repeat} onChange={(event) => set('repeat', event.target.checked)} /> Jede Woche wiederholen
          </label>
          {draft.repeat && (
            <div className="field-row">
              <span className="field-sep">bis einschließlich</span>
              <input className="input date-input" type="date" value={draft.until} onChange={(event) => set('until', event.target.value)} required aria-label="Wiederholen bis" />
            </div>
          )}
        </div>

        <label className="field">
          <span>Wo</span>
          <input className="input" value={draft.location} placeholder="z. B. Bibliothek, Lernraum, Discord" onChange={(event) => set('location', event.target.value)} />
        </label>

        {error && <Callout kind="error" title={error} />}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={props.onClose}>
            Abbrechen
          </button>
          <button type="submit" className="button" disabled={busy || !draft.title.trim()}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}
