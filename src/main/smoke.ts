import { app, BrowserWindow, Menu, net, screen } from 'electron'
import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deadlineStatus, examStatus } from '../shared/exams'
import { IPC, type View } from '../shared/types'
import { autostartEntry } from './autostart'
import { calendarChanged, calendarData, startCalendarSync, syncCalendar } from './calendar'
import { changes, startChanges } from './changes'
import { createLinkedNote, importPdfs, noteForEvent, noteForTask, quickNote, setupNotes } from './courseNotes'
import { examsData, startExamSync, syncExams } from './exams'
import { notesData, saveNoteImage, searchNotes, startNotesWatch, writeNote } from './notes'
import { handleNotesScheme } from './notesProtocol'
import { addOwnEvent } from './ownEvents'
import { refreshUrgent } from './reminders'
import { startTasksSync, syncTasks, syncTestMaterials, tasksData } from './tasks'
import { startTuwelExtras, tuwelExtras } from './tuwelExtras'
import { startStudies, studiesData, updateStudyCourse } from './studies'
import { readJson } from './jsonFile'
import { TuwelError, tuwelCall } from './tuwelApi'
import { lastLoginTrace, trySilent } from './tuwelLogin'
import { fetchSnapshot } from './tuwelTasks'
import { registerIpc } from './ipc'
import { getSecret, secretsStatus } from './secrets'
import { getSettings, updateSettings } from './settings'
import { trayHostAvailable, windowSystem } from './system'
import { fetchTissFeed } from './tiss'
import { createTray, trayUrgent } from './tray'
import { applyTheme, broadcast, printNote, createMainWindow, createMiniWindow, isMiniVisible, miniTakesOver, setOnMainClosed } from './windows'

// `--smoke-test=<dir>`: starts everything without showing a window, takes screenshots of the views,
// writes report.json and quits. Uses its own data folder and no keyring, so it also works on an
// installed package (to check the package itself); the test data from SOUT_TISS_FILE etc. only
// in development.

const FLAG = '--smoke-test='

export function smokeTestDir(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith(FLAG))
  return arg ? arg.slice(FLAG.length) : null
}

