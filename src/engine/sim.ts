import { DEBT, DEPARTMENTS, FUNDING_MAX, FUNDING_MIN, TAX_INFO, type DeptId, type TaxId } from '../data/budget'
import { CITY_EVENTS } from '../data/cityEvents'
import { HISTORY_CHOICES, HISTORY_EVENTS, PARALLEL_EVENTS } from '../data/events'
import { POLICIES, POLICY_BY_ID, type PolicyDef, type PolicyEffect } from '../data/policies'
import { yearValue } from '../data/real'
import { computeIndicators } from './indicators'
import { attractiveness, clamp, computeMetrics, effectiveTaxes, fullQuality, realMetrics, zeroDeviations } from './metrics'
import {
  cpiAt,
  levelAt,
  normalisedSectorDeviation,
  realFelt,
  realFunding,
  realPolicyLevel,
  realReserves,
  realRevenueMonth,
  realSectors,
  realSpendingMonth,
  realTax,
  revenueShare,
  sectorBoost,
  spendShare,
  stepSectors,
  updateFelt,
} from './real'
import { nextRandom } from './rng'
import { LAST_MONTH_INDEX, START_YEAR, isBefore, monthOf, yearOf } from './time'
import type {
  ChoiceOption,
  ChoiceRecord,
  CityContext,
  Effect,
  GameOptions,
  GameState,
  HistoryChoice,
  InboxItem,
  Metrics,
  MonthFlows,
  StockKey,
  YearAccumulator,
} from './types'

/** Months a decision waits in the inbox before the default is taken. */
export const INBOX_DEADLINE = 12
/** Effects vary by ±15% so the same plan plays out a little differently per seed. */
const NOISE = 0.15
/** New land-based housing per year (萬 units) split between public housing and land sales. */
const LAND_UNITS_PER_YEAR = 3
/** Land premium per 萬 private units, per point of the price index (億). */
const PREMIUM_PER_INDEX = 1.2
/** Gross people moving in or out each year (萬) for reasons the player can influence. */
const MIGRATION_GROSS = 6
const PRICE_ELASTICITY = 2
/** Return on reserves above or below the historical level, per year. */
const MARGINAL_RETURN = 0.04
const PRICE_ADJUST_PER_MONTH = 0.025
const LIFE_ADJUST_PER_MONTH = 0.15 / 12
const POLICY_LEVEL_SPEED = 1 / 24
const AUTO_BOND_BUFFER = 300
const MAX_PARALLEL_PER_MONTH = 2
/** Chance each month that an everyday city event makes the news. */
const CITY_EVENT_CHANCE = 0.22

/** Milestones announced when a series crosses each multiple of its step. */
const MILESTONES: { id: string; step: number; value: (m: Metrics, s: GameState) => number; text: (v: number) => string }[] = [
  { id: 'population', step: 25, value: (m) => m.population, text: (v) => `香港人口突破 ${fmtStep(v)} 萬。` },
  { id: 'publicUnits', step: 5, value: (m) => m.publicUnits, text: (v) => `公營房屋單位突破 ${fmtStep(v)} 萬個。` },
  { id: 'railKm', step: 25, value: (m) => m.railKm, text: (v) => `鐵路網絡突破 ${fmtStep(v)} 公里。` },
  { id: 'reserves', step: 5000, value: (_m, s) => s.reserves, text: (v) => `財政儲備突破 ${fmtStep(v)} 億元。` },
  { id: 'lifeExpectancy', step: 2, value: (m) => m.lifeExpectancy, text: (v) => `平均預期壽命突破 ${fmtStep(v)} 歲。` },
]

function fmtStep(v: number): string {
  return new Intl.NumberFormat('zh-HK').format(v)
}

/**
 * How extra spending (per 億 at 1997 prices) turns into things, and when.
 * Weights are spread over successive years starting `startYear` years later.
 */
