import { DEPARTMENTS, type DeptId } from '../data/budget'
import { HISTORY_CHOICES } from '../data/events'
import { computeIndicators, INDICATOR_LABEL } from './indicators'
import { clamp, computeMetrics, realMetricsEnd } from './metrics'
import { realFunding, realReserves } from './real'
import { debtTotal } from './sim'
import { LAST_MONTH_INDEX, monthIndex, yearOf } from './time'
import { INDICATOR_IDS, type GameState, type IndicatorId, type Metrics } from './types'

export type Rating = 'S' | 'A' | 'B' | 'C' | 'D'

export interface ComparisonRow {
  label: string
  unit: string
  decimals: number
  real: number
  yours: number
  /** Whether a higher value is better; undefined when neither is. */
  higherIsBetter?: boolean
}

export interface RevealRow {
  id: string
  year: number
  title: string
  yours?: string
  expired: boolean
  real: string
  same: boolean
  reveal: string
}

export interface FundingPeriod {
  from: number
  to: number
  yours: Record<DeptId, number>
  real: Record<DeptId, number>
}

export interface TrendPoint {
  year: number
  yours: Record<IndicatorId, number> & { reserves: number; population: number }
  real: Record<IndicatorId, number> & { reserves: number; population: number }
}

export interface GameResult {
  endT: number
  endYear: number
  endedEarly: boolean
  reason?: string
  yours: Record<IndicatorId, number>
  real: Record<IndicatorId, number>
  gaps: Record<IndicatorId, number>
  fiscalPoints: number
  total: number
  rating: Rating
  title: string
  subtitle: string
  comparison: ComparisonRow[]
  reveals: RevealRow[]
  funding: FundingPeriod[]
  trend: TrendPoint[]
}

/** Thresholds on the summed indicator gaps plus fiscal points; tuned with tests/balance.test.ts. */
export const RATING_STEPS: [Rating, number][] = [
  ['S', 30],
  ['A', 12],
  ['B', -5],
  ['C', -25],
]

export function ratingFor(total: number, endedEarly: boolean): Rating {
  if (endedEarly) return 'D'
  for (const [r, min] of RATING_STEPS) if (total >= min) return r
  return 'D'
}

const SINGLE_TITLES: Record<IndicatorId, string> = {
  economy: '繁榮之港',
  housing: '安居之城',
  mobility: '八達之城',
  wellbeing: '長壽之城',
  talent: '人才之都',
  environment: '綠色都會',
}

const PAIR_TITLES: { pair: [IndicatorId, IndicatorId]; title: string }[] = [
  { pair: ['housing', 'mobility'], title: '新市鎮之城' },
  { pair: ['economy', 'talent'], title: '創新之港' },
  { pair: ['environment', 'wellbeing'], title: '宜居之城' },
  { pair: ['housing', 'wellbeing'], title: '安居樂業之城' },
  { pair: ['economy', 'mobility'], title: '四通八達的商港' },
  { pair: ['environment', 'mobility'], title: '低碳鐵路城市' },
  { pair: ['economy', 'housing'], title: '樓市與經濟並進之城' },
]

function cityTitle(gaps: Record<IndicatorId, number>, fiscalPoints: number, total: number, endedEarly: boolean) {
  if (endedEarly) return { title: '財政懸崖', subtitle: '債務超過上限，任期提早結束' }
  const sorted = [...INDICATOR_IDS].sort((a, b) => gaps[b] - gaps[a])
  const [first, second] = sorted
  const worst = sorted[sorted.length - 1]
  const cost = gaps[worst] <= -8 ? `代價：${INDICATOR_LABEL[worst]}比真實香港低 ${Math.round(-gaps[worst])} 分` : ''

  let title: string
  if (fiscalPoints >= 10 && fiscalPoints > gaps[first]) title = '儲備之城'
  else if (gaps[first] < 3) title = total > -5 ? '歷史重演' : '失落的平行時空'
  else {
    const pair = PAIR_TITLES.find((p) => p.pair.includes(first) && p.pair.includes(second))
    title = pair && gaps[second] >= 4 ? pair.title : SINGLE_TITLES[first]
  }
  const subtitle =
    cost ||
    (gaps[first] < 3 ? '你的香港跟真實香港相差不大' : `${INDICATOR_LABEL[first]}比真實香港高 ${Math.round(gaps[first])} 分`)
  return { title, subtitle }
}

const REAL_STATE = { quality: { housing: 1, transport: 1, economy: 1, education: 1, health: 1, environment: 1 }, policyLevels: { unemployment: 0, welfare: 0, attract: 0, pm10: 0, green: 0 } }

