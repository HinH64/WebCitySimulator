import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MAP_CELL, MAP_COLS, MAP_ORIGIN, MAP_ROWS, MAP_TILE_KINDS } from '../data/mapBase'
import type { TileKind } from '../data/mapProjects'
import {
  RAIL_WALK,
  cityMapAt,
  lightRailStops,
  peoplePerCell,
  railCoverage,
  railServedShare,
  regionOf,
  regionalPrices,
  type CityMap,
  type HomeKind,
  type Region,
} from '../engine/map'
import { realMetrics } from '../engine/metrics'
import { metricsNow } from '../engine/sim'
import { LAST_MONTH_INDEX, yearOf } from '../engine/time'
import type { GameState } from '../engine/types'
import { formatNumber, percent } from './format'
import { DENSITY_SCALE, KIND_COLOUR, LAND_LEGEND, PRICE_SCALE, hexToRgb, scaleColour } from './mapStyle'
import { loadMapPrefs, saveMapPrefs, type MapLayer } from './storage'

const LAYERS: { id: MapLayer; label: string }[] = [
  { id: 'land', label: '土地用途' },
  { id: 'density', label: '人口密度' },
  { id: 'price', label: '樓價' },
  { id: 'rail', label: '鐵路覆蓋' },
]

const HOMES: HomeKind[] = ['public', 'private', 'village']
const HOME_LABEL: Record<HomeKind, string> = { public: '公營房屋', private: '私人住宅', village: '鄉村' }
const REGION_LABEL: Record<Region, string> = { hk: '港島', kln: '九龍', nt: '新界' }
/** Top of the price layer's scale, HK$ per m²; one band per 40,000. */
const PRICE_TOP = 240000
const ZOOM_MAX = 8
const FLASH_MS = 2500
const MAX_FLASH = 600

interface LayerData {
  people: Record<HomeKind, number>
  prices: Record<Region, number>
  coverage: Uint8Array
  served: number
}

interface View {
  z: number
  cx: number
  cy: number
}

const FULL: View = { z: 1, cx: MAP_COLS / 2, cy: MAP_ROWS / 2 }

