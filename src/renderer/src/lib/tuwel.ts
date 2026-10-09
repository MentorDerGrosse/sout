import { useEffect, useState } from 'react'
import type { CheckmarkSheet, Task, TuwelExtras } from '../../../shared/types'

/** Announcements, Kreuzerlübungen and grades from TUWEL; updates after each TUWEL sync. */
export function useTuwelExtras(): TuwelExtras | null {
  const [data, setData] = useState<TuwelExtras | null>(null)
  useEffect(() => {
    const load = (): void => void window.sout.getTuwelExtras().then(setData)
    load()
    return window.sout.onTuwelExtrasChanged(load)
  }, [])
  return data
}

/** The Kreuzerl sheet of a task (its TUWEL link carries the same id). */
export function sheetOf(task: Task, extras: TuwelExtras | null): CheckmarkSheet | undefined {
  if (task.module !== 'checkmark' || !task.url) return undefined
  const id = /[?&]id=(\d+)/.exec(task.url)?.[1]
  return id ? extras?.checkmarks.find((sheet) => sheet.id === Number(id)) : undefined
}

/** "3 von 5 angekreuzt" – or "noch nichts angekreuzt". */
export function checkedText(sheet: CheckmarkSheet): string {
  const checked = sheet.examples.filter((example) => example.checked).length
  return sheet.submitted ? `${checked} von ${sheet.examples.length} angekreuzt` : 'noch nichts angekreuzt'
}
