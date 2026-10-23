import { describe, expect, it } from 'vitest'
import { CITY_EVENTS } from '../src/data/cityEvents'
import { CANDIDATE_SITES } from '../src/data/mapProjects'
import { REBUILD_MONTHS } from '../src/data/policies'
import { siteCells, siteKey } from '../src/engine/map'
import { realMetrics } from '../src/engine/metrics'
import { cityWorks } from '../src/engine/projects'
import { answer, newGame, playThrough, setPolicy, step, type Strategy } from '../src/engine/sim'
import { monthIndex } from '../src/engine/time'
import type { CityContext, GameState } from '../src/engine/types'
import { FOLLOW_HISTORY } from './strategies'

/** History, but rebuilding old districts fast from the start. */
const FAST_RENEWAL: Strategy = {
  onMonth: (s) => {
    FOLLOW_HISTORY.onMonth!(s)
    setPolicy(s, 'renewal', 'fast')
  },
  choose: (s, item) => (item.id === 'ura' ? 'fast' : FOLLOW_HISTORY.choose(s, item)),
}

function playUntil(strategy: Strategy, t: number): GameState {
  const s = newGame(1, { events: false, removal: false })
  while (s.status === 'running' && s.t < t) {
    for (const item of [...s.inbox]) answer(s, item.uid, strategy.choose(s, item)!)
    strategy.onMonth!(s)
    step(s)
  }
  return s
}

const privateGap = (g: GameState, year: number) => {
  const snap = g.snapshots.find((x) => x.year === year)!
  return snap.metrics.privateUnits - realMetrics(snap.t).privateUnits
}

describe('urban renewal', () => {
  it('has fewer flats while old ones come down, and more once they are rebuilt', () => {
    const g = playThrough(1, FAST_RENEWAL, { events: false, removal: false })
    expect(privateGap(g, 2002)).toBeLessThan(-1)
    expect(privateGap(g, 2015)).toBeGreaterThan(1)
    expect(privateGap(g, 2025)).toBeGreaterThan(privateGap(g, 2015))
    // About REBUILD_MONTHS of demolitions are always under way.
    const steady = g.snapshots.find((x) => x.year === 2015)!.metrics.redeveloping
    expect(steady).toBeCloseTo((0.4 - 0.1) * (REBUILD_MONTHS / 12), 1)
  })

  it('shows the rebuilding as building sites in the old districts, which move on batch by batch', () => {
    const renewalKeys = new Set(CANDIDATE_SITES.filter((s) => s.use === 'renewal').map((s) => siteKey(s.id)))
    const at2003 = cityWorks(playUntil(FAST_RENEWAL, monthIndex(2003, 1)))
    const sites = at2003.works.filter((w) => w.kind === 'renewal')
    expect(sites.length).toBeGreaterThan(0)
    for (const w of sites) {
      expect(renewalKeys.has(w.key)).toBe(true)
      const district = siteCells(CANDIDATE_SITES.find((s) => siteKey(s.id) === w.key)!)
      for (const c of w.building) {
        expect(district).toContain(c)
        expect(at2003.map.grid[c]).toBe(at2003.map.grid[w.building[0]])
      }
    }
    const g = playThrough(1, FAST_RENEWAL, { events: false, removal: false })
    const news = g.news.filter((n) => n.kind === 'project' && n.text.includes('重建'))
    expect(news.filter((n) => n.text.includes('大規模重建展開')).length).toBeGreaterThan(1)
    expect(news.some((n) => n.text.includes('重建完成'))).toBe(true)
  })

  it('changes nothing for a city that follows history', () => {
    const g = playThrough(1, FOLLOW_HISTORY, { events: false })
    expect(g.snapshots.every((s) => s.metrics.redeveloping === 0)).toBe(true)
    expect(g.choices.filter((c) => c.id === 'ura' || c.id === 'mbis').map((c) => c.optionId)).toEqual(['ura', 'mbis'])
  })
})

describe('building inspection', () => {
  const context = (inspection: string) =>
    ({ quality: { housing: 1 }, policy: (id: string) => (id === 'inspection' ? inspection : 'off') }) as unknown as CityContext

  it('makes falling concrete and windows rarer in the news', () => {
    for (const id of ['oldBuilding', 'windowFall']) {
      const ev = CITY_EVENTS.find((e) => e.id === id)!
      expect(ev.weight(context('on')), id).toBeLessThan(ev.weight(context('off')) / 2)
    }
  })
})
