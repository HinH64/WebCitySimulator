/**
 * Plain words for what a policy level or a decision's option does: which way things move and roughly
 * when, never by how much (CONTENT.md 4j). The policy panel, the decision cards and the news use the same
 * words, so what a player is told before choosing is what the news says after.
 */

import { AREA_LABEL } from '../data/areas'
import { DEPT_INFO, TAX_INFO } from '../data/budget'
import { HISTORY_CHOICES, PARALLEL_EVENTS } from '../data/events'
import { POLICY_BY_ID, type PolicyDef, type PolicyEffect } from '../data/policies'
import { SECTOR_LABEL } from '../data/sectors'
import type { AreaId, ChoiceOption, ChoiceRecord, Effect, StockKey } from './types'

const arrow = (v: number) => (v > 0 ? '↑' : '↓')
/** Roughly when, for anything that starts a year or more after the decision. */
const later = (months: number) => (months >= 12 ? `（約 ${Math.round(months / 12)} 年後）` : '')

/** What a level does compared with another, by default the policy's neutral level (levels[0]). */
export function policyEffectWords(p: PolicyDef, level: string, base = p.levels[0].id): string[] {
  const e: PolicyEffect = p.effects[level] ?? {}
  const n: PolicyEffect = p.effects[base] ?? {}
  const d = (k: keyof PolicyEffect) => ((e[k] as number | undefined) ?? 0) - ((n[k] as number | undefined) ?? 0)
  const words: string[] = []
  const money = (diff: number, own: number) => {
    if (diff > 0) words.push('開支↑')
    else if (diff < 0) words.push(own < 0 ? '收入↑' : '開支↓')
  }
  money(d('cost'), e.cost ?? 0)
  money(d('costGdpShare'), e.costGdpShare ?? 0)
  if (d('publicUnits')) words.push(`公營單位${arrow(d('publicUnits'))}（約 3 年後）`)
  if (d('publicUnitsFast')) words.push(`公營單位${arrow(d('publicUnitsFast'))}（約 18 個月後）`)
  if (d('privateUnits')) words.push(`私人單位${arrow(d('privateUnits'))}（約 4 年後）`)
  if (d('publicLandShare')) {
    const share = d('publicLandShare')
    words.push(`公營單位${arrow(share)}`, `私人單位${arrow(-share)}`, `賣地收入${arrow(-share)}`)
  }
  if (d('demolish') || d('rebuild')) words.push(`舊樓重建${arrow(d('demolish') || d('rebuild'))}（拆卸後約 5 年半建回）`)
  if (d('priceDrift')) words.push(`樓價${arrow(d('priceDrift'))}`)
  if (d('stampFactor')) words.push(`印花稅收入${arrow(d('stampFactor'))}`)
  if (d('growth')) words.push(`經濟增長${arrow(d('growth'))}${e.growthYears ? `（${e.growthYears[0]}–${e.growthYears[1]} 年）` : ''}`)
  if (e.sectorBoost && e.sectorBoost !== n.sectorBoost) words.push(`${SECTOR_LABEL[e.sectorBoost]}業增長↑`)
  if (d('unemployment')) words.push(`失業${arrow(d('unemployment'))}`)
  if (d('welfare')) words.push(`福祉${arrow(d('welfare'))}`)
  if (d('attract')) words.push(`吸引力${arrow(d('attract'))}`)
  if (d('talent')) words.push(`移入人口${arrow(d('talent'))}`)
  if (d('pm10')) words.push(`空氣污染${arrow(d('pm10'))}`)
  if (d('green')) words.push(`保護區${arrow(d('green'))}`)
  if (p.unpopular?.[level]) words.push('民望↓（即時）')
  return words
}

const STOCK_LABEL: Record<Exclude<StockKey, 'money'>, string> = {
  publicUnits: '公營單位',
  privateUnits: '私人單位',
  rail: '鐵路',
  care: '病床及安老宿位',
  postSecondary: '專上教育',
  pm10: '空氣污染',
  green: '保護區',
  pop: '人口',
  priceShift: '樓價',
  gdp: '經濟',
  tourism: '旅遊業',
  landSale: '賣地收入',
  redevelop: '舊樓重建',
}

/** The level a policy is at before a decision, to say what changing it does. */
export type PolicyLevelOf = (policyId: string) => string | undefined

/** Words for one effect of a decision; `timing` adds roughly when, for news before it happens. */
function effectWord(e: Effect, timing: boolean, levelOf?: PolicyLevelOf): string | undefined {
  const when = (at = 0) => (timing ? later(at) : '')
  switch (e.kind) {
    case 'stock':
      if (e.key === 'money') {
        const years = Math.round((e.over ?? 1) / 12)
        return e.v > 0 ? `開支↑${timing && years >= 2 ? `（${years} 年內）` : ''}` : '收入↑'
      }
      return `${STOCK_LABEL[e.key]}${arrow(e.v)}${when(e.at)}`
    case 'policy': {
      const p = POLICY_BY_ID[e.id]
      const before = levelOf?.(e.id)
      if (before === e.level) return undefined
      const words = policyEffectWords(p, e.level, before)
      return `「${p.label}」改為「${p.levels.find((l) => l.id === e.level)!.label}」${when(e.at)}${words.length ? `（${words.join('、')}）` : ''}`
    }
    case 'funding':
      return e.factor === 1 ? undefined : `各部門撥款${arrow(e.factor - 1)}`
    case 'dept':
      return `${DEPT_INFO[e.id].label}撥款${arrow(e.delta)}`
    case 'tax':
      return `${TAX_INFO[e.id].label}${arrow(e.delta)}`
    case 'bond':
      return '發債'
  }
}

/** What choosing this option does; an option that changes nothing says so. */
export function optionEffectWords(option: ChoiceOption, timing = true, levelOf?: PolicyLevelOf): string[] {
  const words = [...new Set(option.effects.map((e) => effectWord(e, timing, levelOf)).filter((w): w is string => w !== undefined))]
  return words.length ? words : ['維持現狀']
}

/** The worries a decision answers: its own, and those of the policies its options set. */
export function choiceAreas(id: string, options: ChoiceOption[]): AreaId[] {
  const own = HISTORY_CHOICES.find((c) => c.id === id)?.areas ?? PARALLEL_EVENTS.find((c) => c.id === id)?.areas ?? []
  const fromPolicies = options.flatMap((o) => o.effects.flatMap((e) => (e.kind === 'policy' && POLICY_BY_ID[e.id].area ? [POLICY_BY_ID[e.id].area!] : [])))
  return [...new Set([...own, ...fromPolicies])]
}

export const areaWords = (areas: AreaId[]) => areas.map((a) => `「${AREA_LABEL[a]}」`).join('、')

/**
 * The month an answered decision's effect starts, as answer() applies it: policies count from when the
 * decision came up, as do the real option's other effects (they are in the real data); another option's
 * effects start when it was answered.
 */
export function effectStart(c: ChoiceRecord, e: Effect): number {
  const real = c.kind === 'history' && HISTORY_CHOICES.find((h) => h.id === c.id)?.realOptionId === c.optionId
  return (e.kind === 'policy' || real ? c.received : c.t) + ('at' in e ? e.at ?? 0 : 0)
}

/** Effects that start some time after the decision, as opposed to money paid along the way. */
export const delayedEffect = (e: Effect) => (e.kind === 'stock' && e.key !== 'money') || (e.kind === 'policy' && (e.at ?? 0) > 0)
