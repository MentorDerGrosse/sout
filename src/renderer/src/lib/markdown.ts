import MarkdownIt, { type StateCore } from 'markdown-it'
import katexPlugin from '@vscode/markdown-it-katex'
import hljs from 'highlight.js/lib/common'
import 'katex/dist/katex.min.css'
import { noteFileUrl, resolveRelative } from './notes'

// The preview of a note: Markdown with formulas ($…$, $$…$$), highlighted code, tables and
// checklists. Raw HTML in notes is not rendered, so a note can never run scripts.

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  quotes: '„“‚‘',
  highlight: (code, language) => {
    if (!language || !hljs.getLanguage(language)) return ''
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      return ''
    }
  }
})

md.use(katexPlugin, { throwOnError: false, enableFencedBlocks: true })

/** "- [ ] Aufgabe" becomes a checkbox; data-line points at the line in the note, to tick it there. */
md.core.ruler.push('task_lists', (state: StateCore) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]!
    const item = tokens[i - 2]!
    if (inline.type !== 'inline' || tokens[i - 1]!.type !== 'paragraph_open' || item.type !== 'list_item_open') continue
    const first = inline.children?.[0]
    const match = first?.type === 'text' ? /^\[([ xX])\][  ]/.exec(first.content) : null
    if (!first || !match) continue
    first.content = first.content.slice(match[0].length)
    const checkbox = new state.Token('html_inline', '', 0)
    const checked = match[1] !== ' '
    checkbox.content = `<input type="checkbox" class="task-checkbox" data-line="${item.map?.[0] ?? -1}"${checked ? ' checked' : ''}> `
    inline.children!.unshift(checkbox)
    item.attrJoin('class', checked ? 'task-item done' : 'task-item')
  }
})

/** Images next to the note ("![](Folien/skizze.png)") are loaded from the notes folder. */
const renderImage = md.renderer.rules.image!
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!
  const src = String(token.attrGet('src') ?? '')
  const dir = typeof env?.['dir'] === 'string' ? env['dir'] : ''
  if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) token.attrSet('src', noteFileUrl(resolveRelative(dir, src)))
  return renderImage(tokens, idx, options, env, self)
}

/** HTML for a note; `dir` is the note's folder, relative links and images start there. */
export function renderMarkdown(source: string, dir: string): string {
  return md.render(source, { dir })
}
