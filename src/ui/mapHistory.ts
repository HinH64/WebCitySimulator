import { cityMapFrom, realCityMapAt } from '../engine/map'
import { realMetrics } from '../engine/metrics'
import { monthOf, yearOf } from '../engine/time'
import type { GameState, Metrics } from '../engine/types'
import type { MapScene } from './mapRenderer'

export interface MapMoment { t: number; label: string; metrics: Metrics }

/** Only completed months from this term. Never runs the city forward to fill missing years. */
export function mapMoments(game: GameState, endT: number): MapMoment[] {
  return [
    { t: 0, label: '1997 年 7 月（接手時）', metrics: realMetrics(0) },
    ...game.snapshots.filter((s) => s.t <= endT).map((s) => ({ t: s.t, label: `${yearOf(s.t)} 年 ${monthOf(s.t)} 月`, metrics: s.metrics })),
  ]
}

/** Snapshots have no past construction pipeline; ground and railway come only from their metrics. */
export function sceneAtMoment(moment: MapMoment): MapScene {
  return { t: moment.t, map: moment.t === 0 ? realCityMapAt(0) : cityMapFrom(moment.metrics, moment.t, moment.t + 1) }
}
