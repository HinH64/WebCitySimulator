/**
 * Budget structure. Shares and real funding levels are estimates from spending by policy area
 * and each period's major programmes; they are the baseline the player's budget is compared to.
 */

export const DEPARTMENTS = ['housing', 'transport', 'economy', 'education', 'health', 'environment'] as const
export type DeptId = (typeof DEPARTMENTS)[number]

export interface DeptInfo {
  label: string
  covers: string
  /** What spending above 100% builds. */
  builds: string
}

export const DEPT_INFO: Record<DeptId, DeptInfo> = {
  housing: { label: '房屋及土地', covers: '公屋、居屋、土地平整', builds: '公營房屋、可建屋土地' },
  transport: { label: '交通及基建', covers: '鐵路、道路、口岸', builds: '新鐵路' },
  economy: { label: '經濟及產業', covers: '招商、產業支援、旅遊推廣、創科', builds: '產業競爭力' },
  education: { label: '教育', covers: '中小學、專上教育', builds: '專上學額、教育質素' },
  health: { label: '醫療及社福', covers: '醫院、安老、社會保障', builds: '病床、安老宿位' },
  environment: { label: '環境及保育', covers: '空氣、廢物、郊野公園', builds: '減排' },
}

/** Share of total spending, interpolated between anchor years; the rest is fixed "other" spending. */
export const SPEND_SHARE_ANCHORS: { year: number; shares: Record<DeptId | 'other', number> }[] = [
  { year: 1997, shares: { housing: 8, transport: 14, economy: 5, education: 20, health: 25, environment: 4, other: 24 } },
  { year: 2007, shares: { housing: 6, transport: 12, economy: 5, education: 21, health: 28, environment: 5, other: 23 } },
  { year: 2017, shares: { housing: 5, transport: 17, economy: 5, education: 17, health: 32, environment: 5, other: 19 } },
  { year: 2022, shares: { housing: 6, transport: 13, economy: 10, education: 14, health: 34, environment: 4, other: 19 } },
  { year: 2025, shares: { housing: 7, transport: 13, economy: 6, education: 15, health: 35, environment: 4, other: 20 } },
]

/**
 * Real funding level per department over time: real spending ÷ what maintaining existing services
 * costs. Above 1 means the real government was expanding. Each entry starts at the given month.
 */
export const REAL_FUNDING: Record<DeptId, { from: [number, number]; level: number }[]> = {
  housing: [
    { from: [1997, 7], level: 1.3 },
    { from: [2000, 7], level: 1.15 },
    { from: [2003, 1], level: 1.0 },
    { from: [2012, 1], level: 1.15 },
    { from: [2018, 1], level: 1.25 },
  ],
  transport: [
    { from: [1997, 7], level: 1.25 },
    { from: [1999, 1], level: 1.1 },
    { from: [2009, 1], level: 1.4 },
    { from: [2020, 1], level: 1.15 },
  ],
  economy: [
    { from: [1997, 7], level: 1.0 },
    { from: [2020, 1], level: 1.3 },
    { from: [2023, 1], level: 1.05 },
  ],
  education: [
    { from: [1997, 7], level: 1.05 },
    { from: [2008, 1], level: 1.1 },
  ],
  health: [
    { from: [1997, 7], level: 1.05 },
    { from: [2013, 1], level: 1.1 },
  ],
  environment: [
    { from: [1997, 7], level: 1.0 },
    { from: [2013, 1], level: 1.1 },
  ],
}

export const FUNDING_MIN = 0.5
export const FUNDING_MAX = 2.0

export const REVENUE_SOURCES = ['salaries', 'profits', 'rates', 'stamp', 'land', 'investment', 'other'] as const
export type RevenueId = (typeof REVENUE_SOURCES)[number]

export const REVENUE_LABEL: Record<RevenueId, string> = {
  salaries: '薪俸稅',
  profits: '利得稅',
  rates: '差餉',
  stamp: '印花稅',
  land: '賣地收入',
  investment: '投資收入',
  other: '其他收費',
}

/** Share of real revenue by source (%), interpolated between anchor years. */
export const REVENUE_SHARE_ANCHORS: { year: number; shares: Record<RevenueId, number> }[] = [
  { year: 1997, shares: { salaries: 12, profits: 18, rates: 5, stamp: 8, land: 20, investment: 7, other: 30 } },
  { year: 2003, shares: { salaries: 17, profits: 20, rates: 6, stamp: 5, land: 5, investment: 6, other: 41 } },
  { year: 2010, shares: { salaries: 11, profits: 25, rates: 4, stamp: 12, land: 20, investment: 10, other: 18 } },
  { year: 2019, shares: { salaries: 10, profits: 27, rates: 4, stamp: 11, land: 24, investment: 8, other: 16 } },
  { year: 2023, shares: { salaries: 12, profits: 30, rates: 5, stamp: 8, land: 4, investment: 10, other: 31 } },
]

export const TAXES = ['salaries', 'profits', 'rates'] as const
export type TaxId = (typeof TAXES)[number]

export const TAX_INFO: Record<TaxId, { label: string; min: number; max: number; step: number; effect: string }> = {
  salaries: { label: '薪俸稅標準稅率', min: 10, max: 25, step: 0.5, effect: '稅率高，人才吸引力下降' },
  profits: { label: '利得稅', min: 10, max: 25, step: 0.5, effect: '稅率高，企業投資和經濟增長放慢' },
  rates: { label: '差餉（應課差餉租值 %）', min: 3, max: 8, step: 0.5, effect: '稅率高，住屋負擔加重' },
}

/** Real tax rates; each entry starts at the given month. */
export const REAL_TAX: Record<TaxId, { from: [number, number]; rate: number }[]> = {
  salaries: [
    { from: [1997, 7], rate: 15 },
    { from: [2003, 4], rate: 15.5 },
    { from: [2004, 4], rate: 16 },
    { from: [2008, 4], rate: 15 },
  ],
  profits: [
    { from: [1997, 7], rate: 16.5 },
    { from: [1998, 4], rate: 16 },
    { from: [2003, 4], rate: 17.5 },
    { from: [2008, 4], rate: 16.5 },
  ],
  rates: [{ from: [1997, 7], rate: 5 }],
}

export const DEBT = {
  /** Debt ceiling as a share of GDP; above it the term ends in fiscal collapse. */
  ceiling: 0.3,
  baseSpread: 0.5,
  /** Extra spread (percentage points) per unit of debt-to-GDP. */
  spreadPerDebtRatio: 8,
  tenors: [5, 10],
} as const
