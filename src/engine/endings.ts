import { DEPARTMENTS, REAL_TAX, TAXES, TAX_INFO, type DeptId } from '../data/budget'
import { HISTORY_CHOICES } from '../data/events'
import { computeIndicators, indicatorParts, INDICATOR_LABEL, type IndicatorPart } from './indicators'
import { clamp, computeMetrics, realMetricsEnd } from './metrics'
import { POLICIES, type PolicyCategory } from '../data/policies'
import { realFunding, realPolicyLevel, realReserves, realSpendingMonth, realTax } from './real'
import { debtTotal, playerPolicyLevel } from './sim'
import { LAST_MONTH_INDEX, monthIndex, yearOf } from './time'
import { INDICATOR_IDS, type ChoiceRecord, type EndCause, type GameState, type IndicatorId, type Metrics } from './types'

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
  /** Net reserves up to three months of spending, or debt against GDP (0–100). */
  fiscal: number
  /** Population size (0–100). */
  population: number
}

/**
 * The score is internal: balance tests use it, players never see it. The end screen compares the
 * city with real Hong Kong instead.
 */
export interface CityScore {
  indicators: Record<IndicatorId, number>
  parts: ScoreParts
  score: number
  title: string
}

/** One line of the end summary; good and bad are against real Hong Kong. */
export interface SummaryLine {
  tone: 'good' | 'bad' | 'neutral'
  text: string
}

export interface GameResult extends CityScore {
  endT: number
  endYear: number
  endedEarly: boolean
  cause?: EndCause
  reason?: string
  /** Approval at the end of each year in `trend`; real Hong Kong has none to compare. */
  approval: number[]
  /** Real Hong Kong over the same years, scored the same way. */
  real: CityScore
  /** How many of the six indicators beat real Hong Kong. */
  betterThanReal: number
  summary: SummaryLine[]
  comparison: ComparisonRow[]
  reveals: RevealRow[]
  policies: PolicyRow[]
  funding: FundingPeriod[]
  trend: TrendPoint[]
}

/** Weights of the score; each part is 0–100. */
const WEIGHTS = { cityEnd: 0.56, cityAverage: 0.24, fiscal: 0.1, population: 0.1 }

/** Indicators within this many points of real Hong Kong count as about the same. */
const SAME_BAND = 2

/**
 * Money is a means, not the goal. Three months of spending in reserve scores full marks and hoarding
 * more adds nothing; empty reserves score 80; debt costs 2 points per 1% of GDP.
 */
