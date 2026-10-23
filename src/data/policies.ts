import type { AreaId } from '../engine/types'
import type { SectorId } from './sectors'

export type YearMonth = [number, number]

/**
 * Effects of a policy level, compared between the player's level and the real level each month.
 * Rates are per year; level effects (unemployment, welfare, attract, pm10, green) phase in over
 * about two years.
 */
export interface PolicyEffect {
  /** Yearly cost in 1997 HK$ 億 (scaled by prices); negative means income. */
  cost?: number
  /** Yearly cost as a share of GDP; negative means income (e.g. a sales tax). */
  costGdpShare?: number
  /** Extra public housing completions, 萬 units per year, about three years later. */
  publicUnits?: number
  /** Extra public housing completions, 萬 units per year, about 18 months later. */
  publicUnitsFast?: number
  /** Extra private housing completions, 萬 units per year, about four years later. */
  privateUnits?: number
  /** Share of formed land used for public housing (rest is sold for private housing). */
  publicLandShare?: number
  /** Drift of property prices per year (e.g. -0.03 = 3% lower each year). */
  priceDrift?: number
  /** Multiplier on stamp duty. */
  stampFactor?: number
  /** GDP growth, percentage points per year. */
  growth?: number
  /** Limit `growth` to these calendar years. */
  growthYears?: [number, number]
  /** Unemployment rate, percentage points. */
  unemployment?: number
  /** Points added to the health and wellbeing indicator. */
  welfare?: number
  /** Attractiveness, as a fraction (0.01 = 1%). */
  attract?: number
  /** Extra inflow of people, 萬 per year. */
  talent?: number
  /** PM10 change, µg/m³ (level). */
  pm10?: number
  /** Share of land protected as country parks, percentage points (level). */
  green?: number
  /** Extra growth for one sector, percentage points per year. */
  sectorBoost?: SectorId
  /** Old private flats pulled down for rebuilding, 萬 per year. */
  demolish?: number
  /** Private flats completed where old ones came down, 萬 per year, REBUILD_MONTHS later. */
  rebuild?: number
}

/** Months from pulling down old flats to the new ones being finished. */
export const REBUILD_MONTHS = 66

export type PolicyCategory = 'housing' | 'transport' | 'economy' | 'social' | 'environment' | 'tax'

export const POLICY_CATEGORY_LABEL: Record<PolicyCategory, string> = {
  housing: '房屋及土地',
  transport: '交通',
  economy: '經濟及就業',
  social: '社會及醫療',
  environment: '環境',
  tax: '稅務',
}

/**
 * General policies, like the ordinances of SimCity or the policies of Cities: Skylines: generic
 * names any city could use, available from the start. Named historical moments (八萬五, 辣招, ...)
 * are decisions in events.ts that set these policies.
 */
export interface PolicyDef {
  id: string
  category: PolicyCategory
  /** The worry it answers; changing it counts as a response there. Absent for taxes. */
  area?: AreaId
  /** Approval lost at once when the city switches to one of these levels. */
  unpopular?: Record<string, number>
  label: string
  description: string
  /** levels[0] is the "off" or neutral level. */
  levels: { id: string; label: string }[]
  /** Before this month the policy cannot take effect (only for technology that did not exist yet). */
  availableFrom: YearMonth
  /**
   * Real level over time; each entry starts at its month. A change that comes with a decision starts
   * the month after the decision comes up, which is when an answer given straight away takes effect.
   */
  real: { from: YearMonth; level: string }[]
  effects: Record<string, PolicyEffect>
}

