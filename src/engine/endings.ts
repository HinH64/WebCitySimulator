import { DEPARTMENTS, type DeptId } from '../data/budget'
import { HISTORY_CHOICES } from '../data/events'
import { computeIndicators, INDICATOR_LABEL } from './indicators'
import { clamp, computeMetrics, realMetricsEnd } from './metrics'
import { POLICIES, type PolicyCategory } from '../data/policies'
import { realFunding, realPolicyLevel, realReserves, realSpendingMonth } from './real'
import { debtTotal, playerPolicyLevel } from './sim'
import { LAST_MONTH_INDEX, monthIndex, yearOf } from './time'
import { INDICATOR_IDS, type ChoiceRecord, type GameState, type IndicatorId, type Metrics } from './types'

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

export interface PolicyRow {
  id: string
  label: string
  yours: string
  real: string
  /** How the real level changed over the years, e.g. "1997 不推行 → 2010 全面". */
  realHistory: string
  same: boolean
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

export interface ScoreParts {
  /** Six indicators at the end of the term, averaged (0–100). */
  cityEnd: number
  /** Six indicators averaged over every year of the term (0–100). */
  cityAverage: number
  /** Net reserves against a year of spending, or debt against GDP (0–100). */
  fiscal: number
  /** Population size (0–100). */
  population: number
}

export interface CityScore {
  indicators: Record<IndicatorId, number>
  parts: ScoreParts
  score: number
  rating: Rating
  title: string
  subtitle: string
}

export interface GameResult extends CityScore {
  endT: number
  endYear: number
  endedEarly: boolean
  reason?: string
  /** Real Hong Kong over the same years, scored the same way; shown as a reveal at the end. */
  real: CityScore
  comparison: ComparisonRow[]
  reveals: RevealRow[]
  policies: PolicyRow[]
  funding: FundingPeriod[]
  trend: TrendPoint[]
}

/** Weights of the score; each part is 0–100. */
const WEIGHTS = { cityEnd: 0.56, cityAverage: 0.24, fiscal: 0.1, population: 0.1 }

/** Minimum score for each rating; tuned with tests/balance.test.ts so real history lands on B. */
export const RATING_STEPS: [Rating, number][] = [
  ['S', 72],
  ['A', 68],
  ['B', 62],
  ['C', 55],
]

export function ratingFor(score: number, endedEarly: boolean): Rating {
  if (endedEarly) return 'D'
  for (const [r, min] of RATING_STEPS) if (score >= min) return r
  return 'D'
}

/**
 * Money is a means, not the goal. Half a year of spending in reserve scores full marks and hoarding
 * more adds nothing; empty reserves score 80; debt costs 4 points per 1% of GDP.
 */
export function fiscalScore(netReserves: number, yearlySpending: number, gdp: number): number {
  if (netReserves >= 0) return 80 + 40 * Math.min(0.5, netReserves / Math.max(1, yearlySpending))
  return clamp(80 + (400 * netReserves) / gdp, 0, 80)
}

export function populationScore(population: number): number {
  return clamp((population - 600) / 3, 0, 100)
}

const mean = (v: Record<IndicatorId, number>) => INDICATOR_IDS.reduce((a, k) => a + v[k], 0) / INDICATOR_IDS.length

function totalScore(p: ScoreParts): number {
  return WEIGHTS.cityEnd * p.cityEnd + WEIGHTS.cityAverage * p.cityAverage + WEIGHTS.fiscal * p.fiscal + WEIGHTS.population * p.population
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

/**
 * What a city in 2026 typically scores on each indicator (rounded from real Hong Kong). A title
 * names what stands out against these, so it describes this city's character rather than its rank.
 */
const TYPICAL: Record<IndicatorId, number> = { economy: 76, housing: 48, mobility: 87, wellbeing: 47, talent: 74, environment: 70 }

function cityTitle(ind: Record<IndicatorId, number>, score: number, endedEarly: boolean) {
  if (endedEarly) return { title: '財政懸崖', subtitle: '債務超過上限，任期提早結束' }
  const diff = Object.fromEntries(INDICATOR_IDS.map((k) => [k, ind[k] - TYPICAL[k]])) as Record<IndicatorId, number>
  const sorted = [...INDICATOR_IDS].sort((a, b) => diff[b] - diff[a])
  const [first, second] = sorted
  const worst = sorted[sorted.length - 1]
  const cost = diff[worst] <= -8 ? `代價：${INDICATOR_LABEL[worst]}偏弱（${Math.round(ind[worst])} 分）` : ''

  let title: string
  let subtitle: string
  if (INDICATOR_IDS.every((k) => Math.abs(diff[k]) < 3)) {
    title = '歷史重演'
    subtitle = '你的香港跟真實的香港幾乎一模一樣'
  } else if (diff[first] < 3) {
    title = score >= RATING_STEPS[2][1] ? '穩健之城' : '停滯之城'
    subtitle = '沒有特別突出的地方'
  } else {
    const pair = PAIR_TITLES.find((p) => p.pair.includes(first) && p.pair.includes(second))
    title = pair && diff[second] >= 4 ? pair.title : SINGLE_TITLES[first]
    subtitle = `最突出：${INDICATOR_LABEL[first]} ${Math.round(ind[first])} 分`
  }
  return { title, subtitle: cost && title !== '歷史重演' ? `${subtitle}；${cost}` : subtitle }
}

export function scoreCity(
  indicators: Record<IndicatorId, number>,
  yearlyIndicators: Record<IndicatorId, number>[],
  money: { net: number; yearlySpending: number; gdp: number },
  population: number,
  endedEarly: boolean,
): CityScore {
  const parts: ScoreParts = {
    cityEnd: mean(indicators),
    cityAverage: yearlyIndicators.length ? yearlyIndicators.reduce((a, v) => a + mean(v), 0) / yearlyIndicators.length : mean(indicators),
    fiscal: fiscalScore(money.net, money.yearlySpending, money.gdp),
    population: populationScore(population),
  }
  const score = totalScore(parts)
  return { indicators, parts, score, rating: ratingFor(score, endedEarly), ...cityTitle(indicators, score, endedEarly) }
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

const CATEGORY_ORDER: PolicyCategory[] = ['housing', 'transport', 'economy', 'social', 'environment', 'tax']

function policyRows(s: GameState, endT: number): PolicyRow[] {
  const sorted = [...POLICIES].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
  return sorted.map((p) => {
    const label = (id: string) => p.levels.find((l) => l.id === id)?.label ?? id
    const yours = playerPolicyLevel(s, p, endT)
    const real = realPolicyLevel(p.id, endT)
    const history = p.real.filter((r) => monthIndex(...r.from) <= endT).map((r) => `${r.from[0]} ${label(r.level)}`)
    return { id: p.id, label: p.label, yours: label(yours), real: label(real), realHistory: history.join(' → '), same: yours === real }
  })
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
  const endedEarly = Boolean(s.endedEarly)
  const m = computeMetrics(s, endT)
  const realM = realMetricsEnd(endT)
  const yearly = s.snapshots.filter((snap) => snap.t <= endT)
  const yours = scoreCity(
    computeIndicators(m, s),
    yearly.map((snap) => snap.indicators),
    { net: s.reserves - debtTotal(s), yearlySpending: s.last.spendingTotal * 12, gdp: m.gdp },
    m.population,
    endedEarly,
  )
  const real = scoreCity(
    computeIndicators(realM, REAL_STATE),
    yearly.map((snap) => computeIndicators(realMetricsEnd(snap.t), REAL_STATE)),
    { net: realReserves(endT + 1), yearlySpending: realSpendingMonth(endT) * 12, gdp: realM.gdp },
    realM.population,
    false,
  )

  // Only decisions that came up in this city; pending ones show as undecided.
  const presented = [
    ...s.choices.filter((r) => r.kind === 'history').map((r) => ({ id: r.id, rec: r as ChoiceRecord | undefined })),
    ...s.inbox.filter((i) => i.kind === 'history').map((i) => ({ id: i.id, rec: undefined })),
  ]
  const reveals: RevealRow[] = presented
    .map(({ id, rec }) => {
      const c = HISTORY_CHOICES.find((h) => h.id === id)!
      return {
        id,
        year: c.year,
        title: c.title,
        yours: rec?.optionLabel,
        expired: rec?.expired ?? false,
        real: c.options.find((o) => o.id === c.realOptionId)!.label,
        same: rec?.optionId === c.realOptionId,
        reveal: c.reveal,
        t: monthIndex(c.year, c.month),
      }
    })
    .sort((a, b) => a.t - b.t)
    .map(({ t: _t, ...row }) => row)

  const trend: TrendPoint[] = yearly.map((snap) => {
    const rm = realMetricsEnd(snap.t)
    return {
      year: snap.year,
      yours: { ...snap.indicators, reserves: snap.reserves - snap.debt, population: snap.metrics.population },
      real: { ...computeIndicators(rm, REAL_STATE), reserves: realReserves(snap.t + 1), population: rm.population },
    }
  })

  return {
    ...yours,
    endT,
    endYear: yearOf(endT),
    endedEarly,
    reason: s.endedEarly?.reason,
    real,
    comparison: comparison(m, realM, s, endT),
    reveals,
    policies: policyRows(s, endT),
    funding: fundingPeriods(s, endT),
    trend,
  }
}
