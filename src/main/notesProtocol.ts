import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { NOTE_FILE_SCHEME } from '../shared/types'
import { resolveNote } from './notes'

// sout-file://notes/<path> serves files from the notes folder to the UI: PDFs for Chromium's
// built-in viewer (next to a note) and images inside notes. Nothing outside the notes folder.

/** Has to run before the app is ready. */
export function registerNotesScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: NOTE_FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
}

export function handleNotesScheme(): void {
  protocol.handle(NOTE_FILE_SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.host !== 'notes' || request.method !== 'GET') return new Response(null, { status: 404 })
    try {
      return net.fetch(pathToFileURL(resolveNote(decodeURIComponent(url.pathname.slice(1)))).toString())
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
