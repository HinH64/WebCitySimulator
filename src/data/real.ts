/**
 * Real Hong Kong series, 1997–2026, one value per calendar year.
 *
 * Series built with official() come from government tables via scripts/fetch-official.mjs. The rest
 * are still approximations compiled from public reports, and Stage 2 replaces them one by one.
 * Every series lists its source and how reliable the current figures are.
 */

import { OFFICIAL, type OfficialSeries } from './official'

export const FIRST_YEAR = 1997
export const LAST_YEAR = 2026

export interface Series {
  label: string
  unit: string
  source: string
  note: string
  /** Index 0 = 1997. */
  values: number[]
  /** Official tables the values come from; absent while the series is an approximation. */
  tables?: string[]
}

/** Official sources that are not C&SD tables, by the code OfficialSeries.tables uses. */
const SOURCES: Record<string, { label: string; url: string }> = {
  DH: { label: '衞生署：出生時平均預期壽命', url: 'https://data.gov.hk/tc-data/dataset/hk-dh-dh_ncddhss-ncdd-dataset-9' },
  RVD: { label: '差估署：物業市場統計', url: 'https://data.gov.hk/tc-data/dataset/hk-rvd-tsinfo_rvd-property-market-statistics' },
  ADS: {
    label: '統計處：香港統計年刊（永久性居住屋宇單位存量）',
    url: 'https://www.censtatd.gov.hk/tc/EIndexbySubject.html?pcode=B1010003&scode=460',
  },
  TRY: {
    label: '庫務署：每月財政結果',
    url: 'https://data.gov.hk/tc-data/dataset/hk-try-trymthfinr-press-release-financial-results',
  },
  HIF: {
    label: '房委會：房屋統計數字 2026',
    url: 'https://www.housingauthority.gov.hk/tc/common/pdf/about-us/publications-and-statistics/HIF2026.pdf',
  },
}

/** Link to an official source: a C&SD table ID or one of SOURCES. */
export function tableLink(table: string): { label: string; url: string } {
  return SOURCES[table] ?? { label: `統計處表 ${table}`, url: `https://www.censtatd.gov.hk/tc/web_table.html?id=${table}` }
}

/** "2025、2026" style list, collapsing runs of three or more years into a range. */
function yearList(years: number[]): string {
  const parts: string[] = []
  for (let i = 0; i < years.length; ) {
    let j = i
    while (j + 1 < years.length && years[j + 1] === years[j] + 1) j++
    parts.push(j - i >= 2 ? `${years[i]}–${years[j]}` : years.slice(i, j + 1).join('、'))
    i = j + 1
  }
  return parts.join('、')
}

function officialNote(o: OfficialSeries): string {
  const parts = ['官方數字']
  if (o.provisional.length) parts.push(`${yearList(o.provisional)} 年為臨時數字`)
  if (o.estimated.length) parts.push(`${yearList(o.estimated)} 年為估算：${o.estimateNote}`)
  return parts.join('；')
}

function official(id: keyof typeof OFFICIAL, label: string, unit: string, source: string): Series {
  const o: OfficialSeries = OFFICIAL[id]
  return { label, unit, source, note: officialNote(o), values: o.values, tables: o.tables }
}

/** Builds a yearly array by linear interpolation between anchor years. */
function anchors(points: [number, number][]): number[] {
  const out: number[] = []
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    let i = points.findIndex(([py]) => py >= y)
    if (i === -1) i = points.length - 1
    if (points[i][0] === y || i === 0) {
      out.push(points[i][1])
      continue
    }
    const [y0, v0] = points[i - 1]
    const [y1, v1] = points[i]
    if (y > y1) {
      out.push(v1)
      continue
    }
    out.push(v0 + ((v1 - v0) * (y - y0)) / (y1 - y0))
  }
  return out
}

