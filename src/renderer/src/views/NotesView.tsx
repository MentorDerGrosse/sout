import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  Bold,
  Code,
  Columns2,
  Eye,
  FolderOpen,
  Heading2,
  Italic,
  ListChecks,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  Presentation,
  Search,
  Sigma,
  SquareSigma,
  Trash2,
  X
} from 'lucide-react'
import { INBOX } from '../../../shared/notes'
import type { CalendarData, Course, NoteDoc, NotesData, SearchHit, View } from '../../../shared/types'
import { Callout, ResizeHandle } from '../components'
import { courseMap, eventLabel, useCalendar } from '../lib/calendar'
import {
  courseDirOf,
  courseKeyOf,
  courseLabel,
  currentLecture,
  dirOf,
  displayName,
  eventNotePath,
  fileName,
  filesIn,
  findNode,
  noteFileUrl,
  useNotes,
  type NoteFileNode
} from '../lib/notes'
import { useNow } from '../lib/hooks'
import { MOD, modKey } from '../lib/platform'
import { clamp, remember, remembered, useRemembered } from '../lib/storage'
import { focusFirstSection, goToLine, insertMathBlock, MarkdownEditor, toggleChecklist, toggleHeading, toggleTask, wrap } from '../notes/Editor'
import { NewNoteDialog, type NewNoteDefaults } from '../notes/NewNoteDialog'
import { NoteTree } from '../notes/NoteTree'
import { Preview } from '../notes/Preview'

/** Open a note: from the calendar, the deadlines, the mini window. `fresh`: just created, cursor into the first section. */
export interface NoteRequest {
  path: string
  fresh?: boolean
  id: number
}

type Mode = 'edit' | 'split' | 'preview'
type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

const SAVE_DELAY_MS = 700

const MODES: { mode: Mode; label: string; icon: typeof Eye }[] = [
  { mode: 'edit', label: 'Schreiben', icon: PencilLine },
  { mode: 'split', label: 'Geteilt', icon: Columns2 },
  { mode: 'preview', label: 'Lesen', icon: Eye }
]

/** Small things remembered between starts: last note, view mode, open folders, widths. */
const prefs = {
  get: <T,>(key: string, fallback: T): T => remembered(`sout.notes.${key}`, fallback),
  set: (key: string, value: unknown): void => remember(`sout.notes.${key}`, value)
}

const TREE = { default: 264, min: 180, max: 480 }
/** Smallest width of a pane next to another one. */
const MIN_PANE = 240

export default function NotesView(props: { request: NoteRequest | null; active: boolean; onNavigate: (view: View) => void }) {
  const { notes, reload } = useNotes()
  const calendar = useCalendar()
  if (!notes) return null
  if (!notes.root || notes.missing) return <NotesSetup notes={notes} calendar={calendar} onDone={reload} onNavigate={props.onNavigate} />
  return <Workspace notes={notes} calendar={calendar} request={props.request} active={props.active} />
}

// ---------- Setting up the folder ----------

