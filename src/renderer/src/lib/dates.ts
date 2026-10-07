const longDate = new Intl.DateTimeFormat('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short' })

export const formatLongDate = (date: Date): string => longDate.format(date)
export const formatShortDate = (date: Date): string => shortDate.format(date)

export function greeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 5) return 'Gute Nacht'
  if (hour < 11) return 'Guten Morgen'
  if (hour < 18) return 'Hallo'
  return 'Guten Abend'
}

/** TU Wien: winter semester 1 Oct – end of Feb, summer semester 1 Mar – 30 Sep. Codes as in TISS (2026W). */
export function currentSemester(date: Date): { code: string; label: string } {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  if (month >= 10) return { code: `${year}W`, label: `WS ${year}/${String(year + 1).slice(2)}` }
  if (month <= 2) return { code: `${year - 1}W`, label: `WS ${year - 1}/${String(year).slice(2)}` }
  return { code: `${year}S`, label: `SS ${year}` }
}
