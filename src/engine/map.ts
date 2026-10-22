/**
 * The pixel map: the 2025 land use grid, stepped back through the post-1997 projects (docs/MAP.md).
 * Display only; nothing here feeds back into the simulation.
 */

import { MAP_BASE_2025, MAP_CELL, MAP_COLS, MAP_ORIGIN, MAP_ROWS, MAP_TILE_KINDS } from '../data/mapBase'
import { MAP_PRICES } from '../data/mapPrices'
import {
  CANDIDATE_ROUTES,
  CANDIDATE_SITES,
  MAP_PROJECTS,
  PRICE_REGIONS,
  RAIL_ROUTES,
  type CandidateSite,
  type MapArea,
  type MapProject,
  type TileKind,
} from '../data/mapProjects'
import { MAP_STATIONS } from '../data/mapStations'
import { yearValue } from '../data/real'
import { clamp, computeMetrics, realMetrics } from './metrics'
import { realSectors } from './real'
import { LAST_MONTH_INDEX, monthIndex, yearOf } from './time'
import type { GameState } from './types'

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

// ---- Railway ----

export interface RailSegment {
  route: string
  from: [number, number]
  to: [number, number]
}

export interface MapStationPoint {
  name: string
  e: number
  n: number
}

export interface Railway {
  segments: RailSegment[]
  stations: MapStationPoint[]
}

const STATION_AT = new Map(MAP_STATIONS.filter((s) => !s.light).map((s) => [s.zh, [s.e, s.n] as [number, number]]))

export function stationPosition(name: string): [number, number] {
  const p = STATION_AT.get(name)
  if (!p) throw new Error(`unknown station ${name}`)
  return p
}

interface Route {
  id: string
  stations: MapStationPoint[]
}

const asRoute = (r: { id: string; stations: (string | MapStationPoint)[] }): Route => ({
  id: r.id,
  stations: r.stations.map((s) => {
    if (typeof s !== 'string') return s
    const [e, n] = stationPosition(s)
    return { name: s, e, n }
  }),
})

function railway(routes: Route[]): Railway {
  const segments: RailSegment[] = []
  const stations = new Map<string, MapStationPoint>()
  for (const r of routes) {
    r.stations.forEach((s, i) => {
      stations.set(s.name, s)
      const p = r.stations[i - 1]
      if (p) segments.push({ route: r.id, from: [p.e, p.n], to: [s.e, s.n] })
    })
  }
  return { segments, stations: [...stations.values()] }
}

const isOpen = (r: (typeof RAIL_ROUTES)[number], t: number) => monthIndex(...r.opened) <= t && !(r.closed && monthIndex(...r.closed) <= t)

/** Real Hong Kong's railway at month t: track between neighbouring stations, and the stations in use. */
export function realRailAt(t: number): Railway {
  return railway(RAIL_ROUTES.filter((r) => isOpen(r, t)).map(asRoute))
}

const routeKm = (r: Route) => r.stations.reduce((a, s, i) => (i ? a + Math.hypot(s.e - r.stations[i - 1].e, s.n - r.stations[i - 1].n) : a), 0) / 1000

/**
 * The city's railway: real lines, with later real lines opening early and then proposed ones while the
 * city has more track than history, or the newest lines missing while it has less. A line counts once the
 * gap covers half of it.
 */
function cityRail(gapKm: number, t: number): Railway {
  const open = RAIL_ROUTES.filter((r) => isOpen(r, t)).map(asRoute)
  const extendable = (r: (typeof RAIL_ROUTES)[number]) => r.stations.length > 1 && !r.closed
  if (gapKm > 0) {
    const later = [
      ...RAIL_ROUTES.filter((r) => monthIndex(...r.opened) > t && extendable(r)).map(asRoute),
      ...CANDIDATE_ROUTES.filter((r) => monthIndex(...r.earliest) <= t).map(asRoute),
    ]
    for (const r of later) {
      const km = routeKm(r)
      if (gapKm < km / 2) break
      open.push(r)
      gapKm -= km
    }
  } else if (gapKm < 0) {
    const newest = RAIL_ROUTES.filter((r) => isOpen(r, t) && monthIndex(...r.opened) >= 0 && extendable(r)).reverse()
    for (const r of newest) {
      const km = routeKm(asRoute(r))
      if (-gapKm < km / 2) break
      open.splice(
        open.findIndex((o) => o.id === r.id),
        1,
      )
      gapKm += km
    }
  }
  return railway(open)
}

// ---- The city's map ----

/** A relative industry share this far above history fills its candidate sites completely. */
const SECTOR_FULL = 0.5

type Housing = 'public' | 'private'

interface HousingCell {
  cell: number
  /** Month real Hong Kong finished it. */
  month: number
  /** Kind index just before. */
  before: number
}

const housingOrderCache = new Map<Housing, HousingCell[]>()

