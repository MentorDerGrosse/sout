import { useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import deLocale from '@fullcalendar/core/locales/de'
import type { EventContentArg, EventInput } from '@fullcalendar/core'
import { CalendarDays, ExternalLink, MapPin, NotebookPen, RefreshCw, X } from 'lucide-react'
import { EVENT_NOTE_FOLDERS } from '../../../shared/notes'
import type { CalendarData, CalendarEvent, EventKind, View } from '../../../shared/types'
import { eventNotePath, useNotes } from '../lib/notes'
import { openTasks, taskCourse, useTasks } from '../lib/tasks'
import { Callout } from '../components'
import {
  courseMap,
  eventLabel,
  formatTime,
  HOLIDAY_COLOR,
  isoDate,
  KIND_LABELS,
  mapsUrl,
  roomName,
  syncStatus,
  tissCourseUrl,
  useCalendar,
  visibleEvents
} from '../lib/calendar'

type Filter = EventKind | 'deadline'

const KIND_FILTERS: { kind: Filter; label: string }[] = [
  { kind: 'course', label: 'Vorlesungen' },
  { kind: 'group', label: 'Gruppen' },
  { kind: 'exam', label: 'Prüfungen' },
  { kind: 'deadline', label: 'Abgaben' },
  { kind: 'holiday', label: 'Ferien' }
]

export default function CalendarView(props: { onNavigate: (view: View) => void; onOpenNote: (path: string, fresh?: boolean) => void }) {
  const { onNavigate } = props
  const data = useCalendar()
  const tasks = useTasks()
  const [hiddenKinds, setHiddenKinds] = useState<Set<Filter>>(new Set())
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  if (!data) return null

  if (data.events.length === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Kalender</h1>
          <p>Dein Stundenplan, direkt aus TISS.</p>
        </header>
        <section className="card">
          <div className="empty">
            <CalendarDays size={22} />
            <strong>{data.syncing ? 'Lade deinen TISS-Kalender …' : 'Noch keine Termine'}</strong>
            {data.error ? (
              <span>TISS konnte nicht gelesen werden: {data.error}</span>
            ) : (
              <span>Trag in den Einstellungen deine TISS-Kalender-URL ein, dann erscheinen hier deine LVAs, Gruppen und Prüfungen.</span>
            )}
            <button type="button" className="button small" onClick={() => onNavigate('settings')}>
              Zu den Einstellungen
            </button>
          </div>
        </section>
      </div>
    )
  }

  const courses = courseMap(data)
  const events: EventInput[] = visibleEvents(data)
    .filter((event) => !hiddenKinds.has(event.kind))
    .map((event) => {
      const color = (event.courseKey && courses.get(event.courseKey)?.color) || HOLIDAY_COLOR
      return {
        id: event.id,
        title: eventLabel(event, event.courseKey ? courses.get(event.courseKey) : undefined),
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        backgroundColor: color,
        borderColor: color,
        textColor: '#fff',
        classNames: [`kind-${event.kind}`],
        extendedProps: { room: event.location ? roomName(event.location) : '' }
      }
    })

  // Deadlines go into the all-day row of their day: "23:59 Mathe · Übungsblatt 2".
  if (tasks && !hiddenKinds.has('deadline')) {
    for (const task of openTasks(tasks)) {
      if (!task.due || (task.courseKey && courses.get(task.courseKey)?.hidden)) continue
      const due = new Date(task.due)
      // Due at midnight belongs to the day before.
      const day = new Date(due.getTime() - (due.getHours() === 0 && due.getMinutes() === 0 ? 60_000 : 0))
      const course = taskCourse(task, data)
      events.push({
        id: `task:${task.id}`,
        title: `${formatTime(task.due)} ${[course.name, task.title].filter(Boolean).join(' · ')}`,
        start: isoDate(day),
        allDay: true,
        backgroundColor: course.color,
        borderColor: course.color,
        textColor: '#fff',
        classNames: ['kind-deadline']
      })
    }
  }

  const toggleKind = (kind: Filter): void => {
    const next = new Set(hiddenKinds)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    setHiddenKinds(next)
  }

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <div>
          <h1>Kalender</h1>
          <p className={data.error ? 'sync-error' : ''}>
            {syncStatus(data)}
            {data.error && ` · Letzte Aktualisierung fehlgeschlagen: ${data.error}`}
          </p>
        </div>
        <button type="button" className="button secondary" disabled={data.syncing} onClick={() => void window.sout.syncCalendar()}>
          <RefreshCw size={14} className={data.syncing ? 'spin' : undefined} /> Aktualisieren
        </button>
      </header>

      <div className="filters">
        {data.courses.map((course) => (
          <button
            key={course.key}
            type="button"
            className={`chip${course.hidden ? ' off' : ''}`}
            aria-pressed={!course.hidden}
            title={`${course.key} ${course.title}`}
            onClick={() => void window.sout.updateCourse(course.key, { hidden: !course.hidden })}
          >
            <span className="chip-dot" style={{ background: course.color }} />
            <span className="chip-label">{course.shortName}</span>
          </button>
        ))}
        <span className="filters-divider" />
        {KIND_FILTERS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            className={`chip${hiddenKinds.has(kind) ? ' off' : ''}`}
            aria-pressed={!hiddenKinds.has(kind)}
            onClick={() => toggleKind(kind)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="calendar-shell">
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, listPlugin]}
          locale={deLocale}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listMonth' }}
          buttonText={{ listMonth: 'Liste' }}
          firstDay={1}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          scrollTime="08:00:00"
          allDayText="ganztägig"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit' }}
          nowIndicator
          height="100%"
          fixedWeekCount={false}
          views={{ dayGridMonth: { dayMaxEvents: false } }}
          events={events}
          eventContent={renderEvent}
          eventClick={(info) => {
            if (info.event.id.startsWith('task:')) onNavigate('deadlines')
            else setSelected(data.events.find((event) => event.id === info.event.id) ?? null)
          }}
        />
      </div>

      {selected && (
        <EventDetails data={data} event={selected} onClose={() => setSelected(null)} onNavigate={onNavigate} onOpenNote={props.onOpenNote} />
      )}
    </div>
  )
}

