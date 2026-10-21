import { HISTORY_CHOICES, HISTORY_EVENTS, PARALLEL_EVENTS } from '../data/events'
import {
  LAG,
  allocationEffects,
  clampScore,
  gapDrift,
  gapScores,
  realAllocation,
  realScores,
  withCrossEffects,
  zeroScores,
} from './model'
import { nextRandom } from './rng'
import {
  END_YEAR,
  INDICATORS,
  PERIOD_STARTS,
  START_YEAR,
  TOTAL_POINTS,
  type Allocation,
  type ChoiceRecord,
  type Effect,
  type GameState,
  type IndicatorKey,
  type NewsItem,
  type PendingChoice,
  type ScheduledEffect,
  type YearItem,
} from './types'

/** Effects are multiplied by 1 ± NOISE so the same plan plays out a little differently per seed. */
const NOISE = 0.2
const MAX_PARALLEL_PER_YEAR = 2
/** The game starts on 1 July 1997 and ends at the "back to now" event in October 2026. */
const FIRST_MONTH = 7
const LAST_MONTH = 10

export function defaultAllocation(): Allocation {
  return { housing: 4, economy: 3, transport: 3, environment: 3, livelihood: 4, finance: 3 }
}

export function isValidAllocation(a: Allocation): boolean {
  let sum = 0
  for (const k of INDICATORS) {
    if (!Number.isInteger(a[k]) || a[k] < 0) return false
    sum += a[k]
  }
  return sum === TOTAL_POINTS
}

export function newGame(seed: number): GameState {
  const real = realScores(START_YEAR)
  return {
    seed,
    rng: seed,
    year: START_YEAR,
    month: FIRST_MONTH,
    values: { ...real },
    trail: { [START_YEAR]: { ...real } },
    alloc: defaultAllocation(),
    allocByYear: {},
    scheduled: [],
    flags: {},
    choices: [],
    news: [],
    queue: [],
    cooldowns: {},
    status: 'allocate',
  }
}

/** Month at which the current year is over. */
export function yearEndMonth(s: GameState): number {
  return s.year === END_YEAR ? LAST_MONTH : 12
}

export function isPeriodStart(year: number): boolean {
  return (PERIOD_STARTS as readonly number[]).includes(year)
}

function rand(s: GameState): number {
  const [v, next] = nextRandom(s.rng)
  s.rng = next
  return v
}

function noise(s: GameState): number {
  return 1 + NOISE * (2 * rand(s) - 1)
}

function schedule(s: GameState, year: number, k: IndicatorKey, v: number, source: ScheduledEffect['source']) {
  if (v !== 0) s.scheduled.push({ year, k, v, source })
}

function scheduleEffects(s: GameState, effects: Effect[], sign: 1 | -1, source: ScheduledEffect['source']) {
  for (const e of effects) {
    const at = e.at ?? 0
    const over = e.over ?? 1
    const n = noise(s)
    for (let i = 0; i < over; i++) schedule(s, s.year + 1 + at + i, e.k, (sign * e.v * n) / over, source)
  }
}

/** Net effect per indicator, ignoring timing; used to label news items. */
export function netEffects(effects: Effect[], minus: Effect[] = []): { k: IndicatorKey; v: number }[] {
  const sum = zeroScores()
  for (const e of effects) sum[e.k] += e.v
  for (const e of minus) sum[e.k] -= e.v
  return INDICATORS.filter((k) => Math.abs(sum[k]) >= 0.05).map((k) => ({ k, v: sum[k] }))
}

/**
 * Sets the allocation. At a period start it starts the year; otherwise it applies from next year,
 * because this year's allocation effects are already committed.
 */
export function setAllocation(s: GameState, alloc: Allocation) {
  if (!isValidAllocation(alloc)) throw new Error('allocation must use exactly 20 whole points')
  s.alloc = { ...alloc }
  if (s.status === 'allocate') {
    s.status = 'running'
    beginYear(s)
  }
}

