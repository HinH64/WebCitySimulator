import { afterAll, describe, expect, it } from 'vitest'
import { DEPARTMENTS, DEPT_INFO } from '../src/data/budget'
import { computeResult } from '../src/engine/endings'
import { computeMetrics } from '../src/engine/metrics'
import { debtTotal, playThrough, type Strategy } from '../src/engine/sim'
import { LAST_MONTH_INDEX } from '../src/engine/time'
import type { GameOptions } from '../src/engine/types'
import { FOLLOW_HISTORY, SKILLED, THOUGHTFUL, UNTOUCHED, allFunding, boost, randomStrategy, withPolicy } from './strategies'

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1)

/** Every case uses the same seeds, with city events, removal and citizen stories on by default. */
function sample(make: (seed: number) => Strategy, options: Partial<GameOptions> = {}) {
  return SEEDS.map((seed) => {
    const strategy = make(seed)
    let minApproval = 100
    const game = playThrough(seed, {
      ...strategy,
      onMonth: (s) => {
        minApproval = Math.min(minApproval, s.approval.value)
        strategy.onMonth?.(s)
      },
    }, options)
    const result = computeResult(game)
    return {
      seed,
      result,
      metrics: computeMetrics(game, result.endT),
      snapshots: game.snapshots,
      net: game.reserves - debtTotal(game),
      minApproval: Math.min(minApproval, game.approval.value),
    }
  })
}

type Runs = ReturnType<typeof sample>
const cases = new Map<string, Runs>()

function runs(name: string, make: (seed: number) => Strategy, options?: Partial<GameOptions>): Runs {
  if (!cases.has(name)) cases.set(name, sample(make, options))
  return cases.get(name)!
}

const history = () => runs('照歷史（有城市新聞）', () => FOLLOW_HISTORY)
const thoughtful = () => runs('看需求面板', () => THOUGHTFUL)
const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
const meanScore = (games: Runs) => average(games.map((g) => g.result.score))
const range = (values: number[], digits = 1) => `${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)}`

afterAll(() => {
  console.table([...cases].map(([name, games]) => ({
    玩法: name,
    平均分: meanScore(games).toFixed(2),
    分數範圍: range(games.map((g) => g.result.score), 2),
    完成: games.filter((g) => !g.result.endedEarly).length,
    財政崩潰: games.filter((g) => g.result.cause === 'debt').length,
    被迫下台: games.filter((g) => g.result.cause === 'approval').length,
    結束年份: range(games.map((g) => g.result.endYear), 0),
    最低民望: range(games.map((g) => g.minApproval)),
    結束淨儲備: range(games.map((g) => g.net), 0),
  })))
})

