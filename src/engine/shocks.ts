import type { DeptId } from '../data/budget'
import { clamp } from './metrics'
import type { Effect, Metrics, Shock } from './types'

/**
 * Historical shocks (epidemics, typhoons, financial crises) hit every city, but how hard depends on
 * how ready it is. Real data already contains each shock as real Hong Kong felt it, so only the
 * city's difference from real Hong Kong counts: a city as ready as the real one feels exactly what
 * history did, and following history still reproduces it.
 */

export interface ShockInput {
  m: Metrics
  real: Metrics
  quality: Record<DeptId, number>
  flags: Record<string, string>
  /** Reserves minus debt, 億. */
  netReserves: number
  /** Spending last month, 億. */
  monthlySpending: number
  /** Old buildings go uninspected while real Hong Kong inspects them. */
  uninspected: boolean
}

export interface ShockResult {
  effects: Effect[]
  /** One sentence on how the city fared, when it fared differently from history. */
  note?: string
}

/** How the answer to the decision after SARS (`chp`) leaves the city for later epidemics. */
export const EPIDEMIC_PREPARATION: Record<string, number> = { centre: 0, beds: -0.08, none: -0.15 }

/** Differences smaller than this are left out, so tiny drifts do not make news. */
const DEAD_BAND = 0.02
/** Months of spending in reserve that let a government steady the markets, as real Hong Kong always had. */
const BUFFER_MONTHS = 3

const gdp = (v: number, over: number): Effect => ({ kind: 'stock', key: 'gdp', v, at: 0, over })

/**
 * Epidemics: hospital beds and care places per elder against real Hong Kong's, run-down hospitals,
 * and how the city prepared after SARS. Positive means readier than real Hong Kong.
 */
export function epidemicReadiness(c: ShockInput): number {
  const beds = clamp(Math.log(c.m.carePerThousandElderly / c.real.carePerThousandElderly), -0.4, 0.4)
  return beds - 0.5 * (1 - c.quality.health) + (EPIDEMIC_PREPARATION[c.flags.chp] ?? 0)
}

/** Uninspected old buildings lose this much more in a storm: windows, canopies, loose concrete. */
const UNINSPECTED_DAMAGE = 0.1

/** Storms: run-down roads, slopes and drains (transport and environment upkeep), and uninspected old buildings; 0–1.5. */
export function stormDamage(c: ShockInput): number {
  return 1 - c.quality.transport + (1 - c.quality.environment) + (c.uninspected ? UNINSPECTED_DAMAGE : 0)
}

/** Financial crises: how far reserves fall short of three months of spending, 0–1. */
export function reserveShortfall(c: ShockInput): number {
  return clamp(1 - c.netReserves / c.monthlySpending / BUFFER_MONTHS, 0, 1)
}

export function shockEffects(shock: Shock, c: ShockInput): ShockResult {
  const size = shock.size
  switch (shock.kind) {
    case 'epidemic': {
      const ready = epidemicReadiness(c)
      if (Math.abs(ready) < DEAD_BAND) return { effects: [] }
      return {
        // Lost output over a year, and lives lost (萬) over half a year.
        effects: [gdp(3 * size * ready, 12), { kind: 'stock', key: 'pop', v: 0.15 * size * ready, at: 0, over: 6 }],
        note:
          ready < 0
            ? '醫院病床和安老宿位不足，醫療系統不勝負荷，市民和經濟受到的打擊更大。'
            : '醫院病床和安老宿位較充裕，醫療系統應付得來，經濟受到的打擊較輕。',
      }
    }
    case 'storm': {
      const lost = stormDamage(c)
      if (lost < DEAD_BAND) return { effects: [] }
      const repairs = 80 * size * lost
      return {
        effects: [
          { kind: 'stock', key: 'money', v: repairs, at: 0, over: 6 },
          gdp(-0.5 * size * lost, 3),
        ],
        note: `失修的${c.uninspected ? '舊樓、' : ''}道路、斜坡和渠道令災情更嚴重，修復要多花約 ${Math.round(repairs)} 億元。`,
      }
    }
    case 'financial': {
      const short = reserveShortfall(c)
      if (short < DEAD_BAND) return { effects: [] }
      return {
        effects: [gdp(-3 * size * short, 12)],
        note: '庫房儲備不足三個月開支，政府難以出手穩定市場，衝擊更大。',
      }
    }
  }
}