const CONVERSIONS: Record<DeptId, { key: StockKey; per: number; startYear: number; weights: number[] }[]> = {
  housing: [
    { key: 'publicUnits', per: 0.0063, startYear: 3, weights: [0.1, 0.25, 0.3, 0.25, 0.1] },
    { key: 'landSale', per: 0.0012, startYear: 3, weights: [1] },
    { key: 'privateUnits', per: 0.0012, startYear: 4, weights: [0.2, 0.3, 0.3, 0.2] },
    { key: 'green', per: -0.00004, startYear: 1, weights: [1] },
  ],
  transport: [{ key: 'rail', per: 1 / 30, startYear: 5, weights: [0.1, 0.2, 0.3, 0.25, 0.15] }],
  // Economy is special-cased: each 億 adds 0.5 億 to the GDP level.
  economy: [{ key: 'gdp', per: 0.5, startYear: 0, weights: [0.3, 0.4, 0.3] }],
  education: [{ key: 'postSecondary', per: 0.0024, startYear: 3, weights: [0.2, 0.2, 0.2, 0.2, 0.2] }],
  health: [{ key: 'care', per: 0.0007, startYear: 1, weights: [0.5, 0.5] }],
  environment: [{ key: 'pm10', per: -0.015, startYear: 0, weights: [0.3, 0.3, 0.2, 0.2] }],
}

/**
 * Upkeep quality settles where funding allows: no loss down to 95%, then progressively worse.
 * It falls about a quarter of the way to that level each year and recovers a fifth.
 */
export function qualityTarget(f: number): number {
  return clamp(1 - 1.5 * Math.max(0, 0.95 - f), 0.3, 1)
}

function nextQuality(q: number, f: number): number {
  const target = qualityTarget(f)
  const speed = target < q ? 0.25 : 0.2
  return clamp(q + ((target - q) * speed) / 12, 0.3, 1)
}

/** Spending above 100% builds things, with diminishing returns beyond 150%. */
export function expansionShare(f: number): number {
  if (f <= 1) return 0
  if (f <= 1.5) return f - 1
  return 0.5 + (f - 1.5) * 0.5
}

function emptyFlows(): MonthFlows {
  return { revenue: {}, spending: {}, revenueTotal: 0, spendingTotal: 0, births: 0, deaths: 0, oneWay: 0, otherNet: 0, popChange: 0 }
}

function newAccumulator(year: number, m: Metrics): YearAccumulator {
  return {
    year,
    revenue: 0,
    spending: 0,
    popStart: m.population,
    publicStart: m.publicUnits,
    railStart: m.railKm,
    funding: { housing: 0, transport: 0, economy: 0, education: 0, health: 0, environment: 0 },
    months: 0,
  }
}

export function newGame(seed: number, options: Partial<GameOptions> = {}): GameState {
  const funding = Object.fromEntries(DEPARTMENTS.map((d) => [d, realFunding(d, 0)])) as Record<DeptId, number>
  const s: GameState = {
    seed,
    rng: seed,
    options: { events: true, ...options },
    t: 0,
    status: 'running',
    dev: zeroDeviations(),
    quality: fullQuality(),
    funding,
    taxes: {},
    felt: { ...realFelt(0) },
    policies: Object.fromEntries(POLICIES.map((p) => [p.id, p.real[0].level])),
    policyQueue: [],
    policyLevels: { unemployment: 0, welfare: 0, attract: 0, pm10: 0, green: 0 },
    sectors: { ...realSectors(0) },
    reserves: realReserves(0),
    bonds: [],
    nextBondId: 1,
    pipeline: {},
    inbox: [],
    nextInboxId: 1,
    choices: [],
    flags: {},
    cooldowns: {},
    migrationLog: [],
    milestones: {},
    news: [],
    signals: [],
    last: emptyFlows(),
    year: newAccumulator(START_YEAR, realMetrics(0)),
    snapshots: [],
    fundingByYear: {},
  }
  return s
}

function rand(s: GameState): number {
  const [v, next] = nextRandom(s.rng)
  s.rng = next
  return v
}

function noise(s: GameState): number {
  return 1 + NOISE * (2 * rand(s) - 1)
}

function schedule(s: GameState, month: number, key: StockKey, v: number) {
  if (v === 0 || month > LAST_MONTH_INDEX + 240) return
  const bucket = (s.pipeline[month] ??= {})
  bucket[key] = (bucket[key] ?? 0) + v
}

export function metricsNow(s: GameState): Metrics {
  return computeMetrics(s, Math.min(s.t, LAST_MONTH_INDEX))
}

export function debtTotal(s: GameState): number {
  return s.bonds.reduce((a, b) => a + b.principal, 0)
}

/** The policy as the player has it; before it becomes available it is at its neutral level. */
export function playerPolicyLevel(s: Pick<GameState, 'policies'>, p: PolicyDef, t: number): string {
  if (isBefore(t, p.availableFrom)) return p.levels[0].id
  return s.policies[p.id] ?? p.real[0].level
}