export async function runSmokeTest(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  app.setPath('userData', join(dir, 'userData'))
  app.commandLine.appendSwitch('password-store', 'basic')

  // XCURSOR_SIZE comes from fixCursorSize() at startup (Linux/XWayland).
  const report: Record<string, unknown> = { windowSystem: windowSystem(), xcursorSize: process.env['XCURSOR_SIZE'] ?? null }
  const messages: string[] = []
  const finish = (code: number): void => {
    report['messages'] = messages
    writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    app.exit(code)
  }
  setTimeout(() => {
    report['error'] = 'timeout'
    finish(1)
  }, 120_000)

  app.on('child-process-gone', (_e, details) => messages.push(`[child-gone] ${details.type}: ${details.reason} (${details.exitCode})`))
  app.on('browser-window-created', (_e, win) => {
    const id = win.id
    win.on('closed', () => messages.push(`[window-closed] #${id}`))
  })
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', (details) => messages.push(`[${details.level}] ${details.message}`))
    contents.on('preload-error', (_e, path, error) => messages.push(`[preload-error] ${path}: ${error.message}`))
    contents.on('render-process-gone', (_e, details) => messages.push(`[renderer-gone] ${details.reason}`))
    contents.on('did-fail-load', (_e, code, description, url) => messages.push(`[load-failed] ${code} ${description} ${url}`))
  })

  try {
    await app.whenReady()
    // SOUT_SMOKE_THEME=light|dark checks the other colour scheme without touching the GNOME setting.
    const theme = process.env['SOUT_SMOKE_THEME']
    if (theme === 'light' || theme === 'dark') updateSettings({ themeMode: theme })
    applyTheme()
    report['gpu'] = app.getGPUFeatureStatus()
    Menu.setApplicationMenu(null)
    registerIpc()
    handleNotesScheme()
    startNotesWatch(() => broadcast(IPC.notesChanged))
    startChanges(() => broadcast(IPC.changesChanged))
    startCalendarSync(() => broadcast(IPC.calendarChanged))
    startTasksSync(() => broadcast(IPC.tasksChanged))
    startStudies(() => broadcast(IPC.studiesChanged))
    startTuwelExtras(() => {
      broadcast(IPC.tuwelExtrasChanged)
      broadcast(IPC.calendarChanged)
      broadcast(IPC.tasksChanged)
    })
    startExamSync(() => broadcast(IPC.examsChanged))
    await Promise.all([syncCalendar(), syncTasks()])
    // The course pages after the calendar: it says which courses are yours.
    await syncExams(true)
    report['exams'] = { first: examReport() }
    report['courseInfo'] = calendarData().courses.map((course) => `${course.key} ${course.ects} ECTS ${course.tuwelUrl}`)
    report['deadlines'] = examsData().deadlines.map((deadline) =>
      [deadline.courseKey, deadline.kind, deadline.groups.join('+'), deadline.kind === 'group' ? deadlineStatus(deadline, Date.now()) : ''].filter(Boolean).join(' ')
    )
    addSampleOwnEvents()
    report['trayHost'] = await trayHostAvailable()
    createTray(report['trayHost'] as boolean | null)
    refreshUrgent()
    report['trayUrgent'] = trayUrgent()
    const mini = createMiniWindow()
    const main = createMainWindow('today', false)
    // As in the app: closing the main window hands over to the mini view.
    setOnMainClosed(miniTakesOver)
    // Hidden windows otherwise stop painting, and screenshots show an old frame.
    for (const win of [mini, main]) win.webContents.setBackgroundThrottling(false)
    await Promise.all([loaded(mini), loaded(main)])
    await delay(1000)

    const screenshots: Record<string, string> = { mini: await screenshot(mini, dir, 'mini') }
    for (const view of ['today', 'calendar', 'deadlines', 'exams', 'settings'] satisfies View[]) {
      main.webContents.send(IPC.navigate, view)
      await delay(500)
      screenshots[view] = await screenshot(main, dir, view)
    }
    // Calendar details and the other views (only meaningful with events, e.g. via SOUT_TISS_FILE).
    main.webContents.send(IPC.navigate, 'calendar')
    await delay(500)
    const click = (selector: string): Promise<unknown> =>
      main.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`)
    await click('.fc-timegrid-event')
    await delay(300)
    screenshots['calendar-details'] = await screenshot(main, dir, 'calendar-details')
    for (const view of ['dayGridMonth', 'listMonth']) {
      await click(`.fc-${view}-button`)
      await delay(400)
      screenshots[view] = await screenshot(main, dir, view)
    }
    main.webContents.send(IPC.navigate, 'deadlines')
    await delay(400)
    await main.webContents.executeJavaScript(`[...document.querySelectorAll('.task-section')].at(1)?.scrollIntoView()`)
    await delay(1500)
    screenshots['deadlines-later'] = await screenshot(main, dir, 'deadlines-later')
    await main.webContents.executeJavaScript('document.querySelector(".content").scrollTo(0, 0)')
    await click('.task-card:nth-of-type(1) .task-body')
    await main.webContents.executeJavaScript(
      `[...document.querySelectorAll('.task-body')].find((b) => b.textContent.includes('Übungsblatt') && b.getAttribute('aria-expanded') !== 'true')?.click()`
    )
    await click('.header-actions .button:last-child')
    // Clicks done through executeJavaScript take a moment to show up in a hidden window.
    await delay(1500)
    screenshots['deadlines-open'] = await screenshot(main, dir, 'deadlines-open')
    main.webContents.send(IPC.navigate, 'settings')
    await delay(400)
    await main.webContents.executeJavaScript('document.querySelector(".reminder-choices")?.scrollIntoView()')
    await delay(200)
    screenshots['settings-middle'] = await screenshot(main, dir, 'settings-middle')
    await main.webContents.executeJavaScript('document.querySelector(".content").scrollTo(0, 1e6)')
    await delay(300)
    screenshots['settings-bottom'] = await screenshot(main, dir, 'settings-bottom')
    Object.assign(screenshots, await smokeLayout(main, dir))
    Object.assign(screenshots, await smokeExams(main, dir))
    Object.assign(screenshots, await smokeOwnEvents(main, dir, report))
    Object.assign(screenshots, await smokeChanges(main, mini, dir, report))
    Object.assign(screenshots, await smokeTuwelExtras(main, dir))
    Object.assign(screenshots, await smokeThemes(main, dir))
    await smokeTrayMenu(report)
    Object.assign(screenshots, await smokeNotes(main, mini, dir, report))
    // smokeNotes ends by closing the main window.
    report['miniAfterClose'] = isMiniVisible()
    report['screenshots'] = screenshots

    const display = screen.getPrimaryDisplay()
    report['display'] = { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor }
    report['gpuAfterLoad'] = app.getGPUFeatureStatus().gpu_compositing
    report['secrets'] = secretsStatus()
    report['autostartEntry'] = autostartEntry()
    finish(0)
  } catch (error) {
    report['error'] = error instanceof Error ? error.stack : String(error)
    finish(1)
  }
}

/** Grades and ECTS, an announcement, Kreuzerl sheets, an appointment from TUWEL. */
async function smokeTuwelExtras(main: BrowserWindow, dir: string): Promise<Record<string, string>> {
  const shots: Record<string, string> = {}
  const js = (code: string): Promise<unknown> => main.webContents.executeJavaScript(code)
  const course = studiesData().courses.find((candidate) => candidate.key === '123.456')
  if (course) updateStudyCourse(course.key, course.semester, { grade: '2' })
  main.webContents.send(IPC.navigate, 'grades')
  await delay(1200)
  shots['grades'] = await screenshot(main, dir, 'grades')
  await js(`[...document.querySelectorAll('.task-card .task-body')].at(-1)?.click()`)
  await delay(400)
  await js('document.querySelector(".content").scrollTo(0, 1e6)')
  await delay(1200)
  shots['grades-tuwel'] = await screenshot(main, dir, 'grades-tuwel')
  main.webContents.send(IPC.navigate, 'today')
  await delay(600)
  await js(`document.querySelector('.announcement-head')?.click()`)
  await delay(300)
  await js(`document.querySelector('.announcements')?.scrollIntoView({ block: 'center' })`)
  await delay(1200)
  shots['today-announcement'] = await screenshot(main, dir, 'today-announcement')
  main.webContents.send(IPC.navigate, 'deadlines')
  await delay(600)
  await js(`[...document.querySelectorAll('.task-body')].find((b) => b.textContent.includes('Kreuzerlübung 1'))?.click()`)
  await js(`[...document.querySelectorAll('.task-body')].find((b) => b.textContent.includes('Kreuzerlübung 2'))?.click()`)
  await delay(300)
  await js(`[...document.querySelectorAll('.task-body')].find((b) => b.textContent.includes('Kreuzerlübung 2'))?.scrollIntoView({ block: 'start' })`)
  await delay(1200)
  shots['deadlines-kreuzerl'] = await screenshot(main, dir, 'deadlines-kreuzerl')
  await js('document.querySelector(".content").scrollTo(0, 1e6)')
  await delay(1200)
  shots['deadlines-kreuzerl-past'] = await screenshot(main, dir, 'deadlines-kreuzerl-past')
  main.webContents.send(IPC.navigate, 'calendar')
  await delay(600)
  await js(`document.querySelector('.fc-listMonth-button')?.click()`)
  await delay(400)
  await js(`document.querySelector('.fc-event.kind-appointment')?.click()`)
  await delay(1200)
  shots['calendar-appointment'] = await screenshot(main, dir, 'calendar-appointment')
  await js(`document.querySelector('.event-details .icon-button')?.click()`)
  await js(`document.querySelector('.fc-timeGridWeek-button')?.click()`)
  await delay(300)
  return shots
}

/** The colour schemes: the choice in the settings, then "Heute" in each scheme (and the calendar in one). */
async function smokeThemes(main: BrowserWindow, dir: string): Promise<Record<string, string>> {
  const shots: Record<string, string> = {}
  const original = getSettings()
  main.webContents.send(IPC.navigate, 'settings')
  await delay(400)
  await main.webContents.executeJavaScript(`document.querySelector('.palette-choices')?.scrollIntoView({ block: 'center' })`)
  await delay(1000)
  shots['settings-appearance'] = await screenshot(main, dir, 'settings-appearance')
  const schemes = [
    { themeMode: 'light', lightPalette: 'latte' },
    { themeMode: 'light', lightPalette: 'solarized' },
    { themeMode: 'dark', darkPalette: 'mocha' },
    { themeMode: 'dark', darkPalette: 'nord' }
  ] as const
  for (const scheme of schemes) {
    const name = 'lightPalette' in scheme ? scheme.lightPalette : scheme.darkPalette
    updateSettings(scheme)
    applyTheme()
    broadcast(IPC.stateChanged)
    for (const view of name === 'mocha' ? (['today', 'calendar'] as const) : (['today'] as const)) {
      main.webContents.send(IPC.navigate, view)
      await delay(1200)
      shots[`theme-${name}${view === 'today' ? '' : `-${view}`}`] = await screenshot(main, dir, `theme-${name}${view === 'today' ? '' : `-${view}`}`)
    }
  }
  updateSettings({ themeMode: original.themeMode, lightPalette: original.lightPalette, darkPalette: original.darkPalette })
  applyTheme()
  broadcast(IPC.stateChanged)
  await delay(500)
  return shots
}

/** Exam statuses by "<LVA number> <name>". */
function examReport(): Record<string, string> {
  const now = Date.now()
  return Object.fromEntries(examsData().exams.map((exam) => [`${exam.courseKey} ${exam.name}`, examStatus(exam, now)]))
}

/** The exams page with one exam opened and the folded-away group, and an exam in the calendar. */
async function smokeExams(main: BrowserWindow, dir: string): Promise<Record<string, string>> {
  const shots: Record<string, string> = {}
  const js = (code: string): Promise<unknown> => main.webContents.executeJavaScript(code)
  main.webContents.send(IPC.navigate, 'exams')
  await delay(600)
  await js(`document.querySelector('.exam-card .task-body')?.click()`)
  await delay(1500)
  shots['exams-open'] = await screenshot(main, dir, 'exams-open')
  await js(`document.querySelector('.task-section .group-toggle')?.click()`)
  await delay(400)
  await js('document.querySelector(".content").scrollTo(0, 1e6)')
  await delay(1500)
  shots['exams-other'] = await screenshot(main, dir, 'exams-other')
  main.webContents.send(IPC.navigate, 'calendar')
  await delay(600)
  await js(`document.querySelector('.fc-dayGridMonth-button')?.click()`)
  await delay(400)
  await js(`document.querySelector('.fc-event.kind-exam-option')?.click()`)
  await delay(1500)
  shots['calendar-exam'] = await screenshot(main, dir, 'calendar-exam')
  await js(`document.querySelector('.exam-details .icon-button')?.click()`)
  await js(`document.querySelector('.fc-timeGridWeek-button')?.click()`)
  await delay(300)
  return shots
}

/** Own appointments next to the TISS ones: a weekly study group and a single study block today. */
function addSampleOwnEvents(): void {
  const at = (days: number, hour: number): Date => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    date.setHours(hour, 0, 0, 0)
    return date
  }
  const until = at(42, 0)
  const day = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, '0')}-${String(until.getDate()).padStart(2, '0')}`
  addOwnEvent({ title: 'Lerngruppe', start: at(1, 16).toISOString(), end: at(1, 18).toISOString(), allDay: false, location: 'Bibliothek', courseKey: '234.567', repeatWeeklyUntil: day })
  addOwnEvent({ title: 'Lernblock', start: at(0, 19).toISOString(), end: at(0, 21).toISOString(), allDay: false, location: null, courseKey: null, repeatWeeklyUntil: null })
  calendarChanged()
}

