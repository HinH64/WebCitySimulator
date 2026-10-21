import { describe, expect, it } from 'vitest'
import { computeResult, type Rating } from '../src/engine/endings'
import { FOLLOW_HISTORY, defaultAllocation, playThrough, type Strategy } from '../src/engine/sim'
import { INDICATORS } from '../src/engine/types'
import { ALL_IN, NEED_WEIGHTED, SHIFT, randomStrategy } from './strategies'

const RUNS = 300

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
  return { ratings, early: early / RUNS, meanTotal: total / RUNS }
}

const report: Record<string, ReturnType<typeof summarise>> = {}

describe('balance', () => {
  it('punishes putting everything into one indicator', () => {
    for (const k of INDICATORS) {
      const sum = summarise(() => ALL_IN(k))
      report[`all-in ${k}`] = sum
      expect(sum.ratings.S + sum.ratings.A, `all-in ${k}`).toBe(0)
    }
  })

  it('lets a balanced default plan finish the term', () => {
    const sum = summarise(() => ({ allocate: () => defaultAllocation(), choose: FOLLOW_HISTORY.choose }))
    report.default = sum
    expect(sum.early).toBe(0)
    expect(sum.ratings.B).toBeGreaterThan(RUNS / 2)
  })

  it('rewards a modest, sensible shift from history', () => {
    const sum = summarise(() => SHIFT('housing', 'livelihood', 2))
    report['shift livelihood→housing 2'] = sum
    expect(sum.early).toBe(0)
  })

  it('rewards reading the city and choosing well over the default plan', () => {
    const thoughtful = summarise(() => NEED_WEIGHTED)
    report.thoughtful = thoughtful
    expect(thoughtful.early).toBe(0)
    expect(thoughtful.meanTotal).toBeGreaterThan(report.default.meanTotal)
    expect(thoughtful.ratings.S + thoughtful.ratings.A).toBeGreaterThan(RUNS / 2)
  })

  it('spreads random play across ratings', () => {
    const sum = summarise((seed) => randomStrategy(seed))
    report.random = sum
    const used = Object.values(sum.ratings).filter((n) => n > 0).length
    expect(used).toBeGreaterThanOrEqual(3)
    console.table(
      Object.fromEntries(
        Object.entries(report).map(([name, r]) => [
          name,
          { ...r.ratings, early: r.early.toFixed(2), mean: r.meanTotal.toFixed(1) },
        ]),
      ),
    )
  })
})
