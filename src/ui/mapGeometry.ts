import { MAP_CELL, MAP_COLS, MAP_ORIGIN, MAP_ROWS } from '../data/mapBase'
import type { CityMap, RailSegment } from '../engine/map'

export type Projection = 'plan' | 'iso'
export interface District { id: string; name: string; e: number; n: number; cols: number; rows: number }
export const DISTRICTS: District[] = [
  { id: 'kaiTak', name: '啟德・九龍城', e: 837200, n: 820300, cols: 26, rows: 22 },
  { id: 'kwuTung', name: '古洞・粉嶺北', e: 830500, n: 840100, cols: 32, rows: 22 },
  { id: 'tinShuiWai', name: '天水圍・元朗', e: 819100, n: 833500, cols: 30, rows: 24 },
  { id: 'kowloonEast', name: '九龍東', e: 841100, n: 820300, cols: 26, rows: 22 },
  { id: 'sanTin', name: '新田・落馬洲', e: 825400, n: 839500, cols: 30, rows: 22 },
  { id: 'tuenMunWest', name: '屯門西', e: 809800, n: 826800, cols: 30, rows: 24 },
  { id: 'shamShuiPo', name: '深水埗・油旺', e: 835000, n: 820700, cols: 22, rows: 24 },
  { id: 'all', name: '全港總覽', e: MAP_ORIGIN.e + MAP_COLS * MAP_CELL / 2, n: MAP_ORIGIN.n - MAP_ROWS * MAP_CELL / 2, cols: MAP_COLS, rows: MAP_ROWS },
]

export interface Camera { cx: number; cy: number; cols: number; rows: number; zoom: number }
export interface Transform { projection: Projection; scale: number; cx: number; cy: number; ox: number; oy: number }
export const gridPoint = (e: number, n: number): [number, number] => [(e - MAP_ORIGIN.e) / MAP_CELL, (MAP_ORIGIN.n - n) / MAP_CELL]
export function districtCamera(d: District): Camera {
  const [cx, cy] = gridPoint(d.e, d.n)
  return { cx, cy, cols: d.cols, rows: d.rows, zoom: 1 }
}

export function transformFor(camera: Camera, projection: Projection, width: number, height: number): Transform {
  const span = camera.cols + camera.rows
  const scale = projection === 'iso'
    ? Math.min((width - 48) / span, (height - 90) / (span * 0.5 + 3)) * camera.zoom
    : Math.min((width - 40) / camera.cols, (height - 56) / camera.rows) * camera.zoom
  return { projection, scale: Math.max(0.1, scale), cx: camera.cx, cy: camera.cy, ox: width / 2, oy: height / 2 + (projection === 'iso' ? 18 : 0) }
}

export function project(tr: Transform, col: number, row: number): [number, number] {
  const x = col - tr.cx
  const y = row - tr.cy
  return tr.projection === 'iso'
    ? [tr.ox + (x - y) * tr.scale, tr.oy + (x + y) * tr.scale * 0.5]
    : [tr.ox + x * tr.scale, tr.oy + y * tr.scale]
}

export function unproject(tr: Transform, x: number, y: number): [number, number] {
  const dx = (x - tr.ox) / tr.scale
  const dy = (y - tr.oy) / tr.scale
  return tr.projection === 'iso' ? [tr.cx + dx * 0.5 + dy, tr.cy - dx * 0.5 + dy] : [tr.cx + dx, tr.cy + dy]
}

/** Keep the city's centre reachable in either projection, including after resizing. */
export function clampCamera(camera: Camera): Camera {
  return { ...camera, cx: Math.max(0, Math.min(MAP_COLS, camera.cx)), cy: Math.max(0, Math.min(MAP_ROWS, camera.cy)), zoom: Math.max(1, Math.min(16, camera.zoom)) }
}

/** Pan and zoom use the same inverse as buildings, rail and news markers. CSS pixels throughout. */
export function panCamera(camera: Camera, projection: Projection, width: number, height: number, dx: number, dy: number): Camera {
  const tr = transformFor(camera, projection, width, height)
  const origin = unproject(tr, 0, 0)
  const moved = unproject(tr, dx, dy)
  return clampCamera({ ...camera, cx: camera.cx - moved[0] + origin[0], cy: camera.cy - moved[1] + origin[1] })
}

export function zoomCamera(camera: Camera, projection: Projection, width: number, height: number, factor: number, x = width / 2, y = height / 2): Camera {
  const before = unproject(transformFor(camera, projection, width, height), x, y)
  // A district preset is already magnified. Bound building sprite size as well as the zoom factor.
  const baseScale = transformFor({ ...camera, zoom: 1 }, projection, width, height).scale
  const next = clampCamera({ ...camera, zoom: Math.min(camera.zoom * factor, 40 / baseScale) })
  const after = unproject(transformFor(next, projection, width, height), x, y)
  return clampCamera({ ...next, cx: next.cx + before[0] - after[0], cy: next.cy + before[1] - after[1] })
}

/** Include the screen corners, with room for buildings extending above their ground footprint. */
export function visibleBounds(tr: Transform, width: number, height: number) {
  const margin = Math.max(60, tr.scale * 3.5)
  const corners = [[0, -margin], [width, -margin], [0, height + margin], [width, height + margin]].map(([x, y]) => unproject(tr, x, y))
  return {
    c0: Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0]))) - 1),
    c1: Math.min(MAP_COLS - 1, Math.ceil(Math.max(...corners.map((p) => p[0]))) + 1),
    r0: Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))) - 1),
    r1: Math.min(MAP_ROWS - 1, Math.ceil(Math.max(...corners.map((p) => p[1]))) + 1),
  }
}

export function districtCells(d: District): number[] {
  const cam = districtCamera(d)
  const cells: number[] = []
  for (let r = Math.max(0, Math.floor(cam.cy - d.rows / 2)); r < Math.min(MAP_ROWS, Math.ceil(cam.cy + d.rows / 2)); r++) {
    for (let c = Math.max(0, Math.floor(cam.cx - d.cols / 2)); c < Math.min(MAP_COLS, Math.ceil(cam.cx + d.cols / 2)); c++) cells.push(r * MAP_COLS + c)
  }
  return cells
}

export function changesBetween(a: CityMap, b: CityMap): Set<number> {
  const changed = new Set<number>()
  for (let i = 0; i < a.grid.length; i++) if (a.grid[i] !== b.grid[i]) changed.add(i)
  return changed
}

export function segmentInDistrict(s: RailSegment, d: District): boolean {
  const [cx, cy] = gridPoint(d.e, d.n)
  const a = gridPoint(...s.from)
  const b = gridPoint(...s.to)
  return Math.max(a[0], b[0]) >= cx - d.cols / 2 && Math.min(a[0], b[0]) <= cx + d.cols / 2
    && Math.max(a[1], b[1]) >= cy - d.rows / 2 && Math.min(a[1], b[1]) <= cy + d.rows / 2
}

export function mostChangedDistrict(a: CityMap, b: CityMap): District {
  const changed = changesBetween(a, b)
  const routesA = new Set(a.rail.segments.map((s) => s.route))
  const routesB = new Set(b.rail.segments.map((s) => s.route))
  const differentRail = [...a.rail.segments.filter((s) => !routesB.has(s.route)), ...b.rail.segments.filter((s) => !routesA.has(s.route))]
  return [...DISTRICTS.filter((d) => d.id !== 'all')].sort((x, y) => {
    const score = (d: District) => districtCells(d).filter((i) => changed.has(i)).length + 4 * differentRail.filter((s) => segmentInDistrict(s, d)).length
    return score(y) - score(x)
  })[0]
}
