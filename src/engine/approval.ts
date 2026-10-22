import { DEPARTMENTS, DEPT_INFO, TAXES, TAX_INFO, type DeptId, type TaxId } from '../data/budget'
import { HISTORY_CHOICES, PARALLEL_EVENTS } from '../data/events'
import { POLICIES, POLICY_BY_ID } from '../data/policies'
import { clamp } from './metrics'
import { AREA_IDS, type ApprovalState, type AreaId, type GameState, type InboxItem, type Metrics } from './types'

/**
 * Approval follows whether the government responds to what people worry about, not how bad things
 * are: the city that never acts has much the same problems as real Hong Kong for years, but nobody
 * answers them. It never changes the city's numbers; it only decides whether the term ends early.
 */
export const APPROVAL = {
  start: 60,
  /** Where approval drifts back to, very slowly, whatever happens. */
  base: 60,
  revert: 0.004,
  /** Points lost per month for each area, per unit of severity left unanswered. */
  down: 0.1,
  /** Points gained per month for each area, per unit of severity answered. */
  up: 0.05,
  /** Run-down services weigh this much per unit of lost quality, like severity. */
  decayWeight: 2,
  /** Answering decisions and changing any policy counts for this much in every area. */
  activeShare: 0.6,
  creditMonths: 24,
  activeMonths: 24,
  /** A raise of this much funding (5 points) counts as a full response. */
  raiseFull: 0.05,
  expiredCost: 2,
  /** Points lost per percentage point of tax raised. */
  taxCost: { salaries: 1, profits: 1, rates: 0.5 } as Record<TaxId, number>,
  /** Points lost for cutting a department below 95% while its area is among people's top concerns. */
  cutCost: 2,
  warnLine: 35,
  removeLine: 25,
  recoverLine: 40,
  /** Months in a row below the removal line before the term ends. */
  removeMonths: 12,
} as const

export const AREA_LABEL: Record<AreaId, string> = {
  housing: '住屋',
  jobs: '就業',
  transport: '交通',
  care: '醫療安老',
  education: '教育',
  environment: '環境',
}

export const DEPT_AREA: Record<DeptId, AreaId> = {
  housing: 'housing',
  transport: 'transport',
  economy: 'jobs',
  education: 'education',
  health: 'care',
  environment: 'environment',
}

function severity(v: number, good: number, bad: number): number {
  return Math.max(0, Math.min(1, (v - good) / (bad - good)))
}

/** How pressing each problem is (0–1), as the demand panel ranks them. */
export function areaSeverity(m: Metrics): Record<AreaId, number> {
  return {
    housing: severity(m.prhWait, 2.5, 7),
    jobs: severity(m.unemployment, 3, 8),
    transport: severity(-m.railPerMillion, -30, -12),
    care: severity(-m.carePerThousandElderly, -60, -20),
    education: severity(-m.postSecondary, -40, -15),
    environment: severity(m.pm10, 25, 60),
  }
}

/** The three most pressing problems, as people would put them. */
export function topAreas(sev: Record<AreaId, number>): AreaId[] {
  return AREA_IDS.filter((a) => sev[a] > 0.25)
    .sort((a, b) => sev[b] - sev[a])
    .slice(0, 3)
}

const zeroAreas = (): Record<AreaId, number> => ({ housing: 0, jobs: 0, transport: 0, care: 0, education: 0, environment: 0 })

export function newApproval(s: Pick<GameState, 'funding' | 'taxes' | 'policies'>): ApprovalState {
  return {
    value: APPROVAL.start,
    credit: zeroAreas(),
    active: 0,
    lowMonths: 0,
    fundingLog: [],
    seen: { funding: { ...s.funding }, taxes: { ...s.taxes }, policies: { ...s.policies } },
    policyCredit: {},
    warned: 0,
  }
}

const AREA_DEPT = Object.fromEntries(DEPARTMENTS.map((d) => [DEPT_AREA[d], d])) as Record<AreaId, DeptId>

/**
 * How far people feel the government has responded in an area lately (0–1). Goodwill from being
 * active elsewhere does not reach an area whose department is cut below what its services need.
 */
export function response(s: Pick<GameState, 'approval' | 'funding'>, area: AreaId): number {
  const a = s.approval
  const general = s.funding[AREA_DEPT[area]] < 0.95 ? 0 : APPROVAL.activeShare * a.active
  return Math.max(a.credit[area], general)
}

const CHOICE_AREAS: Record<string, AreaId[]> = Object.fromEntries(
  HISTORY_CHOICES.map((ch) => {
    const set = new Set<AreaId>(ch.areas ?? [])
    for (const o of ch.options) for (const e of o.effects) if (e.kind === 'policy' && POLICY_BY_ID[e.id]?.area) set.add(POLICY_BY_ID[e.id].area!)
    return [ch.id, [...set]]
  }),
)

