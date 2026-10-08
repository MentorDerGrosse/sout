// Runs sout's smoke test with made-up data: two TISS syncs (the second with a room change, a moved,
// a dropped appointment and a new exam date) and two TUWEL syncs (the second with a new assignment).
// Usage: npm run build && npm run smoke [-- <folder>]     (default folder: ./smoke)
// Needs a display; on a Linux server: xvfb-run -a npm run smoke
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(process.argv[2] ?? join(root, 'smoke'))
const data = join(dir, 'data')
rmSync(dir, { recursive: true, force: true })
mkdirSync(data, { recursive: true })

// ---------- Test data, relative to now ----------

const now = new Date()
now.setSeconds(0, 0)
const day = (offset, hours = 0, minutes = 0) => {
  const date = new Date(now)
  date.setDate(date.getDate() + offset)
  date.setHours(hours, minutes, 0, 0)
  return date
}
const monday = day(-((now.getDay() + 6) % 7))
const courses = [
  ['123.456', 'VO', 'Beispielkunde', 'HS 1 Beispielhörsaal - BSP'],
  ['234.567', 'VU', 'Einführung in die Beispielmathematik', 'Seminarraum 2 - BSP'],
  ['345.678', 'UE', 'Grundlagen der Musterrechnung', 'HS 3 - BSP']
]

function tissEvents() {
  const events = []
  for (let week = 0; week < 3; week++) {
    courses.forEach(([key, type, title, room], index) => {
      for (const weekday of [index % 3, (index % 3) + 2]) {
        const start = new Date(monday)
        start.setDate(start.getDate() + week * 7 + weekday)
        start.setHours(9 + 2 * index, 0, 0, 0)
        events.push({ uid: `${key}-${week}-${weekday}`, category: 'COURSE', summary: `${key} ${type} ${title}`, start, minutes: 90, room, description: `${key} ${type} ${title}` })
      }
    })
  }
  // One running right now, so "Läuft gerade" shows up.
  events.push({ uid: '123.456-now', category: 'COURSE', summary: '123.456 VO Beispielkunde', start: new Date(now.getTime() - 30 * 60_000), minutes: 120, room: courses[0][3], description: 'Vorlesung' })
  events.push({ uid: '234.567-group', category: 'GROUP', summary: '234.567 VU Einführung in die Beispielmathematik - Übungsgruppe 2', start: day(1, 13), minutes: 90, room: courses[1][3] })
  events.push({ uid: '234.567-exam', category: 'EXAM_SLOT', summary: '234.567 VU Einführung in die Beispielmathematik - Test 1', start: day(21, 10), minutes: 90, room: courses[0][3] })
  return events
}

/** The second sync: room change, moved, dropped, new exam date. */
function changed(events) {
  return [
    ...events
      .filter((event) => event.uid !== '234.567-1-1')
      .map((event) => {
        if (event.uid === '123.456-1-0') return { ...event, room: 'HS 7 Ausweichsaal - BSP' }
        if (event.uid === '345.678-1-2') return { ...event, start: new Date(event.start.getTime() + 60 * 60_000) }
        return event
      }),
    { uid: '123.456-exam', category: 'EXAM_SLOT', summary: '123.456 VO Beispielkunde - Prüfung', start: day(30, 9), minutes: 120, room: courses[0][3] }
  ]
}

const icalTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`
}

function ical(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sout smoke//DE']
  for (const event of events) {
    const end = new Date(event.start.getTime() + event.minutes * 60_000)
    // Local wall-clock time of this machine, given as Vienna time – fine for a test.
    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `CATEGORIES:${event.category}`, `SUMMARY:${event.summary}`)
    lines.push(`DTSTART;TZID=Europe/Vienna:${icalTime(event.start)}`, `DTEND;TZID=Europe/Vienna:${icalTime(end)}`, `LOCATION:${event.room}`)
    if (event.description) lines.push(`DESCRIPTION:${event.description}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

