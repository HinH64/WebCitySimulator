import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MAP_COLS, MAP_ROWS, MAP_TILE_KINDS } from '../data/mapBase'
import {
  cityMapFrom,
  lightRailStops,
  peoplePerCell,
  railCoverage,
  railServedShare,
  realCityMapAt,
  type CityMap,
} from '../engine/map'
import { realMetrics } from '../engine/metrics'
import { monthOf, yearOf } from '../engine/time'
import type { GameState } from '../engine/types'
import { formatNumber, percent } from './format'
import { KIND_COLOUR } from './mapStyle'
import { cssColour, drawMap, layerBitmap, useDarkTheme, useMapSize } from './MapView'

interface Frame {
  t: number
  label: string
  yours: CityMap
  real: CityMap
  population: number
}

const PLAY_MS = 700
const HOMES = new Set(['public', 'private'])
const GREEN = new Set(['woodland', 'shrubGrass', 'wetland'])
const CELL_KM2 = 0.0625

function stats(map: CityMap, t: number, population: number) {
  let homes = 0
  let green = 0
  for (const v of map.grid) {
    const k = MAP_TILE_KINDS[v]
    if (HOMES.has(k)) homes++
    else if (GREEN.has(k)) green++
  }
  const coverage = railCoverage([...map.rail.stations, ...lightRailStops(t)])
  return {
    homes: homes * CELL_KM2,
    green: green * CELL_KM2,
    stations: map.rail.stations.length,
    served: railServedShare(map.grid, coverage, peoplePerCell(map.grid, population)),
  }
}

/**
 * The end screen's map: the player's Hong Kong left of a divider, real Hong Kong right of it, at any
 * year of the term. One full-width map keeps the cells large enough to see.
 */
export function MapCompare({ game, endT }: { game: GameState; endT: number }) {
  const frames = useMemo<Frame[]>(() => {
    const start: Frame = { t: 0, label: '1997 年 7 月（接手時）', yours: realCityMapAt(0), real: realCityMapAt(0), population: realMetrics(0).population }
    const yearly = game.snapshots
      .filter((s) => s.t <= endT)
      .map((s) => ({
        t: s.t,
        label: monthOf(s.t) === 12 ? `${s.year} 年底` : `${s.year} 年 ${monthOf(s.t)} 月`,
        yours: cityMapFrom(s.metrics, s.t, s.t + 1),
        real: realCityMapAt(s.t),
        population: s.metrics.population,
      }))
    return [start, ...yearly]
  }, [game, endT])

  const [index, setIndex] = useState(frames.length - 1)
  const [playing, setPlaying] = useState(false)
  const [divider, setDivider] = useState(0.5)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useMapSize(frameRef, 480)
  const dark = useDarkTheme()
  const frame = frames[Math.min(index, frames.length - 1)]

  useEffect(() => {
    if (!playing) return
    if (index >= frames.length - 1) {
      setPlaying(false)
      return
    }
    const id = window.setTimeout(() => setIndex(index + 1), PLAY_MS)
    return () => window.clearTimeout(id)
  }, [playing, index, frames.length])

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const W = Math.round(size.w * dpr)
  const H = Math.round(size.h * dpr)

  // Both cities drawn whole, once per year and size; the divider only recombines them.
  const layers = useMemo(() => {
    const el = frameRef.current
    if (!el || W === 0) return null
    const sea = cssColour(el, '--map-sea', KIND_COLOUR.sea)
    const muted = cssColour(el, '--map-muted', '#e6e8eb')
    const draw = (map: CityMap) => {
      const canvas = document.createElement('canvas')
      drawMap(canvas, { bitmap: layerBitmap(map, 'land', undefined, sea, muted), map, t: frame.t, W, H, cellPx: size.base, cx: MAP_COLS / 2, cy: MAP_ROWS / 2, flash: [], dpr, sea })
      return canvas
    }
    return { yours: draw(frame.yours), real: draw(frame.real) }
    // `dark` re-reads the theme colours.
  }, [frame, W, H, size.base, dpr, dark])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layers) return
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    const x = Math.round(W * divider)
    ctx.drawImage(layers.yours, 0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, 0, W - x, H)
    ctx.clip()
    ctx.drawImage(layers.real, 0, 0)
    ctx.restore()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x - dpr, 0, 2 * dpr, H)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = dpr
    ctx.strokeRect(x - 1.5 * dpr, 0, 3 * dpr, H)
  }, [layers, divider, W, H, dpr])

  const moveDivider = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setDivider(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
  }

  const yours = useMemo(() => stats(frame.yours, frame.t, frame.population), [frame])
  const real = useMemo(() => stats(frame.real, frame.t, realMetrics(frame.t).population), [frame])
  const rows: [string, string, string][] = [
    ['住宅用地（公營、私人）', `${formatNumber(real.homes, 1)} 平方公里`, `${formatNumber(yours.homes, 1)} 平方公里`],
    ['郊野及綠地', `${formatNumber(real.green, 0)} 平方公里`, `${formatNumber(yours.green, 0)} 平方公里`],
    ['鐵路站', `${real.stations} 個`, `${yours.stations} 個`],
    ['住在鐵路站或輕鐵站 500 米內的居民', percent(real.served), percent(yours.served)],
  ]

  return (
    <div className="map-compare">
      <div className="map-compare-controls">
        <button
          className="button small-button"
          onClick={() => {
            if (!playing && index >= frames.length - 1) setIndex(0)
            setPlaying(!playing)
          }}
          aria-label={playing ? '暫停播放' : '由 1997 年播放'}
        >
          {playing ? '❚❚ 暫停' : '▶ 播放'}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false)
            setIndex(Number(e.target.value))
          }}
          aria-label="年份"
          aria-valuetext={frame.label}
        />
        <strong className="map-compare-year">{frame.label}</strong>
      </div>
      <div className="map-compare-labels small">
        <span>← 你的香港</span>
        <span>真實香港 →</span>
      </div>
      <div className="map-frame" ref={frameRef} style={{ height: size.h || undefined }}>
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          role="img"
          aria-label={`${frame.label}：左邊是你的香港，右邊是真實香港`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            moveDivider(e)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) moveDivider(e)
          }}
        />
      </div>
      <label className="map-compare-divider small">
        分隔線
        <input type="range" min={0} max={100} value={Math.round(divider * 100)} onChange={(e) => setDivider(Number(e.target.value) / 100)} />
      </label>
      <div className="table-wrap">
        <table className="metrics">
          <thead>
            <tr>
              <th>{yearOf(frame.t)} 年</th>
              <th>真實</th>
              <th>你的香港</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, r, y]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="mono">{r}</td>
                <td className="mono">{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">拖動地圖上的分隔線比較兩邊。每格 250 × 250 米；1997 年後的發展按公開資料整理，年份和範圍是約數。</p>
    </div>
  )
}
