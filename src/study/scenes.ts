import { cityLandmarks, type LandmarkView } from '../engine/landmarks'
import type { HomesFirst } from '../engine/map'
import { cityWorks, type CityWorks } from '../engine/projects'
import { FOLLOW_HISTORY, answer, metricsNow, newGame, setFunding, setPolicy, step, type Strategy } from '../engine/sim'
import { LAST_MONTH_INDEX, monthOf } from '../engine/time'
import type { GameState, Metrics } from '../engine/types'

export const SCENARIOS = [
  { id: 'housing', label: '多建公營房屋', action: '房屋撥款固定 180%，其餘照歷史', focus: 'kaiTak' },
  { id: 'housingNorth', label: '多建房屋・北部新市鎮', action: '房屋撥款固定 180%，新增房屋先放北部新市鎮，其餘照歷史', focus: 'kwuTung' },
  { id: 'housingLantau', label: '多建房屋・大嶼及填海', action: '房屋撥款固定 180%，新增房屋先放大嶼山及填海地，其餘照歷史', focus: 'kauYiChau' },
  { id: 'transport', label: '大力投資鐵路', action: '交通撥款固定 180%，其餘照歷史', focus: 'tinShuiWai' },
  { id: 'finance', label: '金融商業', action: '產業重點固定為金融，其餘照歷史', focus: 'kowloonEast' },
  { id: 'professional', label: '專業服務及創科', action: '產業重點固定為創科，其餘照歷史', focus: 'sanTin' },
  { id: 'trade', label: '貿易物流', action: '產業重點固定為貿易物流，其餘照歷史', focus: 'tuenMunWest' },
  { id: 'renewal', label: '加快舊區重建', action: '市區重建固定為加快，其餘照歷史', focus: 'shamShuiPo' },
] as const
export type ScenarioId = (typeof SCENARIOS)[number]['id']

/**
 * The same city as 多建公營房屋; only where its extra homes go first differs, so its figures are the same.
 * The urban area is left out until density (3f.3): it has too few sites, and its homes would end up in the north.
 */
const HOMES_FIRST: Partial<Record<ScenarioId, HomesFirst>> = { housingNorth: 'north', housingLantau: 'lantau' }

export interface StudyFrame extends CityWorks {
  t: number
  metrics: Metrics
  landmarks: LandmarkView[]
}

export interface StudyRun {
  frames: StudyFrame[]
  ended?: GameState['endedEarly']
}

function strategyFor(id: ScenarioId | 'history'): Strategy {
  return {
    choose: FOLLOW_HISTORY.choose,
    onMonth: (s) => {
      FOLLOW_HISTORY.onMonth!(s)
      if (id === 'housing' || id in HOMES_FIRST) setFunding(s, 'housing', 1.8)
      else if (id === 'transport') setFunding(s, id, 1.8)
      else if (id === 'renewal') setPolicy(s, 'renewal', 'fast')
      else if (id !== 'history') setPolicy(s, 'industryFocus', id)
    },
  }
}

/** Actual annual views captured while the engine runs, including the construction pipeline then. */
export function buildStudyRun(id: ScenarioId | 'history', seed: number, events: boolean): StudyRun {
  const s = newGame(seed, { events })
  const strategy = strategyFor(id)
  const frames: StudyFrame[] = []
  const homesFirst = id === 'history' ? 'history' : HOMES_FIRST[id] ?? 'history'
  const capture = () => {
    const works = cityWorks(s, homesFirst)
    const t = Math.min(s.t, LAST_MONTH_INDEX)
    frames.push({ ...works, t, metrics: metricsNow(s), landmarks: cityLandmarks(s, works.map, t) })
  }
  while (s.status === 'running') {
    for (const item of [...s.inbox]) {
      const option = strategy.choose(s, item)
      if (option) answer(s, item.uid, option)
    }
    strategy.onMonth!(s)
    if (s.t === 0 || monthOf(s.t) === 1) capture()
    step(s)
  }
  if (!s.endedEarly) capture()
  return { frames, ended: s.endedEarly }
}

/** Both sides must show exactly the same month; an early-ending city has no invented future. */
export function sharedFrames(a: StudyRun, b: StudyRun): [StudyFrame, StudyFrame][] {
  const byMonth = new Map(b.frames.map((f) => [f.t, f]))
  return a.frames.flatMap((f) => {
    const other = byMonth.get(f.t)
    return other ? [[f, other] as [StudyFrame, StudyFrame]] : []
  })
}
