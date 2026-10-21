import { METRICS, REAL_ALLOCATION, type MetricDef } from '../data/history'
import { END_YEAR, INDICATORS, START_YEAR, type Allocation, type IndicatorKey, type Scores } from './types'

export const LABELS: Record<IndicatorKey, string> = {
  housing: '住屋',
  economy: '經濟',
  transport: '交通',
  environment: '環境',
  livelihood: '民生',
  finance: '財政',
}

/** Score points gained per year for a full sqrt-share difference in allocation. */
const ALLOC_STRENGTH: Scores = {
  housing: 9,
  economy: 7,
  transport: 9,
  environment: 7,
  livelihood: 7,
  finance: 7,
}

/** How an allocation difference also moves other indicators (multiplier of the source effect). */
const CROSS: Record<IndicatorKey, Partial<Scores>> = {
  housing: { environment: -0.15, finance: -0.1 },
  economy: { housing: -0.15, environment: -0.1, finance: 0.2 },
  transport: { economy: 0.15, livelihood: 0.1, finance: -0.1 },
  environment: { livelihood: 0.15, housing: -0.05 },
  livelihood: { economy: 0.1, finance: -0.1 },
  finance: {},
}

/** Share of an allocation effect landing 1, 2, 3… years later (works take time). */
export const LAG: Record<IndicatorKey, number[]> = {
  housing: [0.05, 0.15, 0.25, 0.3, 0.25],
  economy: [0.4, 0.4, 0.2],
  transport: [0, 0.1, 0.2, 0.3, 0.25, 0.15],
  environment: [0.5, 0.3, 0.2],
  livelihood: [0.7, 0.3],
  finance: [1],
}

/** Fraction of the gap to history that closes each year on its own. */
const REVERSION: Scores = {
  housing: 0.06,
  economy: 0.06,
  transport: 0.06,
  environment: 0.06,
  livelihood: 0.06,
  finance: 0.06,
}

/** Per-year pull of one indicator's gap on another. */
const SPILLOVER: { from: IndicatorKey; to: IndicatorKey; rate: number }[] = [
  { from: 'economy', to: 'finance', rate: 0.04 },
  { from: 'economy', to: 'housing', rate: -0.03 },
  { from: 'housing', to: 'livelihood', rate: 0.03 },
  { from: 'environment', to: 'livelihood', rate: 0.03 },
  { from: 'transport', to: 'economy', rate: 0.03 },
  { from: 'livelihood', to: 'economy', rate: 0.02 },
]

export function zeroScores(): Scores {
  return { housing: 0, economy: 0, transport: 0, environment: 0, livelihood: 0, finance: 0 }
}

export function clampScore(v: number): number {
  return Math.min(100, Math.max(0, v))
}

export function metricValue(m: MetricDef, year: number): number {
  return m.series[year - START_YEAR]
}

function metricScore(m: MetricDef, value: number): number {
  return ((value - m.worst) / (m.best - m.worst)) * 100
}

const REAL_SCORES: Record<number, Scores> = {}
for (let y = START_YEAR; y <= END_YEAR; y++) {
  const s = zeroScores()
  for (const k of INDICATORS) {
    const ms = METRICS.filter((m) => m.k === k)
    s[k] = ms.reduce((sum, m) => sum + metricScore(m, metricValue(m, y)), 0) / ms.length
  }
  REAL_SCORES[y] = s
}

export function realScores(year: number): Scores {
  return REAL_SCORES[Math.min(END_YEAR, Math.max(START_YEAR, year))]
}

export function realAllocation(year: number): Allocation {
  let current = REAL_ALLOCATION[0].alloc
  for (const p of REAL_ALLOCATION) if (p.year <= year) current = p.alloc
  return current
}

export function gapScores(values: Scores, year: number): Scores {
  const real = realScores(year)
  const g = zeroScores()
  for (const k of INDICATORS) g[k] = values[k] - real[k]
  return g
}

/** Converts a score gap into the player's value of a real-world metric. */
export function playerMetricValue(m: MetricDef, year: number, gap: number): number {
  const v = metricValue(m, year) + (gap / 100) * (m.best - m.worst)
  return Math.min(m.max, Math.max(m.min, v))
}

/**
 * Effects of the player's allocation compared with the real one during `year`.
 * Returns per-indicator totals before lag; the caller spreads them over LAG.
 * Investment goes further where an indicator is weak, so reading the era's problems pays off.
 */
export function allocationEffects(alloc: Allocation, realAlloc: Allocation, values: Scores, gap: Scores): Scores {
  const budget = Math.min(1.4, Math.max(0.6, 1 + 0.008 * gap.economy + 0.004 * gap.finance))
  const own = zeroScores()
  for (const k of INDICATORS) {
    const need = 0.5 + (1 - values[k] / 100)
    own[k] = ALLOC_STRENGTH[k] * (Math.sqrt(alloc[k] / 20) - Math.sqrt(realAlloc[k] / 20)) * budget * need
  }
  return own
}

/** Splits each source indicator's own effect into effects on every indicator. */
export function withCrossEffects(own: Scores): { from: IndicatorKey; to: IndicatorKey; v: number }[] {
  const out: { from: IndicatorKey; to: IndicatorKey; v: number }[] = []
  for (const from of INDICATORS) {
    if (own[from] === 0) continue
    out.push({ from, to: from, v: own[from] })
    for (const [to, mult] of Object.entries(CROSS[from]) as [IndicatorKey, number][]) {
      out.push({ from, to, v: own[from] * mult })
    }
  }
  return out
}

/** State-driven change of each gap during one year: spillovers minus reversion. */
export function gapDrift(gap: Scores): Scores {
  const d = zeroScores()
  for (const s of SPILLOVER) d[s.to] += s.rate * gap[s.from]
  for (const k of INDICATORS) d[k] -= REVERSION[k] * gap[k]
  return d
}