/**
 * Linux: what GNOME's AppIndicator extension does on a click – tell sout's tray menu it opened.
 * The mini view has to come along, ticked in the menu; a click on that tick closes it again.
 */
async function smokeTrayMenu(report: Record<string, unknown>): Promise<void> {
  if (process.platform !== 'linux') return
  const run = (args: string[]): Promise<string> =>
    new Promise((resolve) => execFile(args[0]!, args.slice(1), { timeout: 5000 }, (error, stdout) => resolve(error ? '' : stdout)))
  let owner = ''
  for (let attempt = 0; attempt < 15 && !owner; attempt++) {
    const name = `org.freedesktop.StatusNotifierItem-${process.pid}-1`
    const answer = await run(['gdbus', 'call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.GetNameOwner', name])
    owner = /'(:[\d.]+)'/.exec(answer)?.[1] ?? ''
    if (!owner) await delay(200)
  }
  if (!owner) {
    report['trayMenu'] = 'kein Tray-Eintrag auf dem Sitzungsbus'
    return
  }
  // Only the start-up so far: GNOME has picked up the icon, nothing was clicked.
  const atStart = isMiniVisible()
  const menu = (method: string, ...args: string[]): Promise<string> =>
    // "--": arguments like -1 are not options of gdbus.
    run(['gdbus', 'call', '--session', '--dest', owner, '--object-path', '/com/canonical/dbusmenu', '--method', `com.canonical.dbusmenu.${method}`, '--', ...args])
  // What the extension sends when it picks up the icon – that must not open the mini view.
  await menu('AboutToShow', '0')
  await delay(1200)
  const quietOnPickup = !isMiniVisible()
  await menu('Event', '0', 'opened', '<int32 0>', '0')
  await delay(1200)
  const shownWithMenu = isMiniVisible()
  const item = /\((\d+), \{[^}]*'label': <'Mini-Ansicht'>[^}]*\}/.exec(await menu('GetLayout', '0', '-1', '@as []'))
  const tickedInMenu = Boolean(item && /'toggle-state': <1>/.test(item[0]))
  if (item) await menu('Event', item[1]!, 'clicked', '<int32 0>', '0')
  await delay(800)
  report['trayMenu'] = { closedAtStart: !atStart, quietOnPickup, shownWithMenu, tickedInMenu, closedFromMenu: !isMiniVisible() }
}

