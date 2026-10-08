// Minimal iCalendar (RFC 5545) reader for the TISS feed: plain VEVENTs, no recurrence rules.

export interface IcalDate {
  /** ISO date-time (UTC) for timed values, YYYY-MM-DD for date values. */
  value: string
  allDay: boolean
}

export interface IcalEvent {
  uid: string
  summary: string
  description: string | null
  location: string | null
  categories: string | null
  start: IcalDate
  end: IcalDate
}

/** TISS gives local times in Vienna. */
export const TISS_ZONE = 'Europe/Vienna'

export function parseIcal(text: string): IcalEvent[] {
  // Long lines are folded: a line break followed by a space or tab continues the previous line.
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events: IcalEvent[] = []
  let current: Map<string, { params: string; value: string }> | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = new Map()
    } else if (line === 'END:VEVENT' && current) {
      const event = toEvent(current)
      if (event) events.push(event)
      current = null
    } else if (current) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const [name = '', ...params] = line.slice(0, colon).split(';')
      current.set(name.toUpperCase(), { params: params.join(';'), value: line.slice(colon + 1) })
    }
  }
  return events
}

function toEvent(props: Map<string, { params: string; value: string }>): IcalEvent | null {
  const start = props.get('DTSTART')
  const uid = props.get('UID')?.value
  if (!start || !uid) return null
  const parsedStart = parseDate(start.value, start.params)
  const end = props.get('DTEND')
  const text = (name: string): string | null => {
    const value = props.get(name)?.value
    return value ? unescape(value) : null
  }
  return {
    uid,
    summary: text('SUMMARY') ?? '',
    description: text('DESCRIPTION'),
    location: text('LOCATION'),
    categories: text('CATEGORIES'),
    start: parsedStart,
    end: end ? parseDate(end.value, end.params) : parsedStart
  }
}

function unescape(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char))
}

function parseDate(value: string, params: string): IcalDate {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim())
  if (!match) throw new Error(`Unbekanntes Datum im Kalender: ${value}`)
  const [, y, mo, d, h, mi, s, utc] = match
  if (h === undefined) return { value: `${y}-${mo}-${d}`, allDay: true }
  const parts = [y, mo, d, h, mi, s].map(Number) as [number, number, number, number, number, number]
  const zone = /TZID=([^;]+)/.exec(params)?.[1] ?? TISS_ZONE
  const ms = utc ? Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]) : zonedToUtc(parts, zone)
  return { value: new Date(ms).toISOString(), allDay: false }
}

/** Local wall-clock time in a time zone → UTC milliseconds. */
export function zonedToUtc([y, mo, d, h, mi, s]: [number, number, number, number, number, number], zone: string): number {
  const wallClock = Date.UTC(y, mo - 1, d, h, mi, s)
  // Two rounds, so times right after a DST switch use the offset that applies at that moment.
  let guess = wallClock - offset(wallClock, zone)
  guess = wallClock - offset(guess, zone)
  return guess
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Offset of a time zone from UTC at the given instant, in milliseconds. */
function offset(instant: number, zone: string): number {
  let format = formatters.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatters.set(zone, format)
  }
  const get = (type: string): number => Number(format.formatToParts(instant).find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}