function growthActive(e: PolicyEffect, year: number): number {
  if (!e.growth) return 0
  if (e.growthYears && (year < e.growthYears[0] || year > e.growthYears[1])) return 0
  return e.growth
}

export function bondRate(s: GameState, m: Metrics): number {
  const ratio = debtTotal(s) / m.gdp
  return levelAt('interestRate', s.t) + DEBT.baseSpread + DEBT.spreadPerDebtRatio * ratio
}

export function issueBond(s: GameState, amount: number, years: number, auto = false) {
  if (amount <= 0) return
  const m = metricsNow(s)
  s.bonds.push({ id: s.nextBondId++, principal: amount, rate: bondRate(s, m), issued: s.t, matures: s.t + years * 12, auto })
  s.reserves += amount
}

export function repayBond(s: GameState, id: number): boolean {
  const bond = s.bonds.find((b) => b.id === id)
  if (!bond || s.reserves < bond.principal) return false
  s.reserves -= bond.principal
  s.bonds = s.bonds.filter((b) => b.id !== id)
  return true
}

export function setFunding(s: GameState, d: DeptId, level: number) {
  s.funding[d] = clamp(Math.round(level * 100) / 100, FUNDING_MIN, FUNDING_MAX)
}

export function setTax(s: GameState, id: TaxId, rate: number | undefined) {
  if (rate === undefined) delete s.taxes[id]
  else s.taxes[id] = clamp(rate, TAX_INFO[id].min, TAX_INFO[id].max)
}

/** The player's own change; it replaces any change already scheduled for that policy. */
export function setPolicy(s: GameState, id: string, level: string) {
  const p = POLICY_BY_ID[id]
  if (!p || isBefore(s.t, p.availableFrom)) return
  if (!p.levels.some((l) => l.id === level)) return
  s.policies[id] = level
  s.policyQueue = s.policyQueue.filter((q) => q.id !== id)
}

/** A change decided now that starts in a later month, if any. */
export function scheduledPolicy(s: GameState, id: string): { t: number; level: string } | undefined {
  return s.policyQueue.find((q) => q.id === id)
}

function applyEffect(s: GameState, e: Effect, sign: 1 | -1, baseT: number) {
  switch (e.kind) {
    case 'stock': {
      const at = e.at ?? 0
      const over = e.over ?? 1
      const n = noise(s)
      for (let i = 0; i < over; i++) schedule(s, Math.max(s.t, baseT + at + i), e.key, (sign * e.v * n) / over)
      break
    }
    case 'policy': {
      const due = baseT + (e.at ?? 0)
      s.policyQueue = s.policyQueue.filter((q) => q.id !== e.id)
      if (due <= s.t) s.policies[e.id] = e.level
      else s.policyQueue.push({ t: due, id: e.id, level: e.level })
      break
    }
    case 'funding':
      for (const d of DEPARTMENTS) setFunding(s, d, s.funding[d] * e.factor)
      break
    case 'tax':
      setTax(s, e.id, (s.taxes[e.id] ?? realTax(e.id, s.t)) + e.delta)
      break
    case 'bond':
      issueBond(s, e.amount, e.years)
      break
  }
}

/**
 * Answers an inbox item. A history choice always sets the policies it names; its other effects
 * only apply where the option differs from what happened, because history already contains them.
 */
export function answer(s: GameState, uid: number, optionId: string, expired = false): ChoiceRecord | undefined {
  const item = s.inbox.find((i) => i.uid === uid)
  if (!item) return undefined
  const opt = item.options.find((o) => o.id === optionId)
  if (!opt) return undefined
  s.inbox = s.inbox.filter((i) => i.uid !== uid)

  if (item.kind === 'history') {
    const ch = HISTORY_CHOICES.find((c) => c.id === item.id)!
    const real = ch.options.find((o) => o.id === ch.realOptionId)!
    for (const e of opt.effects) if (e.kind === 'policy') applyEffect(s, e, 1, item.received)
    if (opt.id !== real.id) {
      for (const e of opt.effects) if (e.kind !== 'policy') applyEffect(s, e, 1, s.t)
      for (const e of real.effects) if (e.kind === 'stock') applyEffect(s, e, -1, item.received)
    }
  } else {
    for (const e of opt.effects) applyEffect(s, e, 1, s.t)
  }

  s.flags[item.id] = opt.id
  const record: ChoiceRecord = {
    id: item.id,
    kind: item.kind,
    t: s.t,
    title: item.title,
    optionId: opt.id,
    optionLabel: opt.label,
    expired,
  }
  s.choices.push(record)
  s.news.push({
    t: s.t,
    kind: 'decision',
    text: expired ? `${item.title}：限期已過，維持「${opt.label}」` : `${item.title}：你決定「${opt.label}」`,
  })
  return record
}

