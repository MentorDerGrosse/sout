import { TISS_ZONE, zonedToUtc } from './ical'

// Reads the "Prüfungen" table of a public TISS course page (courseDetails.xhtml). TISS lists one
// row per room: "Do. | 10:00 - 12:00 | 17.12.2026 | <room link> | schriftlich |
// 01.12.2026 08:00 - 10.12.2026 23:59 | in TISS | Test 1". Columns are found by their titles.

export interface ParsedRoom {
  name: string
  /** TISS room code – the same code TUW-Maps uses. */
  code: string | null
}

export interface ParsedExam {
  /** LVA number, day, time and name – stays the same as long as TISS doesn't change them. */
  id: string
  name: string
  mode: string | null
  start: string
  end: string
  allDay: boolean
  rooms: ParsedRoom[]
  opens: string | null
  closes: string | null
  registration: string | null
}

/** Is this a course page (and not TISS's "Loading..." page or an error)? */
export function isCoursePage(html: string, courseKey: string): boolean {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? ''
  return title.includes(courseKey)
}

export function parseExamTable(html: string, courseKey: string): ParsedExam[] {
  const table = findTable(html)
  if (!table) {
    // The page has exams, but not in the table we know: TISS changed it. Better an error than "no exams".
    if (/>\s*Prüfungen\s*<\/h2>/i.test(html)) throw new Error('Die Prüfungstabelle auf der TISS-Seite sieht anders aus als gewohnt.')
    return []
  }
  const exams = new Map<string, ParsedExam>()
  for (const row of table.rows) {
    const cell = (title: string): string | null => {
      const index = table.columns.indexOf(title)
      return index >= 0 ? (row[index] ?? null) : null
    }
    const day = parseDay(text(cell('Datum')))
    if (!day) continue
    const time = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(text(cell('Zeit')))
    const name = text(cell('Prüfung')) || 'Prüfung'
    const id = [courseKey, day.join('-'), time ? time.slice(1).join(':') : 'ganztägig', name].join('|')
    const rooms = parseRooms(cell('Ort'))
    const known = exams.get(id)
    if (known) {
      // The same exam in another room.
      for (const room of rooms) if (!known.rooms.some((other) => other.name === room.name)) known.rooms.push(room)
      continue
    }
    const at = (hour: number, minute: number): string => new Date(zonedToUtc([day[0], day[1], day[2], hour, minute, 0], TISS_ZONE)).toISOString()
    const [opens, closes] = parseWindow(text(cell('Anmeldefrist')))
    exams.set(id, {
      id,
      name,
      mode: text(cell('Prüfungsmodus')) || null,
      start: time ? at(Number(time[1]), Number(time[2])) : at(0, 0),
      end: time ? at(Number(time[3]), Number(time[4])) : at(23, 59),
      allDay: !time,
      rooms,
      opens,
      closes,
      registration: text(cell('Anmeldung')) || null
    })
  }
  return [...exams.values()].sort((a, b) => a.start.localeCompare(b.start))
}

/** The table whose columns include "Datum" and "Anmeldefrist" – the group tables have other columns. */
function findTable(html: string): { columns: string[]; rows: string[][] } | null {
  for (const [table] of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const columns = [...table.matchAll(/<th\b[^>]*\baria-label="([^"]*)"/gi)].map((match) => decode(match[1]!))
    if (!columns.includes('Datum') || !columns.includes('Anmeldefrist')) continue
    const rows = [...table.matchAll(/<tr\b[^>]*\bdata-ri="\d+"[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]!)
    )
    return { columns, rows }
  }
  return null
}

/** "17.12.2026" → [2026, 12, 17]. */
function parseDay(value: string): [number, number, number] | null {
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(value)
  return match ? [Number(match[3]), Number(match[2]), Number(match[1])] : null
}

/** "01.12.2026 08:00 - 10.12.2026 23:59" → both moments (ISO); a missing part stays null. */
function parseWindow(value: string): [string | null, string | null] {
  const moments = [...value.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/g)].map((match) => {
    const [day, month, year, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number]
    return new Date(zonedToUtc([year, month, day, hour, minute, 0], TISS_ZONE)).toISOString()
  })
  return [moments[0] ?? null, moments[1] ?? null]
}

/** Room links ("…roomSchedule.xhtml?roomCode=BSP01…") or plain text. */
function parseRooms(cell: string | null): ParsedRoom[] {
  if (!cell) return []
  const links = [...cell.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
  if (links.length === 0) {
    const name = text(cell)
    return name ? [{ name, code: null }] : []
  }
  return links
    .map(([, href, label]) => ({ name: text(label!), code: /roomCode=([^&"]+)/.exec(decode(href!))?.[1] ?? null }))
    .filter((room) => room.name)
}

/** Cell HTML → plain text. */
function text(html: string | null): string {
  return html ? decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : ''
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const number = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity
    }
    return ENTITIES[code.toLowerCase()] ?? entity
  })
}