export function fiscalScore(netReserves: number, yearlySpending: number, gdp: number): number {
  if (netReserves >= 0) return 80 + 80 * Math.min(0.25, netReserves / Math.max(1, yearlySpending))
  return clamp(80 + (200 * netReserves) / gdp, 0, 80)
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

let typical: Record<IndicatorId, number> | undefined

/**
 * What a city in 2026 typically scores on each indicator (real Hong Kong at the end, rounded). A
 * title names what stands out against these, so it describes this city's character rather than its rank.
 */
function typicalScores(): Record<IndicatorId, number> {
  if (!typical) {
    const real = computeIndicators(realMetricsEnd(LAST_MONTH_INDEX), REAL_STATE)
    typical = Object.fromEntries(INDICATOR_IDS.map((k) => [k, Math.round(real[k])])) as Record<IndicatorId, number>
  }
  return typical
}

const EARLY_TITLE: Record<EndCause, string> = { debt: '財政懸崖', approval: '被迫下台' }
const EARLY_LINE: Record<EndCause, string> = {
  debt: '債務超過上限，任期提早結束。',
  approval: '民望連續一年低於 25，被迫下台，任期提早結束。',
}

function cityTitle(ind: Record<IndicatorId, number>, early: EndCause | undefined): string {
  if (early) return EARLY_TITLE[early]
  const typ = typicalScores()
  const diff = Object.fromEntries(INDICATOR_IDS.map((k) => [k, ind[k] - typ[k]])) as Record<IndicatorId, number>
  const [first, second] = [...INDICATOR_IDS].sort((a, b) => diff[b] - diff[a])
  if (INDICATOR_IDS.every((k) => Math.abs(diff[k]) < 3)) return '歷史重演'
  if (diff[first] < 3) return mean(diff) >= 0 ? '穩健之城' : '停滯之城'
  const pair = PAIR_TITLES.find((p) => p.pair.includes(first) && p.pair.includes(second))
  return pair && diff[second] >= 4 ? pair.title : SINGLE_TITLES[first]
}

const FORMATS = [0, 1].map((d) => new Intl.NumberFormat('zh-HK', { minimumFractionDigits: d, maximumFractionDigits: d }))
const nf = (v: number, decimals = 0) => FORMATS[decimals].format(v)

function withUnit(v: number, unit: string, decimals: number): string {
  if (unit === '%') return `${nf(v, decimals)}%`
  return unit ? `${nf(v, decimals)} ${unit}` : nf(v, decimals)
}

/** The figure behind an indicator gap: the part that differs most in that direction, if any does. */
function partDetail(yours: IndicatorPart[], real: IndicatorPart[], sign: 1 | -1): string {
  let best = -1
  let gap = 1
  yours.forEach((p, i) => {
    const g = sign * (p.score - real[i].score)
    if (g >= gap) {
      gap = g
      best = i
    }
  })
  if (best < 0) return ''
  const p = yours[best]
  const label = p.label.replace(/（.*）$/, '')
  return `${label} ${withUnit(p.value, p.unit, p.decimals)}，真實 ${withUnit(real[best].value, p.unit, p.decimals)}`
}

/** A few lines comparing the city with real Hong Kong at the end: indicators, money and people. */
function summary(
  yours: { indicators: Record<IndicatorId, number>; parts: Record<IndicatorId, IndicatorPart[]>; net: number; population: number },
  real: { indicators: Record<IndicatorId, number>; parts: Record<IndicatorId, IndicatorPart[]>; net: number; population: number },
  gdp: number,
  early: EndCause | undefined,
): SummaryLine[] {
  const lines: SummaryLine[] = []
  if (early) lines.push({ tone: 'bad', text: EARLY_LINE[early] })

  const diff = (k: IndicatorId) => yours.indicators[k] - real.indicators[k]
  const better = INDICATOR_IDS.filter((k) => diff(k) >= SAME_BAND).sort((a, b) => diff(b) - diff(a))
  const worse = INDICATOR_IDS.filter((k) => diff(k) <= -SAME_BAND).sort((a, b) => diff(a) - diff(b))
  const same = INDICATOR_IDS.length - better.length - worse.length
  const counts = [
    better.length ? `${better.length} 項好過真實香港` : '',
    worse.length ? `${worse.length} 項較差` : '',
    same ? `${same} 項差不多` : '',
  ].filter(Boolean)
  lines.push({
    tone: 'neutral',
    text: same === INDICATOR_IDS.length ? '六項指標都跟真實香港差不多。' : `六項指標之中，${counts.join('、')}。`,
  })

  const indicatorLine = (k: IndicatorId, tone: 'good' | 'bad'): SummaryLine => {
    const detail = partDetail(yours.parts[k], real.parts[k], tone === 'good' ? 1 : -1)
    const scores = `${INDICATOR_LABEL[k]} ${Math.round(yours.indicators[k])} 分，真實香港 ${Math.round(real.indicators[k])} 分`
    return { tone, text: `${scores}${detail ? `：${detail}` : ''}。` }
  }
  for (const k of better.slice(0, 2)) lines.push(indicatorLine(k, 'good'))
  if (worse.length) lines.push(indicatorLine(worse[0], 'bad'))

  lines.push(
    yours.net >= 0
      ? { tone: 'neutral', text: `儲備減債務 ${nf(yours.net)} 億元，真實香港 ${nf(real.net)} 億元。` }
      : {
          tone: 'bad',
          text: `債務比儲備多 ${nf(-yours.net)} 億元，約佔本地生產總值 ${nf((-yours.net / gdp) * 100)}%；真實香港有儲備 ${nf(real.net)} 億元。`,
        },
  )
  lines.push({ tone: 'neutral', text: `人口 ${nf(yours.population)} 萬，真實香港 ${nf(real.population)} 萬。` })
  return lines
}

export function scoreCity(
  indicators: Record<IndicatorId, number>,
  yearlyIndicators: Record<IndicatorId, number>[],
  money: { net: number; yearlySpending: number; gdp: number },
  population: number,
  early: EndCause | undefined,
): CityScore {
  const parts: ScoreParts = {
    cityEnd: mean(indicators),
    cityAverage: yearlyIndicators.length ? yearlyIndicators.reduce((a, v) => a + mean(v), 0) / yearlyIndicators.length : mean(indicators),
    fiscal: fiscalScore(money.net, money.yearlySpending, money.gdp),
    population: populationScore(population),
  }
  return { indicators, parts, score: totalScore(parts), title: cityTitle(indicators, early) }
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
  const rows = sorted.map((p) => {
    const label = (id: string) => p.levels.find((l) => l.id === id)?.label ?? id
    const yours = playerPolicyLevel(s, p, endT)
    const real = realPolicyLevel(p.id, endT)
    const history = p.real.filter((r) => monthIndex(...r.from) <= endT).map((r) => `${r.from[0]} ${label(r.level)}`)
    return { id: p.id, label: p.label, yours: label(yours), real: label(real), realHistory: history.join(' → '), same: yours === real }
  })
  // Tax rates head the tax group.
  const firstTax = sorted.findIndex((p) => p.category === 'tax')
  rows.splice(firstTax < 0 ? rows.length : firstTax, 0, ...taxRows(s, endT))
  return rows
}

const pct = (v: number) => `${Number(v.toFixed(1))}%`

function taxRows(s: GameState, endT: number): PolicyRow[] {
  return TAXES.map((k) => {
    const yours = s.taxes[k]
    const real = realTax(k, endT)
    const history = REAL_TAX[k].filter((r) => monthIndex(...r.from) <= endT).map((r) => `${r.from[0]} ${pct(r.rate)}`)
    return { id: `tax-${k}`, label: TAX_INFO[k].label, yours: pct(yours), real: pct(real), realHistory: history.join(' → '), same: Math.abs(yours - real) < 0.01 }
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
  const cause = s.endedEarly?.cause
  const m = computeMetrics(s, endT)
  const realM = realMetricsEnd(endT)
  const yearly = s.snapshots.filter((snap) => snap.t <= endT)
  const net = s.reserves - debtTotal(s)
  const realNet = realReserves(endT + 1)
  const yours = scoreCity(
    computeIndicators(m, s),
    yearly.map((snap) => snap.indicators),
    { net, yearlySpending: s.last.spendingTotal * 12, gdp: m.gdp },
    m.population,
    cause,
  )
  const real = scoreCity(
    computeIndicators(realM, REAL_STATE),
    yearly.map((snap) => computeIndicators(realMetricsEnd(snap.t), REAL_STATE)),
    { net: realNet, yearlySpending: realSpendingMonth(endT) * 12, gdp: realM.gdp },
    realM.population,
    undefined,
  )
  const lines = summary(
    { indicators: yours.indicators, parts: indicatorParts(m, s.quality), net, population: m.population },
    { indicators: real.indicators, parts: indicatorParts(realM, REAL_STATE.quality), net: realNet, population: realM.population },
    m.gdp,
    cause,
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
    cause,
    reason: s.endedEarly?.reason,
    approval: yearly.map((snap) => snap.approval),
    real,
    betterThanReal: INDICATOR_IDS.filter((k) => yours.indicators[k] - real.indicators[k] >= SAME_BAND).length,
    summary: lines,
    comparison: comparison(m, realM, s, endT),
    reveals,
    policies: policyRows(s, endT),
    funding: fundingPeriods(s, endT),
    trend,
  }
}
