import { describe, expect, it } from 'vitest'
import { computeResult, type Rating } from '../src/engine/endings'
import { playThrough, setFunding, type Strategy } from '../src/engine/sim'
import { realFunding } from '../src/engine/real'
import { FOLLOW_HISTORY, THOUGHTFUL, UNTOUCHED, allFunding, boost, randomStrategy } from './strategies'

const RUNS = 10

function summarise(make: (seed: number) => Strategy) {
  const ratings: Record<Rating, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 }
  let early = 0
  let total = 0
  for (let seed = 1; seed <= RUNS; seed++) {
    const r = computeResult(playThrough(seed, make(seed)))
    ratings[r.rating]++
    total += r.total
    if (r.endedEarly) early++
  }
  return { ratings, early, mean: total / RUNS }
}

/** A careful player who also invests in the economy and housing. */
const SKILLED: Strategy = {
  onMonth: (s) => {
    THOUGHTFUL.onMonth!(s)
    setFunding(s, 'economy', Math.max(s.funding.economy, 1.4))
    setFunding(s, 'housing', Math.max(s.funding.housing, realFunding('housing', s.t) + 0.3))
  },
  choose: THOUGHTFUL.choose,
}

describe('balance', () => {
  it('rates real history as B', () => {
    expect(summarise(() => FOLLOW_HISTORY).ratings.B).toBe(RUNS)
  })

  it('rates a government that never acts below history', () => {
    const sum = summarise(() => UNTOUCHED)
    expect(sum.ratings.S + sum.ratings.A + sum.ratings.B).toBe(0)
  })

  it('rewards reading the demand panel', () => {
    const thoughtful = summarise(() => THOUGHTFUL)
    expect(thoughtful.mean).toBeGreaterThan(0)
    expect(thoughtful.ratings.C + thoughtful.ratings.D).toBe(0)
    const skilled = summarise(() => SKILLED)
    expect(skilled.ratings.A + skilled.ratings.S).toBeGreaterThanOrEqual(RUNS * 0.8)
  })

  it('ends in fiscal collapse when spending far beyond revenue', () => {
    expect(summarise(() => allFunding(1.5)).early).toBe(RUNS)
  })

  it('punishes starving every department', () => {
    expect(summarise(() => allFunding(0.7)).ratings.D).toBe(RUNS)
  })

  it('never gives S for pouring money into one department', () => {
    for (const d of ['housing', 'transport', 'economy', 'education', 'health', 'environment'] as const) {
      expect(summarise(() => boost(d, 1.8)).ratings.S, d).toBe(0)
    }
  })

  it('spreads random play across ratings', () => {
    const sum = summarise((seed) => randomStrategy(seed))
    expect(Object.values(sum.ratings).filter((n) => n > 0).length).toBeGreaterThanOrEqual(3)
  })
})
