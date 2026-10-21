import type { Allocation, IndicatorKey } from '../engine/types'

export interface MetricDef {
  id: string
  k: IndicatorKey
  label: string
  unit: string
  /** Values mapped to score 0 and score 100. */
  worst: number
  best: number
  /** Hard limits when converting a score gap back into real units. */
  min: number
  max: number
  decimals: number
  source: string
  note: string
  /** Index 0 = 1997, last = 2026. */
  series: number[]
}

/**
 * Phase-1 figures are approximations compiled from public reports and memory, because the
 * build environment cannot reach government data portals. Each series must be replaced with
 * official data in phase 2 (see docs/PLAN.md).
 */
export const METRICS: MetricDef[] = [
  {
    id: 'prhWait',
    k: 'housing',
    label: '公屋平均輪候時間',
    unit: '年',
    worst: 7,
    best: 1.5,
    min: 0.5,
    max: 12,
    decimals: 1,
    source: '房屋委員會（一般申請者平均輪候時間，年底或最新季度）',
    note: '2018 年後的數字有報道核對；1997–2010 年為約數；2026 年為最新季度數字',
    series: [
      6.0, 6.0, 5.4, 4.5, 3.6, 2.8, 2.3, 2.1, 1.9, 1.9, 1.9, 1.9, 1.9, 2.0, 2.6, 2.7, 2.9, 3.3, 3.8, 4.5,
      4.7, 5.5, 5.4, 5.5, 5.8, 6.1, 5.6, 5.3, 5.3, 4.8,
    ],
  },
  {
    id: 'priceIndex',
    k: 'housing',
    label: '私人住宅售價指數',
    unit: '（1999=100）',
    worst: 420,
    best: 60,
    min: 30,
    max: 600,
    decimals: 0,
    source: '差餉物業估價署（私人住宅售價指數，全年平均）',
    note: '約數；2025–2026 年為估算',
    series: [
      163.1, 120.5, 100, 89.9, 78, 69.9, 61.6, 78, 92, 92.7, 103.3, 120.5, 121.3, 150.9, 182.1, 206.2, 242.4,
      256.9, 296.8, 286.1, 333.9, 377, 382, 381.1, 393.3, 370.9, 343.1, 304, 292, 300,
    ],
  },
  {
    id: 'unemployment',
    k: 'economy',
    label: '失業率',
    unit: '%',
    worst: 9,
    best: 2,
    min: 1,
    max: 20,
    decimals: 1,
    source: '政府統計處（經季節性調整失業率，全年平均）',
    note: '約數；2025–2026 年為估算',
    series: [
      2.2, 4.7, 6.2, 4.9, 5.1, 7.3, 7.9, 6.8, 5.6, 4.8, 4.0, 3.6, 5.3, 4.3, 3.4, 3.3, 3.4, 3.3, 3.3, 3.4, 3.1,
      2.8, 2.9, 5.8, 5.2, 4.3, 2.9, 3.0, 3.7, 3.8,
    ],
  },
  {
    id: 'gdpPerCapita',
    k: 'economy',
    label: '人均本地生產總值',
    unit: '千港元',
    worst: 150,
    best: 500,
    min: 80,
    max: 900,
    decimals: 0,
    source: '政府統計處（按當時市價計算）',
    note: '約數；2025–2026 年為估算',
    series: [
      210, 200, 195, 200, 197, 192, 187, 194, 207, 219, 239, 245, 238, 253, 274, 285, 298, 313, 329, 339, 360,
      381, 380, 358, 387, 382, 397, 422, 441, 457,
    ],
  },
  {
    id: 'railKm',
    k: 'transport',
    label: '鐵路網絡長度',
    unit: '公里',
    worst: 80,
    best: 320,
    min: 60,
    max: 500,
    decimals: 0,
    source: '港鐵公司、九廣鐵路（按各綫通車年份累計）',
    note: '按通車年份估算，包括輕鐵、機場快綫及高鐵香港段',
    series: [
      109, 144, 144, 144, 144, 156, 187, 199, 202, 202, 210, 210, 215, 215, 215, 215, 215, 218, 218, 228, 228,
      254, 254, 260, 264, 270, 270, 270, 270, 270,
    ],
  },
  {
    id: 'pm10',
    k: 'environment',
    label: '可吸入懸浮粒子（PM10）年均濃度',
    unit: '微克/立方米',
    worst: 65,
    best: 15,
    min: 5,
    max: 120,
    decimals: 0,
    source: '環境保護署（一般空氣質素監測站）',
    note: '2004、2020、2024 年有報道核對，其餘為約數',
    series: [
      50, 51, 50, 47, 50, 52, 55, 60, 55, 53, 52, 48, 45, 44, 46, 41, 45, 42, 38, 34, 34, 32, 32, 27, 26, 23,
      25, 24, 23, 23,
    ],
  },
  {
    id: 'lifeExpectancy',
    k: 'livelihood',
    label: '出生時平均預期壽命',
    unit: '歲',
    worst: 76,
    best: 90,
    min: 70,
    max: 95,
    decimals: 1,
    source: '政府統計處（男女平均）',
    note: '2023–2024 年有報道核對，其餘為約數；2025–2026 年為估算',
    series: [
      79.8, 80.1, 80.4, 80.8, 81.3, 81.4, 81.4, 81.8, 81.6, 82.4, 82.4, 82.4, 82.8, 83.0, 83.4, 83.5, 83.8, 84.0,
      84.3, 84.2, 84.7, 84.9, 85.2, 85.4, 85.6, 84.3, 85.3, 85.6, 85.8, 85.9,
    ],
  },
  {
    id: 'reserves',
    k: 'finance',
    label: '財政儲備',
    unit: '億港元',
    worst: 0,
    best: 12000,
    min: 0,
    max: 30000,
    decimals: 0,
    source: '財經事務及庫務局、財政預算案（該年開始的財政年度結束時）',
    note: '1997、2003、2007、2019、2023、2024 年有報道核對，其餘為約數；2025–2026 年為估算',
    series: [
      4575, 4344, 4452, 4304, 3723, 3113, 2753, 2959, 3101, 3694, 4929, 4764, 5021, 5953, 6626, 7337, 7457, 8287,
      8601, 9363, 11029, 11709, 11602, 9023, 9533, 8171, 7332, 6543, 5800, 5800,
    ],
  },
]

