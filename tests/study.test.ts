import { describe, expect, it } from 'vitest'
import { MAP_COLS, MAP_ROWS } from '../src/data/mapBase'
import type { CityMap } from '../src/engine/map'
import { metricsNow, playThrough } from '../src/engine/sim'
import { LAST_MONTH_INDEX } from '../src/engine/time'
import { DISTRICTS, changesBetween, districtCamera, districtCells, mostChangedDistrict, project, transformFor, unproject, visibleBounds } from '../src/ui/mapGeometry'
import { buildStudyRun, sharedFrames } from '../src/study/scenes'
import { boost } from './strategies'

describe('the district comparison prototype', () => {
  it('keeps ground coordinates, buildings and markers aligned in both projections', () => {
    for (const projection of ['plan', 'iso'] as const) {
      for (const width of [358, 650]) {
        for (const zoom of [0.7, 1, 3]) {
          const camera = { ...districtCamera(DISTRICTS[0]), zoom }
          const tr = transformFor(camera, projection, width, 380)
          for (const [c, r] of [[camera.cx, camera.cy], [0, 0], [255, 192], [140.25, 108.75]]) {
            const [x, y] = project(tr, c, r)
            const recovered = unproject(tr, x, y)
            expect(recovered[0]).toBeCloseTo(c, 9)
            expect(recovered[1]).toBeCloseTo(r, 9)
          }
          const bounds = visibleBounds(tr, width, 380)
          expect(bounds.c0).toBeGreaterThanOrEqual(0)
          expect(bounds.c1).toBeLessThan(MAP_COLS)
          expect(bounds.r0).toBeGreaterThanOrEqual(0)
          expect(bounds.r1).toBeLessThan(MAP_ROWS)
        }
      }
    }
  })

  it('finds changed ground without changing either city, and focuses a district that contains it', () => {
    const a: CityMap = { grid: new Uint8Array(MAP_COLS * MAP_ROWS), rail: { stations: [], segments: [] }, haze: 0 }
    const b = { ...a, grid: a.grid.slice() }
    const cell = districtCells(DISTRICTS.find((d) => d.id === 'kwuTung')!)[20]
    b.grid[cell] = 1
    const beforeA = a.grid.slice()
    const beforeB = b.grid.slice()
    expect([...changesBetween(a, b)]).toEqual([cell])
    expect(districtCells(mostChangedDistrict(a, b))).toContain(cell)
    expect(a.grid.every((v, i) => v === beforeA[i])).toBe(true)
    expect(b.grid.every((v, i) => v === beforeB[i])).toBe(true)
  })

  it('can find railway development even when no ground cells change', () => {
    const a: CityMap = { grid: new Uint8Array(MAP_COLS * MAP_ROWS), rail: { stations: [], segments: [] }, haze: 0 }
    const b: CityMap = { ...a, rail: { stations: [], segments: [{ route: 'newLine', from: [829500, 840000], to: [831000, 841000] }] } }
    expect(changesBetween(a, b).size).toBe(0)
    expect(['kwuTung', 'sanTin']).toContain(mostChangedDistrict(a, b).id)
  })

  it('captures real construction states and leaves the underlying simulation unchanged', () => {
    const run = buildStudyRun('housing', 1, false)
    const reference = playThrough(1, boost('housing', 1.8), { events: false })
    const actual = run.frames.at(-1)!
    expect(actual.t).toBe(LAST_MONTH_INDEX)
    const metrics = metricsNow(reference)
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') expect(actual.metrics[key as keyof typeof metrics], key).toBeCloseTo(value, 8)
    }
    expect(run.frames.some((f) => f.works.some((w) => w.state === 'building' && w.building.length > 0))).toBe(true)
  })

  it('compares the same month and never invents a future for a collapsed city', () => {
    const history = buildStudyRun('history', 1, false)
    const transport = buildStudyRun('transport', 1, false)
    expect(transport.ended?.cause).toBe('debt')
    const pairs = sharedFrames(history, transport)
    expect(pairs.length).toBeGreaterThan(10)
    for (const [a, b] of pairs) {
      expect(a.t).toBe(b.t)
      expect(b.t).toBeLessThanOrEqual(transport.ended!.t)
    }
    expect(pairs.at(-1)![1].t).toBeLessThan(LAST_MONTH_INDEX)
  })
})