function NotesSetup(props: { notes: NotesData; calendar: CalendarData | null; onDone: () => Promise<void>; onNavigate: (view: View) => void }) {
  const [dir, setDir] = useState(props.notes.root ?? props.notes.suggestedRoot)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const courses = props.calendar?.courses.filter((course) => !course.hidden) ?? []

  const choose = async (): Promise<void> => {
    const chosen = await window.sout.chooseNotesDir()
    if (chosen) setDir(chosen)
  }
  const create = async (): Promise<void> => {
    setBusy(true)
    const result = await window.sout.setupNotes(dir)
    setBusy(false)
    if (result.ok) await props.onDone()
    else setError(result.error)
  }

  return (
    <div className="notes-setup">
      <div className="page">
        <header className="page-header">
          <h1>Notizen</h1>
          <p>Mitschriften, Übungen und Zusammenfassungen – nach Fächern sortiert, mit LaTeX-Formeln und Folien daneben.</p>
        </header>
        {props.notes.missing && (
          <Callout kind="warn" title="Der Notizordner ist nicht da.">
            <code>{props.notes.root}</code> gibt es nicht (mehr) – vielleicht umbenannt, gelöscht oder auf einem Laufwerk, das gerade nicht
            eingehängt ist. Du kannst ihn neu anlegen oder einen anderen Ordner wählen.
          </Callout>
        )}
        <section className="card setup-card">
          <h2 className="card-title">
            <NotebookPen size={16} /> Notizordner einrichten
          </h2>
          <p>
            Deine Notizen sind ganz normale Markdown-Dateien in einem Ordner. Du kannst sie also auch mit anderen Programmen öffnen, sichern
            oder synchronisieren.
          </p>
          <div className="setup-path">
            <code>{dir}</code>
            <button type="button" className="button secondary small" onClick={() => void choose()}>
              <FolderOpen size={13} /> Anderer Ordner …
            </button>
          </div>
          <p>Darin legt sout an:</p>
          <ul className="folder-preview">
            <li>
              <code>Inbox/</code> für Schnellnotizen, die du später einem Fach zuordnest
            </li>
            <li>
              <code>{props.notes.semester}/</code> mit einem Ordner pro Fach{courses.length > 0 ? ` (${courses.map((course) => course.shortName).join(', ')})` : ''} –
              darin <code>Vorlesung/</code>, <code>Übung/</code>, <code>Prüfung/</code> und <code>Folien/</code>, sobald du dort etwas ablegst
            </li>
          </ul>
          {courses.length === 0 && (
            <Callout kind="info" title="Noch keine Fächer bekannt.">
              Mit verbundenem TISS-Kalender bekommt jedes Fach automatisch seinen Ordner.{' '}
              <button type="button" className="link" onClick={() => props.onNavigate('settings')}>
                TISS verbinden
              </button>
            </Callout>
          )}
          <div className="form-row">
            <button type="button" className="button" disabled={busy} onClick={() => void create()}>
              {props.notes.missing ? 'Ordner neu anlegen' : 'Ordner anlegen'}
            </button>
          </div>
          {error && <Callout kind="error" title={error} />}
        </section>
      </div>
    </div>
  )
}

// ---------- The notes themselves ----------

interface OpenNote {
  path: string
  /** Changes whenever the editor gets a fresh document. */
  key: string
}

