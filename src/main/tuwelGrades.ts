import { TUWEL_URL, tuwelCall } from './tuwelApi'
import { lvaNumber } from './tuwelTasks'

// Grades from TUWEL, to tell about new ones. Same calls as the Moodle app's grades page.

interface EnrolledCourse {
  id: number
  fullname: string
  shortname: string
  idnumber?: string
  enddate?: number
}

interface GradeItem {
  id: number
  itemname: string | null
  itemtype: string
  graderaw: number | null
  gradeformatted: string
  grademax?: number
  gradedategraded: number | null
  gradeishidden?: boolean
}

/** A grade that has been given (not the course total). */
export interface Grade {
  /** Item and time of grading: a re-grading counts as new. */
  key: string
  course: string
  courseKey: string | null
  name: string
  /** As TUWEL shows it, e.g. "8,50" – with "von 10" if there is a maximum. */
  grade: string
  url: string
}

const DAY = 24 * 60 * 60

/** Grades of the courses that are still running (or ended less than 90 days ago). */
export async function fetchGrades(token: string, userid: number): Promise<Grade[]> {
  const courses = await tuwelCall<EnrolledCourse[]>(token, 'core_enrol_get_users_courses', { userid })
  const now = Date.now() / 1000
  const current = courses.filter((course) => !course.enddate || course.enddate > now - 90 * DAY).slice(0, 20)
  const grades: Grade[] = []
  // A few at a time, to go easy on TUWEL.
  for (let i = 0; i < current.length; i += 4) {
    const batch = current.slice(i, i + 4)
    const results = await Promise.all(
      batch.map((course) =>
        tuwelCall<{ usergrades?: { gradeitems?: GradeItem[] }[] }>(token, 'gradereport_user_get_grade_items', { courseid: course.id, userid }).catch(() => null)
      )
    )
    results.forEach((result, index) => {
      const course = batch[index]!
      for (const item of result?.usergrades?.[0]?.gradeitems ?? []) {
        if (item.itemtype === 'course' || item.itemtype === 'category' || item.gradeishidden) continue
        if (item.graderaw === null || !item.gradedategraded) continue
        const max = item.grademax ? ` von ${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(item.grademax)}` : ''
        grades.push({
          key: `${item.id}:${item.gradedategraded}`,
          course: course.fullname,
          courseKey: lvaNumber(course),
          name: item.itemname || 'Bewertung',
          grade: `${item.gradeformatted}${max}`,
          url: `${TUWEL_URL}/grade/report/user/index.php?id=${course.id}`
        })
      }
    })
  }
  return grades
}