function beginYear(s: GameState) {
  const y = s.year
  const real = realScores(y)
  const gap = gapScores(s.values, y)
  const realAlloc = realAllocation(y)
  s.allocByYear[y] = { ...s.alloc }
  s.month = y === START_YEAR ? FIRST_MONTH : 1

  const own = allocationEffects(s.alloc, realAlloc, s.values, gap)
  for (const e of withCrossEffects(own)) {
    const n = noise(s)
    LAG[e.from].forEach((w, i) => {
      if (w > 0) schedule(s, y + 1 + i, e.to, e.v * w * n, 'allocation')
    })
  }

  const items: YearItem[] = []

  if (s.landed) {
    const landed = INDICATORS.filter((k) => Math.abs(s.landed![k]) >= 0.8).map((k) => ({ k, v: s.landed![k] }))
    if (landed.length > 0) {
      items.push({
        type: 'news',
        month: s.month,
        news: { year: y, month: s.month, kind: 'project', text: '你的施政重心見效（相對真實歷史）', effects: landed },
      })
    }
    s.landed = undefined
  }

  for (const ev of HISTORY_EVENTS) {
    if (ev.year !== y) continue
    const met =
      !ev.requires || Object.entries(ev.requires).every(([choiceId, opts]) => opts.includes(s.flags[choiceId]))
    const text = met ? ev.text : ev.altText
    if (text) items.push({ type: 'news', month: ev.month, news: { year: y, month: ev.month, kind: 'history', text } })
  }

  for (const ch of HISTORY_CHOICES) {
    if (ch.year !== y) continue
    items.push({
      type: 'choice',
      month: ch.month,
      choice: { kind: 'history', id: ch.id, year: y, month: ch.month, title: ch.title, text: ch.text, options: ch.options },
    })
  }

  const ctx = { year: y, values: s.values, real, gap, alloc: s.alloc, realAlloc }
  let fired = 0
  for (const pe of PARALLEL_EVENTS) {
    if (fired >= MAX_PARALLEL_PER_YEAR) break
    if (pe.minYear !== undefined && y < pe.minYear) continue
    const last = s.cooldowns[pe.id]
    if (last !== undefined && (pe.cooldown === undefined || y - last < pe.cooldown)) continue
    if (!pe.condition(ctx)) continue
    if (rand(s) >= pe.p) continue
    s.cooldowns[pe.id] = y
    fired++
    const month = Math.min(yearEndMonth(s), s.month + Math.floor(rand(s) * (yearEndMonth(s) - s.month + 1)))
    if (pe.options) {
      items.push({
        type: 'choice',
        month,
        choice: { kind: 'parallel', id: pe.id, year: y, month, title: pe.title, text: pe.text, options: pe.options },
      })
    } else {
      const effects = pe.effects ?? []
      scheduleEffects(s, effects, 1, 'parallel')
      items.push({
        type: 'news',
        month,
        news: { year: y, month, kind: 'parallel', text: `${pe.title}：${pe.text}`, effects: netEffects(effects) },
      })
    }
  }

  s.queue = items.sort((a, b) => a.month - b.month)
}

/** Releases queued items up to `month`. Stops at the first choice, which the UI must resolve. */
export function tick(s: GameState, month: number): NewsItem[] {
  const added: NewsItem[] = []
  if (s.status !== 'running') return added
  while (s.queue.length > 0 && s.queue[0].month <= month) {
    const item = s.queue.shift()!
    if (item.type === 'news') {
      s.news.push(item.news)
      added.push(item.news)
    } else {
      s.month = Math.max(s.month, item.month)
      s.status = 'choice'
      s.pending = item.choice
      return added
    }
  }
  s.month = Math.max(s.month, Math.min(month, yearEndMonth(s)))
  return added
}

