import { useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import type { AppInfo, SecretsStatus } from '../../../shared/types'
import { Callout, Command, Toggle } from '../components'
import { useAppState } from '../lib/hooks'

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
            <TrayStatus available={info.trayAvailable} />
          </div>
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
          <div className="row">
            <div className="row-text">
              <div className="row-title">TUWEL</div>
              <div className="row-desc">Anmeldung über den TU-Login, wie bei der Moodle-App. Kommt in Phase 2.</div>
            </div>
            <span className="pill">bald</span>
          </div>
          <div className="row">
            <KeyringStatus secrets={secrets} />
          </div>
        </div>
      </section>

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

function TrayStatus({ available }: { available: boolean | null }) {
  if (available) {
    return (
      <Callout kind="ok" title="Das Symbol oben in der Leiste wird angezeigt.">
        Schließen versteckt sout nur. Ein Klick aufs Symbol öffnet die Mini-Ansicht, Rechtsklick das Menü.
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

function KeyringStatus({ secrets }: { secrets: SecretsStatus }) {
  return secrets.secure ? (
    <Callout kind="info" title="Zugänge werden verschlüsselt gespeichert.">
      Der Schlüssel liegt im GNOME-Schlüsselbund, auf der Platte steht nur verschlüsselter Text.
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
      <dt>Fenster</dt>
      <dd>
        {windowSystem} · Sitzung: {info.sessionType || '?'} · {info.desktop || '?'}
      </dd>
      <dt>Daten</dt>
      <dd>
        <code>{info.userDataDir}</code>
      </dd>
      <dt>Autostart-Datei</dt>
      <dd>
        <code>{info.autostartFile}</code>
      </dd>
    </dl>
  )
}
