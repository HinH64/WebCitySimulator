import { describe, expect, it } from 'vitest'
import { DEPARTMENTS, REVENUE_SHARE_ANCHORS, SPEND_SHARE_ANCHORS, TAXES } from '../src/data/budget'
import { CITY_EVENTS } from '../src/data/cityEvents'
import { HISTORY_CHOICES, HISTORY_EVENTS, PARALLEL_EVENTS } from '../src/data/events'
import { POLICIES, POLICY_BY_ID } from '../src/data/policies'
import { RELEASES } from '../src/data/official'
import { FIRST_YEAR, LAST_YEAR, REAL, realRevenue, yearValue } from '../src/data/real'
import { computeResult } from '../src/engine/endings'
import { computeIndicators } from '../src/engine/indicators'
import { computeMetrics, realMetrics } from '../src/engine/metrics'
import { answer, debtTotal, newGame, playThrough, playerPolicyLevel, setPolicy, step, type Strategy } from '../src/engine/sim'
import { realPolicyLevel, realReserves, realTax } from '../src/engine/real'
import { monthIndex, monthOf, yearOf } from '../src/engine/time'
import { INDICATOR_IDS } from '../src/engine/types'
import { FOLLOW_HISTORY, UNTOUCHED, allFunding, boost, randomStrategy } from './strategies'

const YEARS = LAST_YEAR - FIRST_YEAR + 1

