import { app, session } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tissCourseUrl } from '../shared/tu'
import { isCoursePage } from './examParser'

// The public TISS page of a course: exams, registration windows, ECTS. Read by the exam sync and
// when a course is added to the grade overview by hand.

/** Development: course pages from files, <SOUT_TISS_PAGES>/<LVA number without dot>.html. */
export const devPagesDir = (): string | undefined => (app.isPackaged ? undefined : process.env['SOUT_TISS_PAGES'])

/** The public TISS page of a course (German). */
export async function readCoursePage(courseKey: string, semester: string): Promise<string> {
  const devDir = devPagesDir()
  const html = devDir ? readFileSync(join(devDir, `${courseKey.replace('.', '')}.html`), 'utf8') : await fetchCoursePage(courseKey, semester)
  if (!isCoursePage(html, courseKey)) throw new Error('TISS hat statt der LVA-Seite etwas anderes geliefert.')
  return html
}

async function fetchCoursePage(courseKey: string, semester: string): Promise<string> {
  // TISS hands out the page only to a "browser window" it knows: a window id in the address and
  // in a cookie, as its script would set them. An own session keeps these cookies out of the rest.
  const pages = session.fromPartition('tiss-pages')
  const requestId = String(100 + Math.floor(Math.random() * 900))
  const windowId = String(1000 + Math.floor(Math.random() * 9000))
  const cookie = `dsrwid-${requestId}`
  await pages.cookies.set({ url: 'https://tiss.tuwien.ac.at', name: cookie, value: windowId, path: '/' })
  try {
    let response: Response
    try {
      response = await pages.fetch(`${tissCourseUrl(courseKey, semester)}&locale=de&dsrid=${requestId}&dswid=${windowId}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(20_000)
      })
    } catch {
      throw new Error('TISS ist nicht erreichbar – bist du online?')
    }
    if (!response.ok) throw new Error(`TISS antwortet mit HTTP ${response.status}.`)
    return await response.text()
  } finally {
    await pages.cookies.remove('https://tiss.tuwien.ac.at', cookie).catch(() => {})
  }
}
