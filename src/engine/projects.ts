import { CANDIDATE_ROUTES, CANDIDATE_SITES, MAP_PROJECTS, RAIL_ROUTES, type CandidateSite } from '../data/mapProjects'
import { MAP_TILE_KINDS } from '../data/mapBase'
import {
  KIND_INDEX,
  areaKey,
  asRoute,
  baseMap,
  cellCentre,
  cityChanges,
  mapWithChanges,
  railKey,
  railway,
  realHomesMonth,
  siteKey,
  unitsPerCell,
  type CellChange,
  type CityChanges,
  type CityMap,
  type Railway,
} from './map'
import { computeMetrics } from './metrics'
import { upcoming } from './pipeline'
import { LAST_MONTH_INDEX, monthIndex, yearOf } from './time'
import type { GameState, Metrics, NewsItem, Place, WorkLog } from './types'

/**
 * The city's own works: developments and railway lines it has beyond real Hong Kong, those under
 * construction, and real ones it has not built yet. They follow the same rules as the map (cityChanges),
 * so what the budget panel and the news name is what the map shows. Display only, like the map: the
 * news they make never changes the city's figures.
 */

export type WorkKind = 'housing' | 'industry' | 'rail' | 'renewal'
export type WorkState = 'building' | 'built' | 'delayed'

export interface CityWork {
  /** siteKey, areaKey or railKey. */
  key: string
  name: string
  kind: WorkKind
  /** What an industry site is for. */
  use?: CandidateSite['use']
  state: WorkState
  /** Cells developed beyond history (or, when delayed, real homes not built), and under construction. */
  cells: number[]
  building: number[]
  /** Homes (萬) in `cells`, and under construction. */
  units: number
  unitsBuilding: number
  /** Month (index) the first homes, or the line, under construction are due, roughly. */
  due?: number
  /** Country park edge land still being cleared, before any homes are scheduled. */
  clearing: boolean
  place: Place
}

/** How far ahead scheduled homes and track count as under construction (months). */
export const HOUSING_AHEAD = 36
export const RAIL_AHEAD = 60
/** Months ahead at which due years are worked out. */
const DUE_SAMPLES = [3, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60]

const SITES = new Map(CANDIDATE_SITES.map((s) => [siteKey(s.id), s]))
const AREAS = new Map(MAP_PROJECTS.map((p) => [areaKey(p.id), p]))
const ROUTES = new Map([...RAIL_ROUTES, ...CANDIDATE_ROUTES].map((r) => [railKey(r.id), r]))
const REAL_OPENING = new Map(RAIL_ROUTES.map((r) => [railKey(r.id), monthIndex(...r.opened)]))

/** A real line that would have opened a year or more ago: missing now means its service is suspended. */
const SUSPENDED_AFTER = 12

function kindOf(key: string): WorkKind {
  if (ROUTES.has(key)) return 'rail'
  const use = SITES.get(key)?.use
  return use === undefined || use === 'housing' ? 'housing' : use === 'renewal' ? 'renewal' : 'industry'
}

/** Name for a development: real projects are named for their homes when the project is mostly something else. */
function nameOf(key: string): string {
  const area = AREAS.get(key)
  return SITES.get(key)?.name ?? area?.homesName ?? area?.name ?? ROUTES.get(key)?.name ?? key
}

/** The city's figures with homes and track scheduled in the next `months` already in place. */
function ahead(s: Pick<GameState, 't' | 'pipeline'>, m: Metrics, months: number): Metrics {
  const homes = Math.min(months, HOUSING_AHEAD)
  return {
    ...m,
    publicUnits: m.publicUnits + upcoming(s, 'publicUnits', homes),
    privateUnits: m.privateUnits + upcoming(s, 'privateUnits', homes),
    // Rebuilt flats come back as the old ones finish rebuilding; only the gain is new.
    redeveloping: m.redeveloping + upcoming(s, 'redevelop', homes),
    railKm: m.railKm + upcoming(s, 'rail', Math.min(months, RAIL_AHEAD)),
  }
}

function homesIn(changes: { cell: number; kind: number }[]): number {
  let total = 0
  for (const c of changes) {
    const kind = MAP_TILE_KINDS[c.kind]
    if (kind === 'public' || kind === 'private') total += unitsPerCell(kind)
  }
  return total
}

