import { useEffect, useRef, type MutableRefObject } from 'react'
import { minimalSetup } from 'codemirror'
import { indentWithTab } from '@codemirror/commands'
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { searchKeymap } from '@codemirror/search'
import { EditorSelection, EditorState } from '@codemirror/state'
import { Decoration, EditorView, keymap, MatchDecorator, placeholder, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

// The Markdown editor (CodeMirror 6). Colours come from the app's CSS variables, so it follows
// GNOME's light/dark setting like the rest of sout.

const MONO = "ui-monospace, 'Adwaita Mono', 'Source Code Pro', monospace"

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--surface)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', fontSize: '15px', lineHeight: '1.65', padding: '20px 0 40vh' },
  '.cm-content': { padding: '0 28px', maxWidth: '860px', caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--accent-soft)' },
  '.cm-placeholder': { color: 'var(--text-muted)' },
  '.cm-math': { color: 'var(--code-function)', fontFamily: MONO, fontSize: '0.92em' },
  '.cm-panels': { backgroundColor: 'var(--surface-muted)', color: 'var(--text)' },
  '.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warn-soft)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--accent-soft)' },
  '.cm-textfield': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 6px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px' }
})

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.45em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.22em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.08em', fontWeight: '650' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, fontFamily: MONO, fontSize: '0.92em', color: 'var(--code-string)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName, t.meta], color: 'var(--text-muted)' },
  { tag: t.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
  // Code blocks with a language ("```python")
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--code-type)' }
])

/** Formulas ($…$, $$…$$ on one line) in their own colour. Markdown itself doesn't know them. */
const mathDecorator = new MatchDecorator({ regexp: /\$\$[^$\n]+\$\$|\$[^$\s][^$\n]*?\$/g, decoration: Decoration.mark({ class: 'cm-math' }) })
const mathHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = mathDecorator.createDeco(view)
    }
    update(update: ViewUpdate): void {
      this.decorations = mathDecorator.updateDeco(update, this.decorations)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/** The search panel (Strg+F) in German. */
const phrases = EditorState.phrases.of({
  Find: 'Suchen',
  Replace: 'Ersetzen',
  next: 'weiter',
  previous: 'zurück',
  all: 'alle',
  'match case': 'Groß/klein',
  'by word': 'ganzes Wort',
  regexp: 'Regex',
  replace: 'ersetzen',
  'replace all': 'alle ersetzen',
  close: 'schließen',
  'current match': 'aktueller Treffer',
  'on line': 'in Zeile',
  'Go to line': 'Gehe zu Zeile',
  go: 'los'
})

// ---------- Formatting commands (toolbar and shortcuts) ----------

/** **fett**, *kursiv*, $Formel$, `Code` – or removes the marks if the selection already has them. */
export function wrap(view: EditorView, mark: string): boolean {
  view.dispatch(
    view.state.changeByRange((range) => {
      const before = view.state.sliceDoc(range.from - mark.length, range.from)
      const after = view.state.sliceDoc(range.to, range.to + mark.length)
      if (before === mark && after === mark) {
        return {
          changes: [
            { from: range.from - mark.length, to: range.from },
            { from: range.to, to: range.to + mark.length }
          ],
          range: EditorSelection.range(range.from - mark.length, range.to - mark.length)
        }
      }
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark }
        ],
        range: EditorSelection.range(range.from + mark.length, range.to + mark.length)
      }
    })
  )
  view.focus()
  return true
}

/** Turns the selected lines into "## Überschrift", "- [ ] Aufgabe" … or back. */
export function toggleLinePrefix(view: EditorView, prefix: string, existing: RegExp): boolean {
  const { state } = view
  const lines = new Map<number, { from: number; text: string }>()
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos)
      lines.set(line.number, line)
      pos = line.to + 1
    }
  }
  const all = [...lines.values()]
  const remove = all.every((line) => existing.test(line.text))
  // A plain list item ("- Punkt") becomes a checklist item instead of getting a second marker.
  const bullet = /^\s*[-*+] (?!\[[ xX]\] )/
  view.dispatch({
    changes: all.map((line) => {
      if (remove) return { from: line.from, to: line.from + existing.exec(line.text)![0].length }
      const replaced = existing.exec(line.text)?.[0] ?? (prefix.startsWith('-') ? bullet.exec(line.text)?.[0] : undefined)
      return { from: line.from, to: line.from + (replaced?.length ?? 0), insert: prefix }
    })
  })
  view.focus()
  return true
}

