import { describe, expect, it, vi } from 'vitest'
import { MAP_COLS, MAP_ROWS } from '../src/data/mapBase'
import { cityMapFrom } from '../src/engine/map'
import { FOLLOW_HISTORY, newGame, playThrough, step } from '../src/engine/sim'
import { DISTRICTS, clampCamera, districtCamera, panCamera, project, transformFor, unproject, zoomCamera } from '../src/ui/mapGeometry'
import { mapMoments, sceneAtMoment } from '../src/ui/mapHistory'
import { loadMapPrefs, saveMapPrefs } from '../src/ui/storage'

describe('the game map presentation', () => {
  it('keeps a pointed-to world location fixed while zooming, in either projection and screen size', () => {
    for (const projection of ['plan', 'iso'] as const) for (const width of [341, 800]) {
      const camera = { ...districtCamera(DISTRICTS[0]), zoom: 2 }
      const before = unproject(transformFor(camera, projection, width, 380), width * 0.3, 180)
      const after = zoomCamera(camera, projection, width, 380, 1.6, width * 0.3, 180)
      const screen = project(transformFor(after, projection, width, 380), ...before)
      expect(screen[0]).toBeCloseTo(width * 0.3, 8)
      expect(screen[1]).toBeCloseTo(180, 8)
    }
  })

  it('pans in screen coordinates without mirroring isometric movement, and bounds extreme gestures', () => {
    for (const projection of ['plan', 'iso'] as const) {
      const camera = districtCamera(DISTRICTS[0])
      const before = project(transformFor(camera, projection, 800, 440), camera.cx, camera.cy)
      const after = panCamera(camera, projection, 800, 440, 50, -25)
      const screen = project(transformFor(after, projection, 800, 440), camera.cx, camera.cy)
      expect(screen[0] - before[0]).toBeCloseTo(50, 8)
      expect(screen[1] - before[1]).toBeCloseTo(-25, 8)
      const maximum = zoomCamera(camera, projection, 800, 440, 100)
      expect(transformFor(maximum, projection, 800, 440).scale).toBeLessThanOrEqual(40)
    }
    expect(clampCamera({ cx: -100, cy: 10000, cols: 28, rows: 24, zoom: 100 })).toEqual({ cx: 0, cy: MAP_ROWS, cols: 28, rows: 24, zoom: 16 })
    expect(clampCamera({ cx: MAP_COLS + 1, cy: 20, cols: 28, rows: 24, zoom: 0 }).zoom).toBe(1)
  })

  it('only offers snapshots the city has reached, without changing the game or inventing construction', () => {
    const game = playThrough(1, FOLLOW_HISTORY, { events: false })
    const before = JSON.stringify(game)
    const endT = game.snapshots[8].t
    const moments = mapMoments(game, endT)
    expect(moments.at(-1)!.t).toBe(endT)
    expect(moments.every((m) => m.t <= endT)).toBe(true)
    for (const moment of moments.slice(1)) {
      const scene = sceneAtMoment(moment)
      expect(scene.map).toEqual(cityMapFrom(moment.metrics, moment.t, moment.t + 1))
      expect(scene.works).toBeUndefined()
      expect(scene.railBuilding).toBeUndefined()
    }
    expect(JSON.stringify(game)).toBe(before)
    const fresh = newGame(7)
    step(fresh)
    expect(mapMoments(fresh, fresh.t)).toHaveLength(1)
  })

  it('opens existing map preferences in 2.5D and retains an explicit plan preference', () => {
    let stored = JSON.stringify({ layer: 'rail', mine: true, open: false })
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value } })
    try {
      expect(loadMapPrefs()).toEqual({ layer: 'rail', mine: true, open: false, projection: 'iso' })
      saveMapPrefs({ ...loadMapPrefs(), projection: 'plan' })
      expect(loadMapPrefs().projection).toBe('plan')
      stored = 'null'
      expect(loadMapPrefs().projection).toBe('iso')
    } finally { vi.unstubAllGlobals() }
  })
})