function Workspace(props: { notes: NotesData; calendar: CalendarData | null; request: NoteRequest | null; active: boolean }) {
  const { notes, calendar } = props
  const courses = calendar?.courses ?? []
  const now = useNow(60_000)
  const viewRef = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const notesRef = useRef<HTMLDivElement | null>(null)
  const panesRef = useRef<HTMLDivElement | null>(null)
  // Widths: the list in px, two panes side by side as share of the space (one for preview, one for slides).
  const [treeWidth, setTreeWidth] = useRemembered('sout.notes.treeWidth', TREE.default)
  const [splitPreview, setSplitPreview] = useRemembered('sout.notes.splitPreview', 0.5)
  const [splitPdf, setSplitPdf] = useRemembered('sout.notes.splitPdf', 0.5)

  const [doc, setDoc] = useState<OpenNote | null>(null)
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [problem, setProblem] = useState<string | null>(null)
  const [pdf, setPdf] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(() => prefs.get('mode', 'split'))
  const [treeHidden, setTreeHidden] = useState(() => prefs.get('treeHidden', false))
  const [expanded, setExpanded] = useState(() => new Set(prefs.get<string[]>('expanded', [])))
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [newNote, setNewNote] = useState<NewNoteDefaults | null>(null)
  const [dropping, setDropping] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // What saving needs lives in refs, so editor callbacks and timers always see the latest state.
  const current = useRef<{ path: string; base: number | null } | null>(null)
  const text = useRef('')
  const dirty = useRef(false)
  /** After a conflict: no more automatic saving until it is resolved. */
  const blocked = useRef(false)
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  const timer = useRef<number | undefined>(undefined)
  const afterOpen = useRef<((view: EditorView) => void) | null>(null)

  useEffect(() => prefs.set('mode', mode), [mode])
  useEffect(() => prefs.set('treeHidden', treeHidden), [treeHidden])
  useEffect(() => prefs.set('expanded', [...expanded]), [expanded])

  const expandTo = useCallback((path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      const parts = path.split('/')
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
      return next.size === previous.size ? previous : next
    })
  }, [])

  /** Saves the open note if needed; resolves to false if that failed (then it stays open). */
  const save = useCallback((force = false): Promise<boolean> => {
    window.clearTimeout(timer.current)
    queue.current = queue.current.then(async () => {
      const note = current.current
      if (!note || !dirty.current) return true
      const snapshot = text.current
      setSaveState('saving')
      const result = await window.sout.writeNote(note.path, snapshot, force ? null : note.base)
      if (result.ok) {
        note.base = result.modified
        blocked.current = false
        setProblem(null)
        // Typed while it was saving: the timer from onChange saves that too.
        if (text.current === snapshot) dirty.current = false
        setSaveState(dirty.current ? 'dirty' : 'saved')
        return true
      }
      blocked.current = result.conflict
      setSaveState(result.conflict ? 'conflict' : 'error')
      setProblem(result.error)
      return false
    })
    return queue.current
  }, [])

  const onChange = useCallback(
    (value: string) => {
      text.current = value
      setContent(value)
      dirty.current = true
      if (blocked.current) return
      setSaveState('dirty')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS)
    },
    [save]
  )

  const show = useCallback(
    (loaded: NoteDoc, then?: (view: EditorView) => void) => {
      current.current = { path: loaded.path, base: loaded.modified }
      text.current = loaded.content
      dirty.current = false
      blocked.current = false
      afterOpen.current = then ?? null
      setDoc({ path: loaded.path, key: `${loaded.path}#${Date.now()}` })
      setContent(loaded.content)
      setSaveState('saved')
      setProblem(null)
      setRenaming(false)
      setConfirmDelete(false)
      prefs.set('open', loaded.path)
      expandTo(loaded.path)
    },
    [expandTo]
  )

  const openNote = useCallback(
    async (path: string, then?: (view: EditorView) => void) => {
      if (current.current?.path === path) {
        if (then && viewRef.current) then(viewRef.current)
        return
      }
      if (!(await save())) return
      const result = await window.sout.readNote(path)
      if (result.ok) show(result.value, then)
      else setProblem(result.error)
    },
    [save, show]
  )

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    current.current = null
    text.current = ''
    dirty.current = false
    setDoc(null)
    setContent('')
    setSaveState('saved')
    prefs.set('open', null)
  }, [])

  const openPdf = useCallback(
    (path: string) => {
      setPdf(path)
      expandTo(path)
    },
    [expandTo]
  )

  // Cursor placement and the like, once the editor shows the new note.
  useEffect(() => {
    if (viewRef.current && afterOpen.current) {
      afterOpen.current(viewRef.current)
      afterOpen.current = null
    }
  }, [doc?.key])

  // Requests from the calendar, the deadlines or the mini window – or else the note that was open last time.
  const handled = useRef<number | null>(null)
  useEffect(() => {
    if (props.request && handled.current !== props.request.id) {
      handled.current = props.request.id
      void openNote(props.request.path, props.request.fresh ? focusFirstSection : undefined)
    } else if (handled.current === null) {
      handled.current = -1
      const last = prefs.get<string | null>('open', null)
      if (last && findNode(notes.tree, last)) void openNote(last)
    }
  }, [props.request, openNote, notes.tree])

  // Changed outside of sout (another editor, sync tool) or gone: follow the file, unless something is unsaved here.
  useEffect(() => {
    if (pdf && !findNode(notes.tree, pdf)) setPdf(null)
    const note = current.current
    if (!note) return
    const node = findNode(notes.tree, note.path)
    if (!node || node.kind === 'dir') {
      if (!dirty.current) close()
      return
    }
    if (node.modified === note.base || dirty.current) return
    void window.sout.readNote(note.path).then((result) => {
      if (!result.ok || current.current !== note || dirty.current) return
      if (result.value.content === text.current) note.base = result.value.modified
      else show(result.value)
    })
  }, [notes.tree, pdf, close, show])

  // Last save when the window closes.
  useEffect(() => {
    const flush = (): void => {
      const note = current.current
      if (note && dirty.current && !blocked.current) window.sout.flushNote(note.path, text.current, note.base)
      dirty.current = false
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  // Search as you type.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setHits(null)
      return
    }
    const id = window.setTimeout(() => void window.sout.searchNotes(trimmed).then(setHits), 150)
    return () => window.clearTimeout(id)
  }, [query, notes])

  const lecture = currentLecture(calendar, now)
  const lectureCourse = lecture?.courseKey ? courseMap(calendar!).get(lecture.courseKey) : undefined
  const courseKey = doc ? courseKeyOf(doc.path) : null

  const startNewNote = useCallback(() => {
    setNewNote({
      courseKey: lecture?.courseKey ?? courseKey ?? null,
      template: lecture?.kind === 'course' ? 'lecture' : 'blank'
    })
  }, [lecture, courseKey])

  // Strg+N (Cmd+N on a Mac): new note, Strg+Umschalt+F: search all notes.
  useEffect(() => {
    if (!props.active) return
    const onKey = (event: KeyboardEvent): void => {
      if (!modKey(event) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'n' && !event.shiftKey) {
        event.preventDefault()
        startNewNote()
      } else if (key === 'f' && event.shiftKey) {
        event.preventDefault()
        setTreeHidden(false)
        window.setTimeout(() => searchRef.current?.focus())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.active, startNewNote])

  const openLectureNote = async (): Promise<void> => {
    if (!lecture) return
    const fresh = !eventNotePath(notes, lecture)
    const result = await window.sout.noteForEvent(lecture.id)
    if (result.ok) void openNote(result.value, fresh ? focusFirstSection : undefined)
    else setProblem(result.error)
  }

  const onOpenNode = (node: NoteFileNode): void => {
    if (node.kind === 'pdf') openPdf(node.path)
    else if (node.kind === 'note') void openNote(node.path)
    else window.sout.showNoteInFolder(node.path)
  }

  const rename = async (name: string): Promise<void> => {
    setRenaming(false)
    const note = current.current
    if (!note || !doc || !name.trim() || name.trim() === displayNameForRename(note.path)) return
    if (!(await save())) return
    const result = await window.sout.renameNote(note.path, name)
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    note.path = result.value
    setDoc({ ...doc, path: result.value })
    prefs.set('open', result.value)
    expandTo(result.value)
  }

  const moveTo = async (target: string): Promise<void> => {
    const note = current.current
    if (!note || !doc) return
    if (!(await save())) return
    const result = await window.sout.moveNote(note.path, target || null)
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    note.path = result.value
    setDoc({ ...doc, path: result.value })
    prefs.set('open', result.value)
    expandTo(result.value)
  }

  const remove = async (): Promise<void> => {
    const note = current.current
    if (!note) return
    setConfirmDelete(false)
    const result = await window.sout.trashNote(note.path)
    if (result.ok) close()
    else setProblem(result.error)
  }

  const keepMine = (): void => {
    blocked.current = false
    dirty.current = true
    void save(true)
  }
  const takeTheirs = async (): Promise<void> => {
    const note = current.current
    if (!note) return
    const result = await window.sout.readNote(note.path)
    if (result.ok) show(result.value)
    else setProblem(result.error)
  }

  const importSlides = async (files?: string[]): Promise<void> => {
    const result = await window.sout.importPdfs(courseKey, files)
    if (!result.ok) setProblem(result.error)
    else if (result.value[0]) openPdf(result.value[0])
  }

  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    setDropping(false)
    const files = [...event.dataTransfer.files].map((file) => window.sout.filePath(file)).filter(Boolean)
    if (files.length > 0) void importSlides(files)
  }

  // Slides of the note's course (or of its folder) for "Folien daneben".
  const slidesRoot = doc ? (courseDirOf(doc.path) ?? dirOf(doc.path)) : null
  const slidesDir = slidesRoot ? findNode(notes.tree, slidesRoot) : undefined
  const slides = slidesDir?.kind === 'dir' ? filesIn(slidesDir.children).filter((node) => node.kind === 'pdf') : []
  if (pdf && !slides.some((node) => node.path === pdf)) {
    const node = findNode(notes.tree, pdf)
    if (node && node.kind === 'pdf') slides.push(node)
  }

  const showEditor = doc !== null && mode !== 'preview'
  const showPreview = doc !== null && (mode === 'preview' || (mode === 'split' && !pdf))
  const panes = Number(showEditor) + Number(showPreview) + Number(pdf !== null)
  // Two panes side by side: the left one gets its share, the right one the rest.
  const split = pdf ? splitPdf : splitPreview
  const setSplit = pdf ? setSplitPdf : setSplitPreview
  const leftPane = panes === 2 ? { flex: `0 0 ${(split * 100).toFixed(2)}%` } : undefined
  const resizeSplit = (clientX: number): void => {
    const box = panesRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const min = Math.min(MIN_PANE / box.width, 0.45)
    setSplit(clamp((clientX - box.left) / box.width, min, 1 - min))
  }
  const splitHandle = (
    <ResizeHandle
      label={pdf ? 'Breite von Notiz und Folien' : 'Breite von Notiz und Vorschau'}
      onDrag={resizeSplit}
      onStep={(delta) => {
        const box = panesRef.current?.getBoundingClientRect()
        if (box) resizeSplit(box.left + split * box.width + delta)
      }}
      onReset={() => setSplit(0.5)}
    />
  )
  const dropTarget = courseKey ? `Folien von ${courseLabel(courseDirOf(doc!.path)!.split('/').pop()!, courses)}` : 'die Inbox'

  return (
    <div
      ref={notesRef}
      className="notes"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          setDropping(true)
        }
      }}
    >
      {!treeHidden && (
        <aside className="notes-sidebar" style={{ width: treeWidth }}>
          <div className="notes-sidebar-head">
            <label className="search-field">
              <Search size={14} />
              <input
                ref={searchRef}
                value={query}
                placeholder="Suchen oder #tag"
                aria-label="Notizen durchsuchen"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setQuery('')
                }}
              />
              {query && (
                <button type="button" className="icon-button" aria-label="Suche leeren" onClick={() => setQuery('')}>
                  <X size={13} />
                </button>
              )}
            </label>
            <button type="button" className="icon-button" title={`Neue Notiz (${MOD}+N)`} aria-label="Neue Notiz" onClick={startNewNote}>
              <Plus size={17} />
            </button>
          </div>

          {lecture && lectureCourse && !hits && (
            <button type="button" className="lecture-now" onClick={() => void openLectureNote()} title={lecture.title}>
              <span className="tree-dot" style={{ background: lectureCourse.color }} />
              <span className="lecture-now-text">
                <span className="lecture-now-label">{new Date(lecture.start) <= now ? 'Läuft gerade' : 'Gleich'}</span>
                <span className="lecture-now-title">{eventLabel(lecture, lectureCourse)}</span>
                <span className="lecture-now-action">{eventNotePath(notes, lecture) ? 'Mitschrift öffnen' : 'Mitschrift starten'}</span>
              </span>
            </button>
          )}

          <div className="notes-sidebar-body">
            {hits ? (
              <SearchResults hits={hits} query={query} courses={courses} onOpen={(hit) => void openNote(hit.path, (view) => goToLine(view, hit.line))} />
            ) : (
              <>
                <NoteTree
                  notes={notes}
                  courses={courses}
                  activePaths={[doc?.path, pdf].filter((path): path is string => Boolean(path))}
                  expanded={expanded}
                  onToggle={(path) =>
                    setExpanded((previous) => {
                      const next = new Set(previous)
                      if (!next.delete(path)) next.add(path)
                      return next
                    })
                  }
                  onOpen={onOpenNode}
                />
                {notes.tags.length > 0 && (
                  <div className="tag-cloud">
                    <div className="tree-heading">Tags</div>
                    {notes.tags.slice(0, 30).map(({ tag, count }) => (
                      <button key={tag} type="button" className="tag" onClick={() => setQuery(`#${tag}`)}>
                        #{tag} <span>{count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      )}
      {!treeHidden && (
        <ResizeHandle
          label="Breite der Notizliste"
          onDrag={(clientX) => setTreeWidth(clamp(clientX - (notesRef.current?.getBoundingClientRect().left ?? 0), TREE.min, TREE.max))}
          onStep={(delta) => setTreeWidth((width) => clamp(width + delta, TREE.min, TREE.max))}
          onReset={() => setTreeWidth(TREE.default)}
        />
      )}

      <section className="notes-main">
        <header className="note-header">
          <button
            type="button"
            className="icon-button"
            title={treeHidden ? 'Liste einblenden' : 'Liste ausblenden'}
            aria-label={treeHidden ? 'Liste einblenden' : 'Liste ausblenden'}
            onClick={() => setTreeHidden(!treeHidden)}
          >
            {treeHidden ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          {doc ? (
            <>
              <Breadcrumb path={doc.path} courses={courses} renaming={renaming} onRename={(name) => void rename(name)} onStartRename={() => setRenaming(true)} />
              <span className={`save-state ${saveState}`}>{SAVE_LABELS[saveState]}</span>
              <div className="note-actions">
                {(dirOf(doc.path) === INBOX || !courseKey) && courses.length > 0 && (
                  <select className="input compact" value="" aria-label="In ein Fach verschieben" onChange={(event) => void moveTo(event.target.value)}>
                    <option value="" disabled>
                      In Fach verschieben …
                    </option>
                    {courses
                      .filter((course) => !course.hidden)
                      .map((course) => (
                        <option key={course.key} value={course.key}>
                          {course.shortName}
                        </option>
                      ))}
                  </select>
                )}
                <button type="button" className="icon-button" title="Im Dateimanager zeigen" aria-label="Im Dateimanager zeigen" onClick={() => window.sout.showNoteInFolder(doc.path)}>
                  <FolderOpen size={16} />
                </button>
                {confirmDelete ? (
                  <button type="button" className="button small danger" onClick={() => void remove()} onBlur={() => setConfirmDelete(false)} autoFocus>
                    In den Papierkorb
                  </button>
                ) : (
                  <button type="button" className="icon-button" title="Löschen (in den Papierkorb)" aria-label="Löschen" onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <span className="note-header-empty">{pdf ? displayName(fileName(pdf)) : 'Notizen'}</span>
          )}
        </header>

        {doc && (
          <div className="note-toolbar">
            <div className="format-buttons" aria-label="Formatieren">
              <FormatButton label="Überschrift" icon={Heading2} disabled={!showEditor} run={toggleHeading} view={viewRef} />
              <FormatButton label={`Fett (${MOD}+B)`} icon={Bold} disabled={!showEditor} run={(view) => wrap(view, '**')} view={viewRef} />
              <FormatButton label={`Kursiv (${MOD}+I)`} icon={Italic} disabled={!showEditor} run={(view) => wrap(view, '*')} view={viewRef} />
              <FormatButton label={`Formel (${MOD}+M)`} icon={Sigma} disabled={!showEditor} run={(view) => wrap(view, '$')} view={viewRef} />
              <FormatButton label={`Formel als eigener Block (${MOD}+Umschalt+M)`} icon={SquareSigma} disabled={!showEditor} run={insertMathBlock} view={viewRef} />
              <FormatButton label={`Checkliste (${MOD}+Umschalt+L)`} icon={ListChecks} disabled={!showEditor} run={toggleChecklist} view={viewRef} />
              <FormatButton label={`Code (${MOD}+E)`} icon={Code} disabled={!showEditor} run={(view) => wrap(view, '`')} view={viewRef} />
            </div>
            <div className="toolbar-right">
              <label className="slides-select" title="Folien neben der Notiz anzeigen">
                <Presentation size={14} />
                <select
                  className="input compact"
                  value={pdf ?? ''}
                  aria-label="Folien daneben"
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === '+') void importSlides()
                    else setPdf(value || null)
                  }}
                >
                  <option value="">Keine Folien</option>
                  {slides.map((node) => (
                    <option key={node.path} value={node.path}>
                      {displayName(node.name)}
                    </option>
                  ))}
                  <option value="+">PDF hinzufügen …</option>
                </select>
              </label>
              <div className="segmented" role="radiogroup" aria-label="Ansicht">
                {MODES.map(({ mode: value, label, icon: Icon }) => (
                  <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? 'active' : ''} title={label} onClick={() => setMode(value)}>
                    <Icon size={14} /> <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {saveState === 'conflict' && (
          <Callout kind="warn" title="Die Datei wurde außerhalb von sout geändert.">
            <p>Was du hier geschrieben hast, ist noch nicht gespeichert.</p>
            <div className="form-row">
              <button type="button" className="button small" onClick={keepMine}>
                Meine Fassung speichern
              </button>
              <button type="button" className="button small secondary" onClick={() => void takeTheirs()}>
                Andere Fassung laden
              </button>
            </div>
          </Callout>
        )}
        {problem && saveState !== 'conflict' && (
          <Callout kind="error" title={problem}>
            {saveState === 'error' && (
              <button type="button" className="button small" onClick={() => void save()}>
                Nochmal speichern
              </button>
            )}
          </Callout>
        )}

        <div ref={panesRef} className="note-panes">
          {doc && (
            <div className="pane" hidden={!showEditor} style={showEditor ? leftPane : undefined}>
              <MarkdownEditor
                docKey={doc.key}
                content={content}
                onChange={onChange}
                onSave={() => void save()}
                onScroll={(ratio) => {
                  const preview = previewRef.current
                  if (preview) preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
                }}
                viewRef={viewRef}
              />
            </div>
          )}
          {showEditor && panes === 2 && splitHandle}
          {doc && showPreview && (
            <div className="pane" style={showEditor ? undefined : leftPane}>
              <Preview
                content={content}
                dir={dirOf(doc.path)}
                scrollRef={previewRef}
                onToggleTask={(line) => viewRef.current && toggleTask(viewRef.current, line)}
                onOpenNote={(path) => void openNote(path)}
                onOpenPdf={openPdf}
                onOtherFile={(path) => window.sout.showNoteInFolder(path)}
              />
            </div>
          )}
          {showPreview && !showEditor && panes === 2 && splitHandle}
          {pdf && (
            <div className="pane pdf-pane">
              <div className="pdf-head">
                <Presentation size={14} />
                <span title={pdf}>{fileName(pdf)}</span>
                <button type="button" className="icon-button" aria-label="Folien schließen" onClick={() => setPdf(null)}>
                  <X size={14} />
                </button>
              </div>
              {/* Chromium's own PDF viewer, served from the notes folder. */}
              <iframe key={pdf} src={noteFileUrl(pdf)} title={fileName(pdf)} />
            </div>
          )}
          {!doc && !pdf && <EmptyNotes notes={notes} onNew={startNewNote} />}
        </div>

      </section>

      {dropping && (
        <div className="drop-overlay" onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
          <div>
            <Presentation size={28} />
            <strong>PDF hier ablegen</strong>
            <span>Kommt in {dropTarget}</span>
          </div>
        </div>
      )}

      {newNote && (
        <NewNoteDialog
          courses={courses.filter((course) => !course.hidden)}
          defaults={newNote}
          onClose={() => setNewNote(null)}
          onCreated={(path) => {
            setNewNote(null)
            void openNote(path, focusFirstSection)
          }}
        />
      )}
    </div>
  )
}

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Gespeichert',
  dirty: 'Speichert …',
  saving: 'Speichert …',
  error: 'Nicht gespeichert',
  conflict: 'Nicht gespeichert'
}

const displayNameForRename = (path: string): string => fileName(path).replace(/\.(md|markdown|txt)$/i, '')

function FormatButton(props: { label: string; icon: typeof Bold; disabled: boolean; run: (view: EditorView) => boolean; view: { current: EditorView | null } }) {
  const Icon = props.icon
  return (
    <button
      type="button"
      className="icon-button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      // Keep the editor's selection: no focus change on mouse down.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => props.view.current && props.run(props.view.current)}
    >
      <Icon size={16} />
    </button>
  )
}

/** "Analysis › Vorlesung › Mi., 7. Okt." – the last part is the file name, click to rename. */
function Breadcrumb(props: { path: string; courses: Course[]; renaming: boolean; onRename: (name: string) => void; onStartRename: () => void }) {
  const cancelled = useRef(false)
  const parts = props.path.split('/')
  const name = parts.pop()!
  const courseIndex = parts.findIndex((part) => courseKeyOf(part))
  const crumbs = courseIndex === -1 ? parts : [courseLabel(parts[courseIndex]!, props.courses), ...parts.slice(courseIndex + 1)]
  return (
    <div className="breadcrumb">
      {crumbs.map((crumb, index) => (
        <span key={index} className="crumb">
          {crumb}
          <span className="crumb-sep">›</span>
        </span>
      ))}
      {props.renaming ? (
        <input
          className="input compact rename-input"
          defaultValue={displayNameForRename(props.path)}
          aria-label="Dateiname"
          autoFocus
          onFocus={(event) => {
            cancelled.current = false
            event.currentTarget.select()
          }}
          onKeyDown={(event) => {
            // Enter keeps the name, Esc throws it away; the rename itself happens once, on blur.
            if (event.key === 'Escape') cancelled.current = true
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
          }}
          onBlur={(event) => props.onRename(cancelled.current ? '' : event.currentTarget.value)}
        />
      ) : (
        <button type="button" className="crumb-name" title="Umbenennen" onClick={props.onStartRename}>
          {displayName(name)}
        </button>
      )}
    </div>
  )
}

function SearchResults(props: { hits: SearchHit[]; query: string; courses: Course[]; onOpen: (hit: SearchHit) => void }) {
  if (props.hits.length === 0) return <p className="search-empty">Nichts gefunden.</p>
  const terms = props.query.toLocaleLowerCase('de').split(/\s+/).filter((term) => term && term !== '#')
  return (
    <div className="search-results">
      {props.hits.map((hit) => {
        const courseDir = courseDirOf(hit.path)
        const where = courseDir ? courseLabel(courseDir.split('/').pop()!, props.courses) : dirOf(hit.path) || 'Notizordner'
        return (
          <button key={hit.path} type="button" className="search-hit" onClick={() => props.onOpen(hit)}>
            <span className="search-hit-title">{displayName(fileName(hit.path))}</span>
            <span className="search-hit-where">{where}</span>
            {hit.snippet && <span className="search-hit-snippet">{highlight(hit.snippet, terms)}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** The search words in the snippet, marked. */
function highlight(snippet: string, terms: string[]): ReactNode[] {
  if (terms.length === 0) return [snippet]
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return snippet.split(pattern).map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part))
}

function EmptyNotes(props: { notes: NotesData; onNew: () => void }) {
  const hasNotes = filesIn(props.notes.tree).some((node) => node.kind === 'note')
  return (
    <div className="notes-empty">
      <NotebookPen size={28} />
      <strong>{hasNotes ? 'Wähle links eine Notiz' : 'Noch keine Notizen'}</strong>
      <span>Oder leg eine neue an – für eine Vorlesung, ein Übungsblatt oder zur Prüfungsvorbereitung. PDFs kannst du einfach hierher ziehen.</span>
      <button type="button" className="button" onClick={props.onNew}>
        <Plus size={14} /> Neue Notiz
      </button>
    </div>
  )
}
