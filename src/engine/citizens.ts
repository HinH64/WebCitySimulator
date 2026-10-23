import { CITIZENS, CITIZEN_BY_ID } from '../data/citizens'
import { HISTORY_CHOICES } from '../data/events'
import { RAIL_ROUTES } from '../data/mapProjects'
import { POLICY_BY_ID } from '../data/policies'
import { yearValue } from '../data/real'
import { cityRail } from './map'
import { realMetrics, realMetricsEnd } from './metrics'
import { levelAt, realPolicyLevel } from './real'
import { nextRandom } from './rng'
import { LAST_MONTH_INDEX, isBefore, monthIndex, yearOf } from './time'
import type { GameState, Metrics, Place } from './types'

/**
 * Following a few people through the term (data/citizens.ts). Display only: the stories read the city,
 * draw their own random numbers, and never change anything the simulation uses.
 */

/** What a story can look at in one month: the city's own figures and decisions. */
export interface CitizenView {
  t: number
  /** The city at the end of the month. */
  m: Metrics
  /** The answer given to a history decision, if any. */
  flag: (id: string) => string | undefined
  policy: (id: string) => string
  /** Whether a railway line (mapProjects.ts) is in use. */
  line: (id: string) => boolean
  /** Net migration over the last 12 months, excluding one-way permits (萬). */
  migration12: number
}

export interface CitizenState {
  id: string
  stage: string
  /** Month the current stage began. */
  since: number
  /** Month of the last line. */
  last: number
  /** Figures the story keeps, e.g. months waited. */
  n: Record<string, number>
  done: boolean
  /** The story's own random numbers; `seed` is where they started, to replay it on real Hong Kong. */
  rng: number
  seed: number
}

/** How many people one game follows. */
export const FOLLOWED = 3

/** A year without news of someone gets a quiet line. */
const QUIET_MONTHS = 12

function stream(seed: number) {
  let state = seed
  return {
    next: () => {
      const [v, s] = nextRandom(state)
      state = s
      return v
    },
    get state() {
      return state
    },
  }
}

/** The people a game follows: three picked by the seed, in the order their stories start; or the ones named. */
export function pickCitizens(seed: number, ids?: string[]): CitizenState[] {
  const r = stream((seed ^ 0x2c1b3c6d) >>> 0)
  let chosen = ids
  if (!chosen) {
    const pool = CITIZENS.map((c) => c.id)
    chosen = []
    while (chosen.length < FOLLOWED) chosen.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0])
    chosen.sort((a, b) => monthIndex(...CITIZEN_BY_ID[a].start) - monthIndex(...CITIZEN_BY_ID[b].start))
  }
  return chosen.map((id) => {
    const start = monthIndex(...CITIZEN_BY_ID[id].start)
    const own = Math.floor(r.next() * 2 ** 31) + 1
    return { id, stage: 'start', since: start, last: start, n: {}, done: false, rng: own, seed: own }
  })
}

/** Runs one month of one story; returns what was said. */
function advance(st: CitizenState, v: CitizenView): { text: string; place?: Place }[] {
  const c = CITIZEN_BY_ID[st.id]
  if (st.done || v.t < monthIndex(...c.start)) return []
  const r = stream(st.rng)
  const lines: { text: string; place?: Place }[] = []
  const say = (text: string, place?: Place) => {
    lines.push({ text, place })
    st.last = v.t
  }
  c.step(st, v, say, r.next)
  if (!st.done && lines.length === 0 && v.t - st.last >= QUIET_MONTHS) {
    const quiet = c.quiet(st, v)
    if (quiet) say(quiet)
  }
  st.rng = r.state
  return lines
}