export const toggleHeading = (view: EditorView): boolean => toggleLinePrefix(view, '## ', /^#{1,6} /)
export const toggleChecklist = (view: EditorView): boolean => toggleLinePrefix(view, '- [ ] ', /^\s*[-*+] \[[ xX]\] /)

/** A formula on its own lines: $$ … $$. */
export function insertMathBlock(view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  const lineStart = view.state.doc.lineAt(from).from === from
  const insert = `${lineStart ? '' : '\n'}$$\n${text}\n$$\n`
  const cursor = from + (lineStart ? 0 : 1) + 3 + text.length
  view.dispatch({ changes: { from, to, insert }, selection: { anchor: cursor } })
  view.focus()
  return true
}

/** Ticks or unticks "- [ ]" in that line (0-based), e.g. after a click on the checkbox in the preview. */
export function toggleTask(view: EditorView, line0: number): void {
  if (line0 < 0 || line0 >= view.state.doc.lines) return
  const line = view.state.doc.line(line0 + 1)
  const match = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(line.text)
  if (!match) return
  const pos = line.from + match[1]!.length
  view.dispatch({ changes: { from: pos, to: pos + 1, insert: match[2] === ' ' ? 'x' : ' ' } })
}

/** Cursor into the first section of a new note (below its first "##" heading), else to the end. */
export function focusFirstSection(view: EditorView): void {
  const doc = view.state.doc
  let anchor = doc.length
  for (let n = 1; n <= doc.lines; n++) {
    if (doc.line(n).text.startsWith('## ')) {
      anchor = n + 2 <= doc.lines ? doc.line(n + 2).from : doc.length
      break
    }
  }
  view.dispatch({ selection: { anchor }, scrollIntoView: true })
  view.focus()
}

export function goToLine(view: EditorView, lineNumber: number): void {
  const line = view.state.doc.line(Math.max(1, Math.min(lineNumber, view.state.doc.lines)))
  view.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
  view.focus()
}

const shortcuts = keymap.of([
  { key: 'Mod-b', run: (view) => wrap(view, '**') },
  { key: 'Mod-i', run: (view) => wrap(view, '*') },
  { key: 'Mod-m', run: (view) => wrap(view, '$') },
  { key: 'Mod-Shift-m', run: insertMathBlock },
  { key: 'Mod-e', run: (view) => wrap(view, '`') },
  { key: 'Mod-Shift-l', run: toggleChecklist },
  ...searchKeymap,
  indentWithTab
])

const baseExtensions = [
  minimalSetup,
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  syntaxHighlighting(highlight),
  mathHighlight,
  shortcuts,
  phrases,
  theme,
  placeholder('Schreib los … Formeln mit $…$, z. B. $a^2 + b^2 = c^2$')
]

function noteCompletions(context: CompletionContext, names: string[]): CompletionResult | null {
  const typed = context.matchBefore(/\[\[[^[\]|\n]*$/)
  if (!typed) return null
  return {
    from: typed.from + 2,
    options: names.map((name) => ({ label: name, apply: `${name}]]` })),
    validFor: /^[^[\]|\n]*$/
  }
}

export interface EditorProps {
  /** A new key loads `content` as a fresh document (another note, or the version from disk). */
  docKey: string
  content: string
  onChange: (content: string) => void
  onSave: () => void
  /** Scroll position 0…1, for the preview next to it. */
  onScroll: (ratio: number) => void
  viewRef: MutableRefObject<EditorView | null>
  /** Names of the other notes, offered after "[[". */
  noteNames: string[]
  /** A picture from the clipboard: saved, returns the path for the Markdown (or null). */
  onPasteImage: (file: File) => Promise<string | null>
}

export function MarkdownEditor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null)
  // The editor lives longer than one render; it calls whatever the latest props say.
  const latest = useRef(props)
  latest.current = props
  const { viewRef } = props

  useEffect(() => {
    const view = new EditorView({ parent: host.current! })
    viewRef.current = view
    const onScroll = (): void => {
      const scroller = view.scrollDOM
      latest.current.onScroll(scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight))
    }
    view.scrollDOM.addEventListener('scroll', onScroll)
    return () => {
      view.scrollDOM.removeEventListener('scroll', onScroll)
      view.destroy()
      viewRef.current = null
    }
  }, [viewRef])

  useEffect(() => {
    // A fresh state per note: undo history and cursor belong to the note.
    viewRef.current?.setState(
      EditorState.create({
        doc: latest.current.content,
        extensions: [
          baseExtensions,
          keymap.of([{ key: 'Mod-s', run: () => (latest.current.onSave(), true) }]),
          // "[[" offers the other notes.
          autocompletion({ override: [(context) => noteCompletions(context, latest.current.noteNames)], icons: false }),
          EditorView.domEventHandlers({
            paste: (event, view) => {
              const file = [...(event.clipboardData?.files ?? [])].find((candidate) => candidate.type.startsWith('image/'))
              if (!file) return false
              event.preventDefault()
              const { from, to } = view.state.selection.main
              void latest.current.onPasteImage(file).then((path) => {
                if (!path) return
                // Angle brackets keep paths with spaces working.
                const insert = `![](${/\s/.test(path) ? `<${path}>` : path})`
                view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } })
              })
              return true
            }
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
          })
        ]
      })
    )
  }, [props.docKey, viewRef])

  return <div ref={host} className="note-editor" />
}
