import { useEffect, useState } from 'react'
import type { CourseGrade, StudiesData, StudyCourse } from '../../../shared/types'

/** The ECTS and grade overview; updates when a course or grade changes. */
export function useStudies(): StudiesData | null {
  const [data, setData] = useState<StudiesData | null>(null)
  useEffect(() => {
    const load = (): void => void window.sout.getStudies().then(setData)
    load()
    return window.sout.onStudiesChanged(load)
  }, [])
  return data
}

export const GRADE_LABELS: Record<CourseGrade, string> = {
  '1': '1 – Sehr gut',
  '2': '2 – Gut',
  '3': '3 – Befriedigend',
  '4': '4 – Genügend',
  '5': '5 – Nicht genügend',
  passed: 'Mit Erfolg teilgenommen'
}

/** Completed: a positive grade, or "mit Erfolg teilgenommen". */
export const isPassed = (course: StudyCourse): boolean => course.grade !== null && course.grade !== '5'

/** ECTS of the completed courses, and the grade average weighted by ECTS (positive grades only). */
export function summary(courses: StudyCourse[]): { ects: number; average: number | null; graded: number } {
  const passed = courses.filter(isPassed)
  const graded = passed.filter((course) => course.grade !== 'passed' && course.ects)
  const weight = graded.reduce((sum, course) => sum + course.ects!, 0)
  return {
    ects: passed.reduce((sum, course) => sum + (course.ects ?? 0), 0),
    average: weight > 0 ? graded.reduce((sum, course) => sum + Number(course.grade) * course.ects!, 0) / weight : null,
    graded: graded.length
  }
}

/** The semesters around now, newest first – for adding a course by hand. */
export function recentSemesters(current: string, count = 8): string[] {
  const match = /^(\d{4})([WS])$/.exec(current)
  if (!match) return [current]
  let year = Number(match[1])
  let winter = match[2] === 'W'
  const list: string[] = []
  for (let i = 0; i < count; i++) {
    list.push(`${year}${winter ? 'W' : 'S'}`)
    if (winter) winter = false
    else {
      winter = true
      year--
    }
  }
  return list
}
