import { shell } from 'electron'
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, watch, writeFileSync, type Dirent, type FSWatcher, type Stats } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { NoteDoc, NoteNode, NotesData, SaveResult, SearchHit } from '../shared/types'
import { courseKeyOfFolder, isSemesterFolder, safeFileName } from '../shared/notes'
import { currentSemester } from '../shared/tu'
import { getSettings } from './settings'

export { INBOX } from '../shared/notes'

// Notes are plain Markdown files in a folder of the user's choice (default ~/Studium), so any other
// editor, the file manager or a backup tool can work with them too. Everything here takes paths
// relative to that folder and refuses whatever would end up outside of it.

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
/** Limits for the folder scan, in case the notes folder is set to something huge. */
const MAX_ENTRIES = 5000
const MAX_DEPTH = 8
const MAX_NOTE_BYTES = 5 * 1024 * 1024

type NoteFile = Extract<NoteNode, { modified: number }>

export function notesRoot(): string | null {
  const dir = getSettings().notesDir
  return dir && isAbsolute(dir) ? dir : null
}

export const suggestedRoot = (): string => join(homedir(), 'Studium')

function requireRoot(): string {
  const root = notesRoot()
  if (!root) throw new Error('Der Notizordner ist noch nicht eingerichtet.')
  // Not recreated behind the user's back – it might be a drive that isn't mounted right now.
  if (!existsSync(root)) throw new Error(`Der Notizordner ${root} ist gerade nicht da.`)
  return root
}

/** Absolute path of something in the notes folder; '' is the folder itself. */
export function resolveNote(path: string): string {
  const root = requireRoot()
  if (typeof path !== 'string' || path.includes('\0')) throw new Error('Ungültiger Pfad.')
  const abs = resolve(root, path)
  const inside = relative(root, abs)
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('Der Pfad liegt außerhalb des Notizordners.')
  return abs
}

const toRel = (abs: string): string => relative(requireRoot(), abs).split(sep).join('/')

/** "Analysis" + "Vorlesung" → "Analysis/Vorlesung"; empty parts are left out. */
export const joinRel = (...parts: string[]): string => parts.filter(Boolean).join('/')

export const isTextNote = (path: string): boolean => TEXT_EXTENSIONS.has(extname(path).toLowerCase())

function kindOf(name: string): NoteFile['kind'] {
  const ext = extname(name).toLowerCase()
  return TEXT_EXTENSIONS.has(ext) ? 'note' : ext === '.pdf' ? 'pdf' : 'file'
}

function statOrNull(abs: string): Stats | null {
  try {
    return statSync(abs)
  } catch {
    return null
  }
}

