// TU Wien conventions shared by the main process and the UI.

/** TU Wien: winter semester 1 Oct – end of Feb, summer semester 1 Mar – 30 Sep. Codes as in TISS (2026W). */
export function currentSemester(date: Date): { code: string; label: string } {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  if (month >= 10) return { code: `${year}W`, label: semesterLabel(`${year}W`) }
  if (month <= 2) return { code: `${year - 1}W`, label: semesterLabel(`${year - 1}W`) }
  return { code: `${year}S`, label: semesterLabel(`${year}S`) }
}

/** "2026W" → "WS 2026/27", "2027S" → "SS 2027"; anything else stays as it is. */
export function semesterLabel(code: string): string {
  const match = /^(\d{4})([WS])$/.exec(code)
  if (!match) return code
  const year = Number(match[1])
  return match[2] === 'W' ? `WS ${year}/${String(year + 1).slice(2)}` : `SS ${year}`
}

export function tissCourseUrl(courseKey: string, semester: string): string {
  return `https://tiss.tuwien.ac.at/course/courseDetails.xhtml?courseNr=${courseKey.replace('.', '')}&semester=${semester}`
}

/** "GM 1 Audi. Max.- ARCH-INF" → "GM 1 Audi. Max." (TISS appends the building's short name). */
export function roomName(location: string): string {
  return location.replace(/\s*-\s*[A-Z][A-Z-]*$/, '').trim()
}

/** LVA numbers look like "123.456" (sometimes with letters: "123.A45"). */
export function isCourseKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{3}\.[0-9A-Z]{3}$/.test(value)
}