function comparison(m: Metrics, real: Metrics, s: GameState, endT: number): ComparisonRow[] {
  return [
    { label: '人口', unit: '萬', decimals: 0, real: real.population, yours: m.population },
    { label: '財政儲備', unit: '億元', decimals: 0, real: realReserves(endT + 1), yours: s.reserves, higherIsBetter: true },
    { label: '政府債務', unit: '億元', decimals: 0, real: 0, yours: debtTotal(s), higherIsBetter: false },
    { label: '人均本地生產總值', unit: '千元', decimals: 0, real: real.gdpPerCapita, yours: m.gdpPerCapita, higherIsBetter: true },
    { label: '失業率', unit: '%', decimals: 1, real: real.unemployment, yours: m.unemployment, higherIsBetter: false },
    { label: '公屋平均輪候', unit: '年', decimals: 1, real: real.prhWait, yours: m.prhWait, higherIsBetter: false },
    { label: '私人住宅售價指數', unit: '', decimals: 0, real: real.priceIndex, yours: m.priceIndex },
    { label: '鐵路網絡', unit: '公里', decimals: 0, real: real.railKm, yours: m.railKm, higherIsBetter: true },
    { label: '每千名長者病床及宿位', unit: '個', decimals: 0, real: real.carePerThousandElderly, yours: m.carePerThousandElderly, higherIsBetter: true },
    { label: '具專上教育程度人口', unit: '%', decimals: 1, real: real.postSecondary, yours: m.postSecondary, higherIsBetter: true },
    { label: 'PM10 年均濃度', unit: '微克/立方米', decimals: 0, real: real.pm10, yours: m.pm10, higherIsBetter: false },
    { label: '平均預期壽命', unit: '歲', decimals: 1, real: real.lifeExpectancy, yours: m.lifeExpectancy, higherIsBetter: true },
  ]
}

const PERIODS: [number, number][] = [
  [1997, 2001],
  [2002, 2006],
  [2007, 2011],
  [2012, 2016],
  [2017, 2021],
  [2022, 2026],
]

function fundingPeriods(s: GameState, endT: number): FundingPeriod[] {
  const byYear = { ...s.fundingByYear }
  if (s.year.months > 0 && !byYear[s.year.year]) {
    byYear[s.year.year] = Object.fromEntries(DEPARTMENTS.map((d) => [d, s.year.funding[d] / s.year.months])) as Record<DeptId, number>
  }
  const endYear = yearOf(endT)
  const out: FundingPeriod[] = []
  for (const [from, to] of PERIODS) {
    if (from > endYear) break
    const years = Object.keys(byYear).map(Number).filter((y) => y >= from && y <= Math.min(to, endYear))
    if (years.length === 0) continue
    const first = Math.max(0, monthIndex(from, 1))
    const last = Math.min(endT, monthIndex(to, 12))
    const yours = {} as Record<DeptId, number>
    const real = {} as Record<DeptId, number>
    for (const d of DEPARTMENTS) {
      yours[d] = years.reduce((a, y) => a + byYear[y][d], 0) / years.length
      let sum = 0
      for (let t = first; t <= last; t++) sum += realFunding(d, t)
      real[d] = sum / (last - first + 1)
    }
    out.push({ from, to: Math.min(to, endYear), yours, real })
  }
  return out
}

export function computeResult(s: GameState): GameResult {
  const endT = s.endedEarly ? s.endedEarly.t : Math.min(s.t - 1, LAST_MONTH_INDEX)
  const m = computeMetrics(s, endT)
  const realM = realMetricsEnd(endT)
  const yours = computeIndicators(m, s)
  const real = computeIndicators(realM, REAL_STATE)
  const gaps = Object.fromEntries(INDICATOR_IDS.map((k) => [k, yours[k] - real[k]])) as Record<IndicatorId, number>
  const net = s.reserves - debtTotal(s)
  // Saving more than history helps a little; running down reserves or borrowing costs more.
  const fiscalGap = net - realReserves(endT + 1)
  const fiscalPoints = fiscalGap >= 0 ? Math.min(10, fiscalGap / 1500) : clamp(fiscalGap / 400, -20, 0)
  const total = INDICATOR_IDS.reduce((a, k) => a + gaps[k], 0) + fiscalPoints
  const endedEarly = Boolean(s.endedEarly)
  const { title, subtitle } = cityTitle(gaps, fiscalPoints, total, endedEarly)

  const reveals: RevealRow[] = HISTORY_CHOICES.filter((c) => monthIndex(c.year, c.month) <= endT).map((c) => {
    const rec = s.choices.find((r) => r.kind === 'history' && r.id === c.id)
    const realLabel = c.options.find((o) => o.id === c.realOptionId)!.label
    return {
      id: c.id,
      year: c.year,
      title: c.title,
      yours: rec?.optionLabel,
      expired: rec?.expired ?? false,
      real: realLabel,
      same: rec?.optionId === c.realOptionId,
      reveal: c.reveal,
    }
  })

  const trend: TrendPoint[] = s.snapshots.map((snap) => {
    const rm = realMetricsEnd(snap.t)
    return {
      year: snap.year,
      yours: { ...snap.indicators, reserves: snap.reserves - snap.debt, population: snap.metrics.population },
      real: { ...computeIndicators(rm, REAL_STATE), reserves: realReserves(snap.t + 1), population: rm.population },
    }
  })

  return {
    endT,
    endYear: yearOf(endT),
    endedEarly,
    reason: s.endedEarly?.reason,
    yours,
    real,
    gaps,
    fiscalPoints,
    total,
    rating: ratingFor(total, endedEarly),
    title,
    subtitle,
    comparison: comparison(m, realM, s, endT),
    reveals,
    funding: fundingPeriods(s, endT),
    trend,
  }
}
