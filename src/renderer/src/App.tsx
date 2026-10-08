import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, GraduationCap, NotebookPen, PanelLeftClose, PanelLeftOpen, Settings, Sun, type LucideIcon } from 'lucide-react'
import type { View } from '../../shared/types'
import { Logo, ResizeHandle } from './components'
import { currentSemester } from './lib/dates'
import { clamp, useRemembered } from './lib/storage'
import CalendarView from './views/CalendarView'
import DeadlinesView from './views/DeadlinesView'
import ExamsView from './views/ExamsView'
import SettingsView from './views/SettingsView'
import type { NoteRequest } from './views/NotesView'
import Today from './views/Today'

// Editor, formulas and code highlighting are big; they load when the notes are opened first.
const NotesView = lazy(() => import('./views/NotesView'))

const SIDEBAR = { default: 216, min: 180, max: 360, collapsed: 64 }
/** Dragged narrower than this, the sidebar collapses to its icons. */
const COLLAPSE_BELOW = 130

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'today', label: 'Heute', icon: Sun },
  { view: 'calendar', label: 'Kalender', icon: CalendarDays },
  { view: 'deadlines', label: 'Abgaben', icon: ClipboardList },
  { view: 'exams', label: 'Prüfungen', icon: GraduationCap },
  { view: 'notes', label: 'Notizen', icon: NotebookPen }
]

export default function App({ initialView, initialNote }: { initialView: View; initialNote?: string }) {
  const [view, setView] = useState<View>(initialView)
  const [noteRequest, setNoteRequest] = useState<NoteRequest | null>(initialNote ? { path: initialNote, id: 0 } : null)
  // Once opened, the notes stay mounted: switching views keeps cursor, undo and the PDF next to it.
  const [notesOpened, setNotesOpened] = useState(view === 'notes')
  if (view === 'notes' && !notesOpened) setNotesOpened(true)

  const [sidebarWidth, setSidebarWidth] = useRemembered('sout.sidebar.width', SIDEBAR.default)
  const [collapsed, setCollapsed] = useRemembered('sout.sidebar.collapsed', false)
  const resizeSidebar = (width: number): void => {
    setCollapsed(width < COLLAPSE_BELOW)
    if (width >= COLLAPSE_BELOW) setSidebarWidth(clamp(width, SIDEBAR.min, SIDEBAR.max))
  }

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
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} style={{ width: collapsed ? SIDEBAR.collapsed : sidebarWidth }}>
        <div className="brand">
          <Logo size={34} />
          <div className="brand-text">
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
          <button
            type="button"
            className="nav-item collapse-toggle"
            title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
            aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span>Einklappen</span>
          </button>
        </div>
      </aside>
      <ResizeHandle
        label="Breite der Seitenleiste"
        onDrag={resizeSidebar}
        onStep={(delta) => resizeSidebar((collapsed ? SIDEBAR.collapsed : sidebarWidth) + delta * (collapsed && delta > 0 ? 8 : 1))}
        onReset={() => {
          setCollapsed(false)
          setSidebarWidth(SIDEBAR.default)
        }}
      />
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
              ) : view === 'exams' ? (
                <ExamsView onNavigate={setView} />
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
      // Collapsed, only the icon is left – the name comes as tooltip.
      title={props.label}
      onClick={() => props.onSelect(props.view)}
    >
      <Icon size={18} />
      <span>{props.label}</span>
    </button>
  )
}
