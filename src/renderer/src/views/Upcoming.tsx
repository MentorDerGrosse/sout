import { CalendarDays, Check, ClipboardList, NotebookPen, type LucideIcon } from 'lucide-react'
import type { View } from '../../../shared/types'

type UpcomingView = Exclude<View, 'today' | 'settings'>

/** Placeholder pages for the parts that come in later phases (see PLAN.md). */
const PAGES: Record<UpcomingView, { title: string; intro: string; phase: number; icon: LucideIcon; features: string[] }> = {
  calendar: {
    title: 'Kalender',
    intro: 'Dein Stundenplan, direkt aus TISS.',
    phase: 1,
    icon: CalendarDays,
    features: [
      'LVA-, Gruppen- und Prüfungstermine aus deinem TISS-Kalender',
      'Ansichten Heute, Woche, Monat und Liste',
      'Eine Farbe pro Fach, Filter nach Fach und Typ (VO, UE, Prüfung)',
      'Raum mit TUW-Maps-Link, Links zu TISS und TUWEL',
      'Funktioniert auch offline'
    ]
  },
  deadlines: {
    title: 'Abgaben & Tests',
    intro: 'Was du noch offen hast, direkt aus TUWEL.',
    phase: 2,
    icon: ClipboardList,
    features: [
      'Sortiert nach Fälligkeit: überfällig, heute, diese Woche, später',
      'Was, bis wann, wie und wo – mit Direktlink zur Abgabe',
      'Status aus TUWEL: Abgegebenes verschwindet von selbst',
      'Eigene To-dos ergänzen und abhaken',
      'Erinnerungen als Benachrichtigung'
    ]
  },
  notes: {
    title: 'Notizen',
    intro: 'Mitschriften, automatisch nach deinen Fächern sortiert.',
    phase: 3,
    icon: NotebookPen,
    features: [
      'Pro Fach ein eigener Bereich, nach Semester geordnet',
      'Markdown mit LaTeX-Formeln',
      'PDF-Folien direkt neben der Notiz',
      'Vorlagen für Vorlesung, Übung und Prüfungsvorbereitung',
      'Volltextsuche über alle Notizen'
    ]
  }
}

export default function Upcoming({ view }: { view: UpcomingView }) {
  const page = PAGES[view]
  const Icon = page.icon
  return (
    <>
      <header className="page-header">
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
      </header>
      <section className="card upcoming">
        <div className="upcoming-head">
          <span className="upcoming-icon">
            <Icon size={22} />
          </span>
          <div>
            <span className="phase-tag">Kommt in Phase {page.phase}</span>
            <div className="upcoming-sub">Das ist geplant:</div>
          </div>
        </div>
        <ul className="feature-list">
          {page.features.map((feature) => (
            <li key={feature}>
              <Check size={16} /> {feature}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
