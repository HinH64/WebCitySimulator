import { describe, expect, it } from 'vitest'
import { CANDIDATE_ROUTES, CANDIDATE_SITES, MAP_PROJECTS, RAIL_ROUTES } from '../src/data/mapProjects'
import { MAP_COLS, MAP_ROWS } from '../src/data/mapBase'
import { MAP_STATIONS } from '../src/data/mapStations'
import {
  KIND_INDEX,
  areaCells,
  baseMap,
  cityMapAt,
  cityMapFrom,
  peoplePerCell,
  projectCells,
  railCoverage,
  railServedShare,
  realCityMapAt,
  realMapAt,
  realRailAt,
  regionOf,
  regionalPrices,
  stationPosition,
} from '../src/engine/map'
import { MAP_CELL, MAP_ORIGIN } from '../src/data/mapBase'
import { MAP_PRICES } from '../src/data/mapPrices'
import { FOLLOW_HISTORY, playThrough, setPolicy, type Strategy } from '../src/engine/sim'
import { LAST_MONTH_INDEX, monthIndex } from '../src/engine/time'
import { allFunding, boost } from './strategies'

const count = (grid: Uint8Array, cells: number[], kind: keyof typeof KIND_INDEX) => cells.filter((c) => grid[c] === KIND_INDEX[kind]).length
/** Cells that differ between two grids. Much faster than toEqual, which compares typed arrays one value at a time. */
const differing = (a: Uint8Array, b: Uint8Array) => {
  let n = Math.abs(a.length - b.length)
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++
  return n
}
const project = (id: string) => MAP_PROJECTS.find((p) => p.id === id)!

describe('map data', () => {
  it('decodes the whole base grid', () => {
    expect(baseMap()).toHaveLength(MAP_COLS * MAP_ROWS)
  })

  it('names only stations that exist', () => {
    const names = new Set(MAP_STATIONS.filter((s) => !s.light).map((s) => s.zh))
    for (const r of RAIL_ROUTES) for (const s of r.stations) expect(names.has(s), `${r.id}: ${s}`).toBe(true)
    for (const r of CANDIDATE_ROUTES) for (const s of r.stations) if (typeof s === 'string') expect(names.has(s), `${r.id}: ${s}`).toBe(true)
  })

  it('gives every project and candidate site some cells, and no cell to two projects', () => {
    const owner = new Map<number, string>()
    for (const p of MAP_PROJECTS) {
      const cells = projectCells(p)
      expect(cells.length, p.id).toBeGreaterThan(0)
      for (const c of cells) {
        expect(owner.get(c), `${p.id} overlaps ${owner.get(c)}`).toBeUndefined()
        owner.set(c, p.id)
      }
    }
    for (const s of CANDIDATE_SITES) expect(areaCells(s.area).length, s.id).toBeGreaterThan(0)
  })

  it('keeps each project in date order', () => {
    for (const p of MAP_PROJECTS) {
      const months = p.steps.map((s) => monthIndex(...s.from))
      expect(months, p.id).toEqual([...months].sort((a, b) => a - b))
    }
  })
})

describe('real Hong Kong on the map', () => {
  it('ends on the 2025 land use', () => {
    expect(differing(realMapAt(LAST_MONTH_INDEX), baseMap())).toBe(0)
  })

  it('starts in 1997 with Kai Tak open and Chek Lap Kok still being built', () => {
    const start = realMapAt(0)
    const kaiTak = projectCells(project('kaiTak'))
    const chekLapKok = projectCells(project('airport'))
    expect(count(start, kaiTak, 'airport')).toBe(kaiTak.length)
    expect(count(start, chekLapKok, 'airport')).toBe(0)
    expect(count(start, projectCells(project('thirdRunway')), 'sea')).toBe(projectCells(project('thirdRunway')).length)

    const afterMove = realMapAt(monthIndex(1998, 8))
    expect(count(afterMove, kaiTak, 'airport')).toBe(0)
    expect(count(afterMove, chekLapKok, 'airport')).toBeGreaterThan(100)
  })

  it('grows the railway as lines open', () => {
    const start = realRailAt(0)
    const end = realRailAt(LAST_MONTH_INDEX)
    const names = (r: ReturnType<typeof realRailAt>) => r.stations.map((st) => st.name)
    expect(names(start)).not.toContain('東涌')
    expect(names(start)).toContain('羅湖')
    expect(end.stations.length).toBeGreaterThan(95)
    expect(end.segments.length).toBeGreaterThan(start.segments.length * 2)
    // The Eastern Harbour Crossing stretch runs from Lam Tin until the Tseung Kwan O line takes it over.
    expect(start.segments.some((s) => s.route === 'eastHarbour')).toBe(true)
    expect(end.segments.some((s) => s.route === 'eastHarbour')).toBe(false)
  })
})

const kinds = (grid: Uint8Array, ...ks: (keyof typeof KIND_INDEX)[]) => grid.filter((v) => ks.some((k) => KIND_INDEX[k] === v)).length
const at = (s: { t: number }) => Math.min(s.t, LAST_MONTH_INDEX)

