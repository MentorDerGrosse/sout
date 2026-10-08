import { useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import deLocale from '@fullcalendar/core/locales/de'
import type { EventChangeArg, EventContentArg, EventInput } from '@fullcalendar/core'
import { ExternalLink, MapPin, NotebookPen, Pencil, Plus, RefreshCw, Repeat, Trash2, X } from 'lucide-react'
import { EVENT_NOTE_FOLDERS } from '../../../shared/notes'
import type { CalendarData, CalendarEvent, EventKind, OwnEvent, View } from '../../../shared/types'
import { eventNotePath, useNotes } from '../lib/notes'
import { openTasks, taskCourse, useTasks } from '../lib/tasks'
import { Callout } from '../components'
import { draftOf, newDraft, OwnEventDialog, type OwnEventDraft } from '../OwnEventDialog'
import {
  courseMap,
  eventColor,
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
  { kind: 'own', label: 'Eigene' },
  { kind: 'deadline', label: 'Abgaben' },
  { kind: 'holiday', label: 'Ferien' }
]

export default function CalendarView(props: { onNavigate: (view: View) => void; onOpenNote: (path: string, fresh?: boolean) => void }) {
  const { onNavigate } = props
  const data = useCalendar()
  const tasks = useTasks()
  const [hiddenKinds, setHiddenKinds] = useState<Set<Filter>>(new Set())
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [dialog, setDialog] = useState<{ draft: OwnEventDraft; editingId?: string } | null>(null)
  if (!data) return null

  const courses = courseMap(data)
  const ownById = new Map(data.own.map((own) => [own.id, own]))
  const fromTiss = data.events.some((event) => event.ownId === null)
  const events: EventInput[] = visibleEvents(data)
    .filter((event) => !hiddenKinds.has(event.kind))
    .map((event) => {
      const color = eventColor(event, event.courseKey ? courses.get(event.courseKey) : undefined)
      // Own single appointments can be moved and resized right in the calendar; series only via the form.
      const own = event.ownId ? ownById.get(event.ownId) : undefined
      return {
        id: event.id,
        title: eventLabel(event, event.courseKey ? courses.get(event.courseKey) : undefined),
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        editable: Boolean(own && !own.repeatWeeklyUntil),
        backgroundColor: color,
        borderColor: color,
        textColor: '#fff',
        classNames: [`kind-${event.kind}`],
        extendedProps: { room: event.location ? roomName(event.location) : '' }
      }
    })

  /** An own appointment was dragged to another time or made longer/shorter. */
  const moveOwn = async (change: EventChangeArg): Promise<void> => {
    const own = data.events.find((event) => event.id === change.event.id)?.ownId
    const original = own ? ownById.get(own) : undefined
    const start = change.event.start
    if (!original || !start) {
      change.revert()
      return
    }
    const allDay = change.event.allDay
    const end = change.event.end ?? new Date(start.getTime() + (allDay ? 24 * 60 : 60) * 60_000)
    const result = await window.sout.updateOwnEvent(original.id, {
      ...original,
      allDay,
      start: allDay ? isoDate(start) : start.toISOString(),
      end: allDay ? isoDate(end) : end.toISOString()
    })
    if (!result.ok) change.revert()
  }

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
        <div className="header-actions">
          <button type="button" className="button secondary" disabled={data.syncing} onClick={() => void window.sout.syncCalendar()}>
            <RefreshCw size={14} className={data.syncing ? 'spin' : undefined} /> Aktualisieren
          </button>
          <button type="button" className="button" title="Oder im Kalender eine Zeit aufziehen" onClick={() => setDialog({ draft: newDraft() })}>
            <Plus size={14} /> Termin
          </button>
        </div>
      </header>

      {!fromTiss && (
        <Callout kind="info" title={data.syncing ? 'Lade deinen TISS-Kalender …' : 'Noch keine Termine aus TISS.'}>
          {data.error ? (
            <p>TISS konnte nicht gelesen werden: {data.error}</p>
          ) : (
            <p>Trag in den Einstellungen deine TISS-Kalender-URL ein, dann erscheinen hier deine LVAs, Gruppen und Prüfungen.</p>
          )}
          <button type="button" className="button small" onClick={() => onNavigate('settings')}>
            Zu den Einstellungen
          </button>
        </Callout>
      )}

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
          plugins={[timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin]}
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
          // Pick a time range (or a day) for a new own appointment.
          selectable
          selectMirror
          select={(info) => {
            setDialog({ draft: newDraft(info.start, info.end, info.allDay) })
            info.view.calendar.unselect()
          }}
          eventDrop={(change) => void moveOwn(change)}
          eventResize={(change) => void moveOwn(change)}
          eventContent={renderEvent}
          eventClick={(info) => {
            if (info.event.id.startsWith('task:')) onNavigate('deadlines')
            else setSelected(data.events.find((event) => event.id === info.event.id) ?? null)
          }}
        />
      </div>

      {selected && selected.ownId && ownById.get(selected.ownId) ? (
        <OwnEventDetails
          data={data}
          event={selected}
          own={ownById.get(selected.ownId)!}
          onClose={() => setSelected(null)}
          onEdit={(own) => {
            setSelected(null)
            setDialog({ draft: draftOf(own), editingId: own.id })
          }}
        />
      ) : (
        selected && <EventDetails data={data} event={selected} onClose={() => setSelected(null)} onNavigate={onNavigate} onOpenNote={props.onOpenNote} />
      )}
      {dialog && (
        <OwnEventDialog courses={data.courses.filter((course) => !course.hidden)} initial={dialog.draft} editingId={dialog.editingId} onClose={() => setDialog(null)} />
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

const dayFormat = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })

/** An own appointment: what, when, where – edit or delete (for a series: this day or all). */
function OwnEventDetails(props: { data: CalendarData; event: CalendarEvent; own: OwnEvent; onClose: () => void; onEdit: (own: OwnEvent) => void }) {
  const { data, event, own } = props
  const [confirm, setConfirm] = useState(false)
  const course = event.courseKey ? courseMap(data).get(event.courseKey) : undefined
  const start = new Date(event.allDay ? `${event.start}T00:00` : event.start)
  const day = isoDate(start)
  const remove = async (onlyThisDay: boolean): Promise<void> => {
    const result = await window.sout.deleteOwnEvent(own.id, onlyThisDay ? day : null)
    if (result.ok) props.onClose()
  }
  return (
    <aside className="event-details" style={{ borderTopColor: eventColor(event, course) }}>
      <div className="event-details-head">
        <span className="event-kind">{KIND_LABELS.own}</span>
        <button type="button" className="icon-button" aria-label="Schließen" onClick={props.onClose}>
          <X size={16} />
        </button>
      </div>
      <h2>{event.title}</h2>
      {course && (
        <p className="event-course">
          {course.key} {course.type} {course.title}
        </p>
      )}
      <dl className="info-list">
        <dt>Wann</dt>
        <dd>{event.allDay ? longDay.format(start) : `${longDay.format(start)}, ${formatTime(event.start)}–${formatTime(event.end)}`}</dd>
        {own.repeatWeeklyUntil && (
          <>
            <dt>Serie</dt>
            <dd>
              <Repeat size={12} /> jede Woche bis {dayFormat.format(new Date(`${own.repeatWeeklyUntil}T12:00`))}
            </dd>
          </>
        )}
        {event.location && (
          <>
            <dt>Wo</dt>
            <dd>{event.location}</dd>
          </>
        )}
      </dl>
      <div className="event-actions">
        <button type="button" className="button small secondary" onClick={() => props.onEdit(own)}>
          <Pencil size={13} /> Bearbeiten
        </button>
        {!confirm ? (
          <button type="button" className="button small danger" onClick={() => setConfirm(true)}>
            <Trash2 size={13} /> Löschen
          </button>
        ) : own.repeatWeeklyUntil ? (
          <>
            <button type="button" className="button small danger" onClick={() => void remove(true)}>
              Nur diesen Termin
            </button>
            <button type="button" className="button small danger" onClick={() => void remove(false)}>
              Ganze Serie
            </button>
          </>
        ) : (
          <button type="button" className="button small danger" onClick={() => void remove(false)} autoFocus>
            Wirklich löschen
          </button>
        )}
      </div>
    </aside>
  )
}
