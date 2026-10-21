import { describe, expect, it } from 'vitest'
import { DEPARTMENTS, REVENUE_SHARE_ANCHORS, SPEND_SHARE_ANCHORS } from '../src/data/budget'
import { HISTORY_CHOICES, HISTORY_EVENTS, PARALLEL_EVENTS } from '../src/data/events'
import { POLICIES, POLICY_BY_ID } from '../src/data/policies'
import { FIRST_YEAR, LAST_YEAR, REAL, realRevenue, yearValue } from '../src/data/real'
import { computeResult } from '../src/engine/endings'
import { computeIndicators } from '../src/engine/indicators'
import { computeMetrics, realMetrics } from '../src/engine/metrics'
import { debtTotal, newGame, playThrough, step, type Strategy } from '../src/engine/sim'
import { monthIndex } from '../src/engine/time'
import { INDICATOR_IDS } from '../src/engine/types'
import { FOLLOW_HISTORY, UNTOUCHED, allFunding, boost, randomStrategy } from './strategies'

const YEARS = LAST_YEAR - FIRST_YEAR + 1

describe('data', () => {
  it('has one value per year for every series', () => {
    for (const [id, s] of Object.entries(REAL)) expect(s.values, id).toHaveLength(YEARS)
  })

  it('has shares that add up to 100%', () => {
    for (const a of SPEND_SHARE_ANCHORS) expect(Object.values(a.shares).reduce((x, y) => x + y, 0), String(a.year)).toBe(100)
    for (const a of REVENUE_SHARE_ANCHORS) expect(Object.values(a.shares).reduce((x, y) => x + y, 0), String(a.year)).toBe(100)
  })

  it('implies positive revenue every year', () => {
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) expect(realRevenue(y), String(y)).toBeGreaterThan(1000)
  })

  it('defines every policy level used by its real timeline', () => {
    for (const p of POLICIES) {
      expect(p.real[0].from, p.id).toEqual([1997, 7])
      for (const r of p.real) expect(p.effects[r.level], `${p.id} ${r.level}`).toBeDefined()
      for (const l of p.levels) expect(p.effects[l.id], `${p.id} ${l.id}`).toBeDefined()
    }
  })

  it('keeps choices consistent', () => {
    const ids = new Set<string>()
    for (const c of HISTORY_CHOICES) {
      expect(ids.has(c.id), c.id).toBe(false)
      ids.add(c.id)
      expect(c.options.some((o) => o.id === c.realOptionId), c.id).toBe(true)
      expect(c.options.some((o) => o.id === c.defaultOptionId), c.id).toBe(true)
      for (const o of c.options) {
        for (const e of o.effects) {
          if (e.kind !== 'policy') continue
          const p = POLICY_BY_ID[e.id]
          expect(p, `${c.id} -> ${e.id}`).toBeDefined()
          expect(p.levels.some((l) => l.id === e.level), `${c.id} -> ${e.id}:${e.level}`).toBe(true)
        }
      }
    }
    for (const e of PARALLEL_EVENTS) {
      expect(ids.has(e.id), e.id).toBe(false)
      ids.add(e.id)
    }
  })

  it('only gates history events on earlier choices and known policies', () => {
    for (const ev of HISTORY_EVENTS) {
      for (const choiceId of Object.keys(ev.requires ?? {})) {
        const ch = HISTORY_CHOICES.find((c) => c.id === choiceId)
        expect(ch, `${ev.id} -> ${choiceId}`).toBeDefined()
        expect(monthIndex(ch!.year, ch!.month), ev.id).toBeLessThan(monthIndex(ev.year, ev.month))
      }
      if (ev.requiresPolicy) expect(POLICY_BY_ID[ev.requiresPolicy.id], ev.id).toBeDefined()
    }
  })
})

