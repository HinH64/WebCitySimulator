import { LAST_MONTH_INDEX } from '../engine/time'
import type { GameState } from '../engine/types'
import type { Speed } from './storage'

/** A month lasts this long at 1×. */
const MONTH_MS_1X = 1600

export function monthMs(speed: Speed): number {
  return MONTH_MS_1X / speed
}

/** Roughly how long a whole term takes at this speed, e.g. 約 2 分半 or 約 35 秒. */
export function playTime(speed: Speed): string {
  const seconds = ((LAST_MONTH_INDEX + 1) * monthMs(speed)) / 1000
  if (seconds < 60) return `約 ${Math.round(seconds / 5) * 5} 秒`
  const halves = Math.round(seconds / 30)
  return `約 ${Math.floor(halves / 2)} 分${halves % 2 ? '半' : '鐘'}`
}

export interface SkipStop {
  text: string
  /** The decision about to expire, when that is why. */
  due?: number
}

/**
 * Why fast-forwarding should not simulate the next month: a pending decision would expire in it.
 * `except` is one the player was already warned about; fast-forwarding again lets it expire.
 */
export function dueStop(game: GameState, except?: number): SkipStop | null {
  const due = game.inbox.find((i) => i.deadline <= game.t && i.uid !== except)
  return due ? { text: `「${due.title}」這個月到期，已停止快轉。再快轉一次，它會按限期維持現狀。`, due: due.uid } : null
}

/**
 * Why fast-forwarding should stop after the month just simulated, if it should: a new decision,
 * a crisis, or a decision about to expire. It stops for these whatever the auto-pause settings say.
 */
export function skipStop(game: GameState): SkipStop | null {
  if (game.signals.includes('choice')) return { text: '有新抉擇待決定，已停止快轉。' }
  if (game.signals.includes('crisis')) return { text: '財政告急，已停止快轉。看看預算、稅率和債務。' }
  if (game.signals.includes('approval')) return { text: '民望告急，已停止快轉。看看需求面板，市民覺得政府對哪些問題沒有回應。' }
  return dueStop(game)
}