/** Post-1997 homes of one kind on the map, in the order real Hong Kong finished them. */
function realHousingOrder(kind: Housing): HousingCell[] {
  let order = housingOrderCache.get(kind)
  if (!order) {
    order = []
    const grid = baseMap()
    for (const p of MAP_PROJECTS) {
      const cells = projectCells(p)
      cells.forEach((cell, idx) => {
        if (grid[cell] !== KIND_INDEX[kind]) return
        let current = KIND_INDEX[p.before]
        for (const s of p.steps) {
          if (idx >= Math.round(s.share * cells.length)) continue
          if (s.kind === 'base') {
            order!.push({ cell, month: monthIndex(...s.from), before: current })
            return
          }
          current = KIND_INDEX[s.kind]
        }
      })
    }
    order.sort((a, b) => a.month - b.month)
    housingOrderCache.set(kind, order)
  }
  return order
}

let unitsCache: Record<Housing, number> | undefined

/** Homes per cell (萬), from 2025's stock and the cells of each kind on the 2025 map. */
function unitsPerCell(kind: Housing): number {
  if (!unitsCache) {
    const grid = baseMap()
    const cells = (k: Housing) => grid.filter((v) => v === KIND_INDEX[k]).length
    unitsCache = { public: yearValue('publicUnits', 2025) / cells('public'), private: yearValue('privateUnits', 2025) / cells('private') }
  }
  return unitsCache[kind]
}

let landCells: number | undefined

const siteCellCache = new Map<string, number[]>()

/** Cells of the candidate sites ready by month t, earliest site first. */
function sitePool(t: number, keep: (s: CandidateSite) => boolean, taken: Set<number>): number[] {
  const sites = CANDIDATE_SITES.filter((s) => keep(s) && monthIndex(...s.earliest) <= t).sort(
    (a, b) => monthIndex(...a.earliest) - monthIndex(...b.earliest),
  )
  const pool: number[] = []
  for (const s of sites) {
    let cells = siteCellCache.get(s.id)
    if (!cells) {
      cells = areaCells(s.area)
      siteCellCache.set(s.id, cells)
    }
    for (const c of cells) if (!taken.has(c) && !pool.includes(c)) pool.push(c)
  }
  return pool
}

const SECTOR_KIND: Record<Exclude<CandidateSite['use'], 'housing'>, TileKind[]> = {
  finance: ['commercial'],
  trade: ['logistics', 'logistics', 'port'],
  tourism: ['park', 'commercial'],
  professional: ['sciencePark'],
}

export interface CityMap {
  grid: Uint8Array
  rail: Railway
  /** Air pollution, 0 (clear) to 1 (heavy haze). */
  haze: number
}

/**
 * The player's Hong Kong now: real Hong Kong's map at the same month, changed where the city differs.
 * - Homes: extra public and private homes go first on country park edge land the city gave up, then on
 *   sites real Hong Kong developed later, then on candidate sites. Missing homes take the newest real
 *   estates off the map.
 * - Industries ahead of history fill their candidate sites (finance offices, trade logistics, tourism
 *   attractions, science parks).
 * - Rail ahead of or behind history opens or removes lines (cityRail).
 */
export function cityMapAt(s: GameState): CityMap {
  const t = Math.min(s.t, LAST_MONTH_INDEX)
  const grid = realMapAt(t)
  const m = computeMetrics(s, t)
  const real = realMetrics(t)
  const taken = new Set<number>()
  const put = (cell: number, kind: TileKind) => {
    grid[cell] = KIND_INDEX[kind]
    taken.add(cell)
  }

  landCells ??= baseMap().filter((v) => v !== KIND_INDEX.sea).length
  const greenGap = m.green - real.green
  const parkEdge = greenGap < 0 ? sitePool(t, (site) => Boolean(site.countryPark), taken).slice(0, Math.round((-greenGap / 100) * landCells)) : []
  parkEdge.forEach((c) => put(c, 'construction'))

  const shares = realSectors(t)
  for (const use of ['finance', 'trade', 'tourism', 'professional'] as const) {
    const ahead = s.sectors[use] / shares[use] - 1
    if (ahead <= 0) continue
    const pool = sitePool(t, (site) => site.use === use, taken)
    const kinds = SECTOR_KIND[use]
    pool.slice(0, Math.round(Math.min(1, ahead / SECTOR_FULL) * pool.length)).forEach((c, i) => put(c, kinds[i % kinds.length]))
  }

  const need: Record<Housing, number> = { public: 0, private: 0 }
  for (const kind of ['public', 'private'] as const) {
    const gap = Math.round(s.dev[kind === 'public' ? 'publicUnits' : 'privateUnits'] / unitsPerCell(kind))
    if (gap > 0) need[kind] = gap
    else if (gap < 0) for (const h of realHousingOrder(kind).filter((h) => h.month <= t).slice(gap)) grid[h.cell] = h.before
  }
  /** Fills cells with public and private homes in proportion to what each still needs. */
  const fill = (pool: number[]) => {
    const total = need.public + need.private
    const n = Math.min(pool.length, total)
    let pub = 0
    for (let k = 0; k < n; k++) {
      const isPublic = Math.floor(((k + 1) * need.public) / total) > Math.floor((k * need.public) / total)
      if (isPublic) pub++
      put(pool[k], isPublic ? 'public' : 'private')
    }
    need.public -= pub
    need.private -= n - pub
  }
  fill(parkEdge)
  for (const kind of ['public', 'private'] as const) {
    const later = realHousingOrder(kind).filter((h) => h.month > t && !taken.has(h.cell))
    for (const h of later.slice(0, need[kind])) put(h.cell, kind)
    need[kind] -= Math.min(need[kind], later.length)
  }
  fill(sitePool(t, (site) => site.use === 'housing' && !site.countryPark, taken))

  return { grid, rail: cityRail(s.dev.rail, t), haze: clamp((m.pm10 - 20) / 50, 0, 1) }
}

