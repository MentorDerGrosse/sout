import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, NotebookPen, Settings, Sun, type LucideIcon } from 'lucide-react'
import type { View } from '../../shared/types'
import { Logo } from './components'
import { currentSemester } from './lib/dates'
import CalendarView from './views/CalendarView'
import DeadlinesView from './views/DeadlinesView'
import SettingsView from './views/SettingsView'
import type { NoteRequest } from './views/NotesView'
import Today from './views/Today'

// Editor, formulas and code highlighting are big; they load when the notes are opened first.
const NotesView = lazy(() => import('./views/NotesView'))

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'today', label: 'Heute', icon: Sun },
  { view: 'calendar', label: 'Kalender', icon: CalendarDays },
  { view: 'deadlines', label: 'Abgaben', icon: ClipboardList },
  { view: 'notes', label: 'Notizen', icon: NotebookPen }
]

export default function App({ initialView, initialNote }: { initialView: View; initialNote?: string }) {
  const [view, setView] = useState<View>(initialView)
  const [noteRequest, setNoteRequest] = useState<NoteRequest | null>(initialNote ? { path: initialNote, id: 0 } : null)
  // Once opened, the notes stay mounted: switching views keeps cursor, undo and the PDF next to it.
  const [notesOpened, setNotesOpened] = useState(view === 'notes')
  if (view === 'notes' && !notesOpened) setNotesOpened(true)

  const openNote = useCallback((path: string, fresh?: boolean) => {
    setNoteRequest({ path, fresh, id: Date.now() })
    setView('notes')
  }, [])

  // The tray menu and the mini window can ask for a specific view (and note).
  useEffect(
    () =>
      window.sout.onNavigate((next, note) => {
        if (note) openNote(note)
        else setView(next)
      }),
    [openNote]
  )

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
      {notesOpened && (
        <main className="content content-notes" hidden={view !== 'notes'}>
          <Suspense fallback={null}>
            <NotesView request={noteRequest} active={view === 'notes'} onNavigate={setView} />
          </Suspense>
        </main>
      )}
      {view === 'calendar' ? (
        <main className="content content-full">
          <CalendarView onNavigate={setView} onOpenNote={openNote} />
        </main>
      ) : (
        view !== 'notes' && (
          <main className="content">
            <div className="page">
              {view === 'today' ? (
                <Today onNavigate={setView} />
              ) : view === 'settings' ? (
                <SettingsView />
              ) : (
                <DeadlinesView onOpenNote={openNote} onNavigate={setView} />
              )}
            </div>
          </main>
        )
      )}
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
