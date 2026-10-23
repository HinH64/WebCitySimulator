import type { GameState, StockKey } from './types'

/** Sum of scheduled changes to a stock (deviations from history) within the next `months`. */
export function upcoming(s: Pick<GameState, 't' | 'pipeline'>, key: StockKey, months: number): number {
  let total = 0
  for (let t = s.t; t < s.t + months; t++) total += s.pipeline[t]?.[key] ?? 0
  return total
}
