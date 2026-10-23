import type { DeptId, TaxId } from '../data/budget'
import type { SectorId } from '../data/sectors'
import type { CitizenState } from './citizens'

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
  /** Old private flats pulled down and not yet rebuilt, beyond history (萬); negative when the city rebuilds less. */
  redevelop: number
  /** Old private flats rebuilt so far beyond history (萬). */
  renewed: number
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
  /** Old flats being rebuilt (萬); see Deviations.redevelop. */
  | 'redevelop'

/** `at` and `over` are in months. */
export type Effect =
  | { kind: 'stock'; key: StockKey; v: number; at?: number; over?: number }
  /** Sets a policy; with `at`, that many months after the decision came up (e.g. a law that starts later). */
  | { kind: 'policy'; id: string; level: string; at?: number }
  /** Multiplies every department's funding level. */
  | { kind: 'funding'; factor: number }
  /** Raises one department's funding level, e.g. 0.1 = ten points. */
  | { kind: 'dept'; id: DeptId; delta: number }
  /** Raises a tax rate by percentage points from now on. */
  | { kind: 'tax'; id: TaxId; delta: number }
  | { kind: 'bond'; amount: number; years: number }

export interface ChoiceOption {
  id: string
  label: string
  effects: Effect[]
}

/** A spot on the map, Hong Kong 1980 Grid metres (easting, northing). */
export type Place = [number, number]

/**
 * A historical shock that hits harder or softer depending on how ready the city is. Real data
 * already contains the shock as real Hong Kong felt it, so only the city's difference counts.
 */
export interface Shock {
  /** Epidemics look at hospital and care places, storms at upkeep, financial crises at reserves. */
  kind: 'epidemic' | 'storm' | 'financial'
  /** How big the shock was, 1 = SARS, Typhoon Hato or the Asian financial crisis. */
  size: number
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
  /** Where it happened, for news that opens the map; only with the main text. */
  place?: Place
  shock?: Shock
  /** The railway line it opens (mapProjects.ts), so a city without the line reports it delayed instead. */
  route?: string
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
  /** Areas people see answering it as a response to, besides those of the policies it sets. */
  areas?: AreaId[]
}

/** What people worry about: the rows of the demand panel. Approval follows how the government responds to each. */
export const AREA_IDS = ['housing', 'jobs', 'transport', 'care', 'education', 'environment'] as const
export type AreaId = (typeof AREA_IDS)[number]

export interface ApprovalState {
  /** 0–100. */
  value: number
  /** How much people feel the government has lately responded in each area (0–1, fades over two years). */
  credit: Record<AreaId, number>
  /** Goodwill from answering decisions and changing policies in any area (0–1, fades over a year). */
  active: number
  /** Consecutive months below the removal line. */
  lowMonths: number
  /** Funding at the end of each of the last 12 months, so only going above all of them counts as a raise. */
  fundingLog: Record<DeptId, number>[]
  /** Funding, taxes and policies at the end of last month, to notice what changed. */
  seen: { funding: Record<DeptId, number>; taxes: Record<TaxId, number>; policies: Record<string, string> }
  /** Month each policy last earned credit, so switching back and forth earns nothing. */
  policyCredit: Record<string, number>
  /** Warning already given: 0 none, 1 below the warning line, 2 below the removal line. */
  warned: 0 | 1 | 2
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
  /** Approval at the end of last month. */
  approval: number
  /** Pressing problems people feel the government has not answered, worst first. */
  grievances: AreaId[]
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
  /** A decision for the player; options can depend on the city, e.g. its worst problems. */
  options?: ChoiceOption[] | ((c: CityContext) => ChoiceOption[])
  defaultOptionId?: string
  /** Areas people see answering it as a response to. */
  areas?: AreaId[]
  /** Where it may happen; one is picked by month, so the map can show it. */
  places?: Place[]
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
  /** Where it may happen; one is picked by month, so the map can show it. */
  places?: Place[]
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

export type NewsKind = 'history' | 'inbox' | 'decision' | 'parallel' | 'city' | 'project' | 'citizen' | 'stats' | 'milestone' | 'report' | 'system'

/** Months the news first reported each step of one of the city's own works (projects.ts). */
export interface WorkLog {
  building?: number
  built?: number
  delayed?: number
  caughtUp?: number
  /** When real Hong Kong had the same: the homes the city built early or late, or the line. */
  realAt?: number
}

export interface NewsItem {
  t: number
  kind: NewsKind
  text: string
  tone?: 'good' | 'bad' | 'neutral'
  category?: CityEventCategory
  /** Where it happened; the feed offers to show it on the map. */
  place?: Place
  /** The followed person it is about (data/citizens.ts). */
  citizen?: string
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
export type Signal = 'choice' | 'crisis' | 'approval' | 'yearEnd'

/** Why a term ended before October 2026. */
export type EndCause = 'debt' | 'approval'

export interface YearSnapshot {
  year: number
  t: number
  indicators: Record<IndicatorId, number>
  reserves: number
  debt: number
  approval: number
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
  /** Low approval can end the term; off still tracks approval but keeps the city in office. */
  removal: boolean
  /** Follow people through the term: three picked by the seed, the ones named, or none. */
  citizens: boolean | string[]
}

export interface GameState {
  seed: number
  rng: number
  options: GameOptions
  /** Month about to be simulated. */
  t: number
  status: 'running' | 'ended'
  endedEarly?: { t: number; reason: string; cause: EndCause }

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

  approval: ApprovalState

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
  /** The city's own works the news has reported, by key (projects.ts). */
  works: Record<string, WorkLog>
  /** The people the game follows (citizens.ts); display only. */
  citizens: CitizenState[]
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
  /** Property price index ÷ the real one. */
  priceRatio: number
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
  /** Old private flats being rebuilt beyond history (萬), not counted in `privateUnits` until rebuilt. */
  redeveloping: number
  /** Old private flats rebuilt so far beyond history (萬); the map's building sites move on with it. */
  renewed: number
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
