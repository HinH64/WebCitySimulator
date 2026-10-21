/** Months are counted from July 1997 (index 0). The game ends after October 2026. */
export const START_YEAR = 1997
export const START_MONTH = 7
export const END_YEAR = 2026
export const END_MONTH = 10

export function monthIndex(year: number, month: number): number {
  return (year - START_YEAR) * 12 + (month - START_MONTH)
}

export const LAST_MONTH_INDEX = monthIndex(END_YEAR, END_MONTH)

export function yearOf(t: number): number {
  return START_YEAR + Math.floor((START_MONTH - 1 + t) / 12)
}

export function monthOf(t: number): number {
  return ((START_MONTH - 1 + t) % 12) + 1
}

export function isBefore(t: number, ym: [number, number]): boolean {
  return t < monthIndex(ym[0], ym[1])
}

/** Value of a timeline (entries sorted by start month) at month t. */
export function timelineAt<T>(entries: { from: [number, number] }[], t: number, pick: (i: number) => T): T {
  let idx = 0
  for (let i = 0; i < entries.length; i++) if (!isBefore(t, entries[i].from)) idx = i
  return pick(idx)
}