function cssColour(el: Element, name: string, fallback: string): [number, number, number] {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return hexToRgb(/^#[0-9a-f]{6}$/i.test(v) ? v : fallback)
}

/** One pixel per cell, coloured for the layer. */
function layerBitmap(map: CityMap, layer: MapLayer, data: LayerData, sea: [number, number, number], muted: [number, number, number]) {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_COLS
  canvas.height = MAP_ROWS
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(MAP_COLS, MAP_ROWS)
  const kindRgb = Object.fromEntries(Object.entries(KIND_COLOUR).map(([k, c]) => [k, hexToRgb(c)])) as Record<TileKind, [number, number, number]>
  const maxPeople = Math.max(...HOMES.map((k) => data.people[k]))
  for (let i = 0; i < map.grid.length; i++) {
    const kind = MAP_TILE_KINDS[map.grid[i]] as TileKind
    let rgb: [number, number, number]
    if (kind === 'sea') rgb = sea
    else if (layer === 'land' || (layer === 'rail' && data.coverage[i])) rgb = kindRgb[kind]
    else if (layer === 'density' && HOMES.includes(kind as HomeKind)) rgb = hexToRgb(scaleColour(DENSITY_SCALE, data.people[kind as HomeKind] / maxPeople - 1e-9))
    else if (layer === 'price' && kind === 'private') rgb = hexToRgb(scaleColour(PRICE_SCALE, data.prices[regionOf(i)] / PRICE_TOP))
    else {
      const c = kindRgb[kind]
      rgb = [c[0] * 0.3 + muted[0] * 0.7, c[1] * 0.3 + muted[1] * 0.7, c[2] * 0.3 + muted[2] * 0.7]
    }
    image.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4)
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function Legend({ layer, data }: { layer: MapLayer; data: LayerData }) {
  if (layer === 'land') {
    return (
      <ul className="map-legend">
        {LAND_LEGEND.map((g) => (
          <li key={g.label}>
            <span className="swatch" style={{ background: KIND_COLOUR[g.kinds[0]] }} />
            {g.label}
          </li>
        ))}
      </ul>
    )
  }
  if (layer === 'density') {
    const max = Math.max(...HOMES.map((k) => data.people[k]))
    return (
      <>
        <ul className="map-legend">
          {HOMES.map((k) => (
            <li key={k}>
              <span className="swatch" style={{ background: scaleColour(DENSITY_SCALE, data.people[k] / max - 1e-9) }} />
              {HOME_LABEL[k]}：每格約 {formatNumber(data.people[k] * 10000, 0)} 人
            </li>
          ))}
        </ul>
        <p className="map-note">每格 250 × 250 米。按各類住宅每格的單位數估算，跟全港人口一起變。</p>
      </>
    )
  }
  if (layer === 'price') {
    const step = PRICE_TOP / PRICE_SCALE.length
    return (
      <>
        <ul className="map-legend">
          {PRICE_SCALE.map((c, i) => (
            <li key={c}>
              <span className="swatch" style={{ background: c }} />
              {i === 0 ? `${step / 10000} 萬以下` : i === PRICE_SCALE.length - 1 ? `${(step * i) / 10000} 萬以上` : `${(step * i) / 10000}–${(step * (i + 1)) / 10000} 萬`}
            </li>
          ))}
        </ul>
        <p className="map-note">
          私人住宅每平方米實用面積平均售價：
          {(['hk', 'kln', 'nt'] as const).map((r) => `${REGION_LABEL[r]} ${formatNumber(data.prices[r] / 10000, 1)} 萬`).join('、')}
          元。
        </p>
      </>
    )
  }
  return (
    <p className="map-note">
      住在鐵路站或輕鐵站 {RAIL_WALK} 米內的居民：<strong>{percent(data.served)}</strong>。車站 {RAIL_WALK} 米內的地方保留原來顏色，其餘淡化。
    </p>
  )
}

export function MapView({ game }: { game: GameState }) {
  const [layer, setLayer] = useState<MapLayer>(() => loadMapPrefs().layer)
  const [view, setView] = useState<View>(FULL)
  const [size, setSize] = useState({ w: 0, h: 0, base: 1 })
  const [flash, setFlash] = useState<number[]>([])
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previous = useRef<Uint8Array | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ x: number; y: number; dist: number; view: View } | null>(null)

  const t = Math.min(game.status === 'ended' ? game.t - 1 : game.t, LAST_MONTH_INDEX)
  const quarter = Math.floor(t / 3)
  // The map changes slowly; redraw it every three months rather than every tick.
  const map = useMemo(() => cityMapAt(game), [game, quarter, game.status])

  const data = useMemo<LayerData>(() => {
    const m = metricsNow(game)
    const people = peoplePerCell(map.grid, m.population)
    const coverage = railCoverage([...map.rail.stations, ...lightRailStops(t)])
    return {
      people,
      prices: regionalPrices(t, m.priceIndex / realMetrics(t).priceIndex),
      coverage,
      served: railServedShare(map.grid, coverage, people),
    }
  }, [map])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Cells that changed since the last redraw flash for a moment.
  useEffect(() => {
    const before = previous.current
    previous.current = map.grid
    if (!before) return
    const changed: number[] = []
    for (let i = 0; i < map.grid.length && changed.length <= MAX_FLASH; i++) if (map.grid[i] !== before[i]) changed.push(i)
    if (changed.length === 0 || changed.length > MAX_FLASH) return
    setFlash(changed)
    const id = window.setTimeout(() => setFlash([]), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [map])

  // Size the canvas so each cell is a whole number of device pixels.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const update = () => {
      const dpr = window.devicePixelRatio || 1
      const w = frame.clientWidth
      const maxH = Math.min(480, window.innerHeight * 0.6)
      let base = Math.max(1, Math.floor((w * dpr) / MAP_COLS))
      let h = Math.ceil((MAP_ROWS * base) / dpr)
      if (h > maxH) {
        base = Math.max(1, Math.floor((maxH * dpr) / MAP_ROWS))
        h = Math.ceil((MAP_ROWS * base) / dpr)
      }
      setSize({ w, h, base })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [])

  const bitmap = useMemo(() => {
    const frame = frameRef.current
    if (!frame) return null
    return layerBitmap(map, layer, data, cssColour(frame, '--map-sea', KIND_COLOUR.sea), cssColour(frame, '--map-muted', '#e6e8eb'))
    // `dark` and the size re-read the theme colours once the frame exists.
  }, [map, layer, data, dark, size.w])

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const W = Math.round(size.w * dpr)
  const H = Math.round(size.h * dpr)
  const cellPx = Math.max(1, Math.round(size.base * view.z))

  /** Keeps the map from sliding out of the frame. */
  const clampView = (v: View): View => {
    const px = Math.max(1, Math.round(size.base * v.z))
    const hw = W / 2 / px
    const hh = H / 2 / px
    return {
      z: v.z,
      cx: MAP_COLS <= 2 * hw ? MAP_COLS / 2 : Math.min(MAP_COLS - hw, Math.max(hw, v.cx)),
      cy: MAP_ROWS <= 2 * hh ? MAP_ROWS / 2 : Math.min(MAP_ROWS - hh, Math.max(hh, v.cy)),
    }
  }
  const v = clampView(view)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap || W === 0) return
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    const sea = cssColour(canvas, '--map-sea', KIND_COLOUR.sea)
    ctx.fillStyle = `rgb(${sea.join(',')})`
    ctx.fillRect(0, 0, W, H)
    const ox = Math.round(W / 2 - v.cx * cellPx)
    const oy = Math.round(H / 2 - v.cy * cellPx)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, ox, oy, MAP_COLS * cellPx, MAP_ROWS * cellPx)
    // Haze covers the whole frame, sea included, so it does not outline the map.
    if (map.haze > 0) {
      ctx.fillStyle = `rgba(150, 150, 150, ${(map.haze * 0.25).toFixed(3)})`
      ctx.fillRect(0, 0, W, H)
    }
    const X = (e: number) => ox + ((e - MAP_ORIGIN.e) / MAP_CELL) * cellPx
    const Y = (n: number) => oy + ((MAP_ORIGIN.n - n) / MAP_CELL) * cellPx

    for (const c of flash) {
      ctx.strokeStyle = '#ffd400'
      ctx.lineWidth = Math.max(1, dpr)
      ctx.strokeRect(ox + (c % MAP_COLS) * cellPx + 0.5, oy + Math.floor(c / MAP_COLS) * cellPx + 0.5, cellPx - 1, cellPx - 1)
    }

    const lw = Math.min(4 * dpr, Math.max(1.5 * dpr, cellPx * 0.3))
    ctx.lineCap = 'round'
    for (const [colour, width] of [['rgba(255,255,255,0.9)', lw + 2 * dpr], ['#3d3d3d', lw]] as const) {
      ctx.strokeStyle = colour
      ctx.lineWidth = width
      ctx.beginPath()
      for (const s of map.rail.segments) {
        ctx.moveTo(X(s.from[0]), Y(s.from[1]))
        ctx.lineTo(X(s.to[0]), Y(s.to[1]))
      }
      ctx.stroke()
    }
    const r = Math.min(5 * dpr, Math.max(2 * dpr, cellPx * 0.4))
    ctx.fillStyle = '#3d7a4a'
    for (const s of lightRailStops(t)) {
      ctx.beginPath()
      ctx.arc(X(s.e), Y(s.n), r * 0.45, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeStyle = '#3d3d3d'
    ctx.fillStyle = '#ffffff'
    for (const s of map.rail.stations) {
      ctx.beginPath()
      ctx.arc(X(s.e), Y(s.n), r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    if (cellPx >= 10 * dpr) {
      ctx.font = `${12 * dpr}px ${getComputedStyle(canvas).fontFamily}`
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.fillStyle = '#1f2328'
      for (const s of map.rail.stations) {
        ctx.strokeText(s.name, X(s.e) + r + 2 * dpr, Y(s.n) - r)
        ctx.fillText(s.name, X(s.e) + r + 2 * dpr, Y(s.n) - r)
      }
    }
  }, [bitmap, map, flash, W, H, cellPx, v.cx, v.cy, dpr, t])

  // Ctrl or Cmd with the wheel zooms; a plain wheel keeps scrolling the page.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  })

  /** Zooms by a factor, keeping the point under (px, py) device pixels in place. */
  function zoomAt(factor: number, px = W / 2, py = H / 2, from: View = v) {
    const z = Math.min(ZOOM_MAX, Math.max(1, from.z * factor))
    const oldPx = Math.max(1, Math.round(size.base * from.z))
    const newPx = Math.max(1, Math.round(size.base * z))
    const mx = from.cx + (px - W / 2) / oldPx
    const my = from.cy + (py - H / 2) / oldPx
    setView(clampView({ z, cx: mx - (px - W / 2) / newPx, cy: my - (py - H / 2) / newPx }))
  }

  const devicePoint = (e: ReactPointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr }
  }

  const startGesture = () => {
    const pts = [...pointers.current.values()]
    if (pts.length === 0) {
      gesture.current = null
      return
    }
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const y = pts.reduce((a, p) => a + p.y, 0) / pts.length
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    gesture.current = { x, y, dist, view: v }
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, devicePoint(e))
    startGesture()
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, devicePoint(e))
    const g = gesture.current
    const pts = [...pointers.current.values()]
    if (pts.length > 1 && g.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      zoomAt(dist / g.dist, g.x, g.y, g.view)
      return
    }
    const px = Math.max(1, Math.round(size.base * g.view.z))
    setView(clampView({ z: g.view.z, cx: g.view.cx - (pts[0].x - g.x) / px, cy: g.view.cy - (pts[0].y - g.y) / px }))
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    startGesture()
  }

  const chooseLayer = (id: MapLayer) => {
    setLayer(id)
    saveMapPrefs({ ...loadMapPrefs(), layer: id })
  }

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  return (
    <div className="map-view">
      <div className="segmented small-seg" role="group" aria-label="圖層">
        {LAYERS.map((l) => (
          <button key={l.id} className={layer === l.id ? 'active' : ''} aria-pressed={layer === l.id} onClick={() => chooseLayer(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="map-frame" ref={frameRef} style={{ height: size.h || undefined }}>
        <canvas
          ref={canvasRef}
          className={view.z > 1 ? 'zoomed' : ''}
          style={{ width: size.w, height: size.h }}
          role="img"
          aria-label={`${yearOf(t)} 年的香港地圖：${LAYERS.find((l) => l.id === layer)!.label}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            zoomAt(2, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr)
          }}
        />
        <div className="map-zoom">
          <button className="button icon" onClick={() => zoomAt(2)} disabled={view.z >= ZOOM_MAX} aria-label="放大">
            ＋
          </button>
          <button className="button icon" onClick={() => zoomAt(0.5)} disabled={view.z <= 1} aria-label="縮小">
            −
          </button>
          <button className="button icon small-text" onClick={() => setView(FULL)} disabled={view.z <= 1} aria-label="全港">
            全港
          </button>
        </div>
      </div>
      <Legend layer={layer} data={data} />
      <p className="map-note">{coarse ? '拖動移動，兩指縮放。' : '拖動移動；按 ＋／−、雙擊或 Ctrl＋滾輪縮放。'}新落成的地方會閃一下。</p>
    </div>
  )
}

/** The map above the news on wide screens; it can be folded away. */
export function MapCard({ game }: { game: GameState }) {
  const [open, setOpen] = useState(() => loadMapPrefs().open)
  const toggle = () => {
    setOpen(!open)
    saveMapPrefs({ ...loadMapPrefs(), open: !open })
  }
  return (
    <section className="card map-card" aria-label="地圖">
      <div className="map-head">
        <h2 className="card-title">地圖</h2>
        <button className="button small-button map-toggle" onClick={toggle} aria-expanded={open}>
          {open ? '收起' : '展開'}
        </button>
      </div>
      {open && <MapView game={game} />}
    </section>
  )
}