function list(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** "Notiz.md", or "Notiz 2.md" if that exists already. */
function uniquePath(dir: string, name: string): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let candidate = join(dir, name)
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${stem} ${n}${ext}`)
  return candidate
}

// ---------- The folder tree ----------

const byKindAndName = (a: NoteNode, b: NoteNode): number =>
  Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name, 'de', { numeric: true })

function scan(root: string): NoteNode[] {
  let budget = MAX_ENTRIES
  const walk = (dir: string, depth: number): NoteNode[] => {
    const nodes: NoteNode[] = []
    for (const entry of list(dir)) {
      // Hidden files: .git, editor backups, our own temp files.
      if (entry.name.startsWith('.') || budget-- <= 0) continue
      const abs = join(dir, entry.name)
      const stat = statOrNull(abs)
      const path = relative(root, abs).split(sep).join('/')
      if (stat?.isDirectory()) nodes.push({ kind: 'dir', path, name: entry.name, children: depth < MAX_DEPTH ? walk(abs, depth + 1) : [] })
      else if (stat?.isFile()) nodes.push({ kind: kindOf(entry.name), path, name: entry.name, modified: stat.mtimeMs })
    }
    return nodes.sort(byKindAndName)
  }
  return walk(root, 0)
}

function* notesIn(nodes: NoteNode[]): Generator<NoteFile> {
  for (const node of nodes) {
    if (node.kind === 'dir') yield* notesIn(node.children)
    else if (node.kind === 'note') yield node
  }
}

export function notesData(): NotesData {
  const root = notesRoot()
  const base: NotesData = { root, suggestedRoot: suggestedRoot(), missing: false, semester: currentSemester(new Date()).code, tree: [], tags: [] }
  if (!root) return base
  if (!existsSync(root)) return { ...base, missing: true }
  watchNotes()
  const tree = scan(root)
  return { ...base, tree, tags: collectTags(root, tree) }
}

/** The course's folder for a semester (relative path). Unless `exact`, the latest other semester's folder will do too. */
export function findCourseDir(key: string, semester: string, exact = false): string | null {
  const root = requireRoot()
  const semesters = [semester]
  if (!exact) {
    semesters.push(
      ...list(root)
        .filter((entry) => isSemesterFolder(entry.name) && entry.name !== semester)
        .map((entry) => entry.name)
        .sort()
        .reverse()
    )
  }
  for (const name of semesters) {
    const folder = list(join(root, name)).find((entry) => statOrNull(join(root, name, entry.name))?.isDirectory() && courseKeyOfFolder(entry.name) === key)
    if (folder) return `${name}/${folder.name}`
  }
  return null
}

/** First file in a folder of the notes that matches, as relative path. */
export function findFile(dir: string, matches: (name: string) => boolean): string | null {
  const names = list(resolveNote(dir))
    .filter((entry) => entry.isFile() && matches(entry.name))
    .map((entry) => entry.name)
    .sort()
  return names[0] ? joinRel(dir, names[0]) : null
}

// ---------- Reading and writing ----------

export function readNote(path: string): NoteDoc {
  const abs = resolveNote(path)
  if (!isTextNote(abs)) throw new Error('Das ist keine Notiz.')
  const stat = statOrNull(abs)
  if (!stat?.isFile()) throw new Error(`„${basename(abs)}“ gibt es im Notizordner nicht (mehr).`)
  if (stat.size > MAX_NOTE_BYTES) throw new Error('Die Datei ist zu groß für den Editor.')
  return { path: toRel(abs), content: readFileSync(abs, 'utf8'), modified: stat.mtimeMs }
}

/** Temp file and rename: a crash never leaves half a note behind. Returns the new mtime. */
function writeAtomic(abs: string, content: string): number {
  mkdirSync(dirname(abs), { recursive: true })
  const temp = join(dirname(abs), `.${basename(abs)}.sout-tmp`)
  writeFileSync(temp, content)
  renameSync(temp, abs)
  return statSync(abs).mtimeMs
}

/** Changed on disk since sout read it – and not just touched. */
function changedSince(abs: string, baseModified: number, content: string): boolean {
  const stat = statOrNull(abs)
  if (!stat || stat.mtimeMs === baseModified) return false
  return readFileSync(abs, 'utf8') !== content
}

export function writeNote(path: string, content: string, baseModified: number | null): SaveResult {
  try {
    const abs = resolveNote(path)
    if (!isTextNote(abs)) throw new Error('Nur Notizen (.md, .txt) können hier gespeichert werden.')
    if (baseModified !== null && changedSince(abs, baseModified, content)) {
      return { ok: false, conflict: true, error: 'Die Datei wurde außerhalb von sout geändert.' }
    }
    return { ok: true, modified: writeAtomic(abs, content) }
  } catch (error) {
    return { ok: false, conflict: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Last save while the window closes. Nobody can be asked then, so on a conflict the text goes into a copy. */
export function flushNote(path: string, content: string, baseModified: number | null): boolean {
  try {
    const abs = resolveNote(path)
    if (!isTextNote(abs)) return false
    if (baseModified !== null && changedSince(abs, baseModified, content)) {
      const ext = extname(abs)
      writeAtomic(uniquePath(dirname(abs), `${basename(abs, ext)} (Konflikt)${ext}`), content)
    } else {
      writeAtomic(abs, content)
    }
    return true
  } catch {
    return false
  }
}

/** A new file in a folder of the notes (created if needed); "Name 2.md" if the name is taken. */
export function createNoteFile(dir: string, name: string, content: string): string {
  const abs = uniquePath(resolveNote(dir), name)
  writeAtomic(abs, content)
  notesChanged()
  return toRel(abs)
}

export function renameNote(path: string, name: string): string {
  const abs = resolveNote(path)
  if (!statOrNull(abs)?.isFile()) throw new Error('Nur Dateien lassen sich hier umbenennen.')
  const ext = extname(abs)
  let clean = safeFileName(name, 120)
  if (!clean) throw new Error('Bitte einen Namen eingeben.')
  if (ext && extname(clean).toLowerCase() !== ext.toLowerCase()) clean += ext
  const target = join(dirname(abs), clean)
  if (target === abs) return toRel(abs)
  if (existsSync(target)) throw new Error(`„${clean}“ gibt es in diesem Ordner schon.`)
  renameSync(abs, target)
  notesChanged()
  return toRel(target)
}

export function moveNoteTo(path: string, dir: string): string {
  const abs = resolveNote(path)
  if (!statOrNull(abs)?.isFile()) throw new Error('Nur Dateien lassen sich hier verschieben.')
  const dirAbs = resolveNote(dir)
  if (dirname(abs) === dirAbs) return toRel(abs)
  mkdirSync(dirAbs, { recursive: true })
  const target = uniquePath(dirAbs, basename(abs))
  renameSync(abs, target)
  notesChanged()
  return toRel(target)
}

export async function trashNote(path: string): Promise<void> {
  const abs = resolveNote(path)
  if (abs === requireRoot()) throw new Error('Der Notizordner selbst bleibt.')
  await shell.trashItem(abs)
  notesChanged()
}

/** Copies files into a folder of the notes. The same file dropped twice is not copied again. */
export function copyIntoNotes(files: string[], dir: string): string[] {
  const dirAbs = resolveNote(dir)
  mkdirSync(dirAbs, { recursive: true })
  const result = files.map((file) => {
    const sameName = join(dirAbs, basename(file))
    if (existsSync(sameName) && readFileSync(sameName).equals(readFileSync(file))) return toRel(sameName)
    const target = uniquePath(dirAbs, basename(file))
    copyFileSync(file, target, constants.COPYFILE_EXCL)
    return toRel(target)
  })
  notesChanged()
  return result
}

export function showInFolder(path: string | null): void {
  if (path) shell.showItemInFolder(resolveNote(path))
  else void shell.openPath(requireRoot())
}

// ---------- Tags and search ----------

/** File contents by absolute path, re-read only when the file changed. */
const contents = new Map<string, { modified: number; text: string }>()

function contentOf(abs: string, modified: number): string {
  const cached = contents.get(abs)
  if (cached?.modified === modified) return cached.text
  let text = ''
  try {
    if (statSync(abs).size <= MAX_NOTE_BYTES) text = readFileSync(abs, 'utf8')
  } catch {
    // Gone in the meantime – the next scan won't list it any more.
  }
  contents.set(abs, { modified, text })
  return text
}

/** "#prüfung" anywhere in the text – but not in code, links ("…/#abschnitt") or headings ("# Titel"). */
const TAG = /(?:^|[\s(,;])#(\p{L}[\p{L}\p{N}_/-]*)/gu
const CODE = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/g

export function tagsOf(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.replace(CODE, ' ').matchAll(TAG)) found.add(match[1]!.toLocaleLowerCase('de'))
  return [...found]
}

function collectTags(root: string, tree: NoteNode[]): NotesData['tags'] {
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const note of notesIn(tree)) {
    const abs = join(root, note.path)
    seen.add(abs)
    for (const tag of tagsOf(contentOf(abs, note.modified))) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  for (const key of contents.keys()) if (!seen.has(key)) contents.delete(key)
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'de'))
}

const SNIPPET_LENGTH = 140

/** All words have to occur (in the text or the file name); "#tag" looks for the tag. Best matches first. */
export function searchNotes(query: string): SearchHit[] {
  const root = notesRoot()
  const terms = query.toLocaleLowerCase('de').split(/\s+/).filter((term) => term && term !== '#')
  if (!root || terms.length === 0 || !existsSync(root)) return []
  const hits: (SearchHit & { score: number; modified: number })[] = []
  for (const note of notesIn(scan(root))) {
    const text = contentOf(join(root, note.path), note.modified)
    const lower = text.toLocaleLowerCase('de')
    const name = note.name.toLocaleLowerCase('de')
    const tags = terms.some((term) => term.startsWith('#')) ? new Set(tagsOf(text)) : null
    let count = 0
    let nameHits = 0
    const all = terms.every((term) => {
      if (term.startsWith('#')) {
        count++
        return tags!.has(term.slice(1))
      }
      const inText = occurrences(lower, term)
      if (name.includes(term)) nameHits++
      count += inText
      return inText > 0 || name.includes(term)
    })
    if (!all) continue
    hits.push({ path: note.path, ...firstMatch(text, lower, terms), count, score: nameHits * 1000 + Math.min(count, 999), modified: note.modified })
  }
  return hits
    .sort((a, b) => b.score - a.score || b.modified - a.modified)
    .slice(0, 50)
    .map(({ path, line, snippet, count }) => ({ path, line, snippet, count }))
}

function occurrences(text: string, term: string): number {
  let count = 0
  for (let index = text.indexOf(term); index !== -1; index = text.indexOf(term, index + term.length)) count++
  return count
}

/** Line number and text around the first match; the first text line if only the file name matched. */
function firstMatch(text: string, lower: string, terms: string[]): { line: number; snippet: string } {
  let index = -1
  for (const term of terms) {
    const found = lower.indexOf(term)
    if (found !== -1 && (index === -1 || found < index)) index = found
  }
  if (index === -1) {
    const first = text.split('\n').find((line) => line.trim()) ?? ''
    return { line: 1, snippet: first.replace(/^#+\s*/, '').slice(0, SNIPPET_LENGTH) }
  }
  const start = text.lastIndexOf('\n', index - 1) + 1
  const end = text.indexOf('\n', index) === -1 ? text.length : text.indexOf('\n', index)
  const lineText = text.slice(start, end)
  let from = Math.max(0, index - start - 50)
  // Start at a word, but never after the match itself.
  const space = from > 0 ? lineText.indexOf(' ', from) : -1
  if (space !== -1 && space < index - start) from = space + 1
  let snippet = lineText.slice(from, from + SNIPPET_LENGTH).trim()
  if (from > 0) snippet = `…${snippet}`
  if (from + SNIPPET_LENGTH < lineText.length) snippet = `${snippet}…`
  return { line: text.slice(0, start).split('\n').length, snippet }
}

// ---------- Watching for changes ----------

/** Folder watchers, at most this many (inotify watches are a limited resource). */
const MAX_WATCHED_DIRS = 1000

const watchers = new Map<string, FSWatcher>()
let watchedRoot: string | null = null
let onChange: () => void = () => {}
let pending: NodeJS.Timeout | undefined

export function startNotesWatch(listener: () => void): void {
  onChange = listener
  watchNotes()
}

/** Tells the UI shortly: a burst of file events becomes one update. */
export function notesChanged(): void {
  clearTimeout(pending)
  pending = setTimeout(() => {
    // Folders may have come or gone.
    watchNotes()
    onChange()
  }, 250)
}

/**
 * Follows changes made outside of sout too: file manager, other editors, sync tools. One watcher
 * per folder – fs.watch's recursive mode loses track of files on Linux once they are saved via a
 * temporary file and rename, which is how sout and most editors save.
 */
export function watchNotes(): void {
  const root = notesRoot()
  if (root !== watchedRoot) {
    for (const watcher of watchers.values()) watcher.close()
    watchers.clear()
    watchedRoot = root
  }
  const dirs = new Set<string>()
  const walk = (dir: string, depth: number): void => {
    if (dirs.size >= MAX_WATCHED_DIRS) return
    dirs.add(dir)
    if (depth >= MAX_DEPTH) return
    for (const entry of list(dir)) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) walk(join(dir, entry.name), depth + 1)
    }
  }
  if (root && existsSync(root)) walk(root, 0)

  for (const [dir, watcher] of watchers) {
    if (dirs.has(dir)) continue
    watcher.close()
    watchers.delete(dir)
  }
  for (const dir of dirs) {
    if (watchers.has(dir)) continue
    try {
      const watcher = watch(dir, () => notesChanged())
      // E.g. the folder was deleted; the next notesChanged() sorts the watchers out again.
      watcher.on('error', () => {
        watcher.close()
        watchers.delete(dir)
      })
      watchers.set(dir, watcher)
    } catch {
      // Gone in the meantime.
    }
  }
}
