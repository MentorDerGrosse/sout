import { MapPin, TriangleAlert } from 'lucide-react'
import type { CalendarData, CalendarEvent } from '../../shared/types'
import { countdown, courseMap, eventColor, eventLabel, formatTime, overlapping, relativeDay, roomName } from './lib/calendar'

/** Upcoming appointments grouped by day ("Heute", "Morgen", …), used on "Heute" and in the mini window. */
export function EventList(props: { data: CalendarData; events: CalendarEvent[]; now: Date; compact?: boolean }) {
  const courses = courseMap(props.data)
  const clashes = overlapping(props.data)
  const groups = new Map<string, CalendarEvent[]>()
  for (const event of props.events) {
    const day = relativeDay(event.start, props.now)
    groups.set(day, [...(groups.get(day) ?? []), event])
  }

  return (
    <div className={`event-list${props.compact ? ' compact' : ''}`}>
      {[...groups].map(([day, events]) => (
        <div key={day} className="event-day">
          <div className="event-day-label">{day}</div>
          {events.map((event, index) => {
            const course = event.courseKey ? courses.get(event.courseKey) : undefined
            const soon = index === 0 && day === 'Heute' ? countdown(event, props.now) : null
            return (
              <div key={event.id} className="event-row" title={event.title}>
                <span className="event-bar" style={{ background: eventColor(event, course) }} />
                <span className="event-time">
                  {formatTime(event.start)}
                  {!props.compact && <span className="event-time-end">–{formatTime(event.end)}</span>}
                </span>
                <span className="event-main">
                  <span className="event-title">
                    {clashes.has(event.id) && (
                      <span
                        className="cal-clash"
                        title={`Gleichzeitig: ${clashes
                          .get(event.id)!
                          .map((other) => eventLabel(other, other.courseKey ? courses.get(other.courseKey) : undefined))
                          .join(', ')}`}
                      >
                        <TriangleAlert size={12} />
                      </span>
                    )}
                    {eventLabel(event, course)}
                  </span>
                  {event.location && (
                    <span className="event-room">
                      <MapPin size={11} /> {roomName(event.location)}
                    </span>
                  )}
                </span>
                {soon && <span className={`event-soon${soon === 'läuft' ? ' now' : ''}`}>{soon}</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
