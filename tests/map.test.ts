import { describe, expect, it } from 'vitest'
import { CANDIDATE_ROUTES, CANDIDATE_SITES, MAP_PROJECTS, RAIL_ROUTES } from '../src/data/mapProjects'
import { MAP_COLS, MAP_ROWS } from '../src/data/mapBase'
import { MAP_STATIONS } from '../src/data/mapStations'
import { KIND_INDEX, areaCells, baseMap, projectCells, realMapAt, realRailAt } from '../src/engine/map'
import { LAST_MONTH_INDEX, monthIndex } from '../src/engine/time'

const count = (grid: Uint8Array, cells: number[], kind: keyof typeof KIND_INDEX) => cells.filter((c) => grid[c] === KIND_INDEX[kind]).length
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
    expect(realMapAt(LAST_MONTH_INDEX)).toEqual(baseMap())
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
    expect(start.stations).not.toContain('東涌')
    expect(start.stations).toContain('羅湖')
    expect(end.stations.length).toBeGreaterThan(95)
    expect(end.segments.length).toBeGreaterThan(start.segments.length * 2)
    // The Eastern Harbour Crossing stretch runs from Lam Tin until the Tseung Kwan O line takes it over.
    expect(start.segments.some((s) => s.route === 'eastHarbour')).toBe(true)
    expect(end.segments.some((s) => s.route === 'eastHarbour')).toBe(false)
  })
})
