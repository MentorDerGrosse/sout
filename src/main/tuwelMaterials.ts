import { app, net } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { safeFileName } from '../shared/notes'
import { currentSemester } from '../shared/tu'
import type { NewChange } from './changes'
import { readJson, writeJson } from './jsonFile'
import { findCourseDir, noteFileExists, notesRoot, writeNoteFile } from './notes'
import { getSettings } from './settings'
import { tuwelCall } from './tuwelApi'

// TUWEL course materials (files of "Datei" and "Verzeichnis" activities) go into the course's notes
// folder, under "Unterlagen" – PDFs show up next to the notes then. Every six hours. A file deleted
// on purpose doesn't come back; a file TUWEL changes is replaced, unless it was changed here too –
// then the new one comes next to it.

const INTERVAL_MS = 6 * 60 * 60_000
const FOLDER = 'Unterlagen'
const MAX_FILE_BYTES = 100 * 1024 * 1024
/** Per run, so the first one doesn't take forever; the rest comes next time. */
const MAX_DOWNLOADS = 40

interface RawFile {
  type: string
  filename: string
  filepath?: string
  filesize: number
  fileurl?: string
  timemodified: number
}

interface RawModule {
  id: number
  name: string
  modname: string
  uservisible?: boolean
  contents?: RawFile[]
}

/** core_course_get_contents: the sections of a course. Test data has the same shape. */
export interface RawSection {
  modules: RawModule[]
}

export interface MaterialCourse {
  id: number
  /** LVA number: says which course folder. */
  lva: string | null
  name: string
}

interface Known {
  path: string
  timemodified: number
  /** Size and mtime when sout wrote it: unchanged since then means it may be replaced. */
  size: number
  mtime: number
}

/** materials.json */
interface Stored {
  files: Record<string, Known>
  checkedAt: string | null
}

const file = (): string => join(app.getPath('userData'), 'materials.json')

function load(): Stored {
  const data = readJson(file()) as Partial<Stored> | undefined
  return { files: data?.files ?? {}, checkedAt: data?.checkedAt ?? null }
}

export function materialsDue(): boolean {
  const { checkedAt } = load()
  return getSettings().loadMaterials && notesRoot() !== null && (!checkedAt || Date.now() - Date.parse(checkedAt) > INTERVAL_MS)
}

/** Asks TUWEL for the courses' files (one call per course). */
export async function fetchContents(token: string, courses: MaterialCourse[]): Promise<Record<string, RawSection[]>> {
  const contents: Record<string, RawSection[]> = {}
  for (const course of courses.filter((candidate) => candidate.lva)) {
    try {
      contents[course.id] = await tuwelCall<RawSection[]>(token, 'core_course_get_contents', { courseid: course.id })
    } catch {
      // This course's files next time.
    }
  }
  return contents
}

/**
 * Downloads what is new or changed. `token` for TUWEL's file links; test data uses file:// links.
 * Returns the news ("Neue Unterlagen") – not for the very first run of a course.
 */
export async function syncMaterials(token: string | null, courses: MaterialCourse[], contents: Record<string, RawSection[]>): Promise<NewChange[]> {
  if (!getSettings().loadMaterials || !notesRoot()) return []
  const stored = load()
  const files = { ...stored.files }
  const semester = currentSemester(new Date()).code
  const news: NewChange[] = []
  let downloads = 0
  for (const course of courses) {
    const sections = contents[course.id]
    const courseDir = course.lva ? findCourseDir(course.lva, semester) : null
    if (!sections || !courseDir) continue
    const firstTime = !Object.keys(files).some((key) => key.startsWith(`${course.id}|`))
    const added: string[] = []
    for (const module of sections.flatMap((section) => section.modules)) {
      if ((module.modname !== 'resource' && module.modname !== 'folder') || module.uservisible === false) continue
      const items = (module.contents ?? []).filter((item) => item.type === 'file' && item.fileurl && item.filesize <= MAX_FILE_BYTES)
      for (const item of items) {
        const key = `${course.id}|${module.id}|${item.filepath ?? '/'}${item.filename}`
        const known = files[key]
        // Known and unchanged in TUWEL – also when it was deleted here on purpose.
        if (known && known.timemodified >= item.timemodified) continue
        if (downloads >= MAX_DOWNLOADS) break
        // Changed in TUWEL. Replaced if it is still as sout wrote it; edited here: the new one next to it.
        const present = known ? noteFileExists(known.path) : false
        const target = known && present && unchanged(known) ? known.path : targetPath(courseDir, module, item, items.length, present)
        try {
          const data = await download(item.fileurl!, token)
          const written = writeNoteFile(target, data)
          files[key] = { path: written.path, timemodified: item.timemodified, size: data.byteLength, mtime: written.mtime }
          added.push(item.filename)
          downloads++
        } catch (error) {
          console.log(`[tuwel] Datei nicht geladen: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
    if (added.length > 0 && !firstTime) {
      news.push({
        kind: 'material',
        title: `Neue Unterlagen: ${course.name}`,
        detail: `${added.slice(0, 3).join(', ')}${added.length > 3 ? ` und ${added.length - 3} weitere` : ''} – im Notizordner unter „${FOLDER}“`,
        view: 'notes',
        url: null
      })
    }
  }
  writeJson(file(), { files, checkedAt: new Date().toISOString() })
  return news
}

/** The file is as sout wrote it: may be replaced by a newer version. */
function unchanged(known: Known): boolean {
  try {
    const stat = statSync(join(notesRoot()!, known.path))
    return stat.size === known.size && Math.abs(stat.mtimeMs - known.mtime) < 2000
  } catch {
    return false
  }
}

/**
 * "Unterlagen/<activity>.pdf" for a single file, "Unterlagen/<activity>/<path>/<file>" for a folder.
 * A changed file that was edited here gets " (neu)".
 */
function targetPath(courseDir: string, module: RawModule, item: RawFile, count: number, changed: boolean): string {
  const ext = /\.[a-z0-9]{1,8}$/i.exec(item.filename)?.[0] ?? ''
  const base = module.modname === 'resource' && count === 1 ? safeFileName(module.name) || safeFileName(item.filename) : safeFileName(item.filename.slice(0, item.filename.length - ext.length))
  const name = `${base}${changed ? ' (neu)' : ''}${ext}`
  const folder =
    module.modname === 'folder'
      ? [FOLDER, safeFileName(module.name), ...(item.filepath ?? '/').split('/').filter(Boolean).map((part) => safeFileName(part))].filter(Boolean).join('/')
      : FOLDER
  return `${courseDir}/${folder}/${name}`
}

async function download(url: string, token: string | null): Promise<Uint8Array> {
  // Test data (development only): files on disk.
  if (url.startsWith('file://') && !app.isPackaged) return readFileSync(new URL(url))
  if (!token) throw new Error('Kein TUWEL-Schlüssel.')
  const response = await net.fetch(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`TUWEL antwortet mit HTTP ${response.status}.`)
  return new Uint8Array(await response.arrayBuffer())
}
