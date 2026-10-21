import { DEPT_INFO, type DeptId } from '../data/budget'
import { POLICY_BY_ID } from '../data/policies'
import { levelAt } from './real'
import { playerPolicyLevel } from './sim'
import { LAST_MONTH_INDEX } from './time'
import type { GameState, Metrics, StockKey } from './types'

export type Status = 'good' | 'warn' | 'bad'

export interface DemandRow {
  id: 'housing' | 'jobs' | 'transport' | 'care' | 'education' | 'environment'
  title: string
  status: Status
  /** Higher means a more pressing problem; used to rank what people worry about. */
  severity: number
  figures: { label: string; value: string }[]
  headline: string
  reasons: string[]
}

const nf = (v: number, d = 0) =>
  new Intl.NumberFormat('zh-HK', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const pct = (f: number) => `${Math.round(f * 100)}%`

function status(v: number, good: number, warn: number, higherIsBetter: boolean): Status {
  if (higherIsBetter) return v >= good ? 'good' : v >= warn ? 'warn' : 'bad'
  return v <= good ? 'good' : v <= warn ? 'warn' : 'bad'
}

function severity(v: number, good: number, bad: number): number {
  return Math.max(0, Math.min(1, (v - good) / (bad - good)))
}

/** Sum of scheduled changes to a stock within the next `months`. */
export function upcoming(s: GameState, key: StockKey, months: number): number {
  let total = 0
  for (let t = s.t; t < s.t + months; t++) total += s.pipeline[t]?.[key] ?? 0
  return total
}

/** Metrics as they were `years` ago, from the yearly snapshots. */
function yearsAgo(s: GameState, years: number): Metrics | undefined {
  const target = s.t - 12 * years
  let best: Metrics | undefined
  for (const snap of s.snapshots) if (snap.t <= target) best = snap.metrics
  return best ?? s.snapshots[0]?.metrics
}

function fundingReason(s: GameState, d: DeptId): string | undefined {
  const f = s.funding[d]
  const label = DEPT_INFO[d].label
  if (f < 0.9) return `${label}撥款只有 ${pct(f)}，低於維持現有服務所需`
  if (f >= 1.3) return `${label}撥款 ${pct(f)}，正在擴建`
  return undefined
}

function qualityReason(s: GameState, d: DeptId, what: string): string | undefined {
  const q = s.quality[d]
  return q < 0.9 ? `${what}失修，服務質素只有 ${pct(q)}` : undefined
}

export function demandRows(s: GameState, m: Metrics): DemandRow[] {
  const t = Math.min(s.t, LAST_MONTH_INDEX)
  const past3 = yearsAgo(s, 3)
  const past5 = yearsAgo(s, 5)
  const popChange3 = past3 ? m.population - past3.population : 0
  const policy = (id: string) => playerPolicyLevel(s, POLICY_BY_ID[id], t)
  const compact = (xs: (string | undefined)[]) => xs.filter((x): x is string => Boolean(x))

  const supply = m.publicUnits + m.privateUnits
  const shortage = m.households - supply * 0.96
  const publicSoon = levelAt('publicUnits', t + 36) - levelAt('publicUnits', t) + upcoming(s, 'publicUnits', 36)
  const housing: DemandRow = {
    id: 'housing',
    title: '住屋',
    status: status(m.prhWait, 3, 5, false),
    severity: severity(m.prhWait, 2.5, 7),
    figures: [
      { label: '住戶', value: `${nf(m.households, 1)} 萬` },
      { label: '住宅單位', value: `${nf(supply, 1)} 萬（公營 ${nf(m.publicUnits, 1)}、私人 ${nf(m.privateUnits, 1)}）` },
      { label: '公屋輪候', value: `${nf(m.prhWait, 1)} 年` },
      { label: '私人住宅售價指數', value: nf(m.priceIndex) },
    ],
    headline: shortage > 0 ? `住宅短缺約 ${nf(shortage, 1)} 萬個` : '住宅數量大致足夠',
    reasons: compact([
      fundingReason(s, 'housing'),
      publicSoon > 0.2 ? `預計未來三年有約 ${nf(publicSoon, 1)} 萬個公營單位落成` : undefined,
      popChange3 > 10 ? `過去三年人口增加 ${nf(popChange3)} 萬，住戶需求上升` : undefined,
      popChange3 < -5 ? `過去三年人口減少 ${nf(-popChange3)} 萬` : undefined,
      policy('cooling') !== 'off' ? '樓市辣招生效中，樓價升幅放慢' : undefined,
      policy('hos85') !== 'off' ? '建屋目標生效中，供應增加、樓價受壓' : undefined,
      policy('hos') === 'off' ? '居屋停建，中低收入家庭只能輪候公屋或租樓' : undefined,
      qualityReason(s, 'housing', '公營屋邨'),
    ]),
  }

  const growth = past3 ? (Math.pow(m.realGdpPerCapita / past3.realGdpPerCapita, 1 / 3) - 1) * 100 : 0
  const jobs: DemandRow = {
    id: 'jobs',
    title: '就業',
    status: status(m.unemployment, 4, 6, false),
    severity: severity(m.unemployment, 3, 8),
    figures: [
      { label: '勞動年齡人口', value: `${nf(m.working, 0)} 萬` },
      { label: '失業率', value: `${nf(m.unemployment, 1)}%` },
      { label: '人均本地生產總值', value: `${nf(m.gdpPerCapita)} 千元` },
    ],
    headline: m.unemployment >= 6 ? '職位不足，失業率高企' : m.unemployment <= 3 ? '職位充裕，人手緊張' : '就業大致穩定',
    reasons: compact([
      past3 ? `過去三年人均經濟每年${growth >= 0 ? '增長' : '收縮'} ${nf(Math.abs(growth), 1)}%（扣除物價）` : undefined,
      fundingReason(s, 'economy'),
      m.taxes.profits >= 18 ? `利得稅 ${nf(m.taxes.profits, 1)}%，企業投資放慢` : undefined,
      m.taxes.profits <= 14 ? `利得稅只有 ${nf(m.taxes.profits, 1)}%，吸引企業投資` : undefined,
      popChange3 > 15 && m.unemployment > 5 ? '人口增加快過職位增長' : undefined,
      policy('industryFocus') !== 'none' ? `產業重點：${POLICY_BY_ID.industryFocus.levels.find((l) => l.id === policy('industryFocus'))?.label}` : undefined,
      qualityReason(s, 'economy', '產業支援'),
    ]),
  }

  const railSoon = levelAt('railKm', t + 60) - levelAt('railKm', t) + upcoming(s, 'rail', 60)
  const transport: DemandRow = {
    id: 'transport',
    title: '交通',
    status: status(m.railPerMillion, 30, 20, true),
    severity: severity(-m.railPerMillion, -30, -12),
    figures: [
      { label: '鐵路網絡', value: `${nf(m.railKm)} 公里` },
      { label: '每百萬人鐵路', value: `${nf(m.railPerMillion, 1)} 公里` },
      { label: '設施質素', value: pct(s.quality.transport) },
    ],
    headline: m.railPerMillion < 20 ? '鐵路網絡追不上人口' : '鐵路網絡覆蓋大部分地區',
    reasons: compact([
      fundingReason(s, 'transport'),
      railSoon > 1 ? `預計未來五年新增約 ${nf(railSoon)} 公里鐵路` : '未來五年沒有新鐵路落成',
      popChange3 > 10 ? `過去三年人口增加 ${nf(popChange3)} 萬，乘客增加` : undefined,
      qualityReason(s, 'transport', '交通設施'),
    ]),
  }

  const elderlyGrowth = past5 ? m.elderly - past5.elderly : 0
  const care: DemandRow = {
    id: 'care',
    title: '醫療安老',
    status: status(m.carePerThousandElderly, 50, 30, true),
    severity: severity(-m.carePerThousandElderly, -60, -20),
    figures: [
      { label: '長者（65 歲或以上）', value: `${nf(m.elderly)} 萬（${nf((m.elderly / m.population) * 100, 1)}%）` },
      { label: '病床及安老宿位', value: `${nf(m.careCapacity, 1)} 萬` },
      { label: '每千名長者', value: `${nf(m.carePerThousandElderly)} 個` },
      { label: '平均預期壽命', value: `${nf(m.lifeExpectancy, 1)} 歲` },
    ],
    headline: m.carePerThousandElderly < 30 ? '長者服務不勝負荷，輪候時間長' : '醫療安老服務大致應付到需求',
    reasons: compact([
      elderlyGrowth > 5 ? `過去五年長者增加 ${nf(elderlyGrowth)} 萬` : undefined,
      fundingReason(s, 'health'),
      policy('oala') === 'on' ? '長者生活津貼生效中' : undefined,
      policy('upr') === 'on' ? '全民退休保障生效中' : undefined,
      qualityReason(s, 'health', '醫院和院舍'),
    ]),
  }

  const education: DemandRow = {
    id: 'education',
    title: '教育',
    status: status(m.postSecondary, 35, 25, true),
    severity: severity(-m.postSecondary, -40, -15),
    figures: [
      { label: '具專上教育程度人口', value: `${nf(m.postSecondary, 1)}%` },
      { label: '專業服務及創科佔經濟', value: `${nf(m.professionalShare, 1)}%` },
    ],
    headline: m.postSecondary >= 35 ? '人才充足，有利發展高增值產業' : '高學歷人才不足',
    reasons: compact([
      fundingReason(s, 'education'),
      policy('talent') !== 'off' ? `人才入境計劃：${POLICY_BY_ID.talent.levels.find((l) => l.id === policy('talent'))?.label}` : undefined,
      qualityReason(s, 'education', '學校'),
    ]),
  }

  const environment: DemandRow = {
    id: 'environment',
    title: '環境',
    status: status(m.pm10, 30, 45, false),
    severity: severity(m.pm10, 25, 60),
    figures: [
      { label: 'PM10 年均濃度', value: `${nf(m.pm10)} 微克/立方米` },
      { label: '郊野公園及保護區', value: `${nf(m.green, 1)}%` },
    ],
    headline: m.pm10 <= 30 ? '空氣質素良好' : m.pm10 <= 45 ? '空氣質素一般' : '空氣污染嚴重',
    reasons: compact([
      fundingReason(s, 'environment'),
      policy('cleanAir') !== 'off' ? `空氣污染管制：${POLICY_BY_ID.cleanAir.levels.find((l) => l.id === policy('cleanAir'))?.label}` : undefined,
      policy('countryPark') === 'on' ? '郊野公園邊陲正在發展' : undefined,
      qualityReason(s, 'environment', '環保設施'),
    ]),
  }

  return [housing, jobs, transport, care, education, environment]
}

/** The three most pressing problems, as people would put them. */
export function topConcerns(rows: DemandRow[]): DemandRow[] {
  return [...rows].filter((r) => r.severity > 0.25).sort((a, b) => b.severity - a.severity).slice(0, 3)
}