describe('balance after stages 4a–4f (10 matched seeds)', () => {
  it('finishes history with the historical title, with or without city events', () => {
    const exact = runs('照歷史（無城市新聞）', () => FOLLOW_HISTORY, { events: false })
    for (const g of [...exact, ...history()]) {
      expect(g.result.endedEarly, `seed ${g.seed}`).toBe(false)
      expect(g.result.endT).toBe(LAST_MONTH_INDEX)
      expect(g.result.title, `seed ${g.seed}`).toBe('歷史重演')
      expect(g.minApproval, `seed ${g.seed}`).toBeGreaterThanOrEqual(40)
    }
    for (const g of exact) expect(g.result.score).toBeCloseTo(g.result.real.score, 6)
  })

  it('removes an inactive government in 2004–2010 and scores it below history', () => {
    const inactive = runs('甚麼都不做', () => UNTOUCHED)
    for (const g of inactive) {
      expect(g.result.cause, `seed ${g.seed}`).toBe('approval')
      expect(g.result.endYear).toBeGreaterThanOrEqual(2004)
      expect(g.result.endYear).toBeLessThanOrEqual(2010)
    }
    expect(meanScore(inactive)).toBeLessThan(meanScore(history()) - 2)
  })

  it('rewards demand-led play with a full term and a better result on every seed', () => {
    thoughtful().forEach((g, i) => {
      expect(g.result.endedEarly, `seed ${g.seed}`).toBe(false)
      expect(g.result.endT).toBe(LAST_MONTH_INDEX)
      expect(g.result.score, `seed ${g.seed}`).toBeGreaterThan(history()[i].result.score)
    })
    expect(Math.min(...thoughtful().map((g) => g.result.score))).toBeGreaterThan(meanScore(history()))
  })

  it('rewards affordable investment by more than 1.5 points on average', () => {
    const skilled = runs('看需求＋經濟房屋投資', () => SKILLED)
    for (const g of skilled) expect(g.result.endedEarly, `seed ${g.seed}`).toBe(false)
    expect(meanScore(skilled)).toBeGreaterThan(meanScore(history()) + 1.5)
  })

  it('ends overspending in fiscal collapse, rather than removal for low approval', () => {
    for (const g of runs('全部部門 150%', () => allFunding(1.5))) {
      expect(g.result.cause, `seed ${g.seed}`).toBe('debt')
      expect(g.result.title).toBe('財政懸崖')
    }
  })

  it('punishes starving services with removal or a result at least 10 points below history', () => {
    const starved = runs('全部部門 70%', () => allFunding(0.7))
    starved.forEach((g, i) => {
      expect(g.result.cause === 'approval' || g.result.score < history()[i].result.score - 10, `seed ${g.seed}`).toBe(true)
    })
    expect(Math.max(...starved.map((g) => g.result.score))).toBeLessThan(meanScore(history()) - 10)
  })

  it('never lets one department outperform demand-led play', () => {
    for (const d of DEPARTMENTS) {
      const single = runs(`${DEPT_INFO[d].label} 180%`, () => boost(d, 1.8))
      expect(meanScore(single), d).toBeLessThan(meanScore(thoughtful()))
      single.forEach((g, i) => expect(g.result.score, `${d}, seed ${g.seed}`).toBeLessThan(thoughtful()[i].result.score))
    }
  })

  it('spreads random play by at least four points', () => {
    const scores = runs('隨機', randomStrategy).map((g) => g.result.score)
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThanOrEqual(4)
  })

  it('trades short-term disruption and reserves for more housing through faster renewal', () => {
    const fast = runs('市區重建：加快', () => withPolicy('renewal', 'fast'))
    const slow = runs('市區重建：少量', () => withPolicy('renewal', 'off'))
    fast.forEach((g, i) => {
      const h = history()[i]
      expect(g.result.endedEarly, `seed ${g.seed}`).toBe(false)
      expect(g.snapshots.find((s) => s.year === 2002)!.metrics.privateUnits).toBeLessThan(h.snapshots.find((s) => s.year === 2002)!.metrics.privateUnits - 1)
      expect(g.metrics.privateUnits).toBeGreaterThan(h.metrics.privateUnits + 4)
      expect(g.metrics.affordability).toBeLessThan(h.metrics.affordability)
      expect(g.net).toBeLessThan(h.net)
      expect(slow[i].metrics.privateUnits).toBeLessThan(h.metrics.privateUnits)
      expect(slow[i].net).toBeGreaterThan(h.net)
    })
  })

  it('trades the cost of early inspection for safety, while forgoing inspection lowers wellbeing', () => {
    const early = runs('強制驗樓：提早實施', () => withPolicy('inspection', 'on'))
    const never = runs('強制驗樓：不設', () => withPolicy('inspection', 'off'))
    early.forEach((g, i) => {
      const h = history()[i]
      expect(g.result.endedEarly, `seed ${g.seed}`).toBe(false)
      expect(g.snapshots.find((s) => s.year === 2011)!.indicators.wellbeing).toBeGreaterThan(h.snapshots.find((s) => s.year === 2011)!.indicators.wellbeing)
      expect(g.net).toBeLessThan(h.net)
      expect(never[i].result.indicators.wellbeing).toBeLessThan(h.result.indicators.wellbeing)
    })
  })
})
