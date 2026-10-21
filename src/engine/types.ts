import type { DeptId, TaxId } from '../data/budget'
import type { SectorId } from '../data/sectors'

/** Quantities the player can push away from history; all start at 0. */
export interface Deviations {
  /** Population, 萬. */
  pop: number
  /** Public housing units, 萬. */
  publicUnits: number
  /** Private housing units, 萬. */
  privateUnits: number
  /** Rail network, km. */
  rail: number
  /** Hospital beds and subsidised elderly places, 萬. */
  care: number
  /** Share of people with post-secondary education, percentage points. */
  postSecondary: number
  /** PM10 from spending and choices, µg/m³. */
  pm10: number
  /** Protected land share, percentage points. */
  green: number
  /** Productivity relative to history, as a natural log. */
  lnProductivity: number
  /** Property prices relative to history, as a natural log (adjusts gradually). */
  lnPrice: number
  /** Accumulated push on prices from policies and events, natural log. */
  priceShift: number
  /** Life expectancy, years (adjusts gradually). */
  lifeExpectancy: number
}

export type StockKey =
  | 'publicUnits'
  | 'privateUnits'
  | 'rail'
  | 'care'
  | 'postSecondary'
  | 'pm10'
  | 'green'
  | 'pop'
  | 'priceShift'
  /** GDP level, percent. */
  | 'gdp'
  /** Tourism share of the economy, percentage points. */
  | 'tourism'
  /** Private units whose land is sold now (萬); brings in land premium. */
  | 'landSale'
  /** Extra spending, 億 (nominal at the time it is paid). */
  | 'money'

/** `at` and `over` are in months. */
export type Effect =
  | { kind: 'stock'; key: StockKey; v: number; at?: number; over?: number }
  | { kind: 'policy'; id: string; level: string }
  /** Multiplies every department's funding level. */
  | { kind: 'funding'; factor: number }
  /** Raises a tax rate by percentage points from now on. */
  | { kind: 'tax'; id: TaxId; delta: number }
  | { kind: 'bond'; amount: number; years: number }

export interface ChoiceOption {
  id: string
  label: string
  effects: Effect[]
}

export interface HistoryEvent {
  id: string
  year: number
  month: number
  text: string
  /** Shown only when earlier choices took one of these options. */
  requires?: Record<string, string[]>
  /** Shown only when the policy is at one of these levels. */
  requiresPolicy?: { id: string; levels: string[] }
  /** Shown instead when a requirement is not met; omitted means nothing is shown. */
  altText?: string
}

export interface HistoryChoice {
  id: string
  year: number
  month: number
  title: string
  text: string
  options: ChoiceOption[]
  realOptionId: string
  /** "Keep things as they are": taken when the deadline passes. */
  defaultOptionId: string
  reveal: string
}

export interface ParallelContext {
  t: number
  year: number
  m: Metrics
  real: Metrics
  dev: Deviations
  quality: Record<DeptId, number>
  attract: number
  reserves: number
  realReserves: number
  debtRatio: number
  yearlySpending: number
  /** The treasury ran dry this month and had to borrow. */
  autoBorrowed: boolean
}

export interface ParallelEvent {
  id: string
  /** Chance per year while the condition holds. */
  p: number
  /** Months before it can happen again; omitted means once per game. */
  cooldown?: number
  condition: (c: ParallelContext) => boolean
  title: string
  text: string | ((c: ParallelContext) => string)
  tone: 'good' | 'bad' | 'neutral'
  effects?: Effect[]
  options?: ChoiceOption[]
  defaultOptionId?: string
}

export interface InboxItem {
  uid: number
  kind: 'history' | 'parallel'
  id: string
  title: string
  text: string
  options: ChoiceOption[]
  defaultOptionId: string
  received: number
  deadline: number
}

export interface ChoiceRecord {
  id: string
  kind: 'history' | 'parallel'
  t: number
  title: string
  optionId: string
  optionLabel: string
  /** True when the deadline passed and the default was taken. */
  expired: boolean
}

export type NewsKind = 'history' | 'inbox' | 'decision' | 'parallel' | 'report' | 'system'

export interface NewsItem {
  t: number
  kind: NewsKind
  text: string
  tone?: 'good' | 'bad' | 'neutral'
}

export interface Bond {
  id: number
  principal: number
  /** Annual interest rate, %. */
  rate: number
  issued: number
  matures: number
  auto: boolean
}

/** Events the UI may pause for, depending on the player's settings. */
export type Signal = 'choice' | 'crisis' | 'yearEnd'

export interface YearSnapshot {
  year: number
  t: number
  indicators: Record<IndicatorId, number>
  reserves: number
  debt: number
  metrics: Metrics
}

export const INDICATOR_IDS = ['economy', 'housing', 'mobility', 'wellbeing', 'talent', 'environment'] as const
export type IndicatorId = (typeof INDICATOR_IDS)[number]

export interface YearAccumulator {
  year: number
  revenue: number
  spending: number
  popStart: number
  publicStart: number
  railStart: number
  funding: Record<DeptId, number>
  months: number
}

export interface GameState {
  seed: number
  rng: number
  /** Month about to be simulated. */
  t: number
  status: 'running' | 'ended'
  endedEarly?: { t: number; reason: string }

  dev: Deviations
  quality: Record<DeptId, number>
  funding: Record<DeptId, number>
  /** Undefined means the tax follows its historical rate. */
  taxes: Partial<Record<TaxId, number>>
  /** Tax rates as people react to them (moves gradually towards the actual rate). */
  felt: Record<TaxId, number>
  /** Undefined means the policy follows what happened in history. */
  policies: Record<string, string | undefined>
  /** Level effects of policies as they phase in. */
  policyLevels: { unemployment: number; welfare: number; attract: number; pm10: number; green: number }
  sectors: Record<SectorId, number>

  reserves: number
  bonds: Bond[]
  nextBondId: number

  /** Scheduled changes by month index. */
  pipeline: Record<number, Partial<Record<StockKey, number>>>

  inbox: InboxItem[]
  nextInboxId: number
  choices: ChoiceRecord[]
  flags: Record<string, string>
  cooldowns: Record<string, number>
  news: NewsItem[]
  signals: Signal[]

  /** Last month's flows, for display. */
  last: MonthFlows
  year: YearAccumulator
  snapshots: YearSnapshot[]
  fundingByYear: Record<number, Record<DeptId, number>>
}

export interface MonthFlows {
  revenue: Record<string, number>
  spending: Record<string, number>
  revenueTotal: number
  spendingTotal: number
  births: number
  deaths: number
  oneWay: number
  otherNet: number
  popChange: number
}

/** Everything the UI shows about the city at one moment, in real units. */
export interface Metrics {
  population: number
  children: number
  working: number
  elderly: number
  households: number
  publicUnits: number
  privateUnits: number
  prhWait: number
  priceIndex: number
  /** Price index divided by a wage index (1997 = 1). */
  affordability: number
  unemployment: number
  gdp: number
  gdpPerCapita: number
  /** GDP per capita in 1997 prices, 千元. */
  realGdpPerCapita: number
  railKm: number
  railPerMillion: number
  pm10: number
  green: number
  lifeExpectancy: number
  careCapacity: number
  carePerThousandElderly: number
  postSecondary: number
  professionalShare: number
  sectors: Record<SectorId, number>
  taxes: Record<TaxId, number>
}
