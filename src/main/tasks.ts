import { app, Notification, powerMonitor } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Task, TasksData, TodoInput } from '../shared/types'
import { readJson, writeJson } from './jsonFile'
import { resourcePath } from './paths'
import { clearSecret, getSecret, hasSecret, setSecret } from './secrets'
import { TuwelError, tuwelCall } from './tuwelApi'
import { forgetTuwelLogin, loginToTuwel } from './tuwelLogin'
import { fetchSnapshot, toTasks, type MoodleSnapshot } from './tuwelTasks'
import { showMain } from './windows'

const SYNC_INTERVAL_MS = 30 * 60 * 1000

/** What TUWEL said at the last sync (tuwel.json). */
interface Cache {
  tasks: Task[]
  user: string | null
  syncedAt: string | null
  error: string | null
  expired: boolean
  /** When the current token was issued – to learn how long TUWEL keeps tokens. */
  tokenIssuedAt?: string | null
  /** Every sync's token outcome (newest last), for diagnosis. */
  tokenLog?: string[]
  /** The "please log in again" notification was shown for the current expiry. */
  loginNotified?: boolean
}

interface Todo {
  id: string
  title: string
  due: string | null
  courseKey: string | null
  done: boolean
}

/** Own to-dos and TUWEL tasks ticked off by hand (todos.json). */
interface Local {
  todos: Todo[]
  doneIds: string[]
}

const cacheFile = (): string => join(app.getPath('userData'), 'tuwel.json')
const localFile = (): string => join(app.getPath('userData'), 'todos.json')

const EMPTY: Cache = { tasks: [], user: null, syncedAt: null, error: null, expired: false }

let cache: Cache | null = null
let syncing: Promise<void> | null = null
let onChange: () => void = () => {}

function loadCache(): Cache {
  cache ??= { ...EMPTY, ...(readJson(cacheFile()) as Partial<Cache> | undefined) }
  return cache
}

function saveCache(next: Cache): void {
  cache = next
  writeJson(cacheFile(), next)
  onChange()
}

function loadLocal(): Local {
  const data = readJson(localFile()) as Partial<Local> | undefined
  return { todos: data?.todos ?? [], doneIds: data?.doneIds ?? [] }
}

function saveLocal(local: Local): void {
  writeJson(localFile(), local)
  onChange()
}

export function tasksData(): TasksData {
  const { tasks, user, syncedAt, error, expired } = loadCache()
  const local = loadLocal()
  const done = new Set(local.doneIds)
  const all: Task[] = [
    ...tasks.map((task): Task => (done.has(task.id) ? { ...task, status: 'done' } : task)),
    ...local.todos.map(todoTask)
  ]
  // Soonest first, tasks without a date at the end.
  all.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  return { tasks: all, connected: hasSecret('tuwelToken'), user, syncedAt, error, expired, syncing: syncing !== null }
}

function todoTask(todo: Todo): Task {
  return {
    id: todo.id,
    source: 'own',
    title: todo.title,
    kindLabel: 'To-do',
    module: null,
    dueLabel: 'fällig',
    courseKey: todo.courseKey,
    courseName: null,
    due: todo.due,
    cutoff: null,
    opens: null,
    actionable: null,
    timeLimitMinutes: null,
    description: null,
    submission: [],
    fileTypes: null,
    status: todo.done ? 'done' : 'open',
    overdue: Boolean(todo.due && todo.due < new Date().toISOString()),
    url: null,
    actionLabel: null
  }
}

/** Moodle's answers when a token is gone or expired. */
const TOKEN_ERRORS = new Set(['invalidtoken', 'accessexception'])

const isTokenError = (error: unknown): error is TuwelError => error instanceof TuwelError && TOKEN_ERRORS.has(error.code)

/** Reads TUWEL (or, in development, the snapshot in SOUT_TUWEL_FILE) and replaces the cached tasks. */
export function syncTasks(): Promise<void> {
  syncing ??= (async () => {
    onChange()
    const devFile = app.isPackaged ? undefined : process.env['SOUT_TUWEL_FILE']
    const token = devFile ? null : getSecret('tuwelToken')
    try {
      if (!devFile && !token) return
      const snapshot = devFile ? (JSON.parse(readFileSync(devFile, 'utf8')) as MoodleSnapshot) : await fetchWithFreshToken(token!)
      saveCache({
        ...loadCache(),
        tasks: toTasks(snapshot),
        user: snapshot.site.fullname,
        syncedAt: new Date().toISOString(),
        error: null,
        expired: false,
        loginNotified: false
      })
      forgetVanishedDone()
    } catch (error) {
      // Keep the old tasks: they are still the best we have when offline.
      const expired = isTokenError(error)
      saveCache({ ...loadCache(), error: error instanceof Error ? error.message : String(error), expired })
      if (expired) notifyLoginNeeded()
    }
  })().finally(() => {
    syncing = null
    onChange()
  })
  return syncing
}

