import { net } from 'electron'

// TUWEL is a Moodle site; the Moodle app's web service gives us the same data the app shows.

export const TUWEL_URL = 'https://tuwel.tuwien.ac.at'

export class TuwelError extends Error {
  constructor(
    message: string,
    /** Moodle's error code, e.g. "invalidtoken"; "network" or "http" for transport problems. */
    readonly code: string
  ) {
    super(message)
  }
}

export async function tuwelCall<T>(token: string, wsfunction: string, args: Record<string, unknown> = {}): Promise<T> {
  const body = new URLSearchParams({ wstoken: token, wsfunction, moodlewsrestformat: 'json' })
  for (const [key, value] of formFields(args)) body.append(key, value)

  let response: Response
  try {
    response = await net.fetch(`${TUWEL_URL}/webservice/rest/server.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    throw new TuwelError('TUWEL ist nicht erreichbar – bist du online?', 'network')
  }
  if (!response.ok) throw new TuwelError(`TUWEL antwortet mit HTTP ${response.status}.`, 'http')

  const data: unknown = await response.json()
  if (data && typeof data === 'object' && 'exception' in data) {
    const { message, errorcode } = data as { message?: string; errorcode?: string }
    const code = errorcode ?? 'unknown'
    throw new TuwelError(
      code === 'invalidtoken' ? 'Die TUWEL-Anmeldung ist abgelaufen – bitte neu anmelden.' : `TUWEL meldet: ${message ?? code}`,
      code
    )
  }
  return data as T
}

/** Moodle's REST format wants PHP-style form fields: courseids[0]=1&courseids[1]=2. */
function formFields(value: unknown, prefix = ''): [string, string][] {
  if (Array.isArray(value)) return value.flatMap((item, index) => formFields(item, `${prefix}[${index}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => formFields(item, prefix ? `${prefix}[${key}]` : key))
  }
  if (value === undefined || value === null) return []
  return [[prefix, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]]
}