export const POLICIES: PolicyDef[] = [
  {
    id: 'hos85',
    category: 'housing',
    area: 'housing',
    label: '房屋供應目標',
    description: '訂下每年的住宅供應目標，加快公營和私人住宅落成。增加供應、壓低樓價，但經濟低迷時會加深衰退。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'moderate', label: '溫和' },
      { id: 'full', label: '進取' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [1997, 11], level: 'full' },
      { from: [2000, 7], level: 'off' },
    ],
    effects: {
      off: {},
      moderate: { cost: 30, publicUnits: 0.5, privateUnits: 0.5, priceDrift: -0.02, growth: -0.25, growthYears: [1998, 2003] },
      full: { cost: 60, publicUnits: 1.0, privateUnits: 1.0, priceDrift: -0.04, growth: -0.6, growthYears: [1998, 2003] },
    },
  },
  {
    id: 'hos',
    category: 'housing',
    area: 'housing',
    label: '資助出售房屋',
    description: '以低於市價出售資助房屋，讓中低收入家庭置業，減輕公屋輪候，但會分薄私樓需求。',
    levels: [
      { id: 'off', label: '停建' },
      { id: 'reduced', label: '減少' },
      { id: 'on', label: '興建' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'on' },
      { from: [2002, 12], level: 'off' },
      { from: [2011, 11], level: 'on' },
    ],
    effects: {
      off: {},
      reduced: { cost: 12, publicUnits: 0.35, priceDrift: -0.0025 },
      on: { cost: 25, publicUnits: 0.7, priceDrift: -0.005 },
    },
  },
  {
    id: 'landRatio',
    category: 'housing',
    area: 'housing',
    label: '公私營房屋比例',
    description: '新土地用作公營房屋還是賣地。公營比例高，輪候縮短；私營比例高，賣地收入多。',
    levels: [
      { id: 'p50', label: '50:50' },
      { id: 'p60', label: '60:40' },
      { id: 'p70', label: '70:30' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'p50' },
      { from: [2015, 1], level: 'p60' },
      { from: [2019, 1], level: 'p70' },
    ],
    effects: {
      p50: { publicLandShare: 0.5 },
      p60: { publicLandShare: 0.6 },
      p70: { publicLandShare: 0.7 },
    },
  },
  {
    id: 'lph',
    category: 'housing',
    area: 'housing',
    label: '組裝合成快速建屋',
    description: '用工廠預製的組件快速興建過渡性公屋，約 18 個月見效，但成本較高。',
    levels: [
      { id: 'off', label: '不興建' },
      { id: 'on', label: '興建' },
    ],
    availableFrom: [2018, 1],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2022, 11], level: 'on' },
    ],
    effects: { off: {}, on: { cost: 50, publicUnitsFast: 0.6 } },
  },
  {
    id: 'countryPark',
    category: 'housing',
    area: 'housing',
    unpopular: { on: 5 },
    label: '郊野公園邊陲建屋',
    description: '在郊野公園邊陲建屋。增加可建屋土地，但減少保護範圍。',
    levels: [
      { id: 'off', label: '不發展' },
      { id: 'on', label: '發展' },
    ],
    availableFrom: [1997, 7],
    real: [{ from: [1997, 7], level: 'off' }],
    effects: { off: {}, on: { publicUnits: 0.4, privateUnits: 0.4, green: -1.6 } },
  },
  {
    id: 'cooling',
    category: 'housing',
    area: 'housing',
    label: '額外印花稅（壓抑炒賣）',
    description: '向短期轉售和非首置買家徵收額外印花稅。樓價升幅放慢，印花稅收入增加，但成交減少。',
    levels: [
      { id: 'off', label: '不推行' },
      { id: 'light', label: '溫和' },
      { id: 'on', label: '全面' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2010, 12], level: 'on' },
      { from: [2024, 3], level: 'off' },
    ],
    effects: {
      off: {},
      light: { priceDrift: -0.0075, stampFactor: 1.07, growth: -0.05 },
      on: { priceDrift: -0.015, stampFactor: 1.15, growth: -0.1 },
    },
  },
  {
    id: 'renewal',
    category: 'housing',
    area: 'housing',
    unpopular: { fast: 2 },
    label: '市區重建',
    description: '收購和拆卸殘舊樓宇，重建成更多更安全的新樓。重建期間單位減少、樓價短期略升，約五年半後建回更多單位；要額外開支，加快重建也會惹來街坊反對。',
    levels: [
      { id: 'off', label: '少量' },
      { id: 'normal', label: '一般' },
      { id: 'fast', label: '加快' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2001, 5], level: 'normal' },
    ],
    // Rebuilt sites hold about twice the flats of the old tenements.
    effects: {
      off: {},
      normal: { cost: 10, demolish: 0.1, rebuild: 0.2, welfare: 0.3 },
      fast: { cost: 25, demolish: 0.4, rebuild: 0.8, welfare: 0.8 },
    },
  },
  {
    id: 'inspection',
    category: 'housing',
    area: 'housing',
    unpopular: { on: 1 },
    label: '強制驗樓',
    description: '樓齡 30 年或以上的私人樓宇要定期驗樓和維修。減少外牆剝落和塌樓意外，颱風時損毀也較少，但業主要負擔維修費，會有怨言。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'on', label: '實施' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2012, 6], level: 'on' },
    ],
    effects: { off: {}, on: { cost: 3, welfare: 0.3 } },
  },
  {
    id: 'minWage',
    category: 'economy',
    area: 'jobs',
    label: '法定最低工資',
    description: '保障基層收入。低技術職位略減。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'on', label: '實施' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2011, 5], level: 'on' },
    ],
    effects: { off: {}, on: { unemployment: 0.3, welfare: 2, attract: 0.01 } },
  },
  {
    id: 'oala',
    category: 'social',
    area: 'care',
    label: '長者生活津貼',
    description: '經濟審查的長者津貼，改善長者生活。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'on', label: '實施' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2013, 4], level: 'on' },
    ],
    effects: { off: {}, on: { cost: 60, welfare: 4 } },
  },
  {
    id: 'upr',
    category: 'social',
    area: 'care',
    label: '全民退休保障',
    description: '所有長者每月領取退休金。長者生活大幅改善，但長遠財政壓力大。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'on', label: '實施' },
    ],
    availableFrom: [1997, 7],
    real: [{ from: [1997, 7], level: 'off' }],
    effects: { off: {}, on: { cost: 250, welfare: 8, attract: 0.02 } },
  },
  {
    id: 'cleanAir',
    category: 'environment',
    area: 'environment',
    label: '空氣污染管制',
    description: '淘汰舊柴油車、收緊排放標準。改善空氣，但有成本。',
    levels: [
      { id: 'off', label: '現有措施' },
      { id: 'standard', label: '加強' },
      { id: 'strong', label: '進取' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2013, 4], level: 'standard' },
    ],
    effects: {
      off: {},
      standard: { cost: 25, pm10: -5 },
      strong: { cost: 50, pm10: -9, growth: -0.05 },
    },
  },
  {
    id: 'talent',
    category: 'economy',
    area: 'education',
    label: '人才入境計劃',
    description: '吸引外地專才來港。人口和經濟增加，住屋需求也上升。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'standard', label: '一般' },
      { id: 'boost', label: '大力搶人才' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2006, 7], level: 'standard' },
      { from: [2022, 12], level: 'boost' },
    ],
    effects: {
      off: {},
      standard: { talent: 0.3, growth: 0.05 },
      boost: { cost: 10, talent: 5, growth: 0.15 },
    },
  },
  {
    id: 'industryFocus',
    category: 'economy',
    area: 'jobs',
    label: '產業重點',
    description: '集中資源發展一個行業，令該行業增長加快。',
    levels: [
      { id: 'none', label: '不設' },
      { id: 'finance', label: '金融' },
      { id: 'trade', label: '貿易物流' },
      { id: 'tourism', label: '旅遊' },
      { id: 'professional', label: '創科' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'none' },
      { from: [2015, 12], level: 'professional' },
    ],
    effects: {
      none: {},
      finance: { cost: 30, sectorBoost: 'finance' },
      trade: { cost: 30, sectorBoost: 'trade' },
      tourism: { cost: 30, sectorBoost: 'tourism' },
      professional: { cost: 30, sectorBoost: 'professional' },
    },
  },
  {
    id: 'gst',
    category: 'tax',
    unpopular: { on: 8 },
    label: '銷售稅',
    description: '開徵 5% 銷售稅（商品及服務稅）。擴闊稅基、增加收入，但加重市民負擔、拖慢消費。',
    levels: [
      { id: 'off', label: '不開徵' },
      { id: 'on', label: '開徵 5%' },
    ],
    availableFrom: [1997, 7],
    real: [{ from: [1997, 7], level: 'off' }],
    effects: { off: {}, on: { costGdpShare: -0.02, growth: -0.15, welfare: -3 } },
  },
  {
    id: 'fare',
    category: 'transport',
    area: 'transport',
    label: '公共交通乘車優惠',
    description: '資助市民乘搭公共交通。長者多出外活動、少用私家車，但每年要付車資差額。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'elderly', label: '長者 2 元乘車' },
      { id: 'all', label: '全民交通津貼' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2012, 6], level: 'elderly' },
    ],
    effects: {
      off: {},
      elderly: { cost: 15, welfare: 1.5, pm10: -0.3 },
      all: { cost: 60, welfare: 2.5, attract: 0.01, pm10: -1 },
    },
  },
  {
    id: 'cycling',
    category: 'transport',
    area: 'environment',
    label: '鼓勵單車',
    description: '興建單車徑和泊車位，鼓勵短途以單車代步。',
    levels: [
      { id: 'off', label: '一般' },
      { id: 'on', label: '鼓勵' },
    ],
    availableFrom: [1997, 7],
    real: [{ from: [1997, 7], level: 'off' }],
    effects: { off: {}, on: { cost: 5, pm10: -0.8, welfare: 0.5 } },
  },
  {
    id: 'freeKG',
    category: 'social',
    area: 'education',
    label: '免費幼稚園',
    description: '資助半日制幼稚園課程，減輕年輕家庭負擔。',
    levels: [
      { id: 'off', label: '不推行' },
      { id: 'on', label: '推行' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2017, 9], level: 'on' },
    ],
    effects: { off: {}, on: { cost: 50, welfare: 1.5, attract: 0.008 } },
  },
  {
    id: 'primaryCare',
    category: 'social',
    area: 'care',
    label: '地區基層醫療',
    description: '在各區設立康健中心，提供預防和慢性病管理，減少入院。',
    levels: [
      { id: 'off', label: '不設' },
      { id: 'on', label: '設立' },
    ],
    availableFrom: [1997, 7],
    real: [
      { from: [1997, 7], level: 'off' },
      { from: [2019, 9], level: 'on' },
    ],
    effects: { off: {}, on: { cost: 15, welfare: 2 } },
  },
  {
    id: 'evPromo',
    category: 'environment',
    area: 'environment',
    label: '電動車推廣',
    description: '資助充電設施和電動車，減少路邊廢氣。',
    levels: [
      { id: 'off', label: '現有措施' },
      { id: 'on', label: '加強' },
    ],
    availableFrom: [1997, 7],
    real: [{ from: [1997, 7], level: 'off' }],
    effects: { off: {}, on: { cost: 20, pm10: -2.5 } },
  },
  {
    id: 'wasteCharge',
    category: 'environment',
    area: 'environment',
    unpopular: { on: 3 },
    label: '垃圾徵費',
    description: '按量徵收垃圾費，減少廢物，延遲堆填區擴建，但市民要多付一筆錢。',
    levels: [
      { id: 'off', label: '不徵收' },
      { id: 'on', label: '徵收' },
    ],
    availableFrom: [1997, 7],
    real: [{ from: [1997, 7], level: 'off' }],
    effects: { off: {}, on: { cost: -8, green: 0.3, welfare: -0.5 } },
  },
]

export const POLICY_BY_ID: Record<string, PolicyDef> = Object.fromEntries(POLICIES.map((p) => [p.id, p]))
