import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { MAP_COLS, MAP_ROWS, MAP_TILE_KINDS } from '../data/mapBase'
import type { TileKind } from '../data/mapProjects'
import { RAIL_WALK, lightRailStops, peoplePerCell, railCoverage, railServedShare, regionOf, regionalPrices, type CityMap, type HomeKind, type Region } from '../engine/map'
import { realMetrics } from '../engine/metrics'
import { cityWorks } from '../engine/projects'
import { metricsNow } from '../engine/sim'
import { LAST_MONTH_INDEX, monthOf, yearOf } from '../engine/time'
import type { GameState, Place } from '../engine/types'
import { formatNumber, percent } from './format'
import { DENSITY_SCALE, KIND_COLOUR, LAND_LEGEND, PRICE_SCALE, hexToRgb, scaleColour } from './mapStyle'
import { DISTRICTS, clampCamera, districtCamera, gridPoint, panCamera, zoomCamera, type Camera, type Projection } from './mapGeometry'
import { cityLandmarks } from '../engine/landmarks'
import { mapMoments, sceneAtMoment } from './mapHistory'
import { renderScene, type MapScene } from './mapRenderer'
import { loadMapPrefs, saveMapPrefs, type MapLayer } from './storage'

const LAYERS: { id: MapLayer; label: string }[] = [
  { id: 'land', label: '土地用途' }, { id: 'density', label: '人口密度' },
  { id: 'price', label: '樓價' }, { id: 'rail', label: '鐵路覆蓋' },
]
const HOMES: HomeKind[] = ['public', 'private', 'village']
const HOME_LABEL: Record<HomeKind, string> = { public: '公營房屋', private: '私人住宅', village: '鄉村' }
const REGION_LABEL: Record<Region, string> = { hk: '港島', kln: '九龍', nt: '新界' }
const PRICE_TOP = 240000
const FLASH_MS = 2500
const MAX_FLASH = 600
const MARKER_MS = 6000
export const MINE_COLOUR = '#d6336c'
const FULL = districtCamera(DISTRICTS.find((d) => d.id === 'all')!)
const date = (t: number) => `${yearOf(t)} 年 ${monthOf(t)} 月`
export interface MapFocus { place: Place; key: number }
interface LayerData { people: Record<HomeKind, number>; prices: Record<Region, number>; coverage: Uint8Array; served: number }

