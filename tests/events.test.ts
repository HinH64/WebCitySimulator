import { describe, expect, it } from 'vitest'
import { CITY_EVENTS, CATEGORY_LABEL } from '../src/data/cityEvents'
import { HISTORY_EVENTS, PARALLEL_EVENTS } from '../src/data/events'
import { MAP_CELL, MAP_COLS, MAP_ORIGIN, MAP_ROWS } from '../src/data/mapBase'
import { FIRST_YEAR, LAST_YEAR } from '../src/data/real'
import { fullQuality, realMetrics } from '../src/engine/metrics'
import { shockEffects, type ShockInput } from '../src/engine/shocks'
import { answer, newGame, playThrough, step, type Strategy } from '../src/engine/sim'
import { monthIndex, yearOf } from '../src/engine/time'
import type { CityEventCategory, Effect, GameState, Place } from '../src/engine/types'
import { FOLLOW_HISTORY, UNTOUCHED, randomStrategy } from './strategies'

const gdpOf = (effects: Effect[]) => effects.reduce((a, e) => a + (e.kind === 'stock' && e.key === 'gdp' ? e.v : 0), 0)
const snapshotGdp = (g: GameState, year: number) => g.snapshots.find((s) => s.year === year)!.metrics.gdp

describe('event data', () => {
  it('has news of the real world every year, whatever the player chooses', () => {
    for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
      const always = HISTORY_EVENTS.filter((e) => e.year === year && ((!e.requires && !e.requiresPolicy) || e.altText))
      expect(always.length, String(year)).toBeGreaterThan(0)
    }
  })

  it('offers about ninety pieces of everyday news, at least ten in each category', () => {
    expect(CITY_EVENTS.length).toBeGreaterThanOrEqual(90)
    for (const category of Object.keys(CATEGORY_LABEL) as CityEventCategory[]) {
      expect(CITY_EVENTS.filter((e) => e.category === category).length, category).toBeGreaterThanOrEqual(10)
    }
    expect(PARALLEL_EVENTS.length).toBeGreaterThanOrEqual(25)
  })

  it('puts every place inside the map', () => {
    const places: [string, Place][] = [
      ...HISTORY_EVENTS.filter((e) => e.place).map((e) => [e.id, e.place!] as [string, Place]),
      ...[...CITY_EVENTS, ...PARALLEL_EVENTS].flatMap((e) => (e.places ?? []).map((p) => [e.id, p] as [string, Place])),
    ]
    expect(places.length).toBeGreaterThan(30)
    for (const [id, [e, n]] of places) {
      const col = (e - MAP_ORIGIN.e) / MAP_CELL
      const row = (MAP_ORIGIN.n - n) / MAP_CELL
      expect(col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS, id).toBe(true)
    }
  })
})

describe('news on the map', () => {
  it('marks where news happened, but not for what did not happen', () => {
    const history = playThrough(1, FOLLOW_HISTORY, { events: false })
    const xrl = history.news.find((n) => n.text === '廣深港高鐵香港段通車。')
    expect(xrl?.place).toEqual(HISTORY_EVENTS.find((e) => e.id === 'xrl')!.place)

    const untouched = playThrough(1, UNTOUCHED, { removal: false })
    const noXrl = untouched.news.find((n) => n.text.startsWith('高鐵香港段沒有興建'))
    expect(noXrl).toBeDefined()
    expect(noXrl!.place).toBeUndefined()
  })

  it('picks the place of everyday news without random numbers', () => {
    const a = playThrough(4, FOLLOW_HISTORY)
    const b = playThrough(4, FOLLOW_HISTORY)
    expect(a.news).toEqual(b.news)
    expect(a.news.filter((n) => n.kind === 'city' && n.place).length).toBeGreaterThan(5)
  })
})