// ---- Layers ----

export type Region = 'hk' | 'kln' | 'nt'

let regions: Region[] | undefined

/** The price region a cell is in. */
export function regionOf(cell: number): Region {
  if (!regions) {
    regions = Array.from({ length: MAP_COLS * MAP_ROWS }, (_, i) => {
      const [e, n] = cellCentre(i)
      return PRICE_REGIONS.find((r) => inside(e, n, r.polygon))?.id ?? 'nt'
    })
  }
  return regions[cell]
}

/** Average flat price by region at month t (HK$ per m²), scaled by the city's prices against history. */
export function regionalPrices(t: number, ratio: number): Record<Region, number> {
  const years = Object.keys(MAP_PRICES).map(Number)
  const year = clamp(yearOf(t), Math.min(...years), Math.max(...years))
  const p = MAP_PRICES[year]
  return { hk: p.hk * ratio, kln: p.kln * ratio, nt: p.nt * ratio }
}

export type HomeKind = 'public' | 'private' | 'village'

/**
 * People living in one cell of each kind of home (萬). The city's population is shared out by how many
 * homes a cell holds: public and private from 2025's stock per cell, villages from the households left
 * over in 2025 (at least a tenth of a private cell).
 */
export function peoplePerCell(grid: Uint8Array, population: number): Record<HomeKind, number> {
  const base = baseMap()
  const count = (g: Uint8Array, k: HomeKind) => g.reduce((a, v) => a + (v === KIND_INDEX[k] ? 1 : 0), 0)
  const households = yearValue('population', 2025) / yearValue('householdSize', 2025)
  const village = Math.max(
    unitsPerCell('private') / 10,
    (households - yearValue('publicUnits', 2025) - yearValue('privateUnits', 2025)) / count(base, 'village'),
  )
  const homes: Record<HomeKind, number> = { public: unitsPerCell('public'), private: unitsPerCell('private'), village }
  const total = (['public', 'private', 'village'] as const).reduce((a, k) => a + homes[k] * count(grid, k), 0)
  return { public: (population * homes.public) / total, private: (population * homes.private) / total, village: (population * homes.village) / total }
}

/** Walking distance to a station that counts as served by rail. */
export const RAIL_WALK = 500

/** 1 for cells whose centre is within RAIL_WALK of one of the stations. */
export function railCoverage(stations: MapStationPoint[]): Uint8Array {
  const out = new Uint8Array(MAP_COLS * MAP_ROWS)
  const reach = Math.ceil(RAIL_WALK / MAP_CELL)
  for (const s of stations) {
    const col = Math.floor((s.e - MAP_ORIGIN.e) / MAP_CELL)
    const row = Math.floor((MAP_ORIGIN.n - s.n) / MAP_CELL)
    for (let r = row - reach; r <= row + reach; r++) {
      for (let c = col - reach; c <= col + reach; c++) {
        if (r < 0 || c < 0 || r >= MAP_ROWS || c >= MAP_COLS) continue
        const [e, n] = cellCentre(r * MAP_COLS + c)
        if (Math.hypot(e - s.e, n - s.n) <= RAIL_WALK) out[r * MAP_COLS + c] = 1
      }
    }
  }
  return out
}

/** Share of residents living within RAIL_WALK of a station. */
export function railServedShare(grid: Uint8Array, coverage: Uint8Array, people: Record<HomeKind, number>): number {
  let served = 0
  let all = 0
  for (let i = 0; i < grid.length; i++) {
    const k = MAP_TILE_KINDS[grid[i]]
    if (k !== 'public' && k !== 'private' && k !== 'village') continue
    all += people[k]
    if (coverage[i]) served += people[k]
  }
  return all ? served / all : 0
}

/** Light rail stops in use at month t; the Tin Shui Wai North stops opened in December 2003. */
export function lightRailStops(t: number): MapStationPoint[] {
  const northOpen = t >= monthIndex(2003, 12)
  return MAP_STATIONS.filter((s) => s.light && (northOpen || s.n < 835300)).map((s) => ({ name: s.zh, e: s.e, n: s.n }))
}
