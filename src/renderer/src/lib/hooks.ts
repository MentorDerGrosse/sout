import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, SecretsStatus, Settings, View } from '../../../shared/types'

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

interface ViewHistory {
  stack: View[]
  index: number
}

/**
 * The shown view plus the views visited before and after it, like a browser's history: a new view
 * drops what was ahead, going to the view already shown adds nothing.
 */
export function useViewHistory(initial: View): { view: View; navigate: (next: View) => void; back: () => void; forward: () => void } {
  const [history, setHistory] = useState<ViewHistory>({ stack: [initial], index: 0 })

  const navigate = useCallback((next: View) => {
    setHistory((current) =>
      current.stack[current.index] === next ? current : { stack: [...current.stack.slice(0, current.index + 1), next], index: current.index + 1 }
    )
  }, [])
  const step = useCallback((delta: number) => {
    setHistory((current) => {
      const index = Math.min(Math.max(current.index + delta, 0), current.stack.length - 1)
      return index === current.index ? current : { ...current, index }
    })
  }, [])
  const back = useCallback(() => step(-1), [step])
  const forward = useCallback(() => step(1), [step])

  return { view: history.stack[history.index]!, navigate, back, forward }
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