function centre(cells: number[]): Place {
  let e = 0
  let n = 0
  for (const c of cells) {
    const [ce, cn] = cellCentre(c)
    e += ce / cells.length
    n += cn / cells.length
  }
  return [Math.round(e), Math.round(n)]
}

function routePlace(key: string): Place {
  const stations = asRoute(ROUTES.get(key)!).stations
  const mid = stations[Math.floor((stations.length - 1) / 2)]
  return [mid.e, mid.n]
}

/** Works from the city's changes now and with everything scheduled in the window ahead. */
function describe(now: CityChanges, later: CityChanges): CityWork[] {
  const groups = new Map<string, { built: CellChange[]; building: CellChange[]; removed: CellChange[]; clearing: boolean }>()
  const group = (key: string) => {
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { built: [], building: [], removed: [], clearing: false }))
    return g
  }
  const nowCells = new Set(now.added.map((c) => c.cell))
  for (const c of now.added) {
    if (c.kind === KIND_INDEX.construction) {
      group(c.owner).building.push(c)
      group(c.owner).clearing = true
    } else group(c.owner).built.push(c)
  }
  for (const c of later.added) if (!nowCells.has(c.cell)) group(c.owner).building.push(c)
  // Real homes not built: what they would have been is their 2025 kind.
  for (const c of now.removed) group(c.owner).removed.push({ ...c, kind: baseMap()[c.cell] })

  const works: CityWork[] = []
  for (const [key, g] of groups) {
    const kind = kindOf(key)
    const state: WorkState = g.building.length ? 'building' : g.built.length ? 'built' : 'delayed'
    const cells = (state === 'delayed' ? g.removed : g.built).map((c) => c.cell)
    works.push({
      key,
      name: nameOf(key),
      kind,
      ...(kind === 'industry' ? { use: SITES.get(key)!.use } : {}),
      state,
      cells,
      building: g.building.map((c) => c.cell),
      units: homesIn(state === 'delayed' ? g.removed : g.built),
      // Old flats being rebuilt: the building sites stand where private flats were.
      unitsBuilding: kind === 'renewal' ? g.building.length * unitsPerCell('private') : homesIn(g.building),
      clearing: kind === 'housing' && g.clearing && !g.building.some((c) => c.kind !== KIND_INDEX.construction),
      place: centre([...cells, ...g.building.map((c) => c.cell)]),
    })
  }

  const rail = (ids: string[], state: WorkState) =>
    ids.map((id): CityWork => {
      const key = railKey(id)
      return { key, name: nameOf(key), kind: 'rail', state, cells: [], building: [], units: 0, unitsBuilding: 0, clearing: false, place: routePlace(key) }
    })
  works.push(...rail(now.rail.added, 'built'))
  works.push(...rail(later.rail.added.filter((id) => !now.rail.added.includes(id)), 'building'))
  works.push(...rail(now.rail.missing, 'delayed'))

  const order: Record<WorkState, number> = { building: 0, built: 1, delayed: 2 }
  return works.sort((a, b) => order[a.state] - order[b.state] || b.units + b.unitsBuilding - (a.units + a.unitsBuilding))
}

/**
 * Fills in when works under construction are due, by moving the window ahead a few months at a time.
 * Returns the works without real lines that would open on their own first: those are not the city's.
 */
function addDue(works: CityWork[], s: GameState, m: Metrics, t: number, sectorMonth: number): CityWork[] {
  // Rebuilding old flats takes REBUILD_MONTHS from when each comes down, so it has no one due date.
  const waiting = works.filter((w) => w.state === 'building' && !w.clearing && w.kind !== 'renewal')
  for (const k of DUE_SAMPLES) {
    if (!waiting.some((w) => w.due === undefined)) break
    const at = cityChanges(ahead(s, m, k), t, sectorMonth)
    const cells = new Set(at.added.map((c) => c.cell))
    for (const w of waiting) {
      if (w.due !== undefined) continue
      const ready = w.kind === 'rail' ? at.rail.added.includes(w.key.slice('rail:'.length)) : w.building.some((c) => cells.has(c))
      if (ready) w.due = t + k
    }
  }
  return works.filter((w) => !(w.state === 'building' && w.kind === 'rail' && (REAL_OPENING.get(w.key) ?? Infinity) <= (w.due ?? t + RAIL_AHEAD)))
}