/** The people's stories for the month just simulated, as news; the first month introduces them. */
export function stepCitizens(s: GameState, m: Metrics, t: number) {
  if (s.citizens.length === 0) return
  if (t === 0) {
    const names = s.citizens.map((st) => {
      const c = CITIZEN_BY_ID[st.id]
      const later = monthIndex(...c.start) > 0 ? `，${c.start[0]} 年起` : ''
      return `${c.name}（${c.who}${later}）`
    })
    const count = ['', '一', '兩', '三', '四', '五', '六', '七', '八'][names.length] ?? String(names.length)
    s.news.push({ t, kind: 'citizen', text: `你會跟住${count}個香港人的故事：${names.join('、')}。在城市新聞選「市民故事」可以只看他們。` })
  }
  let rail: Set<string> | undefined
  const v: CitizenView = {
    t,
    m,
    flag: (id) => s.flags[id],
    // As playerPolicyLevel in sim.ts, which imports this module.
    policy: (id) => (isBefore(t, POLICY_BY_ID[id].availableFrom) ? POLICY_BY_ID[id].levels[0].id : (s.policies[id] ?? POLICY_BY_ID[id].real[0].level)),
    line: (id) => (rail ??= new Set(cityRail(m.railKm - realMetrics(t).railKm, t).open.map((r) => r.id))).has(id),
    migration12: s.migrationLog.reduce((a, b) => a + b, 0),
  }
  for (const st of s.citizens) {
    for (const line of advance(st, v)) {
      s.news.push({ t, kind: 'citizen', citizen: st.id, text: line.text, place: line.place ?? CITIZEN_BY_ID[st.id].place })
    }
  }
}

// ---- Real Hong Kong ----

const REAL_CHOICE = Object.fromEntries(HISTORY_CHOICES.map((c) => [c.id, c.realOptionId]))

/** People moving in minus out in month t, excluding one-way permits, worked out as the city does when following history. */
function realOtherNet(t: number): number {
  const year = yearOf(t)
  const popChange = levelAt('population', t + 1) - levelAt('population', t)
  return popChange - yearValue('births', year) / 12 + yearValue('deaths', year) / 12 - yearValue('oneWayPermits', year) / 12
}

function realView(t: number): CitizenView {
  const months: number[] = []
  for (let k = Math.max(0, t - 11); k <= t; k++) months.push(realOtherNet(k))
  return {
    t,
    m: realMetricsEnd(t),
    flag: (id) => REAL_CHOICE[id],
    policy: (id) => realPolicyLevel(id, t),
    line: (id) => {
      const r = RAIL_ROUTES.find((x) => x.id === id)
      return r !== undefined && monthIndex(...r.opened) <= t && !(r.closed && monthIndex(...r.closed) <= t)
    },
    migration12: months.reduce((a, b) => a + b, 0),
  }
}

/** The same person's story in real Hong Kong, to the given month. */
export function realStory(st: CitizenState, end = LAST_MONTH_INDEX): CitizenState {
  const c = CITIZEN_BY_ID[st.id]
  const start = monthIndex(...c.start)
  const real: CitizenState = { id: st.id, stage: 'start', since: start, last: start, n: {}, done: false, rng: st.seed, seed: st.seed }
  for (let t = start; t <= end && !real.done; t++) advance(real, realView(t))
  return real
}

export interface CitizenEnding {
  id: string
  name: string
  who: string
  /** How it went in the player's Hong Kong. */
  yours: string
  /** How it would have gone in real Hong Kong. */
  real: string
  same: boolean
}

/** Each followed person's story in the player's city and in real Hong Kong, to the month the term ended. */
export function citizenEndings(s: GameState): CitizenEnding[] {
  const end = Math.min(s.t - 1, LAST_MONTH_INDEX)
  return s.citizens.map((st) => {
    const c = CITIZEN_BY_ID[st.id]
    const yours = monthIndex(...c.start) > end ? '你的任期在他們的故事開始前已經結束' : c.summary(st)
    const real = c.summary(realStory(st, end))
    return { id: st.id, name: c.name, who: c.who, yours, real, same: yours === real }
  })
}
