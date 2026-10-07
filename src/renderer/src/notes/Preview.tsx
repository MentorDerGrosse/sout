import { useDeferredValue, useMemo, type MouseEvent, type RefObject } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { isPdf, isTextNote, resolveRelative } from '../lib/notes'

/** The rendered note. Checkboxes tick the line in the note; links to notes and PDFs open them in sout. */
export function Preview(props: {
  content: string
  /** Folder of the note: relative links and images start there. */
  dir: string
  scrollRef: RefObject<HTMLDivElement | null>
  onToggleTask: (line: number) => void
  onOpenNote: (path: string) => void
  onOpenPdf: (path: string) => void
  onOtherFile: (path: string) => void
}) {
  // Typing stays smooth: the preview may lag a keystroke behind.
  const content = useDeferredValue(props.content)
  const html = useMemo(() => renderMarkdown(content, props.dir), [content, props.dir])

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement
    if (target instanceof HTMLInputElement && target.classList.contains('task-checkbox')) {
      props.onToggleTask(Number(target.dataset['line']))
      return
    }
    const href = target.closest('a')?.getAttribute('href')
    // Web links: the main process opens them in the browser.
    if (!href || /^(https?|mailto):/i.test(href)) return
    event.preventDefault()
    if (href.startsWith('#')) {
      document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView()
      return
    }
    const path = resolveRelative(props.dir, href.split('#')[0]!)
    if (isPdf(path)) props.onOpenPdf(path)
    else if (isTextNote(path)) props.onOpenNote(path)
    else props.onOtherFile(path)
  }

  return (
    <div ref={props.scrollRef} className="note-preview" onClick={onClick}>
      <article className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