/** Drags a resize handle like a mouse would. */
async function drag(win: BrowserWindow, selector: string, index: number, dx: number): Promise<void> {
  const box = (await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)) as { x: number; y: number } | null
  if (!box) return
  win.webContents.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  for (let step = 1; step <= 5; step++) win.webContents.sendInputEvent({ type: 'mouseMove', x: box.x + (dx * step) / 5, y: box.y, button: 'left' })
  win.webContents.sendInputEvent({ type: 'mouseUp', x: box.x + dx, y: box.y, button: 'left', clickCount: 1 })
  await delay(300)
}

/** The main sidebar collapsed, then back. */
async function smokeLayout(main: BrowserWindow, dir: string): Promise<Record<string, string>> {
  const shots: Record<string, string> = {}
  main.webContents.send(IPC.navigate, 'today')
  await delay(400)
  await main.webContents.executeJavaScript(`document.querySelector('.collapse-toggle')?.click()`)
  await delay(1200)
  shots['sidebar-collapsed'] = await screenshot(main, dir, 'sidebar-collapsed')
  await main.webContents.executeJavaScript(`document.querySelector('.collapse-toggle')?.click()`)
  await delay(400)
  return shots
}

/** Own appointments in the calendar, their details and the form. */
async function smokeOwnEvents(main: BrowserWindow, dir: string, report: Record<string, unknown>): Promise<Record<string, string>> {
  const shots: Record<string, string> = {}
  const js = (code: string): Promise<unknown> => main.webContents.executeJavaScript(code)
  const own = calendarData().events.filter((event) => event.kind === 'own')
  report['ownEvents'] = { definitions: calendarData().own.length, occurrences: own.length }
  main.webContents.send(IPC.navigate, 'calendar')
  await delay(600)
  await js(`document.querySelector('.fc-timeGridWeek-button')?.click()`)
  await delay(400)
  // Two appointments at the same time today (test data): both marked.
  report['overlaps'] = await js(`document.querySelectorAll('.fc-timegrid-event.overlap').length`)
  await js(`document.querySelector('.fc-timegrid-event.overlap')?.scrollIntoView({ block: 'center' })`)
  await delay(800)
  shots['calendar-overlap'] = await screenshot(main, dir, 'calendar-overlap')
  await js(`document.querySelector('.fc-timegrid-event.kind-own')?.click()`)
  await delay(1500)
  shots['calendar-own'] = await screenshot(main, dir, 'calendar-own')
  await js(`[...document.querySelectorAll('.event-details .button')].find((b) => b.textContent.includes('Bearbeiten'))?.click()`)
  await delay(1500)
  shots['own-dialog'] = await screenshot(main, dir, 'own-dialog')
  await js(`document.querySelector('.modal-head .icon-button')?.click()`)
  await delay(300)
  return shots
}