export const REAL = {
  population: official('population', '人口', '萬', '政府統計處（年中人口）'),
  births: official('births', '出生', '萬／年', '政府統計處（按公曆年）'),
  deaths: official('deaths', '死亡', '萬／年', '政府統計處（按公曆年）'),
  oneWayPermits: {
    label: '單程證移入',
    unit: '萬／年',
    source: '入境事務處、政府統計處',
    note: '約數',
    values: [
      5.0, 5.6, 5.4, 5.8, 5.4, 4.5, 5.3, 3.8, 5.5, 5.4, 3.3, 4.2, 4.8, 4.2, 4.3, 5.5, 4.6, 4.0, 3.9, 5.7, 4.7, 4.3, 3.9,
      1.9, 1.4, 1.6, 4.2, 4.5, 4.0, 4.0,
    ],
  },
  childShare: official('childShare', '0–14 歲人口比例', '%', '政府統計處（年中人口）'),
  elderlyShare: official('elderlyShare', '65 歲或以上人口比例', '%', '政府統計處（年中人口）'),
  householdSize: official(
    'householdSize',
    '平均住戶人數',
    '人',
    '政府統計處（綜合住戶統計調查，按住戶人數分佈計算，6 人或以上按 6.5 人計，與公布的平均住戶人數一致）',
  ),
  publicUnits: official('publicUnits', '公營房屋單位（公屋及資助出售）', '萬個', '政府統計處、房屋委員會（年中，由每年 3 月底存量推算）'),
  privateUnits: official('privateUnits', '私人住宅單位', '萬個', '差餉物業估價署（年中，由年底存量推算）'),
  prhWait: {
    label: '公屋平均輪候時間',
    unit: '年',
    source: '房屋委員會（一般申請者）',
    note: '2018 年後有報道核對；1997–2010 年為約數',
    values: [
      6.0, 6.0, 5.4, 4.5, 3.6, 2.8, 2.3, 2.1, 1.9, 1.9, 1.9, 1.9, 1.9, 2.0, 2.6, 2.7, 2.9, 3.3, 3.8, 4.5, 4.7, 5.5, 5.4,
      5.5, 5.8, 6.1, 5.6, 5.3, 5.3, 4.8,
    ],
  },
  priceIndex: official('priceIndex', '私人住宅售價指數', '1999=100', '差餉物業估價署（全年平均）'),
  unemployment: official('unemployment', '失業率', '%', '政府統計處（全年平均）'),
  gdpPerCapita: official('gdpPerCapita', '人均本地生產總值（當時價格）', '千港元', '政府統計處'),
  railKm: {
    label: '鐵路網絡長度',
    unit: '公里',
    source: '港鐵、九廣鐵路（按通車年份累計）',
    note: '按通車年份估算',
    values: [
      109, 144, 144, 144, 144, 156, 187, 199, 202, 202, 210, 210, 215, 215, 215, 215, 215, 218, 218, 228, 228, 254, 254,
      260, 264, 270, 270, 270, 270, 270,
    ],
  },
  pm10: {
    label: '可吸入懸浮粒子（PM10）',
    unit: '微克/立方米',
    source: '環境保護署（一般監測站年均）',
    note: '2004、2020、2024 年有報道核對，其餘為約數',
    values: [
      50, 51, 50, 47, 50, 52, 55, 60, 55, 53, 52, 48, 45, 44, 46, 41, 45, 42, 38, 34, 34, 32, 32, 27, 26, 23, 25, 24,
      23, 23,
    ],
  },
  lifeExpectancy: official('lifeExpectancy', '出生時平均預期壽命', '歲', '衞生署（男女平均）'),
  careCapacity: {
    label: '公營病床及資助安老宿位',
    unit: '萬個',
    source: '醫院管理局、社會福利署',
    note: '按少數年份插值的約數',
    values: anchors([
      [1997, 4.6],
      [2007, 5.2],
      [2017, 5.8],
      [2026, 6.3],
    ]),
  },
  postSecondary: official(
    'postSecondary',
    '具專上教育程度人口比例（15 歲或以上）',
    '%',
    '政府統計處（綜合住戶統計調查，勞動人口加非從事經濟活動人口）',
  ),
  greenShare: {
    label: '郊野公園及保護區佔土地比例',
    unit: '%',
    source: '漁農自然護理署',
    note: '約數；2023 年加入紅花嶺郊野公園',
    values: anchors([
      [1997, 41],
      [2022, 41],
      [2023, 41.4],
      [2026, 41.4],
    ]),
  },
  reserves: official(
    'reserves',
    '財政儲備（扣除發債所得）',
    '億港元',
    '庫務署、政府統計處（該年開始的財政年度結束時）。2019 年起政府把發債所得計入儲備，但遊戲中真實的香港沒有債務，所以由 2019 年 3 月底的官方儲備開始，按每年未計發債的綜合盈餘向前和向後推算',
  ),
  expenditure: official('expenditure', '政府總開支', '億港元', '政府統計處、庫務署（綜合開支，按財政年度）'),
  cpi: official('cpi', '物價指數', '1997=1', '政府統計處（綜合消費物價指數，全年平均）'),
  interestRate: {
    label: '市場利率',
    unit: '%',
    source: '香港金融管理局（銀行同業拆息約數）',
    note: '約數',
    values: [
      6, 7, 6, 6.5, 3.5, 1.8, 1.2, 1.0, 3.5, 4.5, 4.2, 2.5, 0.5, 0.3, 0.3, 0.4, 0.4, 0.4, 0.4, 0.6, 1.0, 1.8, 2.0, 0.8,
      0.2, 2.5, 4.5, 4.2, 3.5, 3.0,
    ],
  },
} satisfies Record<string, Series>

export type SeriesId = keyof typeof REAL

export function yearValue(id: SeriesId, year: number): number {
  const v = REAL[id].values
  return v[Math.min(v.length - 1, Math.max(0, year - FIRST_YEAR))]
}

/** Government revenue implied by spending and the change in reserves, so the real path is exact. */
export function realRevenue(year: number): number {
  if (year <= FIRST_YEAR) return yearValue('expenditure', year)
  return yearValue('expenditure', year) + yearValue('reserves', year) - yearValue('reserves', year - 1)
}