export interface CityWorks {
  works: CityWork[]
  /** The city's map now, with homes and industry under construction shown as building sites. */
  map: CityMap
  /** Lines under construction. */
  railBuilding: Railway
  /** What the city has beyond history, built or under construction, to outline on the map. */
  extraCells: number[]
  extraRail: Railway
}

/** Everything the screen shows about the city's works at the month on the clock. */
export function cityWorks(s: GameState): CityWorks {
  const t = Math.min(s.t, LAST_MONTH_INDEX)
  const m = computeMetrics(s, t)
  // The industry mix is the one at the start of month s.t, as on the map (cityMapAt).
  const now = cityChanges(m, t, s.t)
  const works = addDue(describe(now, cityChanges(ahead(s, m, RAIL_AHEAD), t, s.t)), s, m, t, s.t)
  const map = mapWithChanges(now, t, m.pm10)
  for (const w of works) for (const c of w.building) map.grid[c] = KIND_INDEX.construction
  const lines = (keep: (w: CityWork) => boolean) =>
    railway(works.filter((w) => w.kind === 'rail' && keep(w)).map((w) => asRoute(ROUTES.get(w.key)!)))
  return {
    works,
    map,
    railBuilding: lines((w) => w.state === 'building'),
    extraCells: works.filter((w) => w.kind !== 'rail' && w.state !== 'delayed').flatMap((w) => [...w.cells, ...w.building]),
    extraRail: lines((w) => w.state !== 'delayed'),
  }
}

// ---- News ----

const INDUSTRY_OPENS: Record<Exclude<CandidateSite['use'], 'housing' | 'renewal'>, string> = {
  finance: '第一批商廈落成，金融和專業公司陸續進駐。',
  trade: '物流設施落成，物流公司陸續進駐。',
  tourism: '新旅遊設施開幕，吸引大批旅客。',
  professional: '第一期落成，科技公司和研究機構陸續進駐。',
}

/** A real line missing this long after it really opened was running; its service is suspended rather than late. */
export function suspended(key: string, since: number): boolean {
  const opened = REAL_OPENING.get(key)
  return opened !== undefined && since - opened >= SUSPENDED_AFTER
}

type Step = Exclude<keyof WorkLog, 'realAt'>