describe('following history', () => {
  const s = playThrough(42, FOLLOW_HISTORY)

  it('finishes the whole term', () => {
    expect(s.status).toBe('ended')
    expect(s.endedEarly).toBeUndefined()
    expect(s.snapshots.at(-1)?.year).toBe(LAST_YEAR)
  })

  it('reproduces real history', () => {
    for (const snap of s.snapshots) {
      const real = realMetrics(snap.t)
      const m = snap.metrics
      for (const key of ['population', 'prhWait', 'priceIndex', 'unemployment', 'gdp', 'railKm', 'pm10', 'lifeExpectancy', 'postSecondary', 'carePerThousandElderly'] as const) {
        expect(m[key], `${key} ${snap.year}`).toBeCloseTo(real[key], 6)
      }
      expect(snap.reserves, `reserves ${snap.year}`).toBeCloseTo(yearValue('reserves', snap.year), 3)
      expect(snap.debt).toBe(0)
    }
  })

  it('triggers no parallel-timeline events', () => {
    expect(s.news.filter((n) => n.kind === 'parallel')).toEqual([])
    expect(s.bonds).toEqual([])
  })

  it('ends as history repeating itself', () => {
    const r = computeResult(s)
    expect(r.title).toBe('歷史重演')
    expect(Math.abs(r.total)).toBeLessThan(0.01)
    for (const row of r.comparison) expect(row.yours, row.label).toBeCloseTo(row.real, 2)
    expect(r.reveals.every((x) => x.same)).toBe(true)
  })
})

describe('simulation', () => {
  it('balances the books every month', () => {
    const strategy = randomStrategy(5)
    const g = newGame(5)
    while (g.status === 'running') {
      strategy.onMonth!(g)
      const before = g.reserves - debtTotal(g)
      step(g)
      const after = g.reserves - debtTotal(g)
      expect(after - before).toBeCloseTo(g.last.revenueTotal - g.last.spendingTotal, 6)
    }
  })

  it('is deterministic for the same seed and strategy', () => {
    const a = playThrough(9, randomStrategy(9))
    const b = playThrough(9, randomStrategy(9))
    expect(a.snapshots).toEqual(b.snapshots)
    expect(a.news).toEqual(b.news)
  })

  it('keeps numbers finite and indicators within 0–100 under random play', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = playThrough(seed, randomStrategy(seed))
      for (const snap of g.snapshots) {
        for (const [k, v] of Object.entries(snap.metrics)) if (typeof v === 'number') expect(Number.isFinite(v), `${k} ${seed}`).toBe(true)
        for (const k of INDICATOR_IDS) {
          expect(snap.indicators[k]).toBeGreaterThanOrEqual(0)
          expect(snap.indicators[k]).toBeLessThanOrEqual(100)
        }
        expect(snap.metrics.population).toBeGreaterThan(300)
      }
    }
  })

  it('takes the status-quo option when a decision expires', () => {
    const g = playThrough(3, UNTOUCHED)
    const history = g.choices.filter((c) => c.kind === 'history')
    expect(history.length).toBe(HISTORY_CHOICES.length)
    for (const c of history) {
      expect(c.expired).toBe(true)
      expect(c.optionId).toBe(HISTORY_CHOICES.find((h) => h.id === c.id)!.defaultOptionId)
    }
  })

  it('builds public housing and shortens the queue when housing is funded', () => {
    const g = playThrough(4, boost('housing', 1.8))
    const snap = g.snapshots.find((x) => x.year === 2012)!
    expect(snap.metrics.publicUnits - realMetrics(snap.t).publicUnits).toBeGreaterThan(2)
    expect(snap.metrics.prhWait).toBeLessThan(realMetrics(snap.t).prhWait)
  })

  it('lets services decay when they are underfunded', () => {
    const g = newGame(6)
    const strategy: Strategy = { onMonth: (x) => { FOLLOW_HISTORY.onMonth!(x); x.funding.health = 0.6 }, choose: FOLLOW_HISTORY.choose }
    for (let i = 0; i < 48; i++) {
      strategy.onMonth!(g)
      step(g)
    }
    expect(g.quality.health).toBeLessThan(0.7)
    const m = computeMetrics(g, g.t)
    expect(computeIndicators(m, g).wellbeing).toBeLessThan(computeIndicators(realMetrics(g.t), { ...g, quality: { ...g.quality, health: 1 } }).wellbeing)
  })

  it('ends in fiscal collapse when every department is funded at 200%', () => {
    const g = playThrough(8, allFunding(2))
    expect(g.endedEarly).toBeDefined()
    expect(DEPARTMENTS.every((d) => g.funding[d] === 2 || g.funding[d] < 2)).toBe(true)
  })
})