/** Answering a decision is a response to its areas; letting it expire costs a little approval. */
export function noteAnswer(s: GameState, item: InboxItem, expired: boolean) {
  const a = s.approval
  if (expired) {
    a.value = clamp(a.value - APPROVAL.expiredCost, 0, 100)
    return
  }
  a.active = 1
  const areas = item.kind === 'history' ? CHOICE_AREAS[item.id] : PARALLEL_EVENTS.find((p) => p.id === item.id)?.areas
  for (const area of areas ?? []) a.credit[area] = 1
}

const POINTS = new Intl.NumberFormat('zh-HK', { maximumFractionDigits: 1 })

function fmt(v: number): string {
  return String(Math.round(v))
}

/**
 * Updates approval at the end of a month from what changed since last month and how the city is.
 * Returns true when approval has stayed below the removal line long enough to end the term.
 */
export function updateApproval(s: GameState, m: Metrics): boolean {
  const a = s.approval
  const t = s.t
  const sev = areaSeverity(m)
  const top = topAreas(sev)
  // People feel run-down services long before the figures move, so these count as much as the figures.
  const pressure = (area: AreaId) => Math.max(sev[area], APPROVAL.decayWeight * (1 - s.quality[AREA_DEPT[area]]))
  let change = 0
  const lost = (points: number, text: string) => {
    change -= points
    s.news.push({ t, kind: 'system', text: `${text}，民望下跌 ${POINTS.format(points)}。`, tone: 'bad' })
  }

  for (const area of AREA_IDS) a.credit[area] = Math.max(0, a.credit[area] - 1 / APPROVAL.creditMonths)
  a.active = Math.max(0, a.active - 1 / APPROVAL.activeMonths)

  // Funding: only going above every level of the past year is a raise, so cutting and restoring earns nothing.
  for (const d of DEPARTMENTS) {
    const f = s.funding[d]
    const before = Math.max(a.seen.funding[d], ...a.fundingLog.map((x) => x[d]))
    const area = DEPT_AREA[d]
    if (f - before > 0.005) a.credit[area] = Math.max(a.credit[area], Math.min(1, (f - before) / APPROVAL.raiseFull))
    if (a.seen.funding[d] >= 0.95 && f < 0.95 && top.includes(area)) lost(APPROVAL.cutCost, `削減${DEPT_INFO[d].label}撥款`)
  }
  a.fundingLog = [...a.fundingLog.slice(-(12 - 1)), { ...s.funding }]

  for (const k of TAXES) {
    const raised = s.taxes[k] - a.seen.taxes[k]
    if (raised > 0.001) lost(raised * APPROVAL.taxCost[k], `${TAX_INFO[k].label.replace(/（.*）$/, '')}加至 ${POINTS.format(s.taxes[k])}%`)
  }

  for (const p of POLICIES) {
    const level = s.policies[p.id]
    if (level === a.seen.policies[p.id]) continue
    a.active = 1
    const last = a.policyCredit[p.id]
    if (p.area && (last === undefined || t - last >= 12)) {
      a.credit[p.area] = 1
      a.policyCredit[p.id] = t
    }
    const cost = p.unpopular?.[level]
    if (cost) lost(cost, `「${p.label}」改為「${p.levels.find((l) => l.id === level)?.label ?? level}」引起不滿`)
  }
  a.seen = { funding: { ...s.funding }, taxes: { ...s.taxes }, policies: { ...s.policies } }

  for (const area of AREA_IDS) {
    const r = response(s, area)
    change += pressure(area) * (APPROVAL.up * r - APPROVAL.down * (1 - r))
  }
  change += APPROVAL.revert * (APPROVAL.base - a.value)
  a.value = clamp(a.value + change, 0, 100)

  const unanswered = AREA_IDS.filter((area) => pressure(area) > 0.25 && response(s, area) < 0.5)
    .sort((x, y) => pressure(y) - pressure(x))
    .map((area) => AREA_LABEL[area])
  const grievance = unanswered.length ? `市民覺得政府對${unanswered.slice(0, 2).join('、')}問題沒有回應。` : ''
  if (a.value < APPROVAL.removeLine && a.warned < 2) {
    a.warned = 2
    s.signals.push('approval')
    s.news.push({
      t,
      kind: 'system',
      tone: 'bad',
      text: `民望跌至 ${fmt(a.value)}，低於 ${APPROVAL.removeLine}。${grievance}如果一年內未能回升，你將被迫下台。`,
    })
  } else if (a.value < APPROVAL.warnLine && a.warned < 1) {
    a.warned = 1
    s.signals.push('approval')
    s.news.push({ t, kind: 'system', tone: 'bad', text: `民望跌至 ${fmt(a.value)}。${grievance}` })
  } else if (a.value >= APPROVAL.recoverLine && a.warned > 0) {
    a.warned = 0
    s.news.push({ t, kind: 'system', tone: 'good', text: `民望回升至 ${fmt(a.value)}。` })
  }

  a.lowMonths = a.value < APPROVAL.removeLine ? a.lowMonths + 1 : 0
  return a.lowMonths >= APPROVAL.removeMonths
}