/** Flats (萬) as people say it: 約 6,000 個 or 約 1.2 萬個. */
export function flats(units: number): string {
  const n = (v: number, d: number) => new Intl.NumberFormat('zh-HK', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
  return units >= 1 ? `約 ${n(units, 1)} 萬個` : `約 ${n(Math.round(units * 100) * 100, 0)} 個`
}

function newsText(w: CityWork, what: Step, t: number, log: WorkLog): string {
  const due = w.due !== undefined ? `預計 ${yearOf(w.due)} 年` : '預計數年內'
  if (w.kind === 'rail') {
    if (what === 'building') return `${w.name}動工興建，${due}通車。`
    if (what === 'built') return `${w.name}通車。`
    if (what === 'delayed') return suspended(w.key, t) ? `${w.name}：鐵路撥款長期不足，部分服務暫停。` : `${w.name}：鐵路撥款不足，未能如期通車。`
    return suspended(w.key, log.delayed!) ? `${w.name}恢復全面服務。` : `${w.name}延誤多時，終於通車。`
  }
  if (w.kind === 'industry') return `${w.name}：${INDUSTRY_OPENS[w.use as keyof typeof INDUSTRY_OPENS]}`
  if (w.kind === 'renewal') {
    return what === 'building'
      ? `${w.name}：大規模重建展開，殘舊唐樓陸續拆卸，新樓約五年半後落成。`
      : `${w.name}：這一批重建完成，新樓落成，街道面貌一新。`
  }
  if (what === 'building') return w.clearing ? `${w.name}：開始平整土地，準備興建屋邨。` : `${w.name}：新屋邨動工，${due}起入伙。`
  if (what === 'built') return `${w.name}：第一批新屋邨落成，居民陸續入伙。`
  if (what === 'delayed') return `${w.name}：房屋撥款不足，部分屋邨延遲落成。`
  return `${w.name}：延遲的屋邨終於落成。`
}

/** When real Hong Kong had what the city built early or has not built: the line, or the same homes. */
function realAt(w: CityWork): number | undefined {
  if (w.kind === 'rail') return REAL_OPENING.get(w.key)
  const months = w.cells.map(realHomesMonth).filter((m): m is number => m !== undefined)
  return months.length ? Math.min(...months) : undefined
}

function report(s: GameState, w: CityWork, what: Step, t: number) {
  const log = (s.works[w.key] ??= {})
  const text = newsText(w, what, t, log)
  log[what] = t
  if ((what === 'built' || what === 'delayed') && log.realAt === undefined) {
    const real = realAt(w)
    if (real !== undefined) log.realAt = real
  }
  const item: NewsItem = { t, kind: 'project', text, tone: what === 'delayed' ? 'bad' : 'good', place: w.place }
  s.news.push(item)
}

/** The news checks the city's works every this many months, on the months the map redraws. */
export const WORKS_EVERY = 3

/**
 * Reports what changed in the city's works at the end of month t: work starting, first homes or a new
 * line opening, real homes or lines delayed, and delayed ones catching up. Each is reported once.
 */
export function reportWorks(s: GameState, m: Metrics, t: number) {
  const now = cityChanges(m, t, t + 1)
  let works = describe(now, cityChanges(ahead(s, m, RAIL_AHEAD), t, t + 1))
  // Due dates take a few more maps, so only for work the news has not reported yet.
  if (works.some((w) => w.state === 'building' && s.works[w.key]?.building === undefined)) works = addDue(works, s, m, t, t + 1)

  const delayed = new Set(works.filter((w) => w.state === 'delayed').map((w) => w.key))
  const caughtUp = new Set<string>()
  for (const [key, log] of Object.entries(s.works)) {
    if (log.delayed === undefined || log.caughtUp !== undefined || delayed.has(key)) continue
    report(s, workByKey(key), 'caughtUp', t)
    caughtUp.add(key)
  }
  for (const w of works) {
    const log = (s.works[w.key] ??= {})
    const built = w.kind === 'rail' ? w.state === 'built' : w.state !== 'delayed' && w.cells.length > 0
    // Homes standing, or delayed ones just finished, make news of their own; the work that led to them goes unsaid.
    if (built && log.built === undefined) {
      report(s, w, 'built', t)
      log.building ??= t
    } else if (w.state === 'building' && log.building === undefined) {
      if (caughtUp.has(w.key)) log.building = t
      else report(s, w, 'building', t)
    }
    if (w.state === 'delayed' && log.delayed === undefined) report(s, w, 'delayed', t)
    if (Object.keys(log).length === 0) delete s.works[w.key]
  }
  // Old districts whose batch of rebuilding has finished: its building sites are gone.
  const present = new Set(works.map((w) => w.key))
  for (const [key, log] of Object.entries(s.works)) {
    if (kindOf(key) === 'renewal' && log.building !== undefined && log.built === undefined && !present.has(key)) report(s, workByKey(key), 'built', t)
  }
}

/** A work known only by its key, for news about it. */
function workByKey(key: string): CityWork {
  const base = { key, name: nameOf(key), state: 'built' as const, cells: [], building: [], units: 0, unitsBuilding: 0, clearing: false }
  if (ROUTES.has(key)) return { ...base, kind: 'rail', place: routePlace(key) }
  const site = SITES.get(key)
  const polygon = (site ?? AREAS.get(key))!.area.polygon
  const place: Place = [
    Math.round(polygon.reduce((a, p) => a + p[0], 0) / polygon.length),
    Math.round(polygon.reduce((a, p) => a + p[1], 0) / polygon.length),
  ]
  return { ...base, kind: kindOf(key), ...(site ? { use: site.use } : {}), place }
}

/**
 * A real line due to open this month that the city has not built: reported as delayed in place of the
 * history news of its opening.
 */
export function reportMissingLine(s: GameState, routeId: string, t: number) {
  const key = railKey(routeId)
  if (s.works[key]?.delayed === undefined) report(s, workByKey(key), 'delayed', t)
}

/** A work's name and kind, by key. */
export function workInfo(key: string): { name: string; kind: WorkKind; place: Place } {
  const w = workByKey(key)
  return { name: w.name, kind: w.kind, place: w.place }
}
