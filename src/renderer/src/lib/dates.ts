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

export { currentSemester } from '../../../shared/tu'
