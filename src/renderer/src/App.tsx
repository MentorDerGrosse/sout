import { useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, NotebookPen, Settings, Sun, type LucideIcon } from 'lucide-react'
import type { View } from '../../shared/types'
import { Logo } from './components'
import { currentSemester } from './lib/dates'
import SettingsView from './views/SettingsView'
import Today from './views/Today'
import Upcoming from './views/Upcoming'

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'today', label: 'Heute', icon: Sun },
  { view: 'calendar', label: 'Kalender', icon: CalendarDays },
  { view: 'deadlines', label: 'Abgaben', icon: ClipboardList },
  { view: 'notes', label: 'Notizen', icon: NotebookPen }
]

export default function App({ initialView }: { initialView: View }) {
  const [view, setView] = useState<View>(initialView)
  // The tray menu and the mini window can ask for a specific view.
  useEffect(() => window.sout.onNavigate(setView), [])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Logo size={34} />
          <div>
            <div className="brand-name">sout</div>
            <div className="brand-sub">{currentSemester(new Date()).label}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavItem key={item.view} {...item} active={view === item.view} onSelect={setView} />
          ))}
        </nav>
        <div className="nav nav-bottom">
          <NavItem view="settings" label="Einstellungen" icon={Settings} active={view === 'settings'} onSelect={setView} />
        </div>
      </aside>
      <main className="content">
        <div className="page">
          {view === 'today' ? (
            <Today onNavigate={setView} />
          ) : view === 'settings' ? (
            <SettingsView />
          ) : (
            <Upcoming view={view} />
          )}
        </div>
      </main>
    </div>
  )
}

function NavItem(props: { view: View; label: string; icon: LucideIcon; active: boolean; onSelect: (view: View) => void }) {
  const Icon = props.icon
  return (
    <button
      type="button"
      className={`nav-item${props.active ? ' active' : ''}`}
      aria-current={props.active ? 'page' : undefined}
      onClick={() => props.onSelect(props.view)}
    >
      <Icon size={18} />
      <span>{props.label}</span>
    </button>
  )
}
