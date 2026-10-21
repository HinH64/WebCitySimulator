import type { DeptId } from '../data/budget'
import { clamp } from './metrics'
import type { GameState, IndicatorId, Metrics } from './types'

export const INDICATOR_LABEL: Record<IndicatorId, string> = {
  economy: '經濟實力',
  housing: '安居',
  mobility: '出行',
  wellbeing: '健康與福祉',
  talent: '人才與創新',
  environment: '宜居環境',
}

/** Department whose upkeep each indicator depends on. */
export const INDICATOR_DEPT: Record<IndicatorId, DeptId> = {
  economy: 'economy',
  housing: 'housing',
  mobility: 'transport',
  wellbeing: 'health',
  talent: 'education',
  environment: 'environment',
}

/** Maps a value onto 0–100 between a worst and best value. */
function score(v: number, worst: number, best: number): number {
  return clamp(((v - worst) / (best - worst)) * 100, 0, 100)
}

export interface IndicatorPart {
  label: string
  value: number
  unit: string
  decimals: number
  score: number
}

export function indicatorParts(m: Metrics, quality: Record<DeptId, number>): Record<IndicatorId, IndicatorPart[]> {
  return {
    economy: [
      { label: '人均本地生產總值（1997 年價格）', value: m.realGdpPerCapita, unit: '千元', decimals: 0, score: score(m.realGdpPerCapita, 150, 350) },
      { label: '失業率', value: m.unemployment, unit: '%', decimals: 1, score: score(m.unemployment, 9, 2) },
    ],
    housing: [
      { label: '公屋平均輪候', value: m.prhWait, unit: '年', decimals: 1, score: score(m.prhWait, 7, 1.5) },
      { label: '樓價負擔（樓價指數 ÷ 工資指數）', value: m.affordability, unit: '', decimals: 0, score: score(m.affordability, 250, 50) },
    ],
    mobility: [
      { label: '每百萬人鐵路', value: m.railPerMillion, unit: '公里', decimals: 1, score: score(m.railPerMillion, 10, 45) },
      { label: '交通設施質素', value: quality.transport * 100, unit: '%', decimals: 0, score: score(quality.transport, 0.5, 1) },
    ],
    wellbeing: [
      { label: '出生時平均預期壽命', value: m.lifeExpectancy, unit: '歲', decimals: 1, score: score(m.lifeExpectancy, 76, 90) },
      { label: '每千名長者病床及宿位', value: m.carePerThousandElderly, unit: '個', decimals: 0, score: score(m.carePerThousandElderly, 20, 80) },
    ],
    talent: [
      { label: '具專上教育程度人口', value: m.postSecondary, unit: '%', decimals: 1, score: score(m.postSecondary, 10, 50) },
      { label: '專業服務及創科佔經濟', value: m.professionalShare, unit: '%', decimals: 1, score: score(m.professionalShare, 8, 20) },
    ],
    environment: [
      { label: '可吸入懸浮粒子（PM10）', value: m.pm10, unit: '微克/立方米', decimals: 0, score: score(m.pm10, 65, 15) },
      { label: '郊野公園及保護區', value: m.green, unit: '%', decimals: 1, score: score(m.green, 38, 44) },
    ],
  }
}

export function computeIndicators(
  m: Metrics,
  s: Pick<GameState, 'quality' | 'policyLevels'>,
): Record<IndicatorId, number> {
  const parts = indicatorParts(m, s.quality)
  const avg = (id: IndicatorId) => parts[id].reduce((a, p) => a + p.score, 0) / parts[id].length
  return {
    economy: avg('economy'),
    housing: clamp(avg('housing') * (0.5 + 0.5 * s.quality.housing), 0, 100),
    mobility: avg('mobility'),
    wellbeing: clamp(avg('wellbeing') + s.policyLevels.welfare, 0, 100),
    talent: avg('talent'),
    environment: avg('environment'),
  }
}
