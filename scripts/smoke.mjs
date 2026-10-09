// Runs sout's smoke test with made-up data: two TISS syncs (the second with a room change, a moved,
// a dropped appointment and a new exam date), TISS course pages with exam dates and registration
// windows (the second time with one more) and two TUWEL syncs (the second with a new assignment).
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
// LVA number, type, title, room, ECTS, TUWEL course id (all made up).
const courses = [
  ['123.456', 'VO', 'Beispielkunde', 'HS 1 Beispielhörsaal - BSP', '3.0', 9001],
  ['234.567', 'VU', 'Einführung in die Beispielmathematik', 'Seminarraum 2 - BSP', '5.5', 9002],
  ['345.678', 'UE', 'Grundlagen der Musterrechnung', 'HS 3 - BSP', '4.0', 9003]
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
  // Test 1 of 123.456 in a lecture hall – the TUWEL test (tomorrow, 2 hours) gets this room. Long, so a
  // different time zone on the test machine (these times are local, given as Vienna time) can't miss it.
  events.push({ uid: '123.456-test1', category: 'EXAM_SLOT', summary: '123.456 VO Beispielkunde - Test 1', start: new Date(now.getTime() + 21 * 3600_000), minutes: 480, room: 'HS 7 Ausweichsaal - BSP' })
  // Two appointments at the same time today: marked as overlapping.
  events.push({ uid: '123.456-extra', category: 'COURSE', summary: '123.456 VO Beispielkunde', start: day(0, 17), minutes: 90, room: courses[0][3], description: 'Vorlesung - Zusatztermin' })
  events.push({ uid: '345.678-extra', category: 'COURSE', summary: '345.678 UE Grundlagen der Musterrechnung', start: day(0, 17, 30), minutes: 60, room: courses[2][3], description: 'Übung - Zusatztermin' })
  // Taken last week.
  events.push({ uid: '345.678-exam', category: 'EXAM_SLOT', summary: '345.678 UE Grundlagen der Musterrechnung - Kolloquium', start: day(-7, 10), minutes: 60, room: courses[2][3] })
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

// ---------- TISS course pages: exam dates and registration windows ----------

const ROOMS = {
  hs1: { name: courses[0][3], code: 'BSP01' },
  hs7: { name: 'HS 7 Ausweichsaal - BSP', code: 'BSP07' },
  sem2: { name: courses[1][3], code: 'BSP02' },
  hs3: { name: courses[2][3], code: 'BSP03' }
}

/** Per course; the comment says what sout should make of it (smoke checks it). */
function exams(second) {
  const closesSoon = new Date(now.getTime() + 20 * 60 * 60_000)
  return {
    '123.456': [
      // open, closes within a day; registered after the second TISS sync ("123.456-exam")
      { name: 'Prüfung', start: day(30, 9), minutes: 120, rooms: [ROOMS.hs1, ROOMS.hs7], opens: day(-2, 8), closes: closesSoon },
      { name: 'Prüfung (2. Termin)', start: day(60, 9), minutes: 120, rooms: [ROOMS.hs1], opens: day(45, 8), closes: day(58, 23, 59) }
    ],
    '234.567': [
      // registered ("234.567-exam" in the calendar), and the same test in another room at the same time
      { name: 'Test 1', start: day(21, 10), minutes: 90, rooms: [ROOMS.hs1], opens: day(-10, 8), closes: day(14, 23, 59) },
      { name: 'Test 1 – Ersatzraum', start: day(21, 10), minutes: 90, rooms: [ROOMS.sem2], opens: day(-10, 8), closes: day(14, 23, 59) },
      // opens in three days
      { name: 'Test 2', start: day(50, 10), minutes: 90, rooms: [ROOMS.hs1, ROOMS.sem2], opens: day(3, 8), closes: day(45, 23, 59) },
      // new the second time: reported as news
      ...(second ? [{ name: 'Test 2 (2. Termin)', start: day(80, 10), minutes: 90, rooms: [ROOMS.hs1], opens: day(70, 8), closes: day(78, 23, 59) }] : [])
    ],
    '345.678': [
      // the window is over
      { name: 'Zwischentest', start: day(3, 14), minutes: 60, rooms: [ROOMS.hs3], opens: day(-14, 8), closes: day(-1, 12) },
      { name: 'Abschlusstest', start: day(12, 14), minutes: 120, rooms: [ROOMS.hs3], opens: day(-5, 8), closes: day(4, 23, 59) },
      // no registration window
      { name: 'Mündliche Prüfung', start: day(40, 13), minutes: 30, rooms: [ROOMS.hs3], mode: 'mündlich', registration: 'nach Vereinbarung', opens: null },
      // taken last week ("345.678-exam" in the calendar): this date isn't needed
      { name: 'Kolloquium', start: day(25, 10), minutes: 60, rooms: [ROOMS.hs3], mode: 'mündlich', opens: day(-3, 8), closes: day(20, 23, 59) }
    ]
  }
}

/** LVA registration (with the last day to deregister) and group registration per course. */
function registrations() {
  const closesSoon = new Date(now.getTime() + 20 * 60 * 60_000)
  return {
    // deregistration still possible – shown; no groups
    '123.456': { lva: { opens: day(-30, 0), closes: day(-5, 23, 59), deregister: day(20, 23, 59) }, groups: [] },
    // in a group already ("234.567-group" in the calendar) – its group windows aren't shown; deregistration is over
    '234.567': {
      lva: { opens: day(-30, 0), closes: day(-5, 23, 59), deregister: day(-3, 23, 59) },
      groups: [{ name: 'Übungsgruppe 1', opens: day(-1, 8), closes: closesSoon }]
    },
    // no group yet: two groups open (closing within a day), one later; no LVA table
    '345.678': {
      lva: null,
      groups: [
        { name: 'Gruppe 1', opens: day(-1, 18), closes: closesSoon },
        { name: 'Gruppe 2', opens: day(-1, 18), closes: closesSoon },
        { name: 'Gruppe 3', opens: day(10, 8), closes: day(15, 23, 59) }
      ]
    }
  }
}

const pad = (n) => String(n).padStart(2, '0')
const tissDay = (date) => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
const tissTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.']

/** Like TISS's course page: facts, exams (one table row per room), groups and their dates, LVA and group registration. */
function coursePage([key, type, title, , ects, tuwelId], list, registration) {
  const heads = ['Tag', 'Zeit', 'Datum', 'Ort', 'Prüfungsmodus', 'Anmeldefrist', 'Anmeldung', 'Prüfung']
  let index = 0
  const rows = list.flatMap((exam) =>
    exam.rooms.map((room) => {
      const end = new Date(exam.start.getTime() + exam.minutes * 60_000)
      const window = exam.opens ? `${tissDay(exam.opens)} ${tissTime(exam.opens)} - ${tissDay(exam.closes)} ${tissTime(exam.closes)}` : ''
      const cells = [
        WEEKDAYS[exam.start.getDay()],
        `${tissTime(exam.start)} - ${tissTime(end)}`,
        tissDay(exam.start),
        `<a href="/events/roomSchedule.xhtml?roomCode=${room.code}&amp;initialDate=20300101" target="_blank">${room.name}</a> `,
        exam.mode ?? 'schriftlich',
        `<span id="exams:${index}:ExamRegDatePnlGrp">${window}</span>`,
        exam.registration ?? 'in TISS',
        exam.name
      ]
      return `<tr data-ri="${index++}" class="ui-widget-content">${cells.map((cell) => `<td role="gridcell" class="">${cell}</td>`).join('')}</tr>`
    })
  )
  const th = (head) => `<th class="ui-state-default" aria-label="${head}" scope="col"><span class="ui-column-title">${head}</span></th>`
  return `<!DOCTYPE html>
<html><head><title>${key} ${title} | TU Wien</title></head><body>
<h1>${key} ${type} ${title}</h1>
<h2>Merkmale</h2><div><span>Semesterwochenstunden: 2.0</span> <span>ECTS: ${ects}</span> <span>Typ: ${type}</span> <span>LectureTube Lehrveranstaltung</span></div>
<p><a href="https://tuwel.tuwien.ac.at/course/view.php?id=${tuwelId}">TUWEL</a></p>
<h2>Prüfungen</h2><div class="ui-datatable"><table role="grid"><thead><tr>${heads.map(th).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>
<h2>Gruppen &amp; Termine</h2><div class="ui-datatable"><table role="grid"><thead><tr>${th('Gruppe')}${th('Datum')}</tr></thead>
<tbody><tr data-ri="0" class="ui-widget-content"><td role="gridcell">Gruppe 1</td><td role="gridcell">${tissDay(day(5))}</td></tr></tbody></table></div>
<h2>LVA-Anmeldung</h2>
${
  registration.lva
    ? `<table class="standard big"><thead><tr><th>Von</th><th>Bis</th><th>Abmeldung bis</th></tr></thead>
<tr><td>${moment(registration.lva.opens)} </td><td>${moment(registration.lva.closes)} </td><td>${moment(registration.lva.deregister)} </td></tr></table>`
    : '<p>Die Anmeldung erfolgt über Gruppen-Anmeldung. </p>'
}
<h2>Gruppen-Anmeldung</h2><div class="ui-datatable"><table role="grid"><thead><tr>${th('Gruppe')}${th('Anmeldung Von')}${th('Bis')}</tr></thead>
<tbody>${registration.groups
    .map((group, row) => `<tr data-ri="${row}" class="ui-widget-content"><td role="gridcell">${group.name}</td><td role="gridcell">${moment(group.opens)}</td><td role="gridcell">${moment(group.closes)}</td></tr>`)
    .join('')}</tbody></table></div>
<h2>Curricula</h2>
</body></html>
`
}

const moment = (date) => `${tissDay(date)} ${tissTime(date)}`

function writePages(folder, second) {
  mkdirSync(folder, { recursive: true })
  const list = exams(second)
  const registration = registrations()
  for (const course of courses) {
    writeFileSync(join(folder, `${course[0].replace('.', '')}.html`), coursePage(course, list[course[0]] ?? [], registration[course[0]]))
  }
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
  // A Kreuzerlübung: its link carries the same id as its sheet below.
  events.push({ ...event(16, 'Kreuzerlübung 2', 'checkmark', 3, 'due', 48, eb), url: 'https://tuwel.example/mod/checkmark/view.php?id=31' })
  if (extra) events.push(event(15, 'Übungsblatt 4', 'assign', 8, 'due', 9 * 24, eb))
  return { site: { userid: 1, fullname: 'Test Person' }, events, assignments: [], quizzes: [], submissions: {}, extras: tuwelExtras(extra, ts, eb, bk) }
}

/** Announcements, Kreuzerl sheets, a booked appointment and a booking period, grades – as TUWEL answers. */
function tuwelExtras(extra, ts, eb, bk) {
  return {
    courses: [eb, bk],
    forums: [
      { id: 21, course: bk.id, type: 'news' },
      { id: 22, course: eb.id, type: 'news' }
    ],
    discussions: {
      21: [{ discussion: 501, name: 'Vorlesung am Montag entfällt', message: '<p>Liebe Studierende,</p><p>die Vorlesung am Montag entfällt. Bitte nutzt die Aufzeichnung.</p>', created: ts(-5), userfullname: 'Lehrende Beispielperson' }],
      22: [
        // new the second time: reported as news
        ...(extra ? [{ discussion: 503, name: 'Raumänderung für die Übung', message: '<p>Die Übung findet diesmal im HS 7 statt.</p>', created: ts(-1), userfullname: 'Tutorin Muster' }] : []),
        { discussion: 502, name: 'Anmeldung zu den Übungsgruppen', message: '<p>Bitte meldet euch bis Freitag an.</p>', created: ts(-50), userfullname: 'Tutorin Muster', pinned: true }
      ]
    },
    checkmarks: [
      {
        id: 31, instance: 3, course: eb.id, name: 'Kreuzerlübung 2', timedue: ts(48), cutoffdate: ts(48), submission_timemodified: ts(-2),
        examples: [{ id: 1, name: '1a', checked: 1 }, { id: 2, name: '1b', checked: 1 }, { id: 3, name: '2', checked: 0 }, { id: 4, name: '3', checked: 1 }],
        feedback: null
      },
      {
        id: 32, instance: 4, course: eb.id, name: 'Kreuzerlübung 1', timedue: ts(-6 * 24), cutoffdate: ts(-6 * 24), submission_timemodified: ts(-7 * 24),
        examples: [{ id: 5, name: '1', checked: 1 }, { id: 6, name: '2a', checked: 1 }, { id: 7, name: '2b', checked: 0 }],
        feedback: { grade: '2.00000', feedback: '<p>Beispiel 1 gut präsentiert.</p>' }
      }
    ],
    calendar: [
      {
        id: 41, name: `${eb.fullname} / Abgabegespräche: Appointment`, courseid: eb.id, modulename: 'organizer', instance: 5, eventtype: 'Appointment', timestart: ts(50), timeduration: 900,
        description: `${eb.fullname} / Abgabegespräche: Appointment with Tutorin Muster<br />Location: Seminarraum 2<br />`
      },
      { id: 42, name: 'Registration start: Sprechstunde', courseid: bk.id, modulename: 'organizer', instance: 6, eventtype: 'Instance', timestart: ts(-24), timeduration: 0 },
      { id: 43, name: 'Registration end: Sprechstunde', courseid: bk.id, modulename: 'organizer', instance: 6, eventtype: 'Instance', timestart: ts(72), timeduration: 0 }
    ],
    grades: {
      [eb.id]: [
        { id: 61, itemname: 'Kreuzerlübung 1', itemtype: 'mod', graderaw: 2, gradeformatted: '2,00', rangeformatted: '0,00–3,00', percentageformatted: '66,67 %', feedback: '<p>Beispiel 1 gut präsentiert.</p>', gradedategraded: ts(-48) },
        // new the second time
        ...(extra ? [{ id: 62, itemname: 'Test 1', itemtype: 'mod', graderaw: 8, gradeformatted: '8,00', rangeformatted: '0,00–10,00', percentageformatted: '80,00 %', feedback: '', gradedategraded: ts(-1) }] : []),
        { id: 60, itemname: null, itemtype: 'course', graderaw: 2, gradeformatted: '2,00' }
      ],
      [bk.id]: [
        { id: 71, itemname: 'Übungsblatt 1', itemtype: 'mod', graderaw: 8.5, gradeformatted: '8,50', rangeformatted: '0,00–10,00', percentageformatted: '85,00 %', feedback: '<p>Sauber gelöst, bei 2b fehlt die Begründung.</p>', gradedategraded: ts(-72) }
      ]
    }
  }
}

const tiss = tissEvents()
writeFileSync(join(data, 'tiss.ics'), ical(tiss))
writeFileSync(join(data, 'tiss-changed.ics'), ical(changed(tiss)))
writeFileSync(join(data, 'tuwel.json'), JSON.stringify(tuwel(false), null, 2))
writeFileSync(join(data, 'tuwel-new.json'), JSON.stringify(tuwel(true), null, 2))
writePages(join(data, 'pages'), false)
writePages(join(data, 'pages-second'), true)

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
    SOUT_SMOKE_SECOND_TUWEL: join(data, 'tuwel-new.json'),
    SOUT_TISS_PAGES: join(data, 'pages'),
    SOUT_SMOKE_SECOND_PAGES: join(data, 'pages-second')
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
if ((report.changes ?? []).length < 6) problems.push(`Nur ${(report.changes ?? []).length} von 6 erwarteten Änderungen erkannt`)
// What sout should make of the exam dates on the course pages (see exams() above).
const expectedExams = {
  first: {
    '123.456 Prüfung': 'open',
    '123.456 Prüfung (2. Termin)': 'soon',
    '234.567 Test 1': 'registered',
    '234.567 Test 1 – Ersatzraum': 'covered',
    '234.567 Test 2': 'soon',
    '345.678 Zwischentest': 'closed',
    '345.678 Abschlusstest': 'open',
    '345.678 Mündliche Prüfung': 'none',
    '345.678 Kolloquium': 'covered'
  },
  second: { '123.456 Prüfung': 'registered', '234.567 Test 2 (2. Termin)': 'soon' }
}
for (const [sync, expected] of Object.entries(expectedExams)) {
  for (const [exam, status] of Object.entries(expected)) {
    const found = report.exams?.[sync]?.[exam]
    if (found !== status) problems.push(`Prüfung ${exam} (${sync === 'first' ? 'erste' : 'zweite'} Abfrage): ${found ?? 'fehlt'} statt ${status}`)
  }
}
// ECTS and TUWEL link from the course pages, in the course list.
const expectedInfo = courses.map(([key, , , , ects, tuwelId]) => `${key} ${Number(ects)} ECTS https://tuwel.tuwien.ac.at/course/view.php?id=${tuwelId}`)
if (JSON.stringify(report.courseInfo) !== JSON.stringify(expectedInfo)) problems.push(`LVA-Angaben: ${JSON.stringify(report.courseInfo)}`)
// TUWEL beyond deadlines.
const expectedTuwel = { announcements: 3, checkmarks: 2, gradedCourses: 2, appointments: 1, bookings: 1, testRoom: 'HS 7 Ausweichsaal - BSP', sheetTicked: '3 von 4' }
for (const [key, value] of Object.entries(expectedTuwel)) {
  if (report.tuwel?.[key] !== value) problems.push(`TUWEL ${key}: ${JSON.stringify(report.tuwel?.[key])} statt ${JSON.stringify(value)}`)
}
for (const news of ['announcement: Neue Ankündigung: Raumänderung für die Übung', 'grade: Neue Bewertung: Test 1']) {
  if (!(report.changes ?? []).some((change) => change.startsWith(news))) problems.push(`Nicht gemeldet: ${news}`)
}
if (!(report.overlaps >= 2)) problems.push(`Überschneidungen: ${report.overlaps} statt mindestens 2 markierte Termine`)
const examCount = Object.keys(report.exams?.first ?? {}).length
if (examCount !== Object.keys(expectedExams.first).length) problems.push(`${examCount} statt ${Object.keys(expectedExams.first).length} Prüfungstermine gelesen`)
if (!(report.changes ?? []).some((change) => change.startsWith('exam: Neue Prüfung in TISS'))) problems.push('Neuer Prüfungstermin in TISS nicht gemeldet')
// Group registrations only where you are in no group yet; deregistration only while still possible.
// Soonest first: the opening if still ahead, otherwise the end.
const expectedDeadlines = ['345.678 group Gruppe 1+Gruppe 2 open', '345.678 group Gruppe 3 soon', '123.456 deregister']
if (JSON.stringify(report.deadlines) !== JSON.stringify(expectedDeadlines)) problems.push(`Fristen: ${JSON.stringify(report.deadlines)} statt ${JSON.stringify(expectedDeadlines)}`)
// An assignment, an exam registration and a group registration, each ending within 20 hours.
if (report.trayUrgent !== 3) problems.push(`Tray: ${report.trayUrgent} statt 3 Fristen in den nächsten 24 Stunden`)
const noteExtras = report.notes?.extras
if (!noteExtras?.imageExists) problems.push(`Bild einfügen: ${JSON.stringify(noteExtras?.image)}`)
if (JSON.stringify(noteExtras?.missingLinks) !== '["Zusammenfassung"]') problems.push(`[[Links]]: ${JSON.stringify(noteExtras?.missingLinks)} statt nur „Zusammenfassung“ als fehlend`)
if (!(noteExtras?.pdfPages >= 1)) problems.push(`PDF-Export: ${noteExtras?.pdfPages} Seiten`)
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