/** Ticks for TUWEL tasks that TUWEL no longer lists aren't needed anymore. */
function forgetVanishedDone(): void {
  const local = loadLocal()
  const ids = new Set(loadCache().tasks.map((task) => task.id))
  const doneIds = local.doneIds.filter((id) => ids.has(id))
  if (doneIds.length !== local.doneIds.length) saveLocal({ ...local, doneIds })
}

/**
 * TUWEL lets tokens expire quickly. Each sync first asks TUWEL for a token with the stored login –
 * that also keeps the TUWEL session from timing out. If that isn't possible, the stored token is
 * tried anyway. Every outcome goes into the log, so we learn how long tokens and sessions last.
 */
async function fetchWithFreshToken(stored: string): Promise<MoodleSnapshot> {
  let token = stored
  let renewal: string | null = null
  try {
    token = await loginToTuwel({ silent: true })
    keepToken(token)
  } catch (error) {
    renewal = error instanceof Error ? error.message : String(error)
  }
  try {
    const snapshot = await fetchSnapshot(token)
    logToken(renewal ? `ok mit gespeichertem Schlüssel (keine Erneuerung: ${renewal})` : token === stored ? 'ok' : 'ok mit neuem Schlüssel')
    return snapshot
  } catch (error) {
    if (isTokenError(error)) logToken(`abgelehnt (${error.code})${renewal ? ` – keine Erneuerung: ${renewal}` : ''}`)
    throw error
  }
}

/** Store the token; the issue time only changes when TUWEL handed out a different one. */
function keepToken(token: string): void {
  if (token === getSecret('tuwelToken')) return
  setSecret('tuwelToken', token)
  saveCache({ ...loadCache(), tokenIssuedAt: new Date().toISOString() })
}

/** Once per expiry: a notification that leads straight to the login. */
function notifyLoginNeeded(): void {
  const cached = loadCache()
  if (cached.loginNotified || !Notification.isSupported()) return
  saveCache({ ...cached, loginNotified: true })
  const notification = new Notification({
    title: 'TUWEL: bitte neu anmelden',
    body: 'Deine TU-Wien-Anmeldung ist abgelaufen. Klick hier, dann siehst du wieder aktuelle Abgaben.',
    icon: resourcePath('icon.png')
  })
  notification.on('click', () => {
    showMain('deadlines')
    void loginTuwel().catch(() => {})
  })
  notification.show()
}

function logToken(event: string): void {
  const cached = loadCache()
  const issued = cached.tokenIssuedAt ? Date.parse(cached.tokenIssuedAt) : null
  const age = issued ? ` – Schlüssel ${Math.round((Date.now() - issued) / 60_000)} min alt` : ''
  const line = `${new Date().toISOString()} ${event}${age}`
  console.log(`[tuwel] ${line}`)
  saveCache({ ...cached, tokenLog: [...(cached.tokenLog ?? []), line].slice(-50) })
}

export async function loginTuwel(): Promise<void> {
  // With a still valid TU Wien login this needs no window at all.
  const token = await loginToTuwel({ silent: true }).catch(() => loginToTuwel())
  // Make sure the token works before keeping it.
  const site = await tuwelCall<{ fullname: string }>(token, 'core_webservice_get_site_info')
  keepToken(token)
  logToken('angemeldet')
  saveCache({ ...loadCache(), user: site.fullname, error: null, expired: false, loginNotified: false })
  await syncTasks()
}

export function logoutTuwel(): void {
  clearSecret('tuwelToken')
  saveCache(EMPTY)
  void forgetTuwelLogin()
}

export function addTodo(input: TodoInput): void {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : ''
  if (!title) throw new Error('Gib dem To-do einen Titel.')
  const due = typeof input.due === 'string' && !Number.isNaN(Date.parse(input.due)) ? new Date(input.due).toISOString() : null
  const courseKey = typeof input.courseKey === 'string' && input.courseKey ? input.courseKey : null
  const local = loadLocal()
  saveLocal({ ...local, todos: [...local.todos, { id: `own:${randomUUID()}`, title, due, courseKey, done: false }] })
}

export function setTaskDone(id: string, done: boolean): void {
  const local = loadLocal()
  if (id.startsWith('own:')) {
    saveLocal({ ...local, todos: local.todos.map((todo) => (todo.id === id ? { ...todo, done } : todo)) })
  } else {
    const doneIds = local.doneIds.filter((other) => other !== id)
    saveLocal({ ...local, doneIds: done ? [...doneIds, id] : doneIds })
  }
}

export function deleteTodo(id: string): void {
  const local = loadLocal()
  saveLocal({ ...local, todos: local.todos.filter((todo) => todo.id !== id) })
}

/** Sync now (if logged in), every 30 minutes, and after waking up from standby. */
export function startTasksSync(listener: () => void): void {
  onChange = listener
  void syncTasks()
  setInterval(() => void syncTasks(), SYNC_INTERVAL_MS)
  powerMonitor.on('resume', () => {
    setTimeout(() => void syncTasks(), 10_000)
  })
}