export function choose(s: GameState, optionId: string): ChoiceRecord {
  const p = s.pending
  if (s.status !== 'choice' || !p) throw new Error('no pending choice')
  const opt = p.options.find((o) => o.id === optionId)
  if (!opt) throw new Error(`unknown option ${optionId}`)
  let record: ChoiceRecord
  let effects: { k: IndicatorKey; v: number }[]

  if (p.kind === 'history') {
    const ch = HISTORY_CHOICES.find((c) => c.id === p.id)!
    const real = ch.options.find((o) => o.id === ch.realOptionId)!
    if (opt.id !== real.id) {
      scheduleEffects(s, opt.effects, 1, 'choice')
      scheduleEffects(s, real.effects, -1, 'choice')
    }
    effects = netEffects(opt.effects, real.effects)
    record = {
      id: ch.id,
      kind: 'history',
      year: p.year,
      title: ch.title,
      optionId: opt.id,
      optionLabel: opt.label,
      realOptionId: real.id,
      realOptionLabel: real.label,
      reveal: ch.reveal,
    }
  } else {
    scheduleEffects(s, opt.effects, 1, 'parallel')
    effects = netEffects(opt.effects)
    record = { id: p.id, kind: 'parallel', year: p.year, title: p.title, optionId: opt.id, optionLabel: opt.label }
  }

  s.flags[p.id] = opt.id
  s.choices.push(record)
  const news: NewsItem = {
    year: p.year,
    month: p.month,
    kind: p.kind === 'history' ? 'choice' : 'parallel',
    text: `${p.title}：你選擇「${opt.label}」`,
    effects,
  }
  s.news.push(news)
  s.pending = undefined
  s.status = 'running'
  return record
}

/** Moves to the next year. Returns false when the term ends early. */
function advance(s: GameState): boolean {
  const y = s.year
  const ny = y + 1
  const realNow = realScores(y)
  const realNext = realScores(ny)
  const drift = gapDrift(gapScores(s.values, y))
  const inc = zeroScores()
  const landed = zeroScores()
  const remaining: ScheduledEffect[] = []
  for (const e of s.scheduled) {
    if (e.year === ny) {
      inc[e.k] += e.v
      if (e.source === 'allocation') landed[e.k] += e.v
    } else if (e.year > ny) {
      remaining.push(e)
    }
  }
  s.scheduled = remaining

  const next = zeroScores()
  for (const k of INDICATORS) {
    next[k] = clampScore(s.values[k] + (realNext[k] - realNow[k]) + inc[k] + drift[k])
  }
  s.values = next
  s.trail[ny] = { ...next }
  s.landed = landed
  s.year = ny

  if (next.finance <= 0) {
    s.status = 'ended'
    s.endedEarly = { year: ny, reason: '財政儲備耗盡' }
    s.news.push({ year: ny, month: 1, kind: 'system', text: `${ny} 年：財政儲備耗盡，你的任期提早結束。` })
    return false
  }
  return true
}

/** Closes the current year once its clock has run out, then opens the next one. */
export function finishYear(s: GameState) {
  if (s.status !== 'running') return
  tick(s, yearEndMonth(s))
  if (s.status !== 'running') return
  if (s.year >= END_YEAR) {
    s.status = 'ended'
    return
  }
  if (!advance(s)) return
  if (isPeriodStart(s.year)) {
    s.status = 'allocate'
    s.month = 1
  } else {
    beginYear(s)
  }
}

export interface Strategy {
  allocate(s: GameState): Allocation
  choose(s: GameState, pending: PendingChoice): string
}

export function realOptionId(choiceId: string): string | undefined {
  return HISTORY_CHOICES.find((c) => c.id === choiceId)?.realOptionId
}

/** Picks what really happened, and the first option for parallel-timeline choices. */
export function historyChoice(p: PendingChoice): string {
  return p.kind === 'history' ? realOptionId(p.id)! : p.options[0].id
}

export const FOLLOW_HISTORY: Strategy = {
  allocate: (s) => realAllocation(s.year),
  choose: (_s, p) => historyChoice(p),
}

/** Runs a whole game without a UI; used by tests and balance checks. */
export function playThrough(seed: number, strategy: Strategy): GameState {
  const s = newGame(seed)
  for (let guard = 0; s.status !== 'ended' && guard < 10_000; guard++) {
    if (s.status === 'allocate') setAllocation(s, strategy.allocate(s))
    else if (s.status === 'choice') choose(s, strategy.choose(s, s.pending!))
    else finishYear(s)
  }
  return s
}

