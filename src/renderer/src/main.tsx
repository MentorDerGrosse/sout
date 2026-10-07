import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isView } from '../../shared/types'
import App from './App'
import Mini from './Mini'
import './styles.css'

// Both windows load this page; the URL hash says which one this is (and the main window's first view).
const hash = window.location.hash.slice(1)
const isMini = hash === 'mini'
document.body.classList.add(isMini ? 'is-mini' : 'is-main')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isMini ? <Mini /> : <App initialView={isView(hash) ? hash : 'today'} />}</StrictMode>
)
