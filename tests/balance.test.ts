import { describe, expect, it } from 'vitest'
import { computeResult } from '../src/engine/endings'
import { debtTotal, playThrough, setFunding, type Strategy } from '../src/engine/sim'
import { monthOf } from '../src/engine/time'
import { realFunding } from '../src/engine/real'
import { FOLLOW_HISTORY, THOUGHTFUL, UNTOUCHED, allFunding, boost, randomStrategy } from './strategies'

const RUNS = 10

/** Internal scores over RUNS seeds; players never see them, the end screen compares with real Hong Kong. */
function summarise(make: (seed: number) => Strategy) {
  const scores: number[] = []
  let early = 0
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = computeResult(playThrough(seed, make(seed)))
    scores.push(r.score)
    if (r.endedEarly) early++
  }
  return { early, mean: scores.reduce((a, b) => a + b, 0) / RUNS, min: Math.min(...scores), max: Math.max(...scores) }
}

/** A careful player who also invests in the economy and housing, in years the treasury can afford it. */
const SKILLED: Strategy = {
  onMonth: (s) => {
    THOUGHTFUL.onMonth!(s)
    if (s.t > 0 && monthOf(s.t) !== 1) return
    if (s.reserves - debtTotal(s) < s.last.spendingTotal * 12) return
    setFunding(s, 'economy', Math.max(s.funding.economy, 1.4))
    setFunding(s, 'housing', Math.max(s.funding.housing, realFunding('housing', s.t) + 0.3))
  },
  choose: THOUGHTFUL.choose,
}

describe('balance', () => {
  it('scores a government that never acts below history', () => {
    expect(summarise(() => UNTOUCHED).mean).toBeLessThan(summarise(() => FOLLOW_HISTORY).mean - 2)
  })

  it('rewards reading the demand panel', () => {
    const history = summarise(() => FOLLOW_HISTORY).mean
    expect(summarise(() => THOUGHTFUL).min).toBeGreaterThan(history)
    expect(summarise(() => SKILLED).mean).toBeGreaterThan(history + 1.5)
  })

  it('ends in fiscal collapse when spending far beyond revenue', () => {
    expect(summarise(() => allFunding(1.5)).early).toBe(RUNS)
  })

  it('punishes starving every department', () => {
    expect(summarise(() => allFunding(0.7)).max).toBeLessThan(summarise(() => FOLLOW_HISTORY).mean - 10)
  })

  it('never lets one department carry the city', () => {
    const thoughtful = summarise(() => THOUGHTFUL).mean
    for (const d of ['housing', 'transport', 'economy', 'education', 'health', 'environment'] as const) {
      expect(summarise(() => boost(d, 1.8)).mean, d).toBeLessThan(thoughtful)
    }
  })

  it('spreads random play', () => {
    const sum = summarise((seed) => randomStrategy(seed))
    expect(sum.max - sum.min).toBeGreaterThanOrEqual(4)
  })
})
