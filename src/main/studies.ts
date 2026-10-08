import { app } from 'electron'
import { join } from 'node:path'
import { isCourseKey } from '../shared/tu'
import type { CourseGrade, StudiesData, StudyCourse } from '../shared/types'
import { parseCourseInfo } from './examParser'
import { readJson, writeJson } from './jsonFile'
import { readCoursePage } from './tissPages'

// The ECTS and grade overview. Every course of the TISS calendar is remembered with its semester
// and ECTS (from its TISS page) – also after it has left the calendar. Grades are entered by hand:
// TISS gives them out only with a login.

const GRADES: readonly string[] = ['1', '2', '3', '4', '5', 'passed']

const file = (): string => join(app.getPath('userData'), 'studies.json')

interface Stored {
  courses: StudyCourse[]
  /** Removed by hand ("<LVA> <semester>"): not added again from the TISS calendar. */
  removed: string[]
}

let cache: Stored | null = null
let onChange: () => void = () => {}

function stored(): Stored {
  if (!cache) {
    const data = readJson(file()) as Partial<Stored> | undefined
    cache = { courses: Array.isArray(data?.courses) ? data.courses : [], removed: Array.isArray(data?.removed) ? data.removed : [] }
  }
  return cache
}

const load = (): StudyCourse[] => stored().courses

function save(courses: StudyCourse[], removed = stored().removed): void {
  cache = { courses, removed }
  writeJson(file(), cache)
  onChange()
}

export function startStudies(listener: () => void): void {
  onChange = listener
}

const bySemester = (a: StudyCourse, b: StudyCourse): number => b.semester.localeCompare(a.semester) || a.title.localeCompare(b.title)

export function studiesData(): StudiesData {
  return { courses: [...load()].sort(bySemester) }
}

const same = (course: StudyCourse, key: string, semester: string): boolean => course.key === key && course.semester === semester

/** Courses read from TISS: new ones are added, known ones get the current title and ECTS. */
export function rememberCourses(found: Omit<StudyCourse, 'grade' | 'manual'>[]): void {
  const courses = [...load()]
  const removed = new Set(stored().removed)
  let changed = false
  for (const course of found) {
    const index = courses.findIndex((candidate) => same(candidate, course.key, course.semester))
    const known = courses[index]
    if (!known) {
      if (removed.has(`${course.key} ${course.semester}`)) continue
      courses.push({ ...course, grade: null, manual: false })
      changed = true
    } else if (known.title !== course.title || known.type !== course.type || (course.ects !== null && known.ects !== course.ects)) {
      courses[index] = { ...known, title: course.title, type: course.type, ects: course.ects ?? known.ects }
      changed = true
    }
  }
  if (changed) save(courses)
}

export function updateStudyCourse(key: string, semester: string, patch: { grade?: unknown; ects?: unknown }): void {
  const courses = load().map((course) => {
    if (!same(course, key, semester)) return course
    const next = { ...course }
    if (patch.grade === null || (typeof patch.grade === 'string' && GRADES.includes(patch.grade))) next.grade = patch.grade as CourseGrade | null
    if (patch.ects === null || (typeof patch.ects === 'number' && patch.ects >= 0 && patch.ects <= 60)) next.ects = patch.ects as number | null
    return next
  })
  save(courses)
}

/** A course that isn't (or no longer) in the TISS calendar: title and ECTS from its TISS page. */
export async function addStudyCourse(key: string, semester: string): Promise<void> {
  const courseKey = /^\d{6}$/.test(key) ? `${key.slice(0, 3)}.${key.slice(3)}` : key.trim().toUpperCase()
  if (!isCourseKey(courseKey)) throw new Error('Die LVA-Nummer sieht so aus: 123.456')
  if (!/^\d{4}[WS]$/.test(semester)) throw new Error('Das Semester sieht so aus: 2026W')
  if (load().some((course) => same(course, courseKey, semester))) throw new Error('Diese LVA steht schon in der Liste.')
  const removed = stored().removed.filter((entry) => entry !== `${courseKey} ${semester}`)
  let html: string
  try {
    html = await readCoursePage(courseKey, semester)
  } catch {
    throw new Error(`TISS kennt ${courseKey} im ${semester} nicht – oder ist gerade nicht erreichbar.`)
  }
  const info = parseCourseInfo(html)
  save([...load(), { key: courseKey, semester, type: info.type, title: info.title ?? courseKey, ects: info.ects, grade: null, manual: true }], removed)
}

export function removeStudyCourse(key: string, semester: string): void {
  save(
    load().filter((course) => !same(course, key, semester)),
    [...new Set([...stored().removed, `${key} ${semester}`])]
  )
}