/** A second sync with changed data: the changes show up on "Heute" (and as notifications). */
async function smokeChanges(main: BrowserWindow, mini: BrowserWindow, dir: string, report: Record<string, unknown>): Promise<Record<string, string>> {
  const shots: Record<string, string> = {}
  const tiss = process.env['SOUT_SMOKE_SECOND_TISS']
  const tuwel = process.env['SOUT_SMOKE_SECOND_TUWEL']
  if (tiss) process.env['SOUT_TISS_FILE'] = tiss
  if (tuwel) process.env['SOUT_TUWEL_FILE'] = tuwel
  if (tiss || tuwel) await Promise.all([syncCalendar(), syncTasks()])
  const pages = process.env['SOUT_SMOKE_SECOND_PAGES']
  if (pages) {
    process.env['SOUT_TISS_PAGES'] = pages
    await syncExams(true)
  }
  ;(report['exams'] as Record<string, unknown>)['second'] = examReport()
  const extras = tuwelExtras()
  const quiz = tasksData().tasks.find((task) => task.module === 'quiz')
  const sheet = extras.checkmarks.find((candidate) => candidate.name === 'Kreuzerlübung 2')
  report['tuwel'] = {
    announcements: extras.announcements.length,
    checkmarks: extras.checkmarks.length,
    gradedCourses: extras.grades.filter((course) => course.items.length > 0).length,
    appointments: calendarData().events.filter((event) => event.kind === 'appointment').length,
    bookings: tasksData().tasks.filter((task) => task.module === 'organizer').length,
    testRoom: quiz?.room ?? null,
    sheetTicked: sheet ? `${sheet.examples.filter((example) => example.checked).length} von ${sheet.examples.length}` : null
  }
  report['changes'] = changes().map((change) => `${change.kind}: ${change.title} – ${change.detail}`)
  main.webContents.send(IPC.navigate, 'today')
  await delay(1500)
  shots['today-news'] = await screenshot(main, dir, 'today-news')
  shots['mini-plan'] = await screenshot(mini, dir, 'mini-plan')
  return shots
}

const SAMPLE_NOTE = `# Vorlesung

**Beispielkunde** · Beispielraum

## Notizen

Satz des Pythagoras: $a^2 + b^2 = c^2$ – kommt zur #prüfung.

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

- [x] Folien durchgehen
- [ ] Beispiel 3 nachrechnen

| n | n² |
|---|----|
| 1 | 1  |
| 2 | 4  |

\`\`\`python
def quadrat(n):
    return n * n  # nur ein Beispiel
\`\`\`

## Offene Fragen

- Warum konvergiert die Reihe?
- Siehe [[Zusammenfassung]] und [[Formelsammlung]]
`