describe('shocks', () => {
  const real = realMetrics(monthIndex(2020, 1))
  const ready: ShockInput = { m: real, real, quality: fullQuality(), flags: { chp: 'centre' }, netReserves: 10000, monthlySpending: 500, uninspected: false }

  it('leaves a city as ready as real Hong Kong exactly as history had it', () => {
    for (const kind of ['epidemic', 'storm', 'financial'] as const) expect(shockEffects({ kind, size: 1.5 }, ready)).toEqual({ effects: [] })
  })

  it('hits a city with fewer hospital beds harder, and one with more beds more softly', () => {
    const beds = (f: number) => ({ ...ready, m: { ...real, carePerThousandElderly: real.carePerThousandElderly * f } })
    const fewer = shockEffects({ kind: 'epidemic', size: 1 }, beds(0.7))
    const more = shockEffects({ kind: 'epidemic', size: 1 }, beds(1.3))
    expect(gdpOf(fewer.effects)).toBeLessThan(-0.5)
    expect(gdpOf(more.effects)).toBeGreaterThan(0.5)
    expect(fewer.note).toContain('不足')
    expect(more.note).toContain('較充裕')
  })

  it('remembers how the city prepared after SARS', () => {
    expect(gdpOf(shockEffects({ kind: 'epidemic', size: 1 }, { ...ready, flags: { chp: 'none' } }).effects)).toBeLessThan(-0.3)
    expect(gdpOf(shockEffects({ kind: 'epidemic', size: 1 }, { ...ready, flags: {} }).effects)).toBe(0)
  })

  it('charges a run-down city for storm repairs', () => {
    const r = shockEffects({ kind: 'storm', size: 1 }, { ...ready, quality: { ...fullQuality(), transport: 0.8, environment: 0.8 } })
    const repairs = r.effects.find((e) => e.kind === 'stock' && e.key === 'money')
    expect(repairs && repairs.kind === 'stock' && repairs.v).toBeCloseTo(32, 6)
    expect(r.note).toContain('32 億元')
  })

  it('costs a city that never inspects its old buildings more in a storm', () => {
    const r = shockEffects({ kind: 'storm', size: 1 }, { ...ready, uninspected: true })
    expect(r.effects.some((e) => e.kind === 'stock' && e.key === 'money' && e.v > 0)).toBe(true)
    expect(r.note).toContain('舊樓')
  })

  it('hits a city without three months of reserves harder in a financial crisis', () => {
    expect(gdpOf(shockEffects({ kind: 'financial', size: 1 }, { ...ready, netReserves: 0 }).effects)).toBeCloseTo(-3, 6)
    expect(gdpOf(shockEffects({ kind: 'financial', size: 1 }, { ...ready, netReserves: 750 }).effects)).toBeCloseTo(-1.5, 6)
  })

  it('makes the same epidemics cost a city that did not prepare after SARS', () => {
    const skipped: Strategy = { ...FOLLOW_HISTORY, choose: (s, item) => (item.id === 'chp' ? 'none' : FOLLOW_HISTORY.choose(s, item)) }
    const history = playThrough(2, FOLLOW_HISTORY, { events: false })
    const g = playThrough(2, skipped, { events: false })
    expect(snapshotGdp(g, 2019)).toBeCloseTo(snapshotGdp(history, 2019), 6)
    expect(snapshotGdp(g, 2022) / snapshotGdp(history, 2022)).toBeLessThan(0.995)
    const covid = g.news.find((n) => n.kind === 'history' && n.text.startsWith('新冠病毒疫情爆發'))!
    expect(covid.text).toContain('病床和安老宿位不足')
    expect(history.news.find((n) => n.text.startsWith('新冠病毒疫情爆發'))!.text).toBe(HISTORY_EVENTS.find((e) => e.id === 'covid')!.text)
  })
})

describe('city dynamics', () => {
  it('asks a government in trouble which problem to put first', () => {
    const g = newGame(1)
    while (g.status === 'running' && !g.inbox.some((i) => i.id === 'approvalCrisis')) step(g)
    const item = g.inbox.find((i) => i.id === 'approvalCrisis')!
    expect(item.options.length).toBeGreaterThanOrEqual(2)
    expect(item.options.length).toBeLessThanOrEqual(4)
    expect(item.options.at(-1)!.id).toBe('none')
    expect(yearOf(item.received)).toBeLessThan(2010)

    const first = item.options[0]
    const dept = (first.effects[0] as Extract<Effect, { kind: 'dept' }>).id
    const before = g.funding[dept]
    answer(g, item.uid, first.id)
    expect(g.funding[dept]).toBeCloseTo(before + 0.1, 6)
    step(g)
    expect(g.approval.credit[first.id as keyof typeof g.approval.credit]).toBeGreaterThan(0.9)
  })

  it('never schedules changes into a month already simulated', () => {
    for (const seed of [1, 2, 3]) {
      const strategy = randomStrategy(seed)
      const g = newGame(seed, { removal: false })
      while (g.status === 'running') {
        for (const item of [...g.inbox]) answer(g, item.uid, strategy.choose(g, item)!)
        strategy.onMonth!(g)
        step(g)
        expect(Object.keys(g.pipeline).every((k) => Number(k) >= g.t), `seed ${seed} month ${g.t}`).toBe(true)
      }
    }
  })
})
