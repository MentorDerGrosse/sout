import { useState } from 'react'
import { FolderOpen, KeyRound, LoaderCircle, LogIn, LogOut } from 'lucide-react'
import { REMINDER_CHOICES, type AppInfo, type Course, type SecretsStatus, type Settings } from '../../../shared/types'
import { Callout, Command, Toggle } from '../components'
import { syncStatus, useCalendar } from '../lib/calendar'
import { useAppState } from '../lib/hooks'
import { keyStore, trayPlace } from '../lib/platform'
import { useNotes } from '../lib/notes'
import { useTasks } from '../lib/tasks'

const INSTALL_EXTENSION = 'sudo dnf install gnome-shell-extension-appindicator'
const ENABLE_EXTENSION = 'gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com'

export default function SettingsView() {
  const { state, reload } = useAppState()
  const [autostartError, setAutostartError] = useState<string | null>(null)
  if (!state) return null
  const { info, settings, autostart, secrets } = state

  const toggleAutostart = async (enabled: boolean): Promise<void> => {
    const result = await window.sout.setAutostart(enabled)
    setAutostartError(result.ok ? null : result.error)
  }

  return (
    <>
      <header className="page-header">
        <h1>Einstellungen</h1>
      </header>

      <section className="section">
        <h2>Start & Hintergrund</h2>
        <div className="rows">
          <div className="row">
            <div className="row-text">
              <div className="row-title">Beim Anmelden starten</div>
              <div className="row-desc">sout startet automatisch, wenn du dich am Laptop anmeldest.</div>
            </div>
            <Toggle label="Beim Anmelden starten" checked={autostart} onChange={(value) => void toggleAutostart(value)} />
          </div>
          <div className="row">
            <div className="row-text">
              <div className="row-title">Beim Autostart nur im Hintergrund starten</div>
              <div className="row-desc">Sonst öffnet sich beim Hochfahren gleich das Hauptfenster.</div>
            </div>
            <Toggle
              label="Beim Autostart nur im Hintergrund starten"
              checked={settings.startHiddenOnAutostart}
              disabled={!autostart}
              onChange={(value) => void window.sout.updateSettings({ startHiddenOnAutostart: value })}
            />
          </div>
          <div className="row">
            <div className="row-text">
              <div className="row-title">Beim Schließen die Mini-Ansicht zeigen</div>
              <div className="row-desc">
                Schließt du das Hauptfenster, wird sout zum kleinen Fenster beim Symbol. Ein Klick daneben schickt es ins Symbol.
              </div>
            </div>
            <Toggle
              label="Beim Schließen die Mini-Ansicht zeigen"
              checked={settings.miniOnClose}
              onChange={(value) => void window.sout.updateSettings({ miniOnClose: value })}
            />
          </div>
          <div className="row">
            <TrayStatus available={info.trayAvailable} platform={info.platform} />
          </div>
          {info.platform === 'linux' && (
            <div className="row">
              <div className="row-text">
                <div className="row-title">Tastenkürzel für die Mini-Ansicht</div>
                {info.launcher ? (
                  <div className="row-desc">
                    GNOME-Einstellungen → Tastatur → eigene Tastenkombination hinzufügen, als Befehl:{' '}
                    <Command text={`${info.launcher} --mini`} />
                  </div>
                ) : (
                  <div className="row-desc">
                    Zuerst im Projektordner <code>npm run build</code> und <code>npm run install-desktop</code> ausführen.
                    Danach steht hier der Befehl für die GNOME-Tastenkombination.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {autostartError && (
          <Callout kind="error" title="Autostart konnte nicht geändert werden.">
            {autostartError}
          </Callout>
        )}
      </section>

      <section className="section">
        <h2>Zugänge</h2>
        <div className="rows">
          <TissRow connected={secrets.tissToken} onChanged={reload} />
          <TuwelRow />
          <div className="row">
            <KeyringStatus secrets={secrets} platform={info.platform} />
          </div>
        </div>
      </section>

      <RemindersSection settings={settings} />

      <NotesSection />

      <CoursesSection />

      <section className="section">
        <h2>Info</h2>
        <div className="rows">
          <div className="row">
            <InfoList info={info} />
          </div>
        </div>
      </section>
    </>
  )
}

function TrayStatus({ available, platform }: { available: boolean | null; platform: string }) {
  if (available || platform !== 'linux') {
    return (
      <Callout kind="ok" title={`Das Symbol ${trayPlace(platform)} wird angezeigt.`}>
        Schließen beendet sout nicht. Ein Klick aufs Symbol öffnet die Mini-Ansicht, Rechtsklick das Menü.
      </Callout>
    )
  }
  return (
    <Callout kind="warn" title={available === false ? 'GNOME zeigt gerade keine Tray-Symbole an.' : 'Ob Tray-Symbole angezeigt werden, ließ sich nicht prüfen.'}>
      <p>
        Dafür braucht GNOME die Erweiterung „AppIndicator and KStatusNotifierItem Support“. Bis dahin beendet das Schließen des
        Fensters die App.
      </p>
      <ol className="install-steps">
        <li>
          Im Terminal installieren: <Command text={INSTALL_EXTENSION} />
        </li>
        <li>Einmal ab- und wieder anmelden</li>
        <li>
          Einschalten: <Command text={ENABLE_EXTENSION} />
        </li>
      </ol>
    </Callout>
  )
}

function TissRow({ connected, onChanged }: { connected: boolean; onChanged: () => Promise<void> }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const save = (): Promise<void> =>
    run(async () => {
      const result = await window.sout.saveTissToken(input)
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error })
        return
      }
      setInput('')
      setMessage({ kind: 'ok', text: 'Gespeichert. Mit „Verbindung testen“ prüfst du, ob TISS ihn annimmt.' })
      await onChanged()
    })

  const test = (): Promise<void> =>
    run(async () => {
      const result = await window.sout.testTiss()
      setMessage(
        result.ok
          ? { kind: 'ok', text: `Verbindung klappt: ${result.value.events} Termine in deinem TISS-Kalender.` }
          : { kind: 'error', text: result.error }
      )
    })

  const remove = (): Promise<void> =>
    run(async () => {
      await window.sout.clearSecret('tissToken')
      setMessage(null)
      await onChanged()
    })

  return (
    <div className="row column">
      <div className="row-head">
        <div className="row-text">
          <div className="row-title">TISS-Kalender</div>
          <div className="row-desc">In TISS unter „Kalender“ ganz unten die persönliche Kalender-URL erzeugen und hier einfügen.</div>
        </div>
        <span className={`pill${connected ? ' ok' : ''}`}>{connected ? 'verbunden' : 'nicht verbunden'}</span>
      </div>
      {connected && <SyncLine />}
      {connected ? (
        <div className="form-row">
          <button type="button" className="button secondary" disabled={busy} onClick={() => void test()}>
            {busy && <LoaderCircle size={14} className="spin" />} Verbindung testen
          </button>
          <button type="button" className="button danger" disabled={busy} onClick={() => void remove()}>
            Entfernen
          </button>
        </div>
      ) : (
        <form
          className="form-row"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <input
            className="input"
            type="password"
            placeholder="https://tiss.tuwien.ac.at/events/rest/calendar/personal?token=…"
            aria-label="TISS-Kalender-URL oder Token"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="submit" className="button" disabled={busy || !input.trim()}>
            <KeyRound size={14} /> Speichern
          </button>
        </form>
      )}
      {message && <Callout kind={message.kind} title={message.text} />}
    </div>
  )
}

function KeyringStatus({ secrets, platform }: { secrets: SecretsStatus; platform: string }) {
  return secrets.secure ? (
    <Callout kind="info" title="Zugänge werden verschlüsselt gespeichert.">
      Der Schlüssel liegt {keyStore(platform)}, auf der Platte steht nur verschlüsselter Text.
    </Callout>
  ) : (
    <Callout kind="warn" title="Kein Schlüsselbund gefunden.">
      Zugänge können gerade nicht sicher gespeichert werden (Speicher: {secrets.backend}).
    </Callout>
  )
}

function InfoList({ info }: { info: AppInfo }) {
  const windowSystem = { x11: 'X11 (über XWayland)', wayland: 'Wayland', default: 'Standard' }[info.windowSystem]
  return (
    <dl className="info-list">
      <dt>Version</dt>
      <dd>
        {info.version} (Electron {info.electronVersion})
      </dd>
      {info.platform === 'linux' && (
        <>
          <dt>Fenster</dt>
          <dd>
            {windowSystem} · Sitzung: {info.sessionType || '?'} · {info.desktop || '?'}
          </dd>
        </>
      )}
      <dt>Daten</dt>
      <dd>
        <code>{info.userDataDir}</code>
      </dd>
      {info.autostartFile && (
        <>
          <dt>Autostart-Datei</dt>
          <dd>
            <code>{info.autostartFile}</code>
          </dd>
        </>
      )}
    </dl>
  )
}

function SyncLine() {
  const calendar = useCalendar()
  if (!calendar) return null
  return (
    <div className="row-desc">
      {syncStatus(calendar)}
      {calendar.error && ` · Fehler: ${calendar.error}`}
    </div>
  )
}

function CoursesSection() {
  const calendar = useCalendar()
  if (!calendar || calendar.courses.length === 0) return null
  return (
    <section className="section">
      <h2>Fächer</h2>
      <div className="rows">
        {calendar.courses.map((course) => (
          <CourseRow key={course.key} course={course} />
        ))}
      </div>
      <p className="section-hint">Erkannt aus deinem TISS-Kalender. Der Kurzname erscheint im Kalender und in der Mini-Ansicht.</p>
    </section>
  )
}

function CourseRow({ course }: { course: Course }) {
  const update = (patch: Parameters<typeof window.sout.updateCourse>[1]): void => void window.sout.updateCourse(course.key, patch)
  return (
    <div className="row course-row">
      <input
        type="color"
        className="color-input"
        value={course.color}
        aria-label={`Farbe für ${course.shortName}`}
        onChange={(event) => update({ color: event.target.value })}
      />
      <div className="row-text">
        <input
          key={course.shortName}
          className="input course-name"
          defaultValue={course.shortName}
          aria-label="Kurzname"
          onBlur={(event) => {
            if (event.target.value !== course.shortName) update({ shortName: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <div className="row-desc">
          {course.key} {course.type} {course.title}
        </div>
      </div>
      <Toggle label={`${course.shortName} anzeigen`} checked={!course.hidden} onChange={(shown) => update({ hidden: !shown })} />
    </div>
  )
}

const tuwelSync = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function TuwelRow() {
  const tasks = useTasks()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!tasks) return null

  const login = async (): Promise<void> => {
    setBusy(true)
    const result = await window.sout.loginTuwel()
    setBusy(false)
    setError(result.ok ? null : result.error)
  }

  return (
    <div className="row column">
      <div className="row-head">
        <div className="row-text">
          <div className="row-title">TUWEL</div>
          <div className="row-desc">
            {tasks.connected
              ? [tasks.user && `Angemeldet als ${tasks.user}`, tasks.syncedAt && `Stand: ${tuwelSync.format(new Date(tasks.syncedAt))}`]
                  .filter(Boolean)
                  .join(' · ')
              : 'Anmeldung über den TU-Wien-Login, wie bei der Moodle-App. Dein Passwort sieht und speichert sout nie.'}
          </div>
        </div>
        <span className={`pill${tasks.connected && !tasks.expired ? ' ok' : tasks.expired ? ' warn' : ''}`}>
          {tasks.expired ? 'abgelaufen' : tasks.connected ? 'verbunden' : 'nicht verbunden'}
        </span>
      </div>
      <div className="form-row">
        <button type="button" className={`button${tasks.connected && !tasks.expired ? ' secondary' : ''}`} disabled={busy} onClick={() => void login()}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <LogIn size={14} />} {tasks.connected ? 'Neu anmelden' : 'Bei TUWEL anmelden'}
        </button>
        {tasks.connected && (
          <button type="button" className="button danger" disabled={busy} onClick={() => void window.sout.logoutTuwel()}>
            <LogOut size={14} /> Abmelden
          </button>
        )}
      </div>
      {tasks.error && tasks.connected && <Callout kind={tasks.expired ? 'warn' : 'error'} title={tasks.error} />}
      {error && <Callout kind="error" title="Anmeldung hat nicht geklappt.">{error}</Callout>}
    </div>
  )
}

function RemindersSection({ settings }: { settings: Settings }) {
  const toggle = (minutes: number, on: boolean): void => {
    const reminders = on ? [...settings.reminders, minutes] : settings.reminders.filter((value) => value !== minutes)
    void window.sout.updateSettings({ reminders })
  }
  return (
    <section className="section">
      <h2>Erinnerungen & Meldungen</h2>
      <div className="rows">
        <div className="row column">
          <div className="row-text">
            <div className="row-title">Vor Abgaben, Tests und Anmeldeschlüssen erinnern</div>
            <div className="row-desc">Als Benachrichtigung, solange sout läuft – auch im Hintergrund.</div>
          </div>
          <div className="reminder-choices">
            {REMINDER_CHOICES.map((choice) => (
              <label key={choice.minutes} className="checkbox">
                <input
                  type="checkbox"
                  checked={settings.reminders.includes(choice.minutes)}
                  onChange={(event) => toggle(choice.minutes, event.target.checked)}
                />
                {choice.label} vorher
              </label>
            ))}
          </div>
        </div>
        <div className="row">
          <div className="row-text">
            <div className="row-title">Bescheid geben, sobald etwas aufmacht</div>
            <div className="row-desc">Wenn ein Test oder eine Abgabe in TUWEL freigeschaltet wird.</div>
          </div>
          <Toggle
            label="Bescheid geben, sobald etwas aufmacht"
            checked={settings.notifyOpening}
            onChange={(value) => void window.sout.updateSettings({ notifyOpening: value })}
          />
        </div>
        <div className="row">
          <div className="row-text">
            <div className="row-title">An Prüfungsanmeldungen erinnern</div>
            <div className="row-desc">
              Wenn in TISS die Anmeldung zu einer Prüfung deiner LVAs aufmacht und vor dem Anmeldeschluss (zu den Zeiten oben), solange du nicht
              angemeldet bist. Dazu neue Prüfungstermine, die TISS einträgt.
            </div>
          </div>
          <Toggle
            label="An Prüfungsanmeldungen erinnern"
            checked={settings.notifyExamRegistration}
            onChange={(value) => void window.sout.updateSettings({ notifyExamRegistration: value })}
          />
        </div>
        <div className="row">
          <div className="row-text">
            <div className="row-title">Änderungen im Stundenplan melden</div>
            <div className="row-desc">Raumwechsel, verschobene oder entfallene Termine der nächsten zwei Wochen und deine Prüfungsanmeldungen, sobald sie im TISS-Kalender stehen.</div>
          </div>
          <Toggle label="Änderungen im Stundenplan melden" checked={settings.notifyChanges} onChange={(value) => void window.sout.updateSettings({ notifyChanges: value })} />
        </div>
        <div className="row">
          <div className="row-text">
            <div className="row-title">Neue Aufgaben in TUWEL melden</div>
            <div className="row-desc">Sobald eine neue Abgabe oder ein neuer Test in TUWEL auftaucht.</div>
          </div>
          <Toggle label="Neue Aufgaben in TUWEL melden" checked={settings.notifyNewTasks} onChange={(value) => void window.sout.updateSettings({ notifyNewTasks: value })} />
        </div>
        <div className="row">
          <div className="row-text">
            <div className="row-title">Neue Bewertungen melden</div>
            <div className="row-desc">sout schaut alle zwei Stunden in TUWEL nach neuen Noten und Punkten.</div>
          </div>
          <Toggle label="Neue Bewertungen melden" checked={settings.notifyGrades} onChange={(value) => void window.sout.updateSettings({ notifyGrades: value })} />
        </div>
      </div>
    </section>
  )
}

function NotesSection() {
  const { notes, reload } = useNotes()
  const [error, setError] = useState<string | null>(null)
  if (!notes) return null

  const change = async (): Promise<void> => {
    const dir = await window.sout.chooseNotesDir()
    if (!dir) return
    const result = await window.sout.setupNotes(dir)
    setError(result.ok ? null : result.error)
    await reload()
  }

  return (
    <section className="section">
      <h2>Notizen</h2>
      <div className="rows">
        <div className="row column">
          <div className="row-head">
            <div className="row-text">
              <div className="row-title">Notizordner</div>
              <div className="row-desc">
                {notes.root ? (
                  <>
                    <code>{notes.root}</code>
                    {notes.missing && ' – gerade nicht vorhanden'}
                  </>
                ) : (
                  'Noch nicht eingerichtet – das geht auf der Seite „Notizen“.'
                )}
              </div>
            </div>
            <span className={`pill${notes.root && !notes.missing ? ' ok' : notes.missing ? ' warn' : ''}`}>
              {notes.missing ? 'fehlt' : notes.root ? 'eingerichtet' : 'nicht eingerichtet'}
            </span>
          </div>
          {notes.root && (
            <div className="form-row">
              <button type="button" className="button secondary" onClick={() => window.sout.showNoteInFolder(null)} disabled={notes.missing}>
                <FolderOpen size={14} /> Im Dateimanager öffnen
              </button>
              <button type="button" className="button secondary" onClick={() => void change()}>
                Anderen Ordner wählen …
              </button>
            </div>
          )}
          {error && <Callout kind="error" title={error} />}
        </div>
      </div>
      <p className="section-hint">Beim Wechsel werden vorhandene Notizen nicht verschoben – sout zeigt dann die Notizen im neuen Ordner.</p>
    </section>
  )
}
