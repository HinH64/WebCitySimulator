import {
  DEPARTMENTS,
  REAL_FUNDING,
  REAL_TAX,
  REVENUE_SHARE_ANCHORS,
  REVENUE_SOURCES,
  SPEND_SHARE_ANCHORS,
  TAXES,
  type DeptId,
  type RevenueId,
  type TaxId,
} from '../data/budget'
import { POLICIES, POLICY_BY_ID } from '../data/policies'
import { REAL, realRevenue, yearValue, type SeriesId } from '../data/real'
import { SECTORS, SECTOR_SHARE_1997, sectorDeviation, type SectorId } from '../data/sectors'
import { LAST_MONTH_INDEX, START_YEAR, monthOf, timelineAt, yearOf } from './time'

/** Fractional calendar year at the middle of month t. */
function yearFraction(t: number): number {
  return yearOf(t) + (monthOf(t) - 0.5) / 12
}

/** A level series at month t, interpolated between mid-year values. */
export function levelAt(id: SeriesId, t: number): number {
  const values = REAL[id].values
  const x = yearFraction(t) - 0.5 - START_YEAR
  if (x <= 0) return values[0]
  if (x >= values.length - 1) return values[values.length - 1]
  const i = Math.floor(x)
  return values[i] + (values[i + 1] - values[i]) * (x - i)
}

function anchorShares<K extends string>(anchors: { year: number; shares: Record<K, number> }[], keys: readonly K[], t: number) {
  const x = yearFraction(t)
  let i = anchors.findIndex((a) => a.year >= x)
  if (i === -1) i = anchors.length - 1
  const out = {} as Record<K, number>
  if (i === 0 || anchors[i].year <= x) {
    for (const k of keys) out[k] = anchors[i].shares[k] / 100
    return out
  }
  const a = anchors[i - 1]
  const b = anchors[i]
  const f = (x - a.year) / (b.year - a.year)
  for (const k of keys) out[k] = (a.shares[k] + (b.shares[k] - a.shares[k]) * f) / 100
  return out
}

const SPEND_KEYS = [...DEPARTMENTS, 'other'] as const

/** Share of total spending by department (fractions summing to 1). */
export function spendShare(t: number): Record<DeptId | 'other', number> {
  return anchorShares(SPEND_SHARE_ANCHORS, SPEND_KEYS, t)
}

export function revenueShare(t: number): Record<RevenueId, number> {
  return anchorShares(REVENUE_SHARE_ANCHORS, REVENUE_SOURCES, t)
}

export function realSpendingMonth(t: number): number {
  return yearValue('expenditure', yearOf(t)) / 12
}

export function realRevenueMonth(t: number): number {
  return realRevenue(yearOf(t)) / 12
}

export function realFunding(d: DeptId, t: number): number {
  const entries = REAL_FUNDING[d]
  return timelineAt(entries, t, (i) => entries[i].level)
}

export function realTax(tax: TaxId, t: number): number {
  const entries = REAL_TAX[tax]
  return timelineAt(entries, t, (i) => entries[i].rate)
}

export function realTaxes(t: number): Record<TaxId, number> {
  return Object.fromEntries(TAXES.map((k) => [k, realTax(k, t)])) as Record<TaxId, number>
}

export function realPolicyLevel(id: string, t: number): string {
  const p = POLICY_BY_ID[id]
  return timelineAt(p.real, t, (i) => p.real[i].level)
}

export function cpiAt(t: number): number {
  return levelAt('cpi', t)
}

export function realGdp(t: number): number {
  // 千元 × 萬人 = 0.1 億
  return levelAt('gdpPerCapita', t) * levelAt('population', t) * 0.1
}

/** Felt tax rates move a 24th of the way towards the actual rate each month. */
export const FELT_TAX_SPEED = 1 / 24

export function updateFelt(felt: Record<TaxId, number>, actual: Record<TaxId, number>): Record<TaxId, number> {
  const out = { ...felt }
  for (const k of TAXES) out[k] = felt[k] + (actual[k] - felt[k]) * FELT_TAX_SPEED
  return out
}

/** Sector growth relative to the whole economy (pp/yr), normalised to the real mix at month t. */
export function normalisedSectorDeviation(t: number, realShares: Record<SectorId, number>): Record<SectorId, number> {
  const d = sectorDeviation(yearOf(t))
  const mean = SECTORS.reduce((s, k) => s + realShares[k] * d[k], 0)
  const out = {} as Record<SectorId, number>
  for (const k of SECTORS) out[k] = d[k] - mean
  return out
}

export const SECTOR_BOOST = 1.5

export function sectorBoost(level: string): Partial<Record<SectorId, number>> {
  const sector = POLICY_BY_ID.industryFocus.effects[level]?.sectorBoost
  return sector ? { [sector]: SECTOR_BOOST } : {}
}

/** Advances sector shares by one month. */
export function stepSectors(
  shares: Record<SectorId, number>,
  dev: Record<SectorId, number>,
  boost: Partial<Record<SectorId, number>>,
): Record<SectorId, number> {
  const out = {} as Record<SectorId, number>
  let total = 0
  for (const k of SECTORS) {
    out[k] = shares[k] * Math.exp((dev[k] + (boost[k] ?? 0)) / 100 / 12)
    total += out[k]
  }
  for (const k of SECTORS) out[k] /= total
  return out
}

interface RealPaths {
  reserves: number[]
  felt: Record<TaxId, number>[]
  sectors: Record<SectorId, number>[]
}

/** Real reserves, felt taxes and sector mix at the start of every month, computed once. */
function buildPaths(): RealPaths {
  const reserves: number[] = []
  const felt: Record<TaxId, number>[] = []
  const sectors: Record<SectorId, number>[] = []
  let r = yearValue('reserves', START_YEAR)
  let f = realTaxes(0)
  let s = Object.fromEntries(SECTORS.map((k) => [k, SECTOR_SHARE_1997[k] / 100])) as Record<SectorId, number>
  const total = SECTORS.reduce((a, k) => a + s[k], 0)
  for (const k of SECTORS) s[k] /= total
  for (let t = 0; t <= LAST_MONTH_INDEX + 1; t++) {
    reserves.push(r)
    felt.push(f)
    sectors.push(s)
    r += realRevenueMonth(t) - realSpendingMonth(t)
    f = updateFelt(f, realTaxes(t))
    s = stepSectors(s, normalisedSectorDeviation(t, s), sectorBoost(realPolicyLevel('industryFocus', t)))
  }
  return { reserves, felt, sectors }
}

let paths: RealPaths | undefined
function getPaths(): RealPaths {
  paths ??= buildPaths()
  return paths
}

export function realReserves(t: number): number {
  return getPaths().reserves[Math.min(t, LAST_MONTH_INDEX + 1)]
}

export function realFelt(t: number): Record<TaxId, number> {
  return getPaths().felt[Math.min(t, LAST_MONTH_INDEX + 1)]
}

export function realSectors(t: number): Record<SectorId, number> {
  return getPaths().sectors[Math.min(t, LAST_MONTH_INDEX + 1)]
}

export const ALL_POLICY_IDS = POLICIES.map((p) => p.id)
