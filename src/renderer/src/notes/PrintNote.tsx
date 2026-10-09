import { useEffect, useState } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { dirOf } from '../lib/notes'

/**
 * The page for "Als PDF speichern": the note rendered like the preview, in light colours. Tells the
 * main process when formulas, fonts and pictures are there, then it prints.
 */
export function PrintNote({ path }: { path: string }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    document.documentElement.dataset['print'] = 'true'
    void window.sout.readNote(path).then((result) => setHtml(result.ok ? renderMarkdown(result.value.content, dirOf(path)) : `<p>${result.error}</p>`))
  }, [path])
  useEffect(() => {
    if (html === null) return
    const images = [...document.images].map((image) => (image.complete ? Promise.resolve() : new Promise((done) => image.addEventListener('loadend', done, { once: true }))))
    void Promise.all([document.fonts.ready, ...images]).then(() => window.sout.printReady())
  }, [html])
  return html === null ? null : <article className="markdown print-note" dangerouslySetInnerHTML={{ __html: html }} />
}
