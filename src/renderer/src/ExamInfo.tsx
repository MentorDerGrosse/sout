import { CircleCheck, ExternalLink, Eye, EyeOff, MapPin } from 'lucide-react'
import { tissExamUrl } from '../../shared/exams'
import { tissCourseUrl } from '../../shared/tu'
import type { CalendarData, ExamDate } from '../../shared/types'
import { formatTime, roomName } from './lib/calendar'
import { examCourse, examStatus, roomMapsUrl } from './lib/exams'

/** More rooms than this go into one line, without addresses. */
const MAX_ROOM_LINES = 3

const longDay = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const moment = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** One exam date in detail – when, where, the registration window – and what you can do about it. */
export function ExamInfo(props: { exam: ExamDate; calendar: CalendarData | null; now: Date; showCourse?: boolean }) {
  const { exam, now } = props
  const status = examStatus(exam, now.getTime())
  const { course } = examCourse(exam, props.calendar)
  const start = new Date(exam.start)
  const viaTiss = !exam.registration || /tiss/i.test(exam.registration)
  const signedUp = exam.registered || Boolean(exam.covered)
  return (
    <>
      <dl className="info-list">
        <dt>Prüfung</dt>
        <dd>
          {longDay.format(start)}
          {!exam.allDay && (
            <>
              , <span className="nowrap">{`${formatTime(exam.start)}–${formatTime(exam.end)}`}</span>
            </>
          )}
        </dd>
        {exam.rooms.length > 0 && (
          <>
            <dt>Wo</dt>
            {exam.rooms.length <= MAX_ROOM_LINES ? (
              <dd>
                {exam.rooms.map((room) => (
                  <div key={room.name} className="exam-room">
                    <a href={roomMapsUrl(room, roomName(room.name))} target="_blank" rel="noreferrer">
                      <MapPin size={13} /> {roomName(room.name)}
                    </a>
                    {room.address && <span className="room-address"> · {room.address}</span>}
                  </div>
                ))}
              </dd>
            ) : (
              <dd className="exam-rooms">
                {exam.rooms.map((room, index) => (
                  <span key={room.name}>
                    {index > 0 && ', '}
                    <a href={roomMapsUrl(room, roomName(room.name))} target="_blank" rel="noreferrer">
                      {roomName(room.name)}
                    </a>
                  </span>
                ))}
              </dd>
            )}
          </>
        )}
        {exam.mode && (
          <>
            <dt>Art</dt>
            <dd>{exam.mode}</dd>
          </>
        )}
        <dt>Anmeldung</dt>
        <dd>
          {windowRange(exam)}
          {exam.registration && ` · ${exam.registration}`}
        </dd>
        {signedUp && (
          <>
            <dt>Status</dt>
            <dd className="exam-signed-up">
              <CircleCheck size={13} />{' '}
              {exam.registered ? 'Angemeldet – die Prüfung steht in deinem TISS-Kalender.' : `Nicht nötig: ${exam.covered}.`}
            </dd>
          </>
        )}
        {status === 'closed' && (
          <>
            <dt>Status</dt>
            <dd>Die Anmeldefrist ist vorbei.</dd>
          </>
        )}
        {course && props.showCourse !== false && (
          <>
            <dt>LVA</dt>
            <dd>
              {course.key} {course.type} {course.title}
            </dd>
          </>
        )}
      </dl>
      <div className="task-actions">
        {viaTiss && !signedUp && (
          <a className={`button small${status === 'open' ? '' : ' secondary'}`} href={tissExamUrl(exam.courseKey, exam.semester)} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> {status === 'open' ? 'In TISS anmelden' : 'Prüfungstermine in TISS'}
          </a>
        )}
        <a className="button small secondary" href={tissCourseUrl(exam.courseKey, exam.semester)} target="_blank" rel="noreferrer">
          <ExternalLink size={13} /> LVA in TISS
        </a>
        {!signedUp && (
          <button type="button" className="button small secondary" onClick={() => void window.sout.dismissExam(exam.id, !exam.dismissed)}>
            {exam.dismissed ? <Eye size={13} /> : <EyeOff size={13} />} {exam.dismissed ? 'Wieder einblenden' : 'Brauche ich nicht'}
          </button>
        )}
      </div>
    </>
  )
}

/** "Di., 1. Dez., 08:00 – Do., 10. Dez., 23:59" */
function windowRange(exam: ExamDate): string {
  if (exam.opens && exam.closes) return `${moment.format(new Date(exam.opens))} – ${moment.format(new Date(exam.closes))}`
  if (exam.closes) return `bis ${moment.format(new Date(exam.closes))}`
  if (exam.opens) return `ab ${moment.format(new Date(exam.opens))}`
  return 'TISS nennt keine Anmeldefrist'
}