function pushInbox(s: GameState, item: Omit<InboxItem, 'uid' | 'received' | 'deadline'>) {
  s.inbox.push({ ...item, uid: s.nextInboxId++, received: s.t, deadline: s.t + INBOX_DEADLINE })
  s.news.push({ t: s.t, kind: 'inbox', text: item.title })
  s.signals.push('choice')
}

/** Whether a history decision comes up, given the player's policies at the time. */
export function choiceApplies(s: Pick<GameState, 'policies'>, ch: HistoryChoice, t: number): boolean {
  if (!ch.onlyIf) return true
  return ch.onlyIf.levels.includes(playerPolicyLevel(s, POLICY_BY_ID[ch.onlyIf.policy], t))
}

/** The city as it was about `years` ago, from the yearly snapshots. */
export function metricsAgo(s: GameState, years: number): Metrics {
  const target = s.t - 12 * years
  let best: Metrics | undefined
  for (const snap of s.snapshots) if (snap.t <= target) best = snap.metrics
  return best ?? s.snapshots[0]?.metrics ?? realMetrics(0)
}

function needRatio(d: DeptId | 'other', m: Metrics, real: Metrics): number {
  switch (d) {
    case 'housing':
      return m.publicUnits / real.publicUnits
    case 'transport':
      return m.railKm / real.railKm
    case 'economy':
      return m.gdp / real.gdp
    case 'education':
      return (m.children + 0.2 * m.working) / (real.children + 0.2 * real.working)
    case 'health':
      return Math.pow(m.elderly / real.elderly, 0.6) * Math.pow(m.population / real.population, 0.4)
    case 'environment':
      return Math.sqrt((m.population / real.population) * (m.gdp / real.gdp))
    case 'other':
      return m.population / real.population
  }
}

/** What maintaining each department's existing services costs this month, at real prices (億). */
export function baselines(t: number, m: Metrics): Record<DeptId, number> {
  const real = realMetrics(t)
  const shares = spendShare(t)
  const total = realSpendingMonth(t)
  const out = {} as Record<DeptId, number>
  for (const d of DEPARTMENTS) out[d] = ((total * shares[d]) / realFunding(d, t)) * needRatio(d, m, real)
  return out
}

function scheduleDepartment(s: GameState, d: DeptId, amount: number, m: Metrics) {
  const t = s.t
  const at1997 = amount / cpiAt(t)
  for (const c of CONVERSIONS[d]) {
    const n = noise(s)
    const total = d === 'economy' ? ((amount * c.per) / m.gdp) * 100 * n : at1997 * c.per * n
    c.weights.forEach((w, i) => schedule(s, t + 12 * (c.startYear + i) + 6, c.key, total * w))
  }
}

function applyPipeline(s: GameState): { landSale: number; money: number } {
  const due = s.pipeline[s.t]
  delete s.pipeline[s.t]
  if (!due) return { landSale: 0, money: 0 }
  const dev = s.dev
  for (const [key, v] of Object.entries(due) as [StockKey, number][]) {
    switch (key) {
      case 'gdp':
        dev.lnProductivity += Math.log(1 + v / 100)
        break
      case 'tourism': {
        s.sectors = { ...s.sectors, tourism: Math.max(0.001, s.sectors.tourism + v / 100) }
        const total = Object.values(s.sectors).reduce((a, b) => a + b, 0)
        for (const k of Object.keys(s.sectors) as (keyof typeof s.sectors)[]) s.sectors[k] /= total
        break
      }
      case 'landSale':
      case 'money':
        break
      default:
        dev[key] += v
    }
  }
  return { landSale: due.landSale ?? 0, money: due.money ?? 0 }
}

