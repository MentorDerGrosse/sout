import { useEffect, useState } from 'react'
import type { Change } from '../../../shared/types'

/** What changed lately (room, time, new assignments, grades …); updates when something new comes in. */
export function useChanges(): Change[] {
  const [changes, setChanges] = useState<Change[]>([])
  useEffect(() => {
    const load = (): void => void window.sout.getChanges().then(setChanges)
    load()
    return window.sout.onChangesChanged(load)
  }, [])
  return changes
}

/** "gerade eben", "vor 25 min", "vor 3 h", "vor 2 Tagen". */
export function ago(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60_000)
  if (minutes < 2) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `vor ${hours} h`
  const days = Math.round(hours / 24)
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
}