/** Mid-year population in millions; context only, not simulated. */
export const POPULATION = [
  6.49, 6.54, 6.61, 6.67, 6.71, 6.74, 6.73, 6.78, 6.81, 6.86, 6.92, 6.96, 6.97, 7.02, 7.07, 7.15, 7.18, 7.23, 7.29,
  7.34, 7.39, 7.45, 7.51, 7.48, 7.41, 7.35, 7.53, 7.52, 7.53, 7.55,
]

/**
 * The real government's focus per period, estimated from spending shares by policy area and the
 * period's major commitments. It is the baseline the player's allocation is measured against.
 */
export const REAL_ALLOCATION: { year: number; alloc: Allocation; summary: string }[] = [
  {
    year: 1997,
    alloc: { housing: 5, economy: 3, transport: 4, environment: 1, livelihood: 6, finance: 1 },
    summary: '八萬五建屋目標、機場核心計劃收尾、應對金融風暴',
  },
  {
    year: 2002,
    alloc: { housing: 2, economy: 4, transport: 3, environment: 2, livelihood: 6, finance: 3 },
    summary: '財赤下削減開支、停建居屋、振興經濟',
  },
  {
    year: 2007,
    alloc: { housing: 2, economy: 3, transport: 5, environment: 2, livelihood: 5, finance: 3 },
    summary: '十大基建、改善空氣、庫房回復盈餘',
  },
  {
    year: 2012,
    alloc: { housing: 4, economy: 2, transport: 4, environment: 2, livelihood: 6, finance: 2 },
    summary: '復建居屋、長遠房屋策略、擴大社會福利',
  },
  {
    year: 2017,
    alloc: { housing: 3, economy: 4, transport: 3, environment: 2, livelihood: 7, finance: 1 },
    summary: '醫療安老開支上升、疫情紓困、儲備開始下跌',
  },
  {
    year: 2022,
    alloc: { housing: 5, economy: 4, transport: 3, environment: 2, livelihood: 6, finance: 0 },
    summary: '簡約公屋、北部都會區、連年財赤',
  },
]
