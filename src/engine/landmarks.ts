/**
 * Landmarks (docs/SPATIAL.md section 4). Display only, like the map and the works: whether a landmark
 * opens never changes the city's figures. Real landmarks open in their real month when the city keeps
 * up with history in what they need; otherwise they wait, and open when it catches up.
 */

import { DEPARTMENTS } from '../data/budget'
import { HISTORY_EVENTS } from '../data/events'
import { REAL_LANDMARKS, SITE_LANDMARKS, type LandmarkShape, type RealLandmark } from '../data/landmarks'
import { CANDIDATE_SITES } from '../data/mapProjects'
import { SECTOR_LABEL } from '../data/sectors'
import { indicatorParts } from './indicators'
import { KIND_INDEX, cellCentre, cityRail, siteCells, type CityMap } from './map'
import { realMetrics } from './metrics'
import { realReserves, realSectors } from './real'
import { monthIndex } from './time'
import type { GameState, Metrics, Place } from './types'

/**
 * How far behind history the city can be before a landmark waits. Measured across plays (SPATIAL.md 3f.2):
 * sector output moves little, so its bar is close; reserves move a lot with spending and taxes.
 */
export const LANDMARK_GAP = {
  /** The sector's output (share of GDP times GDP) against history's. */
  sector: 0.9,
  /** Net reserves against real Hong Kong's reserves. */
  reserves: 0.5,
  /** Points of protected land. */
  green: 0.5,
  /** Points of the mobility indicator. */
  mobility: 8,
}

/** A landmark as the map draws it. */
export interface LandmarkView {
  id: string
  name: string
  place: Place
  shape: LandmarkShape
}

const FULL_QUALITY = Object.fromEntries(DEPARTMENTS.map((d) => [d, 1])) as GameState['quality']
const mobility = (m: Metrics, quality: GameState['quality']) => {
  const parts = indicatorParts(m, quality).mobility
  return parts.reduce((a, p) => a + p.score, 0) / parts.length
}

/** Landmarks whose opening a history event announces; the event says so, unless the landmark waits. */
const ANNOUNCED = new Set(HISTORY_EVENTS.flatMap((ev) => (ev.landmark ? [ev.landmark] : [])))

export const LANDMARK_BY_ID = new Map(REAL_LANDMARKS.map((l) => [l.id, l]))

/** Whether the earlier decisions it depends on went its way; without them it is never built. */
export function landmarkDecided(s: Pick<GameState, 'flags'>, l: RealLandmark): boolean {
  return !l.requires || Object.entries(l.requires).every(([id, options]) => options.includes(s.flags[id]))
}

/** Whether the city keeps up with history in what the landmark needs, this month. */
export function landmarkReady(s: Pick<GameState, 'quality'>, l: RealLandmark, m: Metrics, t: number, netReserves: number): boolean {
  const need = l.need
  switch (need.kind) {
    case 'none':
      return true
    case 'sector':
      return m.sectors[need.sector] * m.gdp >= LANDMARK_GAP.sector * realSectors(t)[need.sector] * realMetrics(t).gdp
    case 'green':
      return m.green >= realMetrics(t).green - LANDMARK_GAP.green
    case 'mobility':
      return mobility(m, s.quality) >= mobility(realMetrics(t), FULL_QUALITY) - LANDMARK_GAP.mobility
    case 'route': {
      const real = realMetrics(t)
      return cityRail(m.railKm - real.railKm, t).open.some((r) => r.id === need.route)
    }
    case 'reserves':
      return netReserves >= LANDMARK_GAP.reserves * realReserves(t)
  }
}

function why(l: RealLandmark): string {
  switch (l.need.kind) {
    case 'sector':
      return `${SECTOR_LABEL[l.need.sector]}業發展不及預期，計劃延後`
    case 'green':
      return '郊野及保護區不斷減少，濕地保育計劃擱置'
    case 'mobility':
      return '交通基建落後，工程延後'
    default:
      return '庫房儲備不足，計劃延後'
  }
}

/** "M+ 開幕" but "迪士尼樂園開幕": a space after Latin letters, as elsewhere in the news. */
const named = (l: RealLandmark) => (/[A-Za-z0-9+]$/.test(l.name) ? `${l.name} ` : l.name)

/**
 * At the end of month t: opens the real landmarks that are due and ready, and reports those that wait.
 * Each is reported once; a landmark served by a railway line waits silently, as the line's own news says.
 */
export function reportLandmarks(s: GameState, m: Metrics, t: number, netReserves: number) {
  for (const l of REAL_LANDMARKS) {
    const log = s.landmarks[l.id]
    if (log?.opened !== undefined || t < monthIndex(...l.opened) || !landmarkDecided(s, l)) continue
    const quiet = l.need.kind === 'route'
    if (landmarkReady(s, l, m, t, netReserves)) {
      const late = log?.delayed !== undefined
      s.landmarks[l.id] = { ...log, opened: t }
      if (quiet || (!late && ANNOUNCED.has(l.id))) continue
      // On time it is real history; late, it is the city's own story, like its works.
      if (late) s.news.push({ t, kind: 'project', text: `${named(l)}延遲之後終於${l.verb}。`, tone: 'good', place: l.place })
      else s.news.push({ t, kind: 'history', text: `${named(l)}${l.verb}。`, place: l.place })
    } else if (log?.delayed === undefined && !quiet) {
      s.landmarks[l.id] = { ...log, delayed: t }
      s.news.push({ t, kind: 'project', text: `${named(l)}未能如期${l.verb}：${why(l)}。`, tone: 'bad', place: l.place })
    }
  }
}

/** Real Hong Kong's landmarks at month t. */
export function realLandmarks(t: number): LandmarkView[] {
  return REAL_LANDMARKS.filter((l) => monthIndex(...l.opened) <= t).map(view)
}

const view = (l: RealLandmark): LandmarkView => ({ id: l.id, name: l.name, place: l.place, shape: l.shape })

/** The city's landmarks at month t: real ones it has opened by then, and its own developments on the map. */
export function cityLandmarks(s: Pick<GameState, 'landmarks'>, map: CityMap, t: number): LandmarkView[] {
  const views = REAL_LANDMARKS.filter((l) => (s.landmarks[l.id]?.opened ?? Infinity) <= t).map(view)
  for (const l of SITE_LANDMARKS) {
    const site = CANDIDATE_SITES.find((c) => c.id === l.site)!
    const cells = siteCells(site)
    const kinds = l.kinds.map((k) => KIND_INDEX[k])
    const built = cells.filter((c) => kinds.includes(map.grid[c]))
    // Enough of the site to read as a district of its own.
    if (built.length < Math.max(4, Math.min(12, Math.ceil(cells.length / 3)))) continue
    const centre = built.map(cellCentre).reduce((a, p) => [a[0] + p[0] / built.length, a[1] + p[1] / built.length], [0, 0])
    views.push({ id: `site:${l.site}`, name: l.name, place: [Math.round(centre[0]), Math.round(centre[1])], shape: l.shape })
  }
  return views
}
