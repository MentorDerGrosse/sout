import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { Course, NoteTemplate } from '../../../shared/types'
import { Callout } from '../components'
import { isoDate } from '../lib/calendar'

const TEMPLATES: { template: NoteTemplate; label: string; hint: string; placeholder: string }[] = [
  { template: 'lecture', label: 'Mitschrift', hint: 'Vorlesung eines Tages, mit Zeit und Raum aus dem Kalender', placeholder: '' },
  { template: 'exercise', label: 'Übung', hint: 'Übungsblatt oder Aufgabe, Abschnitte pro Aufgabe', placeholder: 'z. B. Übungsblatt 3' },
  { template: 'summary', label: 'Zusammenfassung', hint: 'Zur Prüfungsvorbereitung: Definitionen, Sätze, Beispiele', placeholder: 'z. B. Zusammenfassung Kapitel 1–3' },
  { template: 'blank', label: 'Leer', hint: 'Nur eine Überschrift', placeholder: 'Titel' }
]

export interface NewNoteDefaults {
  courseKey: string | null
  template: NoteTemplate
}

/** Where (course or Inbox), which template, title or day. Enter creates, Esc closes. */
export function NewNoteDialog(props: { courses: Course[]; defaults: NewNoteDefaults; onCreated: (path: string) => void; onClose: () => void }) {
  const [courseKey, setCourseKey] = useState(props.defaults.courseKey ?? '')
  const [template, setTemplate] = useState<NoteTemplate>(props.defaults.template)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => isoDate(new Date()))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const current = TEMPLATES.find((entry) => entry.template === template)!
  const titleRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lecture notes need nothing typed: Enter creates them right away. Otherwise the title comes first.
  useEffect(() => (template === 'lecture' ? submitRef : titleRef).current?.focus(), [template])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    const result = await window.sout.createNote({ courseKey: courseKey || null, template, title, date })
    setBusy(false)
    if (result.ok) props.onCreated(result.value)
    else setError(result.error)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <form className="modal card" onSubmit={(event) => void submit(event)} aria-label="Neue Notiz">
        <div className="modal-head">
          <h2>Neue Notiz</h2>
          <button type="button" className="icon-button" aria-label="Schließen" onClick={props.onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="field">
          <span>Fach</span>
          <select className="input" value={courseKey} onChange={(event) => setCourseKey(event.target.value)}>
            <option value="">Inbox (später einordnen)</option>
            {props.courses.map((course) => (
              <option key={course.key} value={course.key}>
                {course.shortName === course.title ? course.title : `${course.shortName} – ${course.title}`}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Vorlage</span>
          <div className="segmented" role="radiogroup" aria-label="Vorlage">
            {TEMPLATES.map((entry) => (
              <button
                key={entry.template}
                type="button"
                role="radio"
                aria-checked={template === entry.template}
                className={template === entry.template ? 'active' : ''}
                onClick={() => setTemplate(entry.template)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <span className="field-hint">{current.hint}</span>
        </div>

        {template === 'lecture' ? (
          <label className="field">
            <span>Tag</span>
            <input className="input date-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
        ) : (
          <label className="field">
            <span>Titel</span>
            <input ref={titleRef} className="input" value={title} placeholder={current.placeholder} onChange={(event) => setTitle(event.target.value)} />
          </label>
        )}

        {error && <Callout kind="error" title={error} />}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={props.onClose}>
            Abbrechen
          </button>
          <button ref={submitRef} type="submit" className="button" disabled={busy}>
            Anlegen
          </button>
        </div>
      </form>
    </div>
  )
}