/** Notes: setup page, a lecture note with formulas, the PDF next to it, search, new-note dialog, quick note. */
async function smokeNotes(main: BrowserWindow, mini: BrowserWindow, dir: string, report: Record<string, unknown>): Promise<Record<string, string>> {
  const shots: Record<string, string> = {}
  const js = (code: string): Promise<unknown> => main.webContents.executeJavaScript(code)
  /** Sets an input or select the way typing would, so React notices. */
  const setValue = (selector: string, value: string): Promise<unknown> =>
    js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
      return true
    })()`)
  const clickButton = (selector: string, title: string): Promise<unknown> =>
    js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.title === ${JSON.stringify(title)})?.click()`)

  main.webContents.send(IPC.navigate, 'notes')
  await delay(2000)
  shots['notes-setup'] = await screenshot(main, dir, 'notes-setup')

  const setup = setupNotes(join(dir, 'Studium'))
  // TUWEL files go into the course folders, now that there are some.
  await syncTestMaterials()
  const lecture = calendarData().events.find((event) => event.id === '123.456-now') ?? calendarData().events.find((event) => event.kind === 'course')
  const lecturePath = lecture ? noteForEvent(lecture.id) : null
  if (lecturePath) writeNote(lecturePath, SAMPLE_NOTE, null)
  const pdfSource = join(dir, 'Folien-Beispiel.pdf')
  writeFileSync(pdfSource, await samplePdf())
  const [pdfPath] = await importPdfs(lecture?.courseKey ?? null, [pdfSource], null)
  const task = tasksData().tasks[0]
  const quick = quickNote('Frage an die Tutorin: Beispiel 3 #frage')
  // Without calendar data (installed package) the quick note in the Inbox is the note to open.
  const openPath = lecturePath ?? quick
  const status = async (url: string): Promise<number | string> => {
    try {
      return (await net.fetch(url)).status
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
  report['notes'] = {
    root: setup.root,
    files: readdirSync(setup.root!, { recursive: true }).map(String).sort(),
    lecturePath,
    pdfPath,
    quickNote: quick,
    taskNote: task ? noteForTask(task.id) : null,
    search: searchNotes('pythagoras'),
    tagSearch: searchNotes('#prüfung'),
    tags: notesData().tags,
    protocol: {
      pdf: pdfPath ? await status(`sout-file://notes/${pdfPath.split('/').map(encodeURIComponent).join('/')}`) : null,
      outside: await status('sout-file://notes/..%2F..%2Fetc%2Fhostname')
    }
  }

  main.webContents.send(IPC.navigate, 'notes', openPath)
  await delay(2000)
  shots['notes'] = await screenshot(main, dir, 'notes')
  await clickButton('.segmented button', 'Lesen')
  await delay(1500)
  shots['notes-preview'] = await screenshot(main, dir, 'notes-preview')
  await clickButton('.segmented button', 'Geteilt')
  if (pdfPath) await setValue('.slides-select select', pdfPath)
  await delay(3000)
  shots['notes-pdf'] = await screenshot(main, dir, 'notes-pdf')
  // Narrower list, wider PDF: drag the dividers.
  await drag(main, '.notes .resize-handle', 0, -60)
  await drag(main, '.note-panes .resize-handle', 0, -200)
  await delay(1500)
  shots['notes-resized'] = await screenshot(main, dir, 'notes-resized')
  report['notesLayout'] = await js(`({ tree: document.querySelector('.notes-sidebar')?.getBoundingClientRect().width, pdf: document.querySelector('.pdf-pane')?.getBoundingClientRect().width, editor: document.querySelector('.note-panes .pane')?.getBoundingClientRect().width })`)
  await setValue('.search-field input', 'pythagoras')
  await delay(1500)
  shots['notes-search'] = await screenshot(main, dir, 'notes-search')
  await setValue('.search-field input', '')
  await js(`document.querySelector('.notes-sidebar-head > .icon-button')?.click()`)
  await delay(1500)
  shots['notes-new'] = await screenshot(main, dir, 'notes-new')
  await js(`document.querySelector('.modal-head .icon-button')?.click()`)
  shots['mini-notes'] = await screenshot(mini, dir, 'mini-notes')
  // The assignment card, now with its notes button.
  main.webContents.send(IPC.navigate, 'deadlines')
  await delay(500)
  await js(`[...document.querySelectorAll('.task-body')].find((b) => b.getAttribute('aria-expanded') !== 'true')?.click()`)
  await delay(1500)
  shots['deadlines-note'] = await screenshot(main, dir, 'deadlines-note')
  ;(report['notes'] as Record<string, unknown>)['extras'] = await smokeNoteExtras(main, dir, openPath, shots)
  ;(report['notes'] as Record<string, unknown>)['editing'] = await smokeEditing(main, join(setup.root!, openPath), openPath)
  return shots
}

/** A pasted picture, [[links]] (one leads to a new note), the note as PDF. */
async function smokeNoteExtras(main: BrowserWindow, dir: string, path: string, shots: Record<string, string>): Promise<Record<string, unknown>> {
  const js = (code: string): Promise<unknown> => main.webContents.executeJavaScript(code)
  // A 1×1 PNG stands in for a screenshot.
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'))
  const image = saveNoteImage(path, png, 'image/png')
  const linked = createLinkedNote(path.slice(0, path.lastIndexOf('/')), 'Formelsammlung')
  main.webContents.send(IPC.navigate, 'notes', path)
  await delay(1500)
  await js(`[...document.querySelectorAll('.segmented button')].find((b) => b.title === 'Lesen')?.click()`)
  await delay(800)
  const missing = await js(`[...document.querySelectorAll('.markdown a.wikilink.missing')].map((a) => a.textContent)`)
  await js('document.querySelector(".note-preview")?.scrollTo(0, 1e6)')
  await delay(800)
  shots['notes-links'] = await screenshot(main, dir, 'notes-links')
  await js(`[...document.querySelectorAll('.segmented button')].find((b) => b.title === 'Geteilt')?.click()`)
  const pdf = await printNote(path)
  writeFileSync(join(dir, 'notiz.pdf'), pdf)
  return {
    image,
    imageExists: image.startsWith('Bilder/Bild-'),
    linked,
    // [[Zusammenfassung]] leads nowhere yet, [[Formelsammlung]] does now.
    missingLinks: missing,
    pdfPages: (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length
  }
}

/** Typing saves by itself, changes from outside show up, conflicts are caught, closing the window saves. Closes the main window. */
async function smokeEditing(main: BrowserWindow, file: string, path: string): Promise<Record<string, boolean>> {
  const js = (code: string): Promise<unknown> => main.webContents.executeJavaScript(code)
  const onDisk = (): string => readFileSync(file, 'utf8')
  const type = async (text: string): Promise<void> => {
    await js(`(() => {
      const el = document.querySelector('.cm-content')
      el.focus()
      const selection = window.getSelection()
      selection.selectAllChildren(el)
      selection.collapseToEnd()
    })()`)
    await main.webContents.insertText(text)
  }
  const result: Record<string, boolean> = {}
  main.webContents.send(IPC.navigate, 'notes', path)
  await delay(1000)

  await type(' Autosave-Test')
  await delay(1500)
  result['autosaved'] = onDisk().includes('Autosave-Test')

  writeFileSync(file, `${onDisk()}\nVon außen geändert\n`)
  await delay(1500)
  result['followsOutsideChange'] = ((await js(`document.querySelector('.cm-content').innerText`)) as string).includes('Von außen geändert')

  await type(' Tippen')
  writeFileSync(file, `${onDisk()}\nNochmal von außen\n`)
  await delay(1500)
  result['conflictShown'] = (await js(`document.body.innerText.includes('außerhalb von sout geändert')`)) as boolean
  result['conflictKeptOutsideVersion'] = onDisk().includes('Nochmal von außen') && !onDisk().includes('Tippen')
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Meine Fassung speichern'))?.click()`)
  await delay(1000)
  result['keepMineSaved'] = onDisk().includes('Tippen')

  await type(' Beim-Schliessen')
  main.close()
  await delay(1000)
  result['savedOnClose'] = onDisk().includes('Beim-Schliessen')
  return result
}

/** A one-page PDF made from a little HTML page – stands in for lecture slides. */
async function samplePdf(): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, width: 1000, height: 700 })
  const html = '<body style="font-family:sans-serif;padding:40px"><h1>Folie 1: Beispielkunde</h1><p>Satz des Pythagoras: a² + b² = c²</p></body>'
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const pdf = await win.webContents.printToPDF({ landscape: true })
  win.destroy()
  return pdf
}

