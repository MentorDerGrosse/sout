import { net } from 'electron'

// The personal TISS calendar is an iCal feed behind a secret token (TISS → Kalender → bottom of the page).

export function tissCalendarUrl(token: string): string {
  return `https://tiss.tuwien.ac.at/events/rest/calendar/personal?token=${encodeURIComponent(token)}&locale=de`
}

/** Accepts the full calendar URL copied from TISS or just the token. */
export function parseTissToken(input: string): string | null {
  const text = input.trim()
  if (/^https?:\/\//i.test(text)) {
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return null
    }
    if (url.hostname !== 'tiss.tuwien.ac.at' || !url.pathname.startsWith('/events/rest/calendar/personal')) {
      return null
    }
    const token = url.searchParams.get('token')
    return token && token.length >= 8 ? token : null
  }
  return /^[^\s?&#/]{8,}$/.test(text) ? text : null
}

/** Downloads the feed once and counts its events – a token check until the calendar itself exists. */
export async function testTissFeed(token: string): Promise<{ events: number }> {
  let response: Response
  try {
    response = await net.fetch(tissCalendarUrl(token), { signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new Error('TISS ist nicht erreichbar – bist du online?')
  }
  if (!response.ok) throw new Error(`TISS antwortet mit HTTP ${response.status} – stimmt der Token?`)
  const body = await response.text()
  if (!body.includes('BEGIN:VCALENDAR')) throw new Error('Die Antwort ist kein Kalender – stimmt der Token?')
  return { events: body.match(/^BEGIN:VEVENT/gm)?.length ?? 0 }
}
