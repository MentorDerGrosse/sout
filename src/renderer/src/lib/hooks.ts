import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, SecretsStatus, Settings } from '../../../shared/types'

export interface AppState {
  info: AppInfo
  settings: Settings
  autostart: boolean
  secrets: SecretsStatus
}

/**
 * Everything the UI shows about the app's setup. Reloads when something changes (e.g. from the
 * tray menu) and when the window gets focus (e.g. after installing the GNOME extension).
 */
export function useAppState(): { state: AppState | null; reload: () => Promise<void> } {
  const [state, setState] = useState<AppState | null>(null)

  const reload = useCallback(async () => {
    const [info, settings, autostart, secrets] = await Promise.all([
      window.sout.getInfo(),
      window.sout.getSettings(),
      window.sout.getAutostart(),
      window.sout.getSecretsStatus()
    ])
    setState({ info, settings, autostart, secrets })
  }, [])

  useEffect(() => {
    void reload()
    const unsubscribe = window.sout.onStateChanged(() => void reload())
    const onFocus = (): void => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  return { state, reload }
}

/** The current time, updated every `intervalMs`. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