function tuwel(extra) {
  const ts = (offsetHours) => Math.round(now.getTime() / 1000 + offsetHours * 3600)
  const eb = { id: 1, fullname: 'Einführung in die Beispielmathematik', shortname: '234.567-2026W' }
  const bk = { id: 2, fullname: 'Beispielkunde', shortname: '123.456-2026W' }
  const event = (id, name, module, instance, eventtype, hours, course, actionable = true) => ({
    id, name, activityname: name, modulename: module, instance, eventtype, timesort: ts(hours), course,
    url: `https://tuwel.example/mod/${module}/view.php?id=${id}`,
    action: { name: 'Abgabe hinzufügen', url: `https://tuwel.example/mod/${module}/view.php?id=${id}`, actionable }
  })
  const events = [
    event(11, 'Übungsblatt 3', 'assign', 5, 'due', 20, eb),
    event(12, 'Übungsblatt 2 – Abgabe der schriftlichen Ausarbeitung zu Folgen, Reihen und Grenzwerten', 'assign', 6, 'due', 73, bk),
    event(13, 'Test 1 (Online-Test im TUWEL, Zeitfenster 90 Minuten)', 'quiz', 7, 'open', 24, bk, false),
    event(14, 'Test 1 (Online-Test im TUWEL, Zeitfenster 90 Minuten)', 'quiz', 7, 'close', 26, bk, false)
  ]
  if (extra) events.push(event(15, 'Übungsblatt 4', 'assign', 8, 'due', 9 * 24, eb))
  return { site: { userid: 1, fullname: 'Test Person' }, events, assignments: [], quizzes: [], submissions: {} }
}

const tiss = tissEvents()
writeFileSync(join(data, 'tiss.ics'), ical(tiss))
writeFileSync(join(data, 'tiss-changed.ics'), ical(changed(tiss)))
writeFileSync(join(data, 'tuwel.json'), JSON.stringify(tuwel(false), null, 2))
writeFileSync(join(data, 'tuwel-new.json'), JSON.stringify(tuwel(true), null, 2))

// ---------- Run ----------

const electron = createRequire(import.meta.url)('electron')
const args = [root, '--lang=de-AT', `--smoke-test=${dir}`]
if (process.platform === 'linux') args.splice(1, 0, '--ozone-platform=x11')
const run = spawnSync(electron, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SOUT_TISS_FILE: join(data, 'tiss.ics'),
    SOUT_TUWEL_FILE: join(data, 'tuwel.json'),
    SOUT_SMOKE_SECOND_TISS: join(data, 'tiss-changed.ics'),
    SOUT_SMOKE_SECOND_TUWEL: join(data, 'tuwel-new.json')
  }
})

let report
try {
  report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))
} catch {
  console.error(`Kein report.json – sout ist nicht durchgelaufen (Exit-Code ${run.status}).`)
  process.exit(1)
}
const problems = []
if (report.error) problems.push(`Fehler: ${report.error}`)
for (const [check, ok] of Object.entries(report.notes?.editing ?? {})) if (!ok) problems.push(`Notizen: ${check} fehlgeschlagen`)
if ((report.changes ?? []).length < 5) problems.push(`Nur ${(report.changes ?? []).length} von 5 erwarteten Änderungen erkannt`)
if (report.notes?.protocol?.pdf !== 200 || report.notes?.protocol?.outside !== 404) problems.push(`sout-file: ${JSON.stringify(report.notes?.protocol)}`)
// Linux with a tray host (GNOME): the mini view opens with the tray menu and closes from it.
if (report.trayMenu && typeof report.trayMenu === 'object') {
  for (const [check, ok] of Object.entries(report.trayMenu)) if (!ok) problems.push(`Tray-Menü: ${check} fehlgeschlagen`)
}
if (report.miniAfterClose === false) problems.push('Nach dem Schließen des Hauptfensters ist die Mini-Ansicht nicht aufgegangen')
const failedShots = Object.entries(report.screenshots ?? {}).filter(([, result]) => !/^\d+x\d+$/.test(result))
if (failedShots.length > 0) problems.push(`Screenshots: ${failedShots.map(([name, result]) => `${name} (${result})`).join(', ')}`)

console.log(`\n${Object.keys(report.screenshots ?? {}).length} Screenshots in ${dir}`)
if (report.trayMenu) console.log(`  Tray-Menü: ${JSON.stringify(report.trayMenu)}`)
for (const change of report.changes ?? []) console.log(`  erkannt: ${change}`)
if (problems.length > 0) {
  console.error(`\nTestlauf mit Problemen:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('Testlauf ok.')