function loaded(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => resolve())
    win.webContents.once('did-fail-load', () => resolve())
  })
}

async function screenshot(win: BrowserWindow, dir: string, name: string): Promise<string> {
  try {
    // Hidden windows repaint lazily; ask for a fresh frame first.
    win.webContents.invalidate()
    await delay(250)
    const image = await win.webContents.capturePage()
    if (image.isEmpty()) return 'empty'
    writeFileSync(join(dir, `${name}.png`), image.toPNG())
    const { width, height } = image.getSize()
    return `${width}x${height}`
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The dump tools run next to a running sout: a temporary profile folder of their own (two
 * processes on one profile block each other), but the encrypted tokens from the real one.
 */
function useOwnProfile(): { realUserData: string; done: () => void } {
  // A hidden login window closing would otherwise end the app before the tool is done.
  app.on('window-all-closed', () => {})
  const realUserData = app.getPath('userData')
  // Chromium may still write into the folder while exiting; clean up leftovers of earlier runs.
  for (const entry of readdirSync(app.getPath('temp'))) {
    if (entry.startsWith('sout-dump-')) rmSync(join(app.getPath('temp'), entry), { recursive: true, force: true })
  }
  const temp = join(app.getPath('temp'), `sout-dump-${process.pid}`)
  app.setPath('userData', temp)
  return { realUserData, done: () => rmSync(temp, { recursive: true, force: true }) }
}

/** `--dump-tiss=<file>` (development only): saves the raw TISS feed, to look at its format. */
export function tissDumpFile(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith('--dump-tiss='))
  return arg && !app.isPackaged ? arg.slice('--dump-tiss='.length) : null
}

export async function dumpTiss(file: string): Promise<void> {
  const profile = useOwnProfile()
  await app.whenReady()
  const token = getSecret('tissToken', profile.realUserData)
  if (token) writeFileSync(file, await fetchTissFeed(token))
  else console.error('Kein TISS-Token gespeichert.')
  profile.done()
  app.exit(token ? 0 : 1)
}

/**
 * `--dump-exams=<file>` (development only): reads the TISS pages of the courses in the stored
 * calendar, as the app does, and saves what came out. Prints only counts.
 */
export function examsDumpFile(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith('--dump-exams='))
  return arg && !app.isPackaged ? arg.slice('--dump-exams='.length) : null
}

export async function dumpExams(file: string): Promise<void> {
  const profile = useOwnProfile()
  // A copy of the stored calendar and course settings; the running app keeps its own.
  for (const name of ['calendar.json', 'courses.json']) {
    const source = join(profile.realUserData, name)
    if (existsSync(source)) cpSync(source, join(app.getPath('userData'), name))
  }
  await app.whenReady()
  let code = 0
  try {
    await syncExams(true)
    const data = examsData()
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
    const counts: Record<string, number> = {}
    for (const exam of data.exams) counts[examStatus(exam, Date.now())] = (counts[examStatus(exam, Date.now())] ?? 0) + 1
    console.log(`[exams] ${data.courses} LVAs, ${data.exams.length} Prüfungstermine ${JSON.stringify(counts)}, nicht lesbar: ${data.failed.length}`)
    console.log(`[exams] ECTS/TUWEL-Link je LVA: ${calendarData().courses.map((course) => `${course.ects ?? '?'}/${course.tuwelUrl ? 'ja' : 'nein'}`).join(', ')}`)
    console.log(`[exams] Fristen: ${data.deadlines.map((deadline) => `${deadline.kind}${deadline.groups.length ? ` (${deadline.groups.length} Gruppen)` : ''}`).join(', ') || 'keine'}`)
    for (const failed of data.failed) console.log(`[exams]   ${failed.courseKey}: ${failed.error}`)
  } catch (error) {
    console.log(`[exams] failed: ${error instanceof Error ? error.message : String(error)}`)
    code = 1
  } finally {
    profile.done()
    app.exit(code)
  }
}

