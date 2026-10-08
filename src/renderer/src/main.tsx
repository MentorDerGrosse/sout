import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isView, type Settings } from '../../shared/types'
import App from './App'
import Mini from './Mini'
import './styles.css'

// Both windows load this page; the URL hash says which one this is and what the main window
// shows first: "mini", "calendar", "notes:<path of a note>".
const [first = '', ...rest] = window.location.hash.slice(1).split(':')
const isMini = first === 'mini'
const note = rest.length > 0 ? decodeURIComponent(rest.join(':')) : undefined
document.body.classList.add(isMini ? 'is-mini' : 'is-main')

// Files dropped anywhere else would make the window navigate away to them.
for (const type of ['dragover', 'drop']) window.addEventListener(type, (event) => event.preventDefault())

/** The colour schemes for light and dark mode (styles.css); which mode applies, the main process decides. */
function applyPalettes(settings: Settings): void {
  document.documentElement.dataset['light'] = settings.lightPalette
  document.documentElement.dataset['dark'] = settings.darkPalette
}

window.sout.onStateChanged(() => void window.sout.getSettings().then(applyPalettes))
// Colours first, so the page doesn't flash in the standard scheme.
void window.sout
  .getSettings()
  .then(applyPalettes)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>{isMini ? <Mini /> : <App initialView={isView(first) ? first : 'today'} initialNote={note} />}</StrictMode>
    )
  })
