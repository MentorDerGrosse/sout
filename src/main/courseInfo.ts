import { app } from 'electron'
import { join } from 'node:path'
import { readJson, writeJson } from './jsonFile'

// What the public TISS course page says about a course besides its exams – ECTS, hours, the TUWEL
// course – stored per LVA number (courseinfo.json). The exam sync fills it, the calendar's course
// list shows it.

export interface CourseInfo {
  semester: string
  ects: number | null
  hours: number | null
  tuwelUrl: string | null
  lectureTube: boolean
}

const file = (): string => join(app.getPath('userData'), 'courseinfo.json')

let cache: Record<string, CourseInfo> | null = null

function load(): Record<string, CourseInfo> {
  if (!cache) {
    const data = readJson(file())
    cache = data && typeof data === 'object' ? (data as Record<string, CourseInfo>) : {}
  }
  return cache
}

export function courseInfo(courseKey: string): CourseInfo | null {
  return load()[courseKey] ?? null
}

export function saveCourseInfo(entries: Record<string, CourseInfo>): void {
  cache = { ...load(), ...entries }
  writeJson(file(), cache)
}
