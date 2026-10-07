import { CalendarDays, ClipboardList, Maximize2, Settings } from 'lucide-react'
import { EventList } from './EventList'
import { upcoming, useCalendar } from './lib/calendar'
import { formatShortDate } from './lib/dates'
import { useAppState, useNow } from './lib/hooks'

/** The small window below the tray icon. Closes on Esc or a click outside (handled in the main process). */
export default function Mini() {
  const now = useNow(30_000)
  const { state } = useAppState()
  const tissConnected = state?.secrets.tissToken ?? false
  const calendar = useCalendar()
  const next = calendar ? upcoming(calendar, now, 4) : []

  return (
    <div className="mini">
      <header className="mini-header">
        <div>
          <div className="mini-title">Heute</div>
          <div className="mini-date">{formatShortDate(now)}</div>
        </div>
        <button type="button" className="icon-button" title="sout öffnen" aria-label="sout öffnen" onClick={() => window.sout.openMain()}>
          <Maximize2 size={16} />
        </button>
      </header>

      <section className="mini-section mini-grow">
        <h3>
          <CalendarDays size={13} /> Termine
        </h3>
        {calendar && next.length > 0 ? (
          <EventList data={calendar} events={next} now={now} compact />
        ) : tissConnected ? (
          <p className="mini-empty">Keine kommenden Termine.</p>
        ) : (
          <p className="mini-empty">
            Noch keine Termine.{' '}
            <button type="button" className="link" onClick={() => window.sout.openMain('settings')}>
              TISS verbinden
            </button>
          </p>
        )}
      </section>

      <section className="mini-section">
        <h3>
          <ClipboardList size={13} /> Fällig
        </h3>
        <p className="mini-empty">Abgaben und Tests aus TUWEL erscheinen hier ab Phase 2.</p>
      </section>

      <footer className="mini-footer">
        <button type="button" className="button" onClick={() => window.sout.openMain()}>
          sout öffnen
        </button>
        <button type="button" className="button secondary" onClick={() => window.sout.openMain('settings')}>
          <Settings size={14} /> Einstellungen
        </button>
      </footer>
    </div>
  )
}