export function cssColour(el: Element, name: string, fallback: string): [number, number, number] {
  const value = getComputedStyle(el).getPropertyValue(name).trim()
  return hexToRgb(/^#[0-9a-f]{6}$/i.test(value) ? value : fallback)
}
/** One pixel per cell, coloured for the layer; without layer data, land use. */
export function layerBitmap(map: CityMap, layer: MapLayer, data: LayerData | undefined, sea: [number, number, number], muted: [number, number, number]) {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_COLS
  canvas.height = MAP_ROWS
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(MAP_COLS, MAP_ROWS)
  const kindRgb = Object.fromEntries(Object.entries(KIND_COLOUR).map(([k, c]) => [k, hexToRgb(c)])) as Record<TileKind, [number, number, number]>
  const maxPeople = data ? Math.max(...HOMES.map((k) => data.people[k])) : 1
  for (let i = 0; i < map.grid.length; i++) {
    const kind = MAP_TILE_KINDS[map.grid[i]] as TileKind
    let rgb: [number, number, number]
    if (kind === 'sea') rgb = sea
    else if (!data || layer === 'land' || (layer === 'rail' && data.coverage[i])) rgb = kindRgb[kind]
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


export interface MapSize { w: number; h: number; dpr: number }
/** Reserve space for either projection and track viewport / device pixel ratio changes. */
export function useMapSize(frameRef: RefObject<HTMLDivElement | null>, maxHeight: number): MapSize {
  const [size, setSize] = useState<MapSize>({ w: 0, h: 0, dpr: 1 })
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const update = () => {
      const w = frame.clientWidth
      const h = Math.round(Math.min(maxHeight, window.innerHeight * 0.6, Math.max(300, w * 0.55)))
      const dpr = window.devicePixelRatio || 1
      setSize((before) => before.w === w && before.h === h && before.dpr === dpr ? before : { w, h, dpr })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(frame)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [frameRef, maxHeight])
  return size
}
export function useDarkTheme(): boolean {
  const readTheme = () => document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [dark, setDark] = useState(readTheme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(readTheme())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    mq.addEventListener('change', update)
    return () => { observer.disconnect(); mq.removeEventListener('change', update) }
  }, [])
  return dark
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


interface MapViewProps { game: GameState; focus?: MapFocus | null; onFocused?: () => void }

export function MapView({ game, focus, onFocused }: MapViewProps) {
  const [layer, setLayer] = useState<MapLayer>(() => loadMapPrefs().layer)
  const [mine, setMine] = useState(() => loadMapPrefs().mine)
  const [projection, setProjection] = useState<Projection>(() => loadMapPrefs().projection)
  const [camera, setCamera] = useState<Camera>(FULL)
  const [district, setDistrict] = useState('all')
  const [past, setPast] = useState<number | null>(null)
  const [flash, setFlash] = useState<number[]>([])
  const [marker, setMarker] = useState<Place | null>(null)
  const dark = useDarkTheme()
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previous = useRef<{ grid: Uint8Array; past: number | null } | null>(null)
  const points = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ x: number; y: number; distance: number; camera: Camera } | null>(null)
  const [visible, setVisible] = useState(true)
  const currentT = Math.min(game.status === 'ended' ? game.t - 1 : game.t, LAST_MONTH_INDEX)
  const quarter = Math.floor(currentT / 3)
  const works = useMemo(() => cityWorks(game), [game, quarter, game.status])
  const moments = useMemo(() => mapMoments(game, currentT), [game, game.snapshots.length, currentT])
  const moment = past === null ? undefined : moments.find((m) => m.t === past)
  const historical = useMemo(() => moment ? sceneAtMoment(moment, game) : null, [moment?.t, moment?.metrics])
  const landmarks = useMemo(() => cityLandmarks(game, works.map, currentT), [works, currentT, game.status])
  // Opening a landmark is rare; redraw for it, not for every month that passes.
  const landmarkKey = (historical?.landmarks ?? landmarks).map((l) => l.id).join()
  const scene: MapScene = historical ?? { ...works, t: currentT, landmarks }
  const map = scene.map
  const t = scene.t
  const metric = moment?.metrics ?? metricsNow(game)
  const effectiveProjection = layer === 'land' ? projection : 'plan'
  const size = useMapSize(frameRef, 480)

  const data = useMemo<LayerData>(() => {
    const people = peoplePerCell(map.grid, metric.population)
    const coverage = railCoverage([...map.rail.stations, ...lightRailStops(t)])
    return { people, prices: regionalPrices(t, metric.priceIndex / realMetrics(t).priceIndex), coverage, served: railServedShare(map.grid, coverage, people) }
  }, [map, t, metric.population, metric.priceIndex])

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px 0px' })
    observer.observe(frameRef.current!)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const before = previous.current
    previous.current = { grid: map.grid, past }
    setFlash([])
    if (!before || before.past !== past || past !== null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const changed: number[] = []
    for (let i = 0; i < map.grid.length && changed.length <= MAX_FLASH; i++) if (map.grid[i] !== before.grid[i]) changed.push(i)
    if (!changed.length || changed.length > MAX_FLASH) return
    setFlash(changed)
    const id = window.setTimeout(() => setFlash([]), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [map.grid, past])

  useEffect(() => {
    if (!focus) return
    const [cx, cy] = gridPoint(...focus.place)
    setPast(null)
    setDistrict('')
    setCamera(clampCamera({ cx, cy, cols: 28, rows: 24, zoom: 1 }))
    setMarker(focus.place)
    onFocused?.()
  }, [focus?.key])
  useEffect(() => {
    if (!marker) return
    const id = window.setTimeout(() => setMarker(null), MARKER_MS)
    return () => window.clearTimeout(id)
  }, [marker])

  const bitmap = useMemo(() => {
    const frame = frameRef.current
    if (!frame || layer === 'land') return null
    return layerBitmap(map, layer, data, cssColour(frame, '--map-sea', KIND_COLOUR.sea), cssColour(frame, '--map-muted', '#e6e8eb'))
  }, [map, layer, data, dark, size.w])

  // The map itself changes each quarter; between those, only the light rail's extension changes the drawing.
  const lightRail = lightRailStops(t).length
  useEffect(() => {
    if (!canvasRef.current || !size.w || !visible) return
    renderScene(canvasRef.current, {
      frame: layer === 'land' ? scene : { ...scene, landmarks: undefined }, camera, projection: effectiveProjection, width: size.w, height: size.h, dpr: size.dpr, dark, bitmap,
      outline: mine && !historical ? { cells: works.extraCells, rail: works.extraRail } : null,
      flash: historical ? [] : flash, marker,
      sea: getComputedStyle(canvasRef.current).getPropertyValue('--map-sea').trim(),
    })
  }, [map, lightRail, works, historical, landmarkKey, layer, camera, effectiveProjection, size, dark, bitmap, mine, flash, marker, visible])

  const zoomAt = (factor: number, x?: number, y?: number, from = camera) =>
    setCamera(zoomCamera(from, effectiveProjection, size.w, size.h, factor, x, y))
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top)
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  })

  const point = (e: ReactPointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const startGesture = () => {
    const pts = [...points.current.values()]
    gesture.current = pts.length ? {
      x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
      y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
      distance: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      camera,
    } : null
  }
  const pointerDown = (e: ReactPointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); points.current.set(e.pointerId, point(e)); startGesture() }
  const pointerMove = (e: ReactPointerEvent) => {
    if (!points.current.has(e.pointerId) || !gesture.current) return
    points.current.set(e.pointerId, point(e))
    const pts = [...points.current.values()], g = gesture.current
    const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
    const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
    const factor = pts.length > 1 && g.distance > 0 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.distance : 1
    const zoomed = zoomCamera(g.camera, effectiveProjection, size.w, size.h, factor, g.x, g.y)
    setCamera(panCamera(zoomed, effectiveProjection, size.w, size.h, x - g.x, y - g.y))
  }
  const pointerUp = (e: ReactPointerEvent) => { points.current.delete(e.pointerId); startGesture() }
  const chooseDistrict = (id: string) => { setDistrict(id); setCamera(districtCamera(DISTRICTS.find((d) => d.id === id)!)) }
  const chooseProjection = (value: Projection) => { setProjection(value); saveMapPrefs({ ...loadMapPrefs(), projection: value }) }
  const building = historical ? 0 : works.works.filter((w) => w.state === 'building').length
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  return (
    <div className="map-view">
      <div className="map-tools">
        <div className="segmented small-seg" role="group" aria-label="圖層">
          {LAYERS.map((l) => <button key={l.id} className={layer === l.id ? 'active' : ''} aria-pressed={layer === l.id} onClick={() => { setLayer(l.id); saveMapPrefs({ ...loadMapPrefs(), layer: l.id }) }}>{l.label}</button>)}
        </div>
        <div className="segmented small-seg">
          <button disabled={!!historical} className={mine ? 'active mine-toggle' : 'mine-toggle'} aria-pressed={mine} onClick={() => { setMine(!mine); saveMapPrefs({ ...loadMapPrefs(), mine: !mine }) }}>你的發展</button>
        </div>
      </div>
      <div className="map-tools map-places">
        <label>地區<select aria-label="地圖地區" value={district} onChange={(e) => chooseDistrict(e.target.value)}>{!district && <option value="">自訂視野</option>}{DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <div className="segmented small-seg" role="group" aria-label="地圖畫法">
          <button disabled={layer !== 'land'} className={effectiveProjection === 'iso' ? 'active' : ''} aria-pressed={effectiveProjection === 'iso'} onClick={() => chooseProjection('iso')}>2.5D</button>
          <button className={effectiveProjection === 'plan' ? 'active' : ''} aria-pressed={effectiveProjection === 'plan'} onClick={() => chooseProjection('plan')}>俯視</button>
        </div>
      </div>
      <div className="map-tools map-years">
        <label>城市年份<select aria-label="城市年份" value={past ?? 'now'} onChange={(e) => { setPast(e.target.value === 'now' ? null : Number(e.target.value)); setMarker(null) }}><option value="now">現在 · {date(currentT)}</option>{moments.filter((m) => m.t < currentT).map((m) => <option key={m.t} value={m.t}>{m.label}</option>)}</select></label>
        {historical && <button className="button small-button" onClick={() => setPast(null)}>返回現在</button>}
      </div>
      {layer !== 'land' && <p className="map-note">分析圖層以俯視顯示；返回土地用途可繼續查看 2.5D。</p>}
      <div className="map-frame" ref={frameRef} style={{ height: size.h || undefined }}>
        <canvas ref={canvasRef} className="city-canvas" style={{ width: size.w, height: size.h }} role="img"
          aria-label={`${date(t)}的香港地圖：${LAYERS.find((l) => l.id === layer)!.label}，${effectiveProjection === 'iso' ? '2.5D' : '俯視'}`}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}
          onDoubleClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); zoomAt(2, e.clientX - rect.left, e.clientY - rect.top) }} />
        <div className="map-zoom">
          <button className="button icon" onClick={() => zoomAt(1.6)} disabled={zoomCamera(camera, effectiveProjection, size.w, size.h, 1.6).zoom <= camera.zoom + 1e-6} aria-label="放大">＋</button>
          <button className="button icon" onClick={() => zoomAt(1 / 1.6)} disabled={camera.zoom <= 1} aria-label="縮小">−</button>
          <button className="button icon small-text" onClick={() => chooseDistrict('all')} aria-label="全港">全港</button>
        </div>
      </div>
      <Legend layer={layer} data={data} />
      {historical ? <p className="map-note">正在看自己城市的 {moment!.label}，年份切換保留同一視野。過往畫面只顯示當年用地及已通車鐵路；施工進度未有紀錄，「你的發展」暫不顯示。</p> : mine && <p className="map-note"><span className="swatch-line" style={{ borderColor: MINE_COLOUR }} />框出的是你的撥款和政策帶來的新發展，包括施工中的工地和鐵路。{works.extraCells.length === 0 && works.extraRail.segments.length === 0 && '暫時沒有。'}</p>}
      {building > 0 && <p className="map-note">吊臂工地和虛線鐵路是正在施工的工程，預算面板有詳情。</p>}
      <p className="map-note">{coarse ? '拖動移動，兩指縮放。' : '拖動移動；按 ＋／−、雙擊或 Ctrl＋滾輪縮放。'}每格 250 × 250 米；樓群及高度是用地示意。</p>
    </div>
  )
}

/** The map above the news on wide screens; it can be folded away, and unfolds when news asks to show a place. */
export function MapCard({ game, focus, onFocused }: MapViewProps) {
  const [open, setOpen] = useState(() => loadMapPrefs().open)
  const ref = useRef<HTMLElement>(null)
  const toggle = () => {
    setOpen(!open)
    saveMapPrefs({ ...loadMapPrefs(), open: !open })
  }
  useEffect(() => {
    if (!focus) return
    setOpen(true)
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focus])
  return (
    <section className="card map-card" aria-label="地圖" ref={ref}>
      <div className="map-head">
        <h2 className="card-title">地圖</h2>
        <button className="button small-button map-toggle" onClick={toggle} aria-expanded={open}>
          {open ? '收起' : '展開'}
        </button>
      </div>
      {open && <MapView game={game} focus={focus} onFocused={onFocused} />}
    </section>
  )
}