function historyEventText(s: GameState, ev: (typeof HISTORY_EVENTS)[number], t: number): string | undefined {
  const choicesMet =
    !ev.requires || Object.entries(ev.requires).every(([choiceId, opts]) => opts.includes(s.flags[choiceId]))
  const policyMet =
    !ev.requiresPolicy || ev.requiresPolicy.levels.includes(playerPolicyLevel(s, POLICY_BY_ID[ev.requiresPolicy.id], t))
  return choicesMet && policyMet ? ev.text : ev.altText
}

function fmt(v: number, d = 0): string {
  return new Intl.NumberFormat('zh-HK', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
}

function signed(v: number, d = 1): string {
  const r = Number(v.toFixed(d))
  return (r > 0 ? '+' : r < 0 ? '−' : '') + fmt(Math.abs(r), d)
}

function closeYear(s: GameState, m: Metrics) {
  const acc = s.year
  if (acc.months > 0) {
    const balance = acc.revenue - acc.spending
    s.fundingByYear[acc.year] = Object.fromEntries(
      DEPARTMENTS.map((d) => [d, acc.funding[d] / acc.months]),
    ) as Record<DeptId, number>
    s.news.push({
      t: s.t,
      kind: 'report',
      text:
        `${acc.year} 年度報告：收入 ${fmt(acc.revenue)} 億、開支 ${fmt(acc.spending)} 億，` +
        `${balance >= 0 ? '盈餘' : '赤字'} ${fmt(Math.abs(balance))} 億；人口 ${signed(m.population - acc.popStart)} 萬；` +
        `公營房屋 ${signed(m.publicUnits - acc.publicStart, 1)} 萬個；鐵路 ${signed(m.railKm - acc.railStart, 0)} 公里。`,
      tone: balance >= 0 ? 'good' : 'bad',
    })
  }
  s.year = newAccumulator(yearOf(s.t), m)
}

function snapshot(s: GameState, t: number) {
  const m = computeMetrics(s, t)
  s.snapshots.push({
    year: yearOf(t),
    t,
    indicators: computeIndicators(m, s),
    reserves: s.reserves,
    debt: debtTotal(s),
    metrics: m,
  })
}

/** Simulates one month. */
export function step(s: GameState) {
  if (s.status !== 'running') return
  const t = s.t
  const year = yearOf(t)
  const month = monthOf(t)
  s.signals = []

  if (month === 1 && t > 0) closeYear(s, computeMetrics(s, t))

  for (const q of s.policyQueue.filter((x) => x.t <= t)) s.policies[q.id] = q.level
  s.policyQueue = s.policyQueue.filter((x) => x.t > t)

  const due = applyPipeline(s)
  const real = realMetrics(t)
  let m = computeMetrics(s, t)
  const popStart = m.population
  const cpi = cpiAt(t)

  // Departments: spending, expansion relative to history, upkeep quality.
  const base = baselines(t, m)
  const deptSpend = {} as Record<DeptId, number>
  for (const d of DEPARTMENTS) {
    const fP = s.funding[d]
    const fR = realFunding(d, t)
    const baseReal = base[d] / needRatio(d, m, real)
    deptSpend[d] = base[d] * fP
    const extra = base[d] * expansionShare(fP) - baseReal * expansionShare(fR)
    if (extra !== 0) scheduleDepartment(s, d, extra, m)
    s.quality[d] = nextQuality(s.quality[d], fP)
    s.year.funding[d] += fP
  }
  s.year.months++

  // Policies: compare the player's level with the real one.
  const levelTarget = { unemployment: 0, welfare: 0, attract: 0, pm10: 0, green: 0 }
  let policyCost = 0
  let policyGdpFlow = 0
  let stampRatio = 1
  for (const p of POLICIES) {
    const lp = playerPolicyLevel(s, p, t)
    const lr = realPolicyLevel(p.id, t)
    const ep = p.effects[lp] ?? {}
    const er = p.effects[lr] ?? {}
    for (const k of Object.keys(levelTarget) as (keyof typeof levelTarget)[]) levelTarget[k] += (ep[k] ?? 0) - (er[k] ?? 0)
    if (lp === lr) continue
    policyCost += (((ep.cost ?? 0) - (er.cost ?? 0)) * cpi) / 12
    policyGdpFlow += ((ep.costGdpShare ?? 0) * m.gdp - (er.costGdpShare ?? 0) * real.gdp) / 12
    const pub = (ep.publicUnits ?? 0) - (er.publicUnits ?? 0)
    const pubFast = (ep.publicUnitsFast ?? 0) - (er.publicUnitsFast ?? 0)
    const priv = (ep.privateUnits ?? 0) - (er.privateUnits ?? 0)
    const landShare = ((ep.publicLandShare ?? 0) - (er.publicLandShare ?? 0)) * LAND_UNITS_PER_YEAR
    schedule(s, t + 36, 'publicUnits', (pub + landShare) / 12)
    schedule(s, t + 18, 'publicUnits', pubFast / 12)
    schedule(s, t + 48, 'privateUnits', (priv - landShare) / 12)
    schedule(s, t + 12, 'landSale', (priv - landShare) / 12)
    s.dev.priceShift += ((ep.priceDrift ?? 0) - (er.priceDrift ?? 0)) / 12
    s.dev.lnProductivity += (growthActive(ep, year) - growthActive(er, year)) / 100 / 12
    s.dev.pop += ((ep.talent ?? 0) - (er.talent ?? 0)) / 12
    stampRatio *= (ep.stampFactor ?? 1) / (er.stampFactor ?? 1)
  }
  for (const k of Object.keys(levelTarget) as (keyof typeof levelTarget)[]) {
    s.policyLevels[k] += (levelTarget[k] - s.policyLevels[k]) * POLICY_LEVEL_SPEED
  }

  // Economy: sector mix and continuous growth effects.
  const realShares = realSectors(t)
  const sectorDev = normalisedSectorDeviation(t, realShares)
  const boostP = sectorBoost(playerPolicyLevel(s, POLICY_BY_ID.industryFocus, t))
  const boostR = sectorBoost(realPolicyLevel('industryFocus', t))
  let aggregate = 0
  for (const k of Object.keys(sectorDev) as (keyof typeof sectorDev)[]) {
    aggregate += s.sectors[k] * (sectorDev[k] + (boostP[k] ?? 0)) - realShares[k] * (sectorDev[k] + (boostR[k] ?? 0))
  }
  s.sectors = stepSectors(s.sectors, sectorDev, boostP)
  const feltReal = realFelt(t)
  const growth =
    aggregate +
    0.04 * s.dev.postSecondary +
    0.5 * Math.log(m.railPerMillion / real.railPerMillion) -
    0.08 * (s.felt.profits - feltReal.profits) -
    1.5 * (1 - s.quality.economy)
  s.dev.lnProductivity += growth / 100 / 12

  // Prices and life expectancy move gradually towards where conditions push them.
  const supplyP = m.privateUnits + 0.5 * m.publicUnits
  const supplyR = real.privateUnits + 0.5 * real.publicUnits
  const priceTarget =
    PRICE_ELASTICITY * (Math.log(m.households / real.households) - Math.log(supplyP / supplyR)) +
    Math.log(m.gdpPerCapita / real.gdpPerCapita) +
    s.dev.priceShift
  s.dev.lnPrice += (priceTarget - s.dev.lnPrice) * PRICE_ADJUST_PER_MONTH
  const lifeTarget =
    2.5 * Math.log(m.carePerThousandElderly / real.carePerThousandElderly) +
    0.04 * (real.pm10 - m.pm10) -
    (1 - s.quality.health) * 2 +
    0.3 * Math.log(m.gdpPerCapita / real.gdpPerCapita) +
    0.05 * s.policyLevels.welfare
  s.dev.lifeExpectancy += (lifeTarget - s.dev.lifeExpectancy) * LIFE_ADJUST_PER_MONTH
  s.dev.postSecondary -= ((1 - s.quality.education) * 0.5) / 12
  s.dev.pm10 *= 1 - 0.03 / 12

  // People move with the city's attractiveness.
  const attract = attractiveness(m, real, s, t)
  const migration = (MIGRATION_GROSS / 12) * (attract.total * attract.total - 1)
  s.dev.pop += migration

  // Money.
  const taxesP = effectiveTaxes(s.taxes, t)
  const rs = revenueShare(t)
  const rm = realRevenueMonth(t)
  const gdpRatio = m.gdp / real.gdp
  const priceRatio = m.priceIndex / real.priceIndex
  const unitsRatio = (m.publicUnits + m.privateUnits) / (real.publicUnits + real.privateUnits)
  const popRatio = m.population / real.population
  const revenue: Record<string, number> = {
    salaries: rm * rs.salaries * Math.pow(taxesP.salaries / realTax('salaries', t), 0.7) * gdpRatio,
    profits: rm * rs.profits * Math.pow(taxesP.profits / realTax('profits', t), 0.7) * gdpRatio,
    rates: rm * rs.rates * Math.pow(taxesP.rates / realTax('rates', t), 0.9) * unitsRatio * Math.sqrt(priceRatio),
    stamp: rm * rs.stamp * priceRatio * stampRatio,
    land: rm * rs.land * priceRatio + due.landSale * PREMIUM_PER_INDEX * m.priceIndex,
    investment: rm * rs.investment + ((Math.max(0, s.reserves) - realReserves(t)) * MARGINAL_RETURN) / 12,
    other: rm * rs.other * popRatio,
  }
  if (policyGdpFlow < 0) revenue.gst = -policyGdpFlow
  const interest = s.bonds.reduce((a, b) => a + (b.principal * b.rate) / 100 / 12, 0)
  const spending: Record<string, number> = {
    ...deptSpend,
    other: realSpendingMonth(t) * spendShare(t).other * popRatio,
    policies: policyCost + Math.max(0, policyGdpFlow),
    projects: due.money,
    interest,
  }
  const revenueTotal = Object.values(revenue).reduce((a, b) => a + b, 0)
  const spendingTotal = Object.values(spending).reduce((a, b) => a + b, 0)
  s.reserves += revenueTotal - spendingTotal
  s.year.revenue += revenueTotal
  s.year.spending += spendingTotal

  for (const b of s.bonds.filter((b) => b.matures <= t)) {
    s.reserves -= b.principal
    s.news.push({ t, kind: 'system', text: `償還到期債券 ${fmt(b.principal)} 億元。` })
  }
  s.bonds = s.bonds.filter((b) => b.matures > t)

  let autoBorrowed = false
  if (s.reserves < 0) {
    issueBond(s, -s.reserves + AUTO_BOND_BUFFER, 5, true)
    autoBorrowed = true
    s.signals.push('crisis')
  }

  s.felt = updateFelt(s.felt, taxesP)

  // End-of-month view of the city.
  m = computeMetrics(s, t)
  const debt = debtTotal(s)
  const debtRatio = debt / m.gdp
  s.last = {
    revenue,
    spending,
    revenueTotal,
    spendingTotal,
    births: yearValue('births', year) / 12,
    deaths: yearValue('deaths', year) / 12,
    oneWay: yearValue('oneWayPermits', year) / 12,
    otherNet: 0,
    popChange: levelAt('population', t + 1) + s.dev.pop - popStart,
  }
  s.last.otherNet = s.last.popChange - s.last.births + s.last.deaths - s.last.oneWay
  s.migrationLog = [...s.migrationLog.slice(-11), s.last.otherNet]

  if (debtRatio > DEBT.ceiling) {
    s.status = 'ended'
    s.endedEarly = { t, reason: '債務超過上限，財政崩潰' }
    s.news.push({ t, kind: 'system', text: `${year} 年 ${month} 月：債務超過本地生產總值的 30%，財政崩潰，你的任期提早結束。`, tone: 'bad' })
    snapshot(s, t)
    s.t = t + 1
    return
  }

  // Events.
  for (const ev of HISTORY_EVENTS) {
    if (ev.year !== year || ev.month !== month) continue
    const text = historyEventText(s, ev, t)
    if (text) s.news.push({ t, kind: 'history', text })
  }
  for (const ch of HISTORY_CHOICES) {
    if (ch.year !== year || ch.month !== month || !choiceApplies(s, ch, t)) continue
    pushInbox(s, { kind: 'history', id: ch.id, title: ch.title, text: ch.text, options: ch.options, defaultOptionId: ch.defaultOptionId })
  }
  for (const item of s.inbox.filter((i) => i.deadline <= t)) answer(s, item.uid, item.defaultOptionId, true)

  checkMilestones(s, m)
  if (s.options.events) {
    const ctx: CityContext = {
      t,
      year,
      month,
      m,
      quality: s.quality,
      funding: s.funding,
      policy: (id) => playerPolicyLevel(s, POLICY_BY_ID[id], t),
      reserves: s.reserves,
      debtRatio,
      yearlySpending: spendingTotal * 12,
      autoBorrowed,
      migration12: s.migrationLog.reduce((a, b) => a + b, 0),
      ago: (years) => metricsAgo(s, years),
    }
    cityDynamics(s, ctx)
    cityEvent(s, ctx)
  }

  if (month === 12) {
    snapshot(s, t)
    s.signals.push('yearEnd')
  }

  if (t >= LAST_MONTH_INDEX) {
    if (month !== 12) snapshot(s, t)
    closeYear(s, m)
    s.status = 'ended'
  }
  s.t = t + 1
}

function checkMilestones(s: GameState, m: Metrics) {
  for (const ms of MILESTONES) {
    // Only new highs are announced, so a series hovering around a step is reported once.
    const level = Math.floor(ms.value(m, s) / ms.step)
    const prev = s.milestones[ms.id]
    if (prev !== undefined && level > prev) s.news.push({ t: s.t, kind: 'milestone', text: ms.text(level * ms.step), tone: 'good' })
    if (prev === undefined || level > prev) s.milestones[ms.id] = level
  }
}

/** Events that follow from the city crossing a threshold. */
function cityDynamics(s: GameState, ctx: CityContext) {
  const t = s.t
  let fired = 0
  for (const pe of PARALLEL_EVENTS) {
    if (fired >= MAX_PARALLEL_PER_MONTH) break
    const last = s.cooldowns[pe.id]
    if (last !== undefined && (pe.cooldown === undefined || t - last < pe.cooldown)) continue
    if (!pe.condition(ctx)) continue
    const pMonth = pe.p >= 1 ? 1 : 1 - Math.pow(1 - pe.p, 1 / 12)
    if (rand(s) >= pMonth) continue
    s.cooldowns[pe.id] = t
    fired++
    const text = typeof pe.text === 'function' ? pe.text(ctx) : pe.text
    if (pe.options) {
      pushInbox(s, { kind: 'parallel', id: pe.id, title: pe.title, text, options: pe.options, defaultOptionId: pe.defaultOptionId ?? pe.options[0].id })
    } else {
      for (const e of pe.effects ?? []) applyEffect(s, e, 1, t)
      s.news.push({ t, kind: 'parallel', text: `${pe.title}：${text}`, tone: pe.tone })
    }
    if (pe.id === 'debtWarning') s.signals.push('crisis')
  }
}

/** Now and then, one piece of everyday news, more likely where the city's state makes it so. */
function cityEvent(s: GameState, ctx: CityContext) {
  if (rand(s) >= CITY_EVENT_CHANCE) return
  const t = s.t
  const pool = CITY_EVENTS.map((ev) => {
    const last = s.cooldowns[ev.id]
    const ready = last === undefined || t - last >= ev.cooldown
    return { ev, w: ready ? Math.max(0, ev.weight(ctx)) : 0 }
  }).filter((x) => x.w > 0)
  const total = pool.reduce((a, x) => a + x.w, 0)
  if (total <= 0) return
  let r = rand(s) * total
  const pick = pool.find((x) => (r -= x.w) < 0) ?? pool[pool.length - 1]
  const ev = pick.ev
  s.cooldowns[ev.id] = t
  for (const e of ev.effects ?? []) applyEffect(s, e, 1, t)
  s.news.push({ t, kind: 'city', category: ev.category, text: typeof ev.text === 'function' ? ev.text(ctx) : ev.text, tone: ev.tone })
}

export interface Strategy {
  onMonth?(s: GameState): void
  choose(s: GameState, item: InboxItem): string | undefined
}

export function realOptionId(choiceId: string): string | undefined {
  return HISTORY_CHOICES.find((c) => c.id === choiceId)?.realOptionId
}

/** Does what the real government did: real funding levels, policies and choices. */
export const FOLLOW_HISTORY: Strategy = {
  onMonth: (s) => {
    for (const d of DEPARTMENTS) s.funding[d] = realFunding(d, s.t)
    for (const p of POLICIES) s.policies[p.id] = realPolicyLevel(p.id, s.t)
  },
  choose: (_s, item) => (item.kind === 'history' ? realOptionId(item.id) : item.defaultOptionId),
}

/** Runs a whole game without a UI; used by tests and balance checks. */
export function playThrough(seed: number, strategy: Strategy, options: Partial<GameOptions> = {}): GameState {
  const s = newGame(seed, options)
  for (let guard = 0; s.status === 'running' && guard < 5000; guard++) {
    for (const item of [...s.inbox]) {
      const id = strategy.choose(s, item)
      if (id) answer(s, item.uid, id)
    }
    strategy.onMonth?.(s)
    step(s)
  }
  return s
}

export function optionLabel(options: ChoiceOption[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id
}