describe('the city on the map', () => {
  it('is real Hong Kong when following history', () => {
    const s = playThrough(42, FOLLOW_HISTORY, { events: false })
    const map = cityMapAt(s)
    expect(differing(map.grid, realMapAt(LAST_MONTH_INDEX))).toBe(0)
    expect(map.rail).toEqual(realRailAt(LAST_MONTH_INDEX))
  })

  it('adds homes when the city builds more, and takes them off when it builds less', () => {
    const more = playThrough(3, boost('housing', 1.8))
    expect(more.dev.publicUnits + more.dev.privateUnits).toBeGreaterThan(5)
    expect(kinds(cityMapAt(more).grid, 'public', 'private')).toBeGreaterThan(kinds(realMapAt(at(more)), 'public', 'private') + 20)

    const less = playThrough(3, allFunding(0.7), { removal: false })
    expect(less.dev.publicUnits).toBeLessThan(-2)
    expect(kinds(cityMapAt(less).grid, 'public')).toBeLessThan(kinds(realMapAt(at(less)), 'public'))
  })

  it('builds on country park edges only under that policy', () => {
    const edge: Strategy = {
      onMonth: (s) => {
        FOLLOW_HISTORY.onMonth!(s)
        setPolicy(s, 'countryPark', 'on')
      },
      choose: FOLLOW_HISTORY.choose,
    }
    const sites = CANDIDATE_SITES.filter((c) => c.countryPark).flatMap((c) => areaCells(c.area))
    const s = playThrough(3, edge)
    const map = cityMapAt(s)
    expect(kinds(realMapAt(at(s)), 'woodland', 'shrubGrass')).toBeGreaterThan(kinds(map.grid, 'woodland', 'shrubGrass'))
    expect(sites.filter((c) => map.grid[c] === KIND_INDEX.public || map.grid[c] === KIND_INDEX.private).length).toBeGreaterThan(0)
  })

  it('opens more railway with more transport money, and less with less', () => {
    const more = playThrough(3, boost('transport', 1.8))
    expect(cityMapAt(more).rail.segments.length).toBeGreaterThan(realRailAt(at(more)).segments.length)
    const less = playThrough(3, allFunding(0.7), { removal: false })
    expect(cityMapAt(less).rail.segments.length).toBeLessThan(realRailAt(at(less)).segments.length)
  })

  it('shows an industry that grows faster than history', () => {
    const tech: Strategy = {
      onMonth: (s) => {
        FOLLOW_HISTORY.onMonth!(s)
        setPolicy(s, 'industryFocus', 'professional')
      },
      choose: FOLLOW_HISTORY.choose,
    }
    const s = playThrough(3, tech)
    expect(kinds(cityMapAt(s).grid, 'sciencePark')).toBeGreaterThan(kinds(realMapAt(at(s)), 'sciencePark'))
  })

  it('draws a month quickly', () => {
    const s = playThrough(3, boost('housing', 1.8))
    cityMapAt(s)
    const start = performance.now()
    for (let i = 0; i < 10; i++) cityMapAt(s)
    expect((performance.now() - start) / 10).toBeLessThan(20)
  })
})

describe('map layers', () => {
  const cellOf = (name: string) => {
    const [e, n] = stationPosition(name)
    return Math.floor((MAP_ORIGIN.n - n) / MAP_CELL) * MAP_COLS + Math.floor((e - MAP_ORIGIN.e) / MAP_CELL)
  }

  it('shares the population out over the homes on the map', () => {
    const grid = realMapAt(LAST_MONTH_INDEX)
    const people = peoplePerCell(grid, 750)
    const total = (['public', 'private', 'village'] as const).reduce((a, k) => a + people[k] * kinds(grid, k), 0)
    expect(total).toBeCloseTo(750, 6)
    expect(people.public).toBeGreaterThan(people.private)
    expect(people.private).toBeGreaterThan(people.village)
  })

  it('places stations in the right price region', () => {
    expect(regionOf(cellOf('中環'))).toBe('hk')
    expect(regionOf(cellOf('旺角'))).toBe('kln')
    expect(regionOf(cellOf('觀塘'))).toBe('kln')
    expect(regionOf(cellOf('沙田'))).toBe('nt')
    expect(regionOf(cellOf('荃灣'))).toBe('nt')
  })

  it('scales the official regional prices by the city', () => {
    expect(regionalPrices(0, 1)).toEqual(MAP_PRICES[1997])
    expect(regionalPrices(LAST_MONTH_INDEX, 2).hk).toBe(MAP_PRICES[2025].hk * 2)
  })

  it('serves more residents by rail when the city builds more lines', () => {
    const s = playThrough(3, boost('transport', 1.8))
    const map = cityMapAt(s)
    const real = { grid: realMapAt(at(s)), rail: realRailAt(at(s)) }
    const share = (m: { grid: Uint8Array; rail: ReturnType<typeof realRailAt> }) =>
      railServedShare(m.grid, railCoverage(m.rail.stations), peoplePerCell(m.grid, 700))
    expect(share(map)).toBeGreaterThan(share(real))
  })
})

describe('the map over the term', () => {
  it('redraws the end of the term from the last yearly snapshot', () => {
    const s = playThrough(3, boost('housing', 1.8))
    const last = s.snapshots.at(-1)!
    const fromSnapshot = cityMapFrom(last.metrics, last.t, last.t + 1)
    const now = cityMapAt(s)
    expect(differing(fromSnapshot.grid, now.grid)).toBe(0)
    expect(fromSnapshot.rail).toEqual(now.rail)
    expect(fromSnapshot.haze).toBe(now.haze)
  })

  it('is real Hong Kong every year when following history', () => {
    const s = playThrough(42, FOLLOW_HISTORY, { events: false })
    for (const snap of s.snapshots) {
      const map = cityMapFrom(snap.metrics, snap.t, snap.t + 1)
      const real = realCityMapAt(snap.t)
      expect(differing(map.grid, real.grid), String(snap.year)).toBe(0)
      expect(map.rail, String(snap.year)).toEqual(real.rail)
      expect(map.haze, String(snap.year)).toBe(real.haze)
    }
  })
})
