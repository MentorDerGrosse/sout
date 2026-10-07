import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isView } from '../../shared/types'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isMini ? <Mini /> : <App initialView={isView(first) ? first : 'today'} initialNote={note} />}</StrictMode>
)