describe('data', () => {
  it('has one value per year for every series', () => {
    for (const [id, s] of Object.entries(REAL)) expect(s.values, id).toHaveLength(YEARS)
  })

  it('has shares that add up to 100%', () => {
    for (const a of SPEND_SHARE_ANCHORS) expect(Object.values(a.shares).reduce((x, y) => x + y, 0), String(a.year)).toBe(100)
    for (const a of REVENUE_SHARE_ANCHORS) expect(Object.values(a.shares).reduce((x, y) => x + y, 0), String(a.year)).toBeCloseTo(100, 9)
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
    for (const e of [...PARALLEL_EVENTS, ...CITY_EVENTS]) {
      expect(ids.has(e.id), e.id).toBe(false)
      ids.add(e.id)
    }
  })

  it('only makes decisions conditional on known policy levels', () => {
    for (const c of HISTORY_CHOICES) {
      if (!c.onlyIf) continue
      const p = POLICY_BY_ID[c.onlyIf.policy]
      expect(p, c.id).toBeDefined()
      for (const l of c.onlyIf.levels) expect(p.levels.some((x) => x.id === l), `${c.id} ${l}`).toBe(true)
    }
  })

  it('offers a decision for every real policy change, taking effect when it really did', () => {
    for (const p of POLICIES) {
      for (const change of p.real.slice(1)) {
        const t = monthIndex(...change.from)
        // An answer given straight away counts from the next month; a scheduled one from its `at`.
        const choice = HISTORY_CHOICES.find((c) =>
          c.options
            .find((o) => o.id === c.realOptionId)!
            .effects.some((e) => e.kind === 'policy' && e.id === p.id && e.level === change.level && monthIndex(c.year, c.month) + (e.at ?? 1) === t),
        )
        expect(choice, `${p.id} -> ${change.level} ${change.from.join('-')}`).toBeDefined()
      }
    }
  })

  it('makes general policies available from the start, except new technology', () => {
    expect(POLICIES.filter((p) => monthIndex(...p.availableFrom) > 0).map((p) => p.id)).toEqual(['lph'])
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
  // City events are random; without them, following history must reproduce it exactly.
  const s = playThrough(42, FOLLOW_HISTORY, { events: false })

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
      expect(snap.reserves, `reserves ${snap.year}`).toBeCloseTo(realReserves(snap.t + 1), 3)
      // Each full year ends on the official figure; the last snapshot comes part-way through 2026.
      if (monthOf(snap.t) === 12) expect(snap.reserves, `reserves ${snap.year}`).toBeCloseTo(yearValue('reserves', snap.year), 3)
      expect(snap.debt).toBe(0)
    }
  })

  it('reports milestones but no city events', () => {
    expect(s.news.filter((n) => n.kind === 'parallel' || n.kind === 'city')).toEqual([])
    expect(s.news.filter((n) => n.kind === 'milestone').length).toBeGreaterThanOrEqual(10)
    expect(s.bonds).toEqual([])
  })

  it('publishes the real headline figures', () => {
    const stats = s.news.filter((n) => n.kind === 'stats').map((n) => n.text)
    const one = (v: number) => new Intl.NumberFormat('zh-HK', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)
    RELEASES.gdpGrowthYearly.forEach((g, i) => {
      const year = FIRST_YEAR + i
      if (year >= LAST_YEAR) return
      const line = `${year} 年經濟實質${g >= 0 ? '增長' : '收縮'} ${one(Math.abs(g))}%`
      expect(stats.some((t) => t.startsWith(line)), line).toBe(true)
    })
    for (let year = FIRST_YEAR + 1; year <= LAST_YEAR; year++) {
      const line = `年中人口 ${one(yearValue('population', year))} 萬`
      expect(stats.some((t) => t.startsWith(line)), `${year} ${line}`).toBe(true)
    }
    expect(stats.filter((t) => t.includes('出現通縮')).length).toBeGreaterThanOrEqual(2)
  })

  it('scores the same as real Hong Kong', () => {
    const r = computeResult(s)
    expect(r.title).toBe('歷史重演')
    expect(r.score).toBeCloseTo(r.real.score, 6)
    expect(r.rating).toBe(r.real.rating)
    for (const row of r.comparison) expect(row.yours, row.label).toBeCloseTo(row.real, 2)
    expect(r.reveals.length).toBe(HISTORY_CHOICES.length)
    expect(r.reveals.every((x) => x.same)).toBe(true)
  })

  it('stays close to history with city events on', () => {
    const g = playThrough(42, FOLLOW_HISTORY)
    const news = g.news.filter((n) => n.kind === 'city')
    expect(news.length).toBeGreaterThanOrEqual(40)
    expect(news.length).toBeLessThanOrEqual(130)
    expect(new Set(news.map((n) => n.category)).size).toBe(8)
    const end = g.snapshots.at(-1)!
    const real = realMetrics(end.t)
    expect(Math.abs(end.metrics.population / real.population - 1)).toBeLessThan(0.01)
    expect(Math.abs(end.metrics.gdp / real.gdp - 1)).toBeLessThan(0.02)
    expect(Math.abs(end.reserves / yearValue('reserves', end.year) - 1)).toBeLessThan(0.05)
    expect(computeResult(g).rating).toBe('B')
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

  it('keeps statistics news to a few items a year, whatever the player does', () => {
    for (const strategy of [UNTOUCHED, allFunding(0.6), allFunding(1.6), randomStrategy(3)]) {
      const g = playThrough(3, strategy)
      const perYear = new Map<number, number>()
      for (const n of g.news.filter((n) => n.kind === 'stats')) perYear.set(yearOf(n.t), (perYear.get(yearOf(n.t)) ?? 0) + 1)
      expect(Math.max(...perYear.values())).toBeLessThanOrEqual(12)
      // Every year has some, up to the last (possibly early) year of the term.
      expect(perYear.size).toBeGreaterThanOrEqual(yearOf(g.t - 1) - FIRST_YEAR)
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
    for (const c of history) {
      expect(c.expired).toBe(true)
      expect(c.optionId).toBe(HISTORY_CHOICES.find((h) => h.id === c.id)!.defaultOptionId)
    }
    // Decisions that only make sense after another one went the historical way never came up.
    const skipped = HISTORY_CHOICES.filter((c) => !history.some((r) => r.id === c.id)).map((c) => c.id)
    expect(skipped.sort()).toEqual(['derating', 'hos85Drop', 'hosResume'])
  })

  it('never changes a policy unless the player does', () => {
    const g = playThrough(3, UNTOUCHED)
    for (const p of POLICIES) expect(g.policies[p.id], p.id).toBe(p.real[0].level)
    const t = monthIndex(2016, 1)
    expect(realPolicyLevel('talent', t)).toBe('standard')
    expect(playerPolicyLevel(g, POLICY_BY_ID.talent, t)).toBe('off')
  })

  it('keeps 1997 tax rates unless the player changes them, and reveals the real ones at the end', () => {
    const g = playThrough(3, UNTOUCHED)
    for (const k of TAXES) expect(g.taxes[k], k).toBe(realTax(k, 0))
    expect(realTax('profits', monthIndex(2005, 1))).toBe(17.5)
    const profits = computeResult(g).policies.find((p) => p.id === 'tax-profits')!
    expect(profits.yours).toBe('16.5%')
    expect(profits.realHistory).toContain('2003 17.5%')
  })

  it('starts a scheduled policy when the decision says', () => {
    const g = newGame(2)
    while (g.t <= monthIndex(2010, 7)) step(g)
    const item = g.inbox.find((i) => i.id === 'minWage')!
    answer(g, item.uid, 'legislate')
    expect(g.policies.minWage).toBe('off')
    while (g.t < monthIndex(2011, 5)) step(g)
    expect(g.policies.minWage).toBe('off')
    step(g)
    expect(g.policies.minWage).toBe('on')
    expect(g.news.some((n) => n.text.includes('法定最低工資實施'))).toBe(true)
  })

  it('lets the player override a scheduled policy', () => {
    const g = newGame(2)
    while (g.t <= monthIndex(2010, 7)) step(g)
    answer(g, g.inbox.find((i) => i.id === 'minWage')!.uid, 'legislate')
    setPolicy(g, 'minWage', 'off')
    while (g.t <= monthIndex(2011, 6)) step(g)
    expect(g.policies.minWage).toBe('off')
  })

  it('sets a decision\'s policy only when it is answered', () => {
    const g = newGame(2)
    while (g.t <= monthIndex(1998, 3)) step(g)
    expect(g.inbox.some((i) => i.id === 'hos85')).toBe(true)
    expect(realPolicyLevel('hos85', g.t)).toBe('full')
    expect(playerPolicyLevel(g, POLICY_BY_ID.hos85, g.t)).toBe('off')
    const item = g.inbox.find((i) => i.id === 'hos85')!
    answer(g, item.uid, 'full')
    expect(playerPolicyLevel(g, POLICY_BY_ID.hos85, g.t)).toBe('full')
  })

  it('brings up a follow-up decision only where it applies', () => {
    const strategy = (target: string): Strategy => ({ choose: (_s, item) => (item.id === 'hos85' ? target : undefined) })
    expect(playThrough(5, strategy('full')).choices.some((c) => c.id === 'hos85Drop')).toBe(true)
    expect(playThrough(5, strategy('none')).choices.some((c) => c.id === 'hos85Drop')).toBe(false)
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