/** `--dump-tuwel=<file>` (development only): saves what TUWEL returns, for SOUT_TUWEL_FILE. */
export function tuwelDumpFile(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith('--dump-tuwel='))
  return arg && !app.isPackaged ? arg.slice('--dump-tuwel='.length) : null
}

export async function dumpTuwel(file: string): Promise<void> {
  const profile = useOwnProfile()
  await app.whenReady()
  const token = getSecret('tuwelToken', profile.realUserData)
  let code = 0
  try {
    if (!token) throw new Error('Nicht bei TUWEL angemeldet.')
    // Only the shape, never the token itself: Moodle tokens are 32 hex characters.
    console.error(`[dump] token: ${token.length} characters, hex: ${/^[0-9a-f]+$/.test(token)}`)
    writeFileSync(file, `${JSON.stringify(await fetchSnapshot(token), null, 2)}\n`)
    console.error(`[dump] saved ${file}`)
  } catch (error) {
    console.error('[dump] failed:', error instanceof TuwelError ? `${error.code}: ${error.message}` : error)
    code = 1
  } finally {
    profile.done()
    app.exit(code)
  }
}

/** `--probe-tuwel` (development only): is the stored TUWEL token still accepted? Prints one line, no secrets. */
export function isTuwelProbe(argv: string[]): boolean {
  return argv.includes('--probe-tuwel') && !app.isPackaged
}

export async function probeTuwel(): Promise<void> {
  const profile = useOwnProfile()
  await app.whenReady()
  const token = getSecret('tuwelToken', profile.realUserData)
  const cache = readJson(join(profile.realUserData, 'tuwel.json')) as { tokenIssuedAt?: string } | undefined
  const age = cache?.tokenIssuedAt ? Math.round((Date.now() - Date.parse(cache.tokenIssuedAt)) / 60_000) : null
  let result: string
  try {
    if (!token) throw new Error('kein Token')
    await tuwelCall(token, 'core_webservice_get_site_info')
    result = 'gültig'
  } catch (error) {
    result = error instanceof TuwelError ? `abgelehnt (${error.code}): ${error.message}` : String(error)
  }
  console.log(`[probe] ${new Date().toISOString()} ${result} – Schlüssel-Alter: ${age ?? '?'} min`)
  profile.done()
  app.exit(0)
}

/**
 * `--tuwel-calls=<file>` (development only): calls the TUWEL web service functions listed in
 * SOUT_TUWEL_CALLS (JSON: [["core_webservice_get_site_info", {}], …]) with a fresh token from a copy
 * of the stored login and saves the answers – to look at what TUWEL offers. Prints only counts.
 */
export function tuwelCallsFile(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith('--tuwel-calls='))
  return arg && !app.isPackaged ? arg.slice('--tuwel-calls='.length) : null
}

export async function tuwelCalls(file: string): Promise<void> {
  const profile = useOwnProfile()
  cpSync(join(profile.realUserData, 'Partitions', 'tuwel'), join(app.getPath('userData'), 'Partitions', 'tuwel'), { recursive: true })
  await app.whenReady()
  let code = 0
  try {
    const calls = JSON.parse(process.env['SOUT_TUWEL_CALLS'] ?? '[]') as [string, Record<string, unknown>][]
    const token = await trySilent('session')
    const answers: { call: string; args: Record<string, unknown>; result?: unknown; error?: string }[] = []
    for (const [name, args] of calls) {
      try {
        answers.push({ call: name, args, result: await tuwelCall(token, name, args) })
      } catch (error) {
        answers.push({ call: name, args, error: error instanceof TuwelError ? `${error.code}: ${error.message}` : String(error) })
      }
    }
    writeFileSync(file, `${JSON.stringify(answers, null, 2)}\n`)
    console.log(`[tuwel] ${answers.length} Aufrufe, ${answers.filter((answer) => answer.error).length} mit Fehler`)
  } catch (error) {
    console.log(`[tuwel] failed: ${error instanceof Error ? error.message : String(error)}`)
    code = 1
  } finally {
    profile.done()
    app.exit(code)
  }
}

/** `--try-renewal[=session|sso]` (development only): one silent token attempt with a copy of the stored login. */
export function tryRenewalArg(argv: string[]): 'session' | 'sso' | null {
  const arg = argv.find((value) => value === '--try-renewal' || value.startsWith('--try-renewal='))
  if (!arg || app.isPackaged) return null
  return arg.endsWith('=sso') ? 'sso' : 'session'
}

export async function tryRenewal(via: 'session' | 'sso'): Promise<void> {
  const profile = useOwnProfile()
  // A copy of the stored login cookies; the running app keeps using its own.
  cpSync(join(profile.realUserData, 'Partitions', 'tuwel'), join(app.getPath('userData'), 'Partitions', 'tuwel'), { recursive: true })
  await app.whenReady()
  try {
    await trySilent(via)
    console.log(`[renewal] ${via}: Token erhalten`)
  } catch (error) {
    console.log(`[renewal] ${via}: fehlgeschlagen – ${error instanceof Error ? error.message : String(error)}`)
  }
  for (const line of lastLoginTrace()) console.log(`[renewal]   ${line}`)
  profile.done()
  app.exit(0)
}
