import { METRICS, REAL_ALLOCATION } from '../data/history'
import { LABELS, gapScores, metricValue, playerMetricValue, realScores, zeroScores } from './model'
import { END_YEAR, INDICATORS, type Allocation, type GameState, type IndicatorKey, type Scores } from './types'

export type Rating = 'S' | 'A' | 'B' | 'C' | 'D'

export interface MetricRow {
  id: string
  label: string
  unit: string
  decimals: number
  real: number
  yours: number
  /** True when the player's value is better than the real one. */
  better: boolean
}

export interface PeriodRow {
  year: number
  endYear: number
  yours: Allocation
  real: Allocation
  summary: string
}

export interface GameResult {
  endYear: number
  endedEarly: boolean
  final: Scores
  real: Scores
  gaps: Scores
  total: number
  rating: Rating
  title: string
  subtitle: string
  metrics: MetricRow[]
  periods: PeriodRow[]
  /** Effects still in the pipeline after the game ends, i.e. left to the next term. */
  legacy: Scores
}

/** Thresholds on the summed gap across six indicators; tuned with tests/balance.test.ts. */
const RATING_STEPS: [Rating, number][] = [
  ['S', 25],
  ['A', 12],
  ['B', -3],
  ['C', -25],
]

export function ratingFor(total: number, endedEarly: boolean): Rating {
  if (endedEarly) return 'D'
  for (const [r, min] of RATING_STEPS) if (total >= min) return r
  return 'D'
}

const SINGLE_TITLES: Record<IndicatorKey, string> = {
  housing: '安居之城',
  economy: '繁榮之港',
  transport: '八達之城',
  environment: '綠色都會',
  livelihood: '長壽之城',
  finance: '儲備之城',
}

const PAIR_TITLES: { pair: [IndicatorKey, IndicatorKey]; title: string }[] = [
  { pair: ['housing', 'transport'], title: '新市鎮之城' },
  { pair: ['economy', 'finance'], title: '金融重鎮' },
  { pair: ['environment', 'livelihood'], title: '宜居之城' },
  { pair: ['housing', 'livelihood'], title: '安居樂業之城' },
  { pair: ['economy', 'transport'], title: '四通八達的商港' },
  { pair: ['environment', 'finance'], title: '綠色穩健之城' },
  { pair: ['housing', 'economy'], title: '樓市與經濟並進之城' },
  { pair: ['transport', 'environment'], title: '低碳鐵路城市' },
]

export function cityTitle(gaps: Scores, total: number, endedEarly: boolean): { title: string; subtitle: string } {
  if (endedEarly) return { title: '財政懸崖', subtitle: '儲備耗盡，任期提早結束' }
  const sorted = [...INDICATORS].sort((a, b) => gaps[b] - gaps[a])
  const [first, second] = sorted
  const worst = sorted[sorted.length - 1]
  const cost =
    gaps[worst] <= -10 ? `代價：${LABELS[worst]}比真實歷史低 ${Math.round(-gaps[worst])} 分` : ''

  let title: string
  if (gaps[first] < 3) {
    title = total > -5 ? '歷史重演' : '失落的平行時空'
  } else {
    const pair = PAIR_TITLES.find((p) => p.pair.includes(first) && p.pair.includes(second))
    title = pair && gaps[second] >= 5 ? pair.title : SINGLE_TITLES[first]
  }
  const subtitle = cost || (gaps[first] < 3 ? '你的香港跟真實歷史相差不大' : `${LABELS[first]}比真實歷史高 ${Math.round(gaps[first])} 分`)
  return { title, subtitle }
}

export function computeResult(s: GameState): GameResult {
  const endYear = s.year
  const real = realScores(endYear)
  const gaps = gapScores(s.values, endYear)
  const total = INDICATORS.reduce((sum, k) => sum + gaps[k], 0)
  const endedEarly = Boolean(s.endedEarly)
  const { title, subtitle } = cityTitle(gaps, total, endedEarly)

  const metrics: MetricRow[] = METRICS.map((m) => {
    const realValue = metricValue(m, endYear)
    const yours = playerMetricValue(m, endYear, gaps[m.k])
    const higherIsBetter = m.best > m.worst
    return {
      id: m.id,
      label: m.label,
      unit: m.unit,
      decimals: m.decimals,
      real: realValue,
      yours,
      better: higherIsBetter ? yours > realValue : yours < realValue,
    }
  })

  const periods: PeriodRow[] = []
  REAL_ALLOCATION.forEach((p, i) => {
    const periodEnd = (REAL_ALLOCATION[i + 1]?.year ?? END_YEAR + 1) - 1
    const years = Object.keys(s.allocByYear)
      .map(Number)
      .filter((y) => y >= p.year && y <= periodEnd)
    if (years.length === 0) return
    const yours = zeroScores()
    for (const y of years) for (const k of INDICATORS) yours[k] += s.allocByYear[y][k] / years.length
    periods.push({ year: p.year, endYear: Math.min(periodEnd, endYear), yours, real: p.alloc, summary: p.summary })
  })

  const legacy = zeroScores()
  for (const e of s.scheduled) if (e.year > endYear) legacy[e.k] += e.v

  return {
    endYear,
    endedEarly,
    final: { ...s.values },
    real,
    gaps,
    total,
    rating: ratingFor(total, endedEarly),
    title,
    subtitle,
    metrics,
    periods,
    legacy,
  }
}
