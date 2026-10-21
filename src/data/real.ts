/**
 * Real Hong Kong series, 1997–2026, one value per calendar year.
 *
 * Figures are approximations compiled from public reports and memory, because the build
 * environment cannot reach government data portals. Stage 2 replaces them with official data.
 * Every series lists its source and how reliable the current figures are.
 */

export const FIRST_YEAR = 1997
export const LAST_YEAR = 2026

export interface Series {
  label: string
  unit: string
  source: string
  note: string
  /** Index 0 = 1997. */
  values: number[]
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
  population: {
    label: '人口',
    unit: '萬',
    source: '政府統計處（年中人口）',
    note: '約數；2025–2026 年為估算',
    values: [
      649, 654, 661, 667, 671, 674, 673, 678, 681, 686, 692, 696, 697, 702, 707, 715, 718, 723, 729, 734, 739, 745,
      751, 748, 741, 735, 753, 752, 753, 755,
    ],
  },
  births: {
    label: '出生',
    unit: '萬／年',
    source: '政府統計處',
    note: '約數',
    values: [
      5.9, 5.3, 5.1, 5.4, 4.8, 4.9, 4.7, 4.9, 5.7, 6.5, 7.1, 7.8, 8.2, 8.9, 9.5, 9.1, 5.7, 6.2, 6.0, 6.1, 5.7, 5.4, 5.3,
      4.3, 3.7, 3.3, 3.3, 3.7, 3.6, 3.5,
    ],
  },
  deaths: {
    label: '死亡',
    unit: '萬／年',
    source: '政府統計處',
    note: '約數',
    values: [
      3.2, 3.3, 3.4, 3.4, 3.3, 3.5, 3.7, 3.7, 3.8, 3.7, 3.9, 4.1, 4.1, 4.2, 4.3, 4.4, 4.3, 4.6, 4.6, 4.7, 4.6, 4.8, 4.9,
      5.1, 5.1, 6.2, 5.5, 5.4, 5.5, 5.6,
    ],
  },
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
  childShare: {
    label: '0–14 歲人口比例',
    unit: '%',
    source: '政府統計處',
    note: '按人口普查年份插值的約數',
    values: anchors([
      [1997, 18.3],
      [2001, 16.5],
      [2006, 13.7],
      [2011, 11.6],
      [2016, 11.2],
      [2021, 11.0],
      [2026, 10.3],
    ]),
  },
  elderlyShare: {
    label: '65 歲或以上人口比例',
    unit: '%',
    source: '政府統計處',
    note: '按人口普查年份插值的約數',
    values: anchors([
      [1997, 10.5],
      [2001, 11.1],
      [2006, 12.4],
      [2011, 13.3],
      [2016, 16.6],
      [2021, 20.5],
      [2026, 25.0],
    ]),
  },
  householdSize: {
    label: '平均住戶人數',
    unit: '人',
    source: '政府統計處',
    note: '按人口普查年份插值的約數',
    values: anchors([
      [1997, 3.3],
      [2001, 3.1],
      [2006, 3.0],
      [2011, 2.9],
      [2016, 2.8],
      [2021, 2.7],
      [2026, 2.65],
    ]),
  },
  publicUnits: {
    label: '公營房屋單位（公屋及資助出售）',
    unit: '萬個',
    source: '房屋委員會、運輸及房屋局',
    note: '約數',
    values: [
      91, 93, 97, 101, 105, 108, 110, 111, 112, 113, 114, 115, 116, 117, 117, 118, 119, 120, 121, 122, 123, 124, 125,
      126, 127, 128, 129, 131, 133, 135,
    ],
  },
  privateUnits: {
    label: '私人住宅單位',
    unit: '萬個',
    source: '差餉物業估價署',
    note: '約數',
    values: [
      118, 121, 124, 126, 128, 131, 134, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 148, 149, 151, 153, 155,
      157, 158, 160, 162, 165, 167, 169,
    ],
  },
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
  priceIndex: {
    label: '私人住宅售價指數',
    unit: '1999=100',
    source: '差餉物業估價署（全年平均）',
    note: '約數；2025–2026 年為估算',
    values: [
      163.1, 120.5, 100, 89.9, 78, 69.9, 61.6, 78, 92, 92.7, 103.3, 120.5, 121.3, 150.9, 182.1, 206.2, 242.4, 256.9,
      296.8, 286.1, 333.9, 377, 382, 381.1, 393.3, 370.9, 343.1, 304, 292, 300,
    ],
  },
  unemployment: {
    label: '失業率',
    unit: '%',
    source: '政府統計處（全年平均）',
    note: '約數；2025–2026 年為估算',
    values: [
      2.2, 4.7, 6.2, 4.9, 5.1, 7.3, 7.9, 6.8, 5.6, 4.8, 4.0, 3.6, 5.3, 4.3, 3.4, 3.3, 3.4, 3.3, 3.3, 3.4, 3.1, 2.8, 2.9,
      5.8, 5.2, 4.3, 2.9, 3.0, 3.7, 3.8,
    ],
  },
  gdpPerCapita: {
    label: '人均本地生產總值（當時價格）',
    unit: '千港元',
    source: '政府統計處',
    note: '約數；2025–2026 年為估算',
    values: [
      210, 200, 195, 200, 197, 192, 187, 194, 207, 219, 239, 245, 238, 253, 274, 285, 298, 313, 329, 339, 360, 381, 380,
      358, 387, 382, 397, 422, 441, 457,
    ],
  },
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
  lifeExpectancy: {
    label: '出生時平均預期壽命',
    unit: '歲',
    source: '政府統計處（男女平均）',
    note: '2023–2024 年有報道核對，其餘為約數',
    values: [
      79.8, 80.1, 80.4, 80.8, 81.3, 81.4, 81.4, 81.8, 81.6, 82.4, 82.4, 82.4, 82.8, 83.0, 83.4, 83.5, 83.8, 84.0, 84.3,
      84.2, 84.7, 84.9, 85.2, 85.4, 85.6, 84.3, 85.3, 85.6, 85.8, 85.9,
    ],
  },
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
  postSecondary: {
    label: '具專上教育程度人口比例（15 歲或以上）',
    unit: '%',
    source: '政府統計處（人口普查）',
    note: '按人口普查年份插值的約數',
    values: anchors([
      [1997, 18],
      [2001, 23],
      [2006, 27],
      [2011, 32],
      [2016, 35],
      [2021, 38],
      [2026, 41],
    ]),
  },
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
  reserves: {
    label: '財政儲備',
    unit: '億港元',
    source: '財經事務及庫務局、財政預算案（該年開始的財政年度結束時）',
    note: '1997、2003、2007、2019、2023、2024 年有報道核對；2025–2026 年為估算',
    values: [
      4575, 4344, 4452, 4304, 3723, 3113, 2753, 2959, 3101, 3694, 4929, 4764, 5021, 5953, 6626, 7337, 7457, 8287, 8601,
      9363, 11029, 11709, 11602, 9023, 9533, 8171, 7332, 6543, 5800, 5800,
    ],
  },
  expenditure: {
    label: '政府總開支',
    unit: '億港元',
    source: '財政預算案',
    note: '按財政年度的約數',
    values: [
      1950, 2370, 2240, 2330, 2670, 2410, 2475, 2420, 2330, 2330, 2340, 3150, 3190, 3010, 3700, 3960, 4350, 3960, 4350,
      4730, 4710, 5320, 6070, 8070, 6450, 7250, 6330, 6800, 7000, 7100,
    ],
  },
  cpi: {
    label: '物價指數',
    unit: '1997=1',
    source: '政府統計處（綜合消費物價指數）',
    note: '約數',
    values: anchors([
      [1997, 1.0],
      [1998, 1.03],
      [1999, 0.99],
      [2000, 0.95],
      [2001, 0.93],
      [2002, 0.9],
      [2003, 0.88],
      [2004, 0.88],
      [2005, 0.89],
      [2006, 0.91],
      [2007, 0.93],
      [2008, 0.97],
      [2009, 0.98],
      [2010, 1.0],
      [2011, 1.05],
      [2012, 1.09],
      [2013, 1.13],
      [2014, 1.18],
      [2015, 1.21],
      [2016, 1.24],
      [2017, 1.26],
      [2018, 1.29],
      [2019, 1.33],
      [2020, 1.33],
      [2021, 1.36],
      [2022, 1.39],
      [2023, 1.42],
      [2024, 1.45],
      [2025, 1.47],
      [2026, 1.49],
    ]),
  },
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
