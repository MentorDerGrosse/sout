import type { ReactNode } from 'react'
import { CalendarDays, Circle, CircleCheck, ClipboardList, Clock } from 'lucide-react'
import type { View } from '../../../shared/types'
import { formatLongDate, greeting } from '../lib/dates'
import { useAppState, useNow } from '../lib/hooks'

export default function Today({ onNavigate }: { onNavigate: (view: View) => void }) {
  const now = useNow(60_000)
  const { state } = useAppState()
  const tissConnected = state?.secrets.tissToken ?? false
  const toSettings = (
    <button type="button" className="button small secondary" onClick={() => onNavigate('settings')}>
      Einstellungen
    </button>
  )

  return (
    <>
      <header className="page-header">
        <h1>{greeting(now)}</h1>
        <p>{formatLongDate(now)}</p>
      </header>

      <div className="grid">
        <section className="card">
          <h2 className="card-title">
            <CalendarDays size={16} /> Nächste Termine
          </h2>
          <div className="empty">
            <strong>Noch keine Termine</strong>
            {tissConnected ? (
              <span>Dein TISS-Kalender ist verbunden. Die Termine erscheinen hier, sobald der Kalender fertig ist (Phase 1).</span>
            ) : (
              <>
                <span>Verbinde deinen TISS-Kalender, dann siehst du hier, was als Nächstes ansteht.</span>
                <button type="button" className="button small" onClick={() => onNavigate('settings')}>
                  TISS verbinden
                </button>
              </>
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">
            <ClipboardList size={16} /> Fällig
          </h2>
          <div className="empty">
            <strong>Noch keine Abgaben</strong>
            <span>Abgaben und Tests aus TUWEL kommen in Phase 2.</span>
          </div>
        </section>

        {state && (
          <section className="card span-2">
            <h2 className="card-title">Einrichtung</h2>
            <ul className="steps">
              <Step
                status={state.info.trayAvailable ? 'done' : 'todo'}
                title="Symbol oben in der Leiste"
                hint={
                  state.info.trayAvailable
                    ? 'Schließen versteckt sout nur – ein Klick aufs Symbol öffnet die Mini-Ansicht.'
                    : 'GNOME braucht dafür die AppIndicator-Erweiterung. Anleitung in den Einstellungen.'
                }
                action={state.info.trayAvailable ? undefined : toSettings}
              />
              <Step
                status={state.autostart ? 'done' : 'todo'}
                title="Startet beim Anmelden"
                hint={state.autostart ? 'sout startet automatisch mit deinem Laptop.' : 'Lässt sich in den Einstellungen einschalten.'}
                action={state.autostart ? undefined : toSettings}
              />
              <Step
                status={tissConnected ? 'done' : 'todo'}
                title="TISS-Kalender verbunden"
                hint={tissConnected ? 'Der Token ist verschlüsselt gespeichert.' : 'In TISS unter Kalender ganz unten die Kalender-URL erzeugen.'}
                action={tissConnected ? undefined : toSettings}
              />
              <Step status="later" title="TUWEL verbunden" hint="Anmeldung über den TU-Login – kommt in Phase 2." />
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

const STEP_ICONS = { done: CircleCheck, todo: Circle, later: Clock }

function Step(props: { status: keyof typeof STEP_ICONS; title: string; hint: string; action?: ReactNode }) {
  const Icon = STEP_ICONS[props.status]
  return (
    <li className="step">
      <span className={`step-icon ${props.status}`}>
        <Icon size={16} />
      </span>
      <div className="step-text">
        <div className="step-title">{props.title}</div>
        <div className="step-hint">{props.hint}</div>
      </div>
      {props.action}
    </li>
  )
}
