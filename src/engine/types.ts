export const INDICATORS = ['housing', 'economy', 'transport', 'environment', 'livelihood', 'finance'] as const
export type IndicatorKey = (typeof INDICATORS)[number]

export type Scores = Record<IndicatorKey, number>

/** Points per indicator; always sums to TOTAL_POINTS. */
export type Allocation = Record<IndicatorKey, number>

export const TOTAL_POINTS = 20
export const START_YEAR = 1997
export const END_YEAR = 2026
/** Years at which a new allocation period begins. */
export const PERIOD_STARTS = [1997, 2002, 2007, 2012, 2017, 2022] as const

/**
 * An effect on one indicator, in score points, applied relative to history.
 * `at` is the delay in years after the decision; the total `v` is spread evenly over `over` years.
 */
export interface Effect {
  k: IndicatorKey
  v: number
  at?: number
  over?: number
}

export interface ChoiceOption {
  id: string
  label: string
  detail?: string
  effects: Effect[]
}

/** Fixed event that happened in real history. */
export interface HistoryEvent {
  id: string
  year: number
  month: number
  text: string
  /** Only shown when a previous choice took one of these options (choiceId -> optionIds). */
  requires?: Record<string, string[]>
  /** Alternative text when `requires` is not met. Omitted means the event is skipped. */
  altText?: string
}

/** A real historical decision point; the real option is the baseline the engine measures against. */
export interface HistoryChoice {
  id: string
  year: number
  month: number
  title: string
  text: string
  options: ChoiceOption[]
  realOptionId: string
  reveal: string
}

/** Events that only happen in the player's parallel timeline. */
export interface ParallelEvent {
  id: string
  /** Probability per eligible year. */
  p: number
  /** Years before it can fire again; omitted means once per game. */
  cooldown?: number
  minYear?: number
  condition: (ctx: ConditionContext) => boolean
  title: string
  text: string
  /** Narrative-only events apply these effects directly. */
  effects?: Effect[]
  /** Choice events: no real baseline, effects apply as-is. */
  options?: ChoiceOption[]
}

export interface ConditionContext {
  year: number
  values: Scores
  real: Scores
  gap: Scores
  alloc: Allocation
  realAlloc: Allocation
}

export interface ScheduledEffect {
  year: number
  k: IndicatorKey
  v: number
  source: 'allocation' | 'choice' | 'parallel'
}

export type NewsKind = 'history' | 'choice' | 'parallel' | 'project' | 'system'

export interface NewsItem {
  year: number
  month: number
  kind: NewsKind
  text: string
  effects?: { k: IndicatorKey; v: number }[]
}

/** A pending decision the UI must resolve before time continues. */
export interface PendingChoice {
  kind: 'history' | 'parallel'
  id: string
  year: number
  month: number
  title: string
  text: string
  options: ChoiceOption[]
}

export interface ChoiceRecord {
  id: string
  kind: 'history' | 'parallel'
  year: number
  title: string
  optionId: string
  optionLabel: string
  realOptionId?: string
  realOptionLabel?: string
  reveal?: string
}

/** One queued item in the current year, in month order. */
export type YearItem =
  | { type: 'news'; month: number; news: NewsItem }
  | { type: 'choice'; month: number; choice: PendingChoice }

export interface GameState {
  seed: number
  rng: number
  year: number
  /** Month the clock has reached inside the current year (1–12). */
  month: number
  values: Scores
  /** values[year] for every simulated year so far. */
  trail: Record<number, Scores>
  /** Allocation used from the next year that begins (or the current one while allocating). */
  alloc: Allocation
  /** Allocation actually applied in each year. */
  allocByYear: Record<number, Allocation>
  scheduled: ScheduledEffect[]
  /** Allocation-driven effects that landed at the start of the current year, for the news feed. */
  landed?: Scores
  flags: Record<string, string>
  choices: ChoiceRecord[]
  news: NewsItem[]
  queue: YearItem[]
  cooldowns: Record<string, number>
  status: 'allocate' | 'running' | 'choice' | 'ended'
  pending?: PendingChoice
  endedEarly?: { year: number; reason: string }
}
