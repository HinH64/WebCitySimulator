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
  /** Sets a policy; with `at`, that many months after the decision came up (e.g. a law that starts later). */
  | { kind: 'policy'; id: string; level: string; at?: number }
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
  /** Comes up only while the player's policy is at one of these levels. */
  onlyIf?: { policy: string; levels: string[] }
}

/** What city events can look at: the city's own state, never the real history. */
export interface CityContext {
  t: number
  year: number
  month: number
  m: Metrics
  quality: Record<DeptId, number>
  funding: Record<DeptId, number>
  policy: (id: string) => string
  reserves: number
  debtRatio: number
  yearlySpending: number
  /** The treasury ran dry this month and had to borrow. */
  autoBorrowed: boolean
  /** People moving in minus moving out over the last 12 months, excluding one-way permits (萬). */
  migration12: number
  /** The city one, two, three and five years ago (from the yearly snapshots). */
  ago: (years: 1 | 2 | 3 | 5) => Metrics
}

/** Follows from the city's state when it crosses a threshold. */
export interface ParallelEvent {
  id: string
  /** Chance per year while the condition holds. */
  p: number
  /** Months before it can happen again; omitted means once per game. */
  cooldown?: number
  condition: (c: CityContext) => boolean
  title: string
  text: string | ((c: CityContext) => string)
  tone: 'good' | 'bad' | 'neutral'
  effects?: Effect[]
  options?: ChoiceOption[]
  defaultOptionId?: string
}

export type CityEventCategory = 'transport' | 'housing' | 'health' | 'economy' | 'environment' | 'weather' | 'education' | 'society'

/** Everyday news. One is drawn at random now and then, weighted by the city's state. */
export interface CityEvent {
  id: string
  category: CityEventCategory
  /** Relative chance of being drawn; 0 means it cannot happen now. */
  weight: (c: CityContext) => number
  /** Months before it can happen again. */
  cooldown: number
  text: string | ((c: CityContext) => string)
  tone: 'good' | 'bad' | 'neutral'
  effects?: Effect[]
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

export type NewsKind = 'history' | 'inbox' | 'decision' | 'parallel' | 'city' | 'stats' | 'milestone' | 'report' | 'system'

export interface NewsItem {
  t: number
  kind: NewsKind
  text: string
  tone?: 'good' | 'bad' | 'neutral'
  category?: CityEventCategory
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

export interface GameOptions {
  /** City events and city dynamics; off reproduces history exactly when following it. */
  events: boolean
}

export interface GameState {
  seed: number
  rng: number
  options: GameOptions
  /** Month about to be simulated. */
  t: number
  status: 'running' | 'ended'
  endedEarly?: { t: number; reason: string }

  dev: Deviations
  quality: Record<DeptId, number>
  funding: Record<DeptId, number>
  /** Tax rates; they start at 1997's and change only when the player changes them. */
  taxes: Record<TaxId, number>
  /** Tax rates as people react to them (moves gradually towards the actual rate). */
  felt: Record<TaxId, number>
  /** Policy levels; they change only when the player changes them or answers a decision. */
  policies: Record<string, string>
  /** Policy changes already decided that start later. */
  policyQueue: { t: number; id: string; level: string }[]
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
  /** Last 12 months of migration excluding one-way permits (萬). */
  migrationLog: number[]
  /** Highest step reached by each milestone series. */
  milestones: Record<string, number>
  /** The city's figures at the end of every month so far (index = month), for statistics releases. */
  statsLog: StatsPoint[]
  /** What each statistics release last reported, and when. */
  releases: Record<string, { t: number; v: number; n?: number }>
  news: NewsItem[]
  signals: Signal[]

  /** Last month's flows, for display. */
  last: MonthFlows
  year: YearAccumulator
  snapshots: YearSnapshot[]
  fundingByYear: Record<number, Record<DeptId, number>>
}

/** The city against real history at the end of one month, for statistics releases. */
export interface StatsPoint {
  /** GDP ÷ real GDP. */
  gdpRatio: number
  /** GDP per head ÷ the real one. */
  perCapitaRatio: number
  /** Population minus the real one, 萬. */
  popGap: number
  /** Share of people aged 65 or over minus the real share, percentage points. */
  elderlyGap: number
  unemployment: number
  priceIndex: number
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
