/**
 * The pixel map: the 2025 land use grid, stepped back through the post-1997 projects (docs/MAP.md).
 * Display only; nothing here feeds back into the simulation.
 */

import { MAP_BASE_2025, MAP_CELL, MAP_COLS, MAP_ORIGIN, MAP_ROWS, MAP_TILE_KINDS } from '../data/mapBase'
import { MAP_PROJECTS, RAIL_ROUTES, type MapArea, type MapProject, type TileKind } from '../data/mapProjects'
import { MAP_STATIONS } from '../data/mapStations'
import { monthIndex } from './time'

export const KIND_INDEX = Object.fromEntries(MAP_TILE_KINDS.map((k, i) => [k, i])) as Record<TileKind, number>

let base: Uint8Array | undefined

/** The 2025 grid, one kind index per cell, row by row from the north-west corner. */
export function baseMap(): Uint8Array {
  if (!base) {
    base = new Uint8Array(MAP_COLS * MAP_ROWS)
    let i = 0
    for (const m of MAP_BASE_2025.matchAll(/(\d*)([a-z])/g)) {
      const count = m[1] ? Number(m[1]) : 1
      base.fill(m[2].charCodeAt(0) - 97, i, i + count)
      i += count
    }
    if (i !== base.length) throw new Error(`map base has ${i} cells, expected ${base.length}`)
  }
  return base
}

/** Centre of a cell in Hong Kong 1980 Grid metres. */
export function cellCentre(i: number): [number, number] {
  return [MAP_ORIGIN.e + ((i % MAP_COLS) + 0.5) * MAP_CELL, MAP_ORIGIN.n - (Math.floor(i / MAP_COLS) + 0.5) * MAP_CELL]
}

function inside(e: number, n: number, polygon: [number, number][]): boolean {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ei, ni] = polygon[i]
    const [ej, nj] = polygon[j]
    if (ni > n !== nj > n && e < ((ej - ei) * (n - ni)) / (nj - ni) + ei) hit = !hit
  }
  return hit
}

/** Cells of an area, nearest to `start` (default: the cells' centre) first, so growth spreads outwards. */
export function areaCells(area: MapArea, start?: [number, number]): number[] {
  const grid = baseMap()
  const kinds = new Set(area.kinds.map((k) => KIND_INDEX[k]))
  const cells: number[] = []
  for (let i = 0; i < grid.length; i++) {
    if (!kinds.has(grid[i])) continue
    const [e, n] = cellCentre(i)
    if (inside(e, n, area.polygon)) cells.push(i)
  }
  let [se, sn] = start ?? [0, 0]
  if (!start && cells.length) {
    for (const c of cells) {
      const [e, n] = cellCentre(c)
      se += e / cells.length
      sn += n / cells.length
    }
  }
  const dist = (c: number) => {
    const [e, n] = cellCentre(c)
    return (e - se) ** 2 + (n - sn) ** 2
  }
  return cells.sort((a, b) => dist(a) - dist(b) || a - b)
}

const projectCellCache = new Map<string, number[]>()

export function projectCells(p: MapProject): number[] {
  let cells = projectCellCache.get(p.id)
  if (!cells) {
    cells = areaCells(p.area, p.start)
    projectCellCache.set(p.id, cells)
  }
  return cells
}

/** Sets a project's cells to what they were at month t. */
function applyProject(grid: Uint8Array, p: MapProject, t: number) {
  const cells = projectCells(p)
  const kinds = cells.map(() => KIND_INDEX[p.before])
  for (const s of p.steps) {
    if (monthIndex(...s.from) > t) continue
    const reach = Math.round(s.share * cells.length)
    for (let i = 0; i < reach; i++) kinds[i] = s.kind === 'base' ? baseMap()[cells[i]] : KIND_INDEX[s.kind]
  }
  cells.forEach((c, i) => (grid[c] = kinds[i]))
}

/** Real Hong Kong's land use at month t. */
export function realMapAt(t: number): Uint8Array {
  const grid = baseMap().slice()
  for (const p of MAP_PROJECTS) applyProject(grid, p, t)
  return grid
}

export interface RailSegment {
  route: string
  from: [number, number]
  to: [number, number]
}

const STATION_AT = new Map(MAP_STATIONS.filter((s) => !s.light).map((s) => [s.zh, [s.e, s.n] as [number, number]]))

export function stationPosition(name: string): [number, number] {
  const p = STATION_AT.get(name)
  if (!p) throw new Error(`unknown station ${name}`)
  return p
}

/** Real Hong Kong's railway at month t: track between neighbouring stations, and the stations in use. */
export function realRailAt(t: number): { segments: RailSegment[]; stations: string[] } {
  const segments: RailSegment[] = []
  const stations = new Set<string>()
  for (const r of RAIL_ROUTES) {
    if (monthIndex(...r.opened) > t || (r.closed && monthIndex(...r.closed) <= t)) continue
    r.stations.forEach((s, i) => {
      stations.add(s)
      if (i > 0) segments.push({ route: r.id, from: stationPosition(r.stations[i - 1]), to: stationPosition(s) })
    })
  }
  return { segments, stations: [...stations] }
}
