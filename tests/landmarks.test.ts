import { describe, expect, it } from 'vitest'
import { REAL_LANDMARKS } from '../src/data/landmarks'
import { MAP_CELL, MAP_COLS, MAP_ORIGIN, MAP_TILE_KINDS } from '../src/data/mapBase'
import { cityLandmarks, realLandmarks } from '../src/engine/landmarks'
import { baseMap, cityMapAt } from '../src/engine/map'
import { FOLLOW_HISTORY, playThrough, setPolicy, setTax, type Strategy } from '../src/engine/sim'
import { LAST_MONTH_INDEX, monthIndex } from '../src/engine/time'
import type { GameState } from '../src/engine/types'

const due = (id: string) => monthIndex(...REAL_LANDMARKS.find((l) => l.id === id)!.opened)
const landmarkNews = (s: GameState) => s.news.filter((n) => n.kind === 'project' && REAL_LANDMARKS.some((l) => n.text.startsWith(l.name)))
const withHistory = (onMonth: Strategy['onMonth']): Strategy => ({
  onMonth: (s) => {
    FOLLOW_HISTORY.onMonth!(s)
    onMonth!(s)
  },
  choose: FOLLOW_HISTORY.choose,
})

describe('landmarks', () => {
  it('stand on land, except the bridge over the channel', () => {
    const grid = baseMap()
    for (const l of REAL_LANDMARKS) {
      const cell = Math.floor((MAP_ORIGIN.n - l.place[1]) / MAP_CELL) * MAP_COLS + Math.floor((l.place[0] - MAP_ORIGIN.e) / MAP_CELL)
      if (l.shape !== 'cableBridge') expect(MAP_TILE_KINDS[grid[cell]], l.id).not.toBe('sea')
    }
  })

  it('open in their real month when following history, with no landmark waiting', () => {
    for (const events of [false, true]) {
      const s = playThrough(2, FOLLOW_HISTORY, { events })
      for (const l of REAL_LANDMARKS) expect(s.landmarks[l.id], `${l.id} ${events}`).toEqual({ opened: monthIndex(...l.opened) })
      expect(landmarkNews(s).filter((n) => n.tone === 'bad')).toEqual([])
      expect(realLandmarks(LAST_MONTH_INDEX).map((l) => l.id)).toEqual(cityLandmarks(s, cityMapAt(s), LAST_MONTH_INDEX).map((l) => l.id))
    }
  })

  it('wait while the city has far less money than real Hong Kong, and say so once', () => {
    const s = playThrough(1, withHistory((g) => {
      setTax(g, 'salaries', 10)
      setTax(g, 'profits', 10)
    }))
    for (const id of ['hzmbPort', 'mPlus', 'kaiTakSports']) {
      expect(s.landmarks[id]?.opened, id).toBeUndefined()
      expect(s.landmarks[id]?.delayed, id).toBeGreaterThanOrEqual(due(id))
      expect(landmarkNews(s).filter((n) => n.text.startsWith(REAL_LANDMARKS.find((l) => l.id === id)!.name) && n.tone === 'bad'), id).toHaveLength(1)
    }
    // The bridge's history event does not announce an opening that did not happen.
    expect(s.news.some((n) => n.kind === 'history' && n.text === '港珠澳大橋通車。')).toBe(false)
  })

  it('wait for the wetland park when the city gives up protected land', () => {
    const s = playThrough(1, withHistory((g) => setPolicy(g, 'countryPark', 'on')))
    expect(s.landmarks.wetlandPark).toEqual({ delayed: due('wetlandPark') })
  })

  it('are never built when a decision went the other way, without news of a delay', () => {
    const noPark: Strategy = { onMonth: FOLLOW_HISTORY.onMonth, choose: (s, item) => (item.id === 'disney' ? 'skip' : FOLLOW_HISTORY.choose(s, item)) }
    const s = playThrough(1, noPark, { events: false })
    expect(s.landmarks.disneyland).toBeUndefined()
    expect(landmarkNews(s).some((n) => n.text.startsWith('香港迪士尼樂園'))).toBe(false)
  })

  it('mark the city own developments once a site is built up, and none when following history', () => {
    const finance = playThrough(1, withHistory((g) => setPolicy(g, 'industryFocus', 'finance')))
    expect(cityLandmarks(finance, cityMapAt(finance), LAST_MONTH_INDEX).map((l) => l.name)).toContain('九龍東商業區')
    const history = playThrough(1, FOLLOW_HISTORY, { events: false })
    expect(cityLandmarks(history, cityMapAt(history), LAST_MONTH_INDEX).some((l) => l.id.startsWith('site:'))).toBe(false)
  })
})