function renderEvent(arg: EventContentArg) {
  // Month cells are small: one line with dot, time and name.
  if (arg.view.type === 'dayGridMonth' && !arg.event.allDay) {
    return (
      <div className="cal-event-line">
        <span className="cal-dot" style={{ background: arg.event.backgroundColor }} />
        <span className="cal-event-time">{arg.timeText}</span>
        <span className="cal-event-title">{arg.event.title}</span>
      </div>
    )
  }
  // The list view shows the time in its own column.
  const room = arg.event.extendedProps['room'] as string
  const sub = [arg.event.allDay || arg.view.type === 'listMonth' ? '' : arg.timeText, room].filter(Boolean).join(' · ')
  return (
    <div className="cal-event">
      <div className="cal-event-title">{arg.event.title}</div>
      {sub && <div className="cal-event-sub">{sub}</div>}
    </div>
  )
}

const longDay = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function EventDetails(props: {
  data: CalendarData
  event: CalendarEvent
  onClose: () => void
  onNavigate: (view: View) => void
  onOpenNote: (path: string, fresh?: boolean) => void
}) {
  const { data, event, onClose } = props
  const course = event.courseKey ? courseMap(data).get(event.courseKey) : undefined
  const start = new Date(event.start)
  return (
    <aside className="event-details" style={{ borderTopColor: course?.color ?? HOLIDAY_COLOR }}>
      <div className="event-details-head">
        <span className="event-kind">{KIND_LABELS[event.kind]}</span>
        <button type="button" className="icon-button" aria-label="Schließen" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <h2>{eventLabel(event, course)}</h2>
      {course && (
        <p className="event-course">
          {course.key} {course.type} {course.title}
        </p>
      )}
      <dl className="info-list">
        <dt>Wann</dt>
        <dd>
          {event.allDay ? longDay.format(start) : `${longDay.format(start)}, ${formatTime(event.start)}–${formatTime(event.end)}`}
        </dd>
        {event.location && (
          <>
            <dt>Wo</dt>
            <dd>
              <a href={mapsUrl(data, event.location)} target="_blank" rel="noreferrer">
                <MapPin size={13} /> {roomName(event.location)}
              </a>
              {data.rooms[event.location] && <div className="room-address">{data.rooms[event.location]!.address}</div>}
              {event.otherLocations.map((room) => (
                <div key={room} className="other-room">
                  auch in{' '}
                  <a href={mapsUrl(data, room)} target="_blank" rel="noreferrer">
                    {roomName(room)}
                  </a>{' '}
                  (Ausweichraum/Übertragung)
                </div>
              ))}
            </dd>
          </>
        )}
        {event.detail && (
          <>
            <dt>Was</dt>
            <dd>{event.detail}</dd>
          </>
        )}
      </dl>
      {course && (
        <div className="event-actions">
          <NoteButton event={event} onNavigate={props.onNavigate} onOpenNote={props.onOpenNote} />
          <a className="button secondary small" href={tissCourseUrl(course.key, start)} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> LVA in TISS
          </a>
        </div>
      )}
      {!course && event.kind !== 'holiday' && <Callout kind="info" title={event.title} />}
    </aside>
  )
}

/** Lecture notes for this appointment: opens them, or creates them from the template. */
function NoteButton(props: { event: CalendarEvent; onNavigate: (view: View) => void; onOpenNote: (path: string, fresh?: boolean) => void }) {
  const { notes } = useNotes()
  const [error, setError] = useState<string | null>(null)
  const { event } = props
  if (!EVENT_NOTE_FOLDERS[event.kind]) return null
  const existing = eventNotePath(notes, event)
  const exam = event.kind === 'exam'
  const label = existing ? (exam ? 'Prüfungsnotizen' : 'Mitschrift öffnen') : exam ? 'Prüfung vorbereiten' : 'Mitschrift anlegen'

  const open = async (): Promise<void> => {
    // Without a notes folder the notes page explains how to set it up.
    if (!notes?.root) return props.onNavigate('notes')
    if (existing) return props.onOpenNote(existing)
    const result = await window.sout.noteForEvent(event.id)
    if (result.ok) props.onOpenNote(result.value, true)
    else setError(result.error)
  }

  return (
    <>
      <button type="button" className="button small" onClick={() => void open()}>
        <NotebookPen size={13} /> {label}
      </button>
      {error && <Callout kind="error" title={error} />}
    </>
  )
}
