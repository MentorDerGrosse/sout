import { app, Notification, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Change } from '../shared/types'
import { readJson, writeJson } from './jsonFile'
import { resourcePath } from './paths'
import { showMain } from './windows'

// What changed since the last sync – room changes, moved or dropped appointments, new exam dates,
// new assignments, new grades. Each one is a notification (if wanted) and stays on "Heute" until
// it is dismissed or two weeks old (changes.json).

export type NewChange = Omit<Change, 'id' | 'at'>

const file = (): string => join(app.getPath('userData'), 'changes.json')
const KEEP_MS = 14 * 24 * 60 * 60_000
const MAX_KEPT = 60
/** More at once than this become one summary notification instead of a flood. */
const MAX_NOTIFICATIONS = 3

let onChange: () => void = () => {}

export function startChanges(listener: () => void): void {
  onChange = listener
}

export function changes(): Change[] {
  const data = readJson(file())
  const since = Date.now() - KEEP_MS
  return Array.isArray(data) ? (data as Change[]).filter((change) => change && Date.parse(change.at) > since) : []
}

/** One change, or with null all of them. */
export function dismissChange(id: string | null): void {
  writeJson(file(), id ? changes().filter((change) => change.id !== id) : [])
  onChange()
}

export function reportChanges(found: NewChange[], notify: boolean): void {
  if (found.length === 0) return
  const at = new Date().toISOString()
  const added: Change[] = found.map((change) => ({ ...change, id: randomUUID(), at }))
  writeJson(file(), [...added, ...changes()].slice(0, MAX_KEPT))
  onChange()
  if (!notify || !Notification.isSupported()) return
  if (added.length <= MAX_NOTIFICATIONS) {
    for (const change of added) show(change.title, change.detail, change)
  } else {
    const titles = added.slice(0, MAX_NOTIFICATIONS).map((change) => change.title)
    show(`${added.length} Neuigkeiten`, `${titles.join(' · ')} …`, { view: 'today', url: null })
  }
}

function show(title: string, body: string, target: Pick<Change, 'view' | 'url'>): void {
  const notification = new Notification({ title, body, icon: resourcePath('icon.png') })
  notification.on('click', () => {
    if (target.url) void shell.openExternal(target.url)
    else showMain(target.view ?? 'today')
  })
  notification.show()
}
