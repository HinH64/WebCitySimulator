import { describe, expect, it } from 'vitest'
import { HISTORY_EVENTS } from '../src/data/events'
import { MAP_TILE_KINDS } from '../src/data/mapBase'
import { RAIL_ROUTES } from '../src/data/mapProjects'
import { railKey, realMapAt } from '../src/engine/map'
import { cityWorks } from '../src/engine/projects'
import { answer, newGame, playThrough, step, type Strategy } from '../src/engine/sim'
import { LAST_MONTH_INDEX, monthIndex, yearOf } from '../src/engine/time'
import type { GameState } from '../src/engine/types'
import { FOLLOW_HISTORY, boost } from './strategies'

/** Plays like playThrough, but stops at month t. */
function playUntil(seed: number, strategy: Strategy, t: number): GameState {
  const s = newGame(seed, { removal: false })
  while (s.status === 'running' && s.t < t) {
    for (const item of [...s.inbox]) {
      const id = strategy.choose(s, item)
      if (id) answer(s, item.uid, id)
    }
    strategy.onMonth?.(s)
    step(s)
  }
  return s
}

const kindAt = (grid: Uint8Array, cell: number) => MAP_TILE_KINDS[grid[cell]]

describe('the city\'s works', () => {
  it('are none when following history', () => {
    for (const events of [false, true]) {
      const g = playThrough(2, FOLLOW_HISTORY, { events })
      expect(g.works).toEqual({})
      expect(g.news.filter((n) => n.kind === 'project')).toEqual([])
      expect(cityWorks(g).works).toEqual([])
    }
    const mid = playUntil(2, FOLLOW_HISTORY, monthIndex(2012, 1))
    expect(cityWorks(mid).works).toEqual([])
  })

  it('name the homes a housing-heavy city builds, where the map shows them', () => {
    const g = playUntil(1, boost('housing', 1.8), monthIndex(2012, 1))
    const w = cityWorks(g)
    const homes = w.works.filter((x) => x.kind === 'housing' && x.state !== 'delayed')
    expect(homes.length).toBeGreaterThan(1)
    expect(homes.reduce((a, x) => a + x.units + x.unitsBuilding, 0)).toBeGreaterThan(2)
    const real = realMapAt(g.t)
    for (const x of homes) {
      for (const c of x.cells) {
        expect(['public', 'private']).toContain(kindAt(w.map.grid, c))
        expect(w.map.grid[c]).not.toBe(real[c])
      }
      for (const c of x.building) expect(kindAt(w.map.grid, c)).toBe('construction')
      if (x.state === 'building' && !x.clearing) expect(yearOf(x.due!)).toBeGreaterThanOrEqual(2012)
    }
    expect(w.extraCells.length).toBe(homes.reduce((a, x) => a + x.cells.length + x.building.length, 0))
    const news = g.news.filter((n) => n.kind === 'project')
    expect(news.some((n) => n.text.includes('動工') && n.text.includes('入伙'))).toBe(true)
    expect(news.some((n) => n.text.includes('第一批新屋邨落成'))).toBe(true)
    expect(news.every((n) => n.place)).toBe(true)
  })

  it('open lines early in a rail-heavy city, and the news does not open them twice', () => {
    const g = playThrough(1, boost('transport', 1.8), { removal: false })
    const news = g.news.filter((n) => n.kind === 'project')
    expect(news.some((n) => n.text === '東九龍綫通車。')).toBe(true)
    expect(news.some((n) => /^東九龍綫動工興建，預計 \d{4} 年通車。$/.test(n.text))).toBe(true)
    for (const ev of HISTORY_EVENTS.filter((e) => e.route)) {
      if (g.works[railKey(ev.route!)]?.built === undefined) continue
      expect(g.news.some((n) => n.kind === 'history' && n.text === ev.text), ev.id).toBe(false)
    }
  })

  it('never claim a real line that would open on its own first', () => {
    const g = playThrough(1, boost('transport', 1.8), { removal: false })
    for (const r of RAIL_ROUTES) {
      for (const n of g.news.filter((x) => x.kind === 'project' && x.text.startsWith(`${r.name}動工興建，預計 `))) {
        expect(Number(n.text.match(/(\d{4}) 年/)![1]), r.name).toBeLessThan(r.opened[0] + 1)
      }
    }
  })

  it('report real lines a short-funded city has not opened, instead of their opening', () => {
    const g = playThrough(1, boost('transport', 0.6), { removal: false })
    const missing = HISTORY_EVENTS.filter((e) => e.route && g.works[railKey(e.route)]?.delayed === monthIndex(e.year, e.month))
    expect(missing.length).toBeGreaterThan(0)
    for (const ev of missing) {
      expect(g.news.some((n) => n.kind === 'history' && n.text === ev.text), ev.id).toBe(false)
      expect(g.news.some((n) => n.kind === 'project' && n.text.includes('未能如期通車') && n.t === monthIndex(ev.year, ev.month)), ev.id).toBe(true)
    }
    // Lines that ran for years are never taken away.
    for (const [key, log] of Object.entries(g.works)) {
      const route = RAIL_ROUTES.find((r) => railKey(r.id) === key)
      if (route && log.delayed !== undefined) expect(log.delayed - monthIndex(...route.opened), key).toBeLessThanOrEqual(60)
    }
  })

  it('are the same for the same seed and play', () => {
    const a = playThrough(3, boost('housing', 1.6))
    const b = playThrough(3, boost('housing', 1.6))
    expect(a.works).toEqual(b.works)
    expect(a.works).not.toEqual({})
    expect(Object.values(a.works).every((log) => Object.values(log).every((t) => t! <= LAST_MONTH_INDEX))).toBe(true)
  })
})
