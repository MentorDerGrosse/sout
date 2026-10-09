import type { CourseDeadline, ExamDate } from './types'

// Where an exam registration stands – used by the reminders in the main process and by the UI.

export type ExamStatus =
  /** In your TISS calendar. */
  | 'registered'
  /** Registered for an alternative, or taken already. */
  | 'covered'
  /** Marked as not needed in sout. */
  | 'dismissed'
  /** The registration window is open now. */
  | 'open'
  /** It opens later. */
  | 'soon'
  /** The window is over and you are not registered. */
  | 'closed'
  /** TISS gives no registration window. */
  | 'none'

export function examStatus(exam: ExamDate, now: number): ExamStatus {
  if (exam.registered) return 'registered'
  if (exam.covered) return 'covered'
  if (exam.dismissed) return 'dismissed'
  const opens = exam.opens ? Date.parse(exam.opens) : null
  const closes = exam.closes ? Date.parse(exam.closes) : null
  if (closes !== null && now >= closes) return 'closed'
  if (opens !== null && now < opens) return 'soon'
  return opens !== null || closes !== null ? 'open' : 'none'
}

/** A group registration window: open, opening later, or marked as not needed. */
export function deadlineStatus(deadline: CourseDeadline, now: number): 'open' | 'soon' | 'dismissed' {
  if (deadline.dismissed) return 'dismissed'
  return deadline.opens && Date.parse(deadline.opens) > now ? 'soon' : 'open'
}

/** The course's groups in TISS, where you register for one. */
export function tissGroupsUrl(courseKey: string, semester: string): string {
  return `https://tiss.tuwien.ac.at/education/course/groupList.xhtml?courseNr=${courseKey.replace('.', '')}&semester=${semester}`
}

/** You still have to register: the window is open, or it opens later. */
export const needsRegistration = (status: ExamStatus): boolean => status === 'open' || status === 'soon'

/** Closes within this time: worth a red dot at the tray icon and a colour in the lists. */
export const EXAM_URGENT_MS = 24 * 60 * 60_000

/** The course's exam dates in TISS, where you register (TISS asks you to log in first). */
export function tissExamUrl(courseKey: string, semester: string): string {
  return `https://tiss.tuwien.ac.at/education/course/examDateList.xhtml?courseNr=${courseKey.replace('.', '')}&semester=${semester}`
}
