/**
 * Downloads official Hong Kong statistics and writes src/data/official.ts.
 *
 * Census and Statistics Department (C&SD) tables come from its JSON API, life expectancy from the
 * Department of Health's open data CSV. Years not yet published are filled from the latest partial
 * data and marked as estimates. Run with `npm run data:official`.
 */
import { writeFileSync } from 'node:fs'

const FIRST_YEAR = 1997
const LAST_YEAR = 2026
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
const OUT = new URL('../src/data/official.ts', import.meta.url)

const LIFE_CSV =
  'https://www.dh.gov.hk/datagovhk/ncdd/Life%20Expectancy%20at%20Birth%20by%20Sex,%201971%20to%202024%20(EN).csv'

async function csd(id) {
  const res = await fetch(`https://www.censtatd.gov.hk/api/get.php?id=${id}&lang=en&full_series=1`)
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
  const json = await res.json()
  if (!json.dataSet?.length) throw new Error(`${id}: ${JSON.stringify(json.header?.status ?? json).slice(0, 200)}`)
  return json.dataSet
}

const isProvisional = (row) => String(row.sd_value ?? '').split(',').includes('p')
const num = (row) => (row && row.figure !== '' && !Number.isNaN(Number(row.figure)) ? Number(row.figure) : undefined)
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d

/** Rows matching every field in `where`, keyed by period. */
function byPeriod(rows, where) {
  const out = new Map()
  for (const r of rows) if (Object.entries(where).every(([k, v]) => r[k] === v)) out.set(r.period, r)
  return out
}

/**
 * Builds one series. `official(year)` returns `{ value, provisional }` when the year is published;
 * `estimate(year)` fills the remaining years and returns undefined when it cannot.
 */
function series(name, { official, estimate, decimals, tables, estimateNote }) {
  const values = []
  const provisional = []
  const estimated = []
  for (const y of YEARS) {
    const o = official(y)
    if (o) {
      values.push(round(o.value, decimals))
      if (o.provisional) provisional.push(y)
      continue
    }
    const e = estimate?.(y, values)
    if (e === undefined) throw new Error(`${name}: no data for ${y}`)
    values.push(round(e, decimals))
    estimated.push(y)
  }
  return { tables, values, provisional, estimated, ...(estimated.length ? { estimateNote } : {}) }
}

/** A yearly value from a table, as `{ value, provisional }`. */
function fromRow(row, scale = 1) {
  const v = num(row)
  return v === undefined ? undefined : { value: v * scale, provisional: isProvisional(row) }
}

// ---- Population (C&SD 110-01001, 110-01003) ----

const popRows = await csd('110-01001')
const popTotal = byPeriod(popRows, { SEX: '', AGE: '', svDesc: "Number ('000)" })
const popShare = popRows.filter((r) => r.SEX === '' && r.AGE !== '' && r.svDesc === '% of total population')

function ageShare(year, test) {
  const rows = popShare.filter((r) => r.period === `${year}06` && test(parseInt(r.AGEDesc, 10)))
  if (!rows.length) return undefined
  return { value: rows.reduce((a, r) => a + Number(r.figure), 0), provisional: rows.some(isProvisional) }
}

const growth = await csd('110-01003')
const births = byPeriod(growth, { sv: 'BIRTHS_PRO' })
const deaths = byPeriod(growth, { sv: 'DEATHS_PRO' })

/** Calendar-year births or deaths: the 12 months to December, else the 12 months to June. */
function vital(map, name) {
  return series(name, {
    tables: ['110-01003'],
    decimals: 2,
    official: (y) => fromRow(map.get(`${y}12`), 0.1),
    estimate: (y) => num(map.get(`${y}06`)) / 10,
    estimateNote: '未有全年數字的年份，用截至該年 6 月的 12 個月數字',
  })
}

// ---- Households (C&SD 130-06601, checked against 130-06602) ----

// The published average (130-06602) has one decimal and starts in 2002, so the average is computed
// from households by size instead, counting "6 and over" as this many people.
const SIX_AND_OVER = 6.5
const hhBySize = (await csd('130-06601')).filter((r) => r.svDesc === "No. ('000)")
const hhPublished = byPeriod(await csd('130-06602'), { LQTYPE: '', freq: 'Y' })

function householdSize(freq, period) {
  const g = Object.fromEntries(
    hhBySize.filter((r) => r.freq === freq && r.period === period).map((r) => [r.HHSIZEDesc, num(r)]),
  )
  if (!g.Total) return undefined
  const people = [1, 2, 3, 4, 5].reduce((a, k) => a + k * g[k], 0) + SIX_AND_OVER * g['6 and over']
  return people / g.Total
}

for (const [period, row] of hhPublished) {
  const v = householdSize('Y', period)
  if (period >= String(FIRST_YEAR) && Math.abs(v - num(row)) > 0.05)
    throw new Error(`household size ${period}: computed ${v.toFixed(2)}, published ${row.figure}`)
}

// ---- Labour force (C&SD 210-06101, 210-06203, 210-06703) ----

const lf = await csd('210-06101')
const urYear = byPeriod(lf, { sv: 'UR', SEX: '', freq: 'Y' })
const urQuarter = byPeriod(lf, { sv: 'UR', SEX: '', freq: 'M3M' })

/** Mean of the non-overlapping three-month periods (Mar, Jun, Sep, Dec) published for a year. */
function quarterMean(map, year) {
  const xs = ['03', '06', '09', '12'].map((m) => num(map.get(`${year}${m}`))).filter((x) => x !== undefined)
  return xs.length ? mean(xs) : undefined
}

const eduWhere = (freq, edu) => ({ AGE: '', SEX: '', freq, EDUDesc: edu })
const lfEdu = await csd('210-06203')
const eiEdu = await csd('210-06703')
const LF_NUMBER = "No. ('000)"

function postSecondaryShare(freq, period) {
  const pick = (rows, sv, edu) =>
    num(byPeriod(rows, { ...eduWhere(freq, edu), sv, svDesc: LF_NUMBER }).get(period))
  const ps = pick(lfEdu, 'LF', 'Post-secondary') + pick(eiEdu, 'EI', 'Post-secondary')
  const all = pick(lfEdu, 'LF', 'Total') + pick(eiEdu, 'EI', 'Total')
  return Number.isNaN(ps / all) ? undefined : (ps / all) * 100
}

// ---- GDP and prices (C&SD 310-31001, 510-60001) ----

const gdp = await csd('310-31001')
const gdpPc = byPeriod(gdp, { sv: 'CURPGDP', freq: 'Y', svDesc: 'HK$' })
const gdpGrowthQ = byPeriod(gdp, { sv: 'CUR', freq: 'Q', svDesc: 'Year-on-year % change' })

const cpiRows = await csd('510-60001')
const cpiYear = byPeriod(cpiRows, { sv: 'CC_CM_1920', freq: 'Y', svDesc: 'Index' })
const cpiMonth = byPeriod(cpiRows, { sv: 'CC_CM_1920', freq: 'M', svDesc: 'Index' })
const cpiBase = num(cpiYear.get(String(FIRST_YEAR)))

// ---- Life expectancy (Department of Health) ----

const lifeRes = await fetch(LIFE_CSV)
if (!lifeRes.ok) throw new Error(`life expectancy: HTTP ${lifeRes.status}`)
const life = new Map()
for (const line of (await lifeRes.text()).split(/\r?\n/)) {
  const [y, m, f] = line.split(',')
  if (/^\d{4}$/.test(y)) life.set(Number(y), (Number(m) + Number(f)) / 2)
}

// ---- Private housing (Rating and Valuation Department open data) ----

/** Rows of an RVD CSV (title line, then a header line), keyed by header name. */
async function rvd(file) {
  const res = await fetch(`https://www.rvd.gov.hk/datagovhk/${file}`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  const split = (line) => [...line.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].map((m) => (m[2] ?? m[1]).trim()).slice(0, -1)
  const [, header, ...lines] = (await res.text()).split(/\r?\n/).filter((l) => l.trim())
  const names = split(header)
  return lines.map((l) => Object.fromEntries(split(l).map((v, i) => [names[i], v])))
}

const value = (s) => (s && !Number.isNaN(Number(s)) ? Number(s) : undefined)
const priceYear = new Map((await rvd('1.4A.csv')).map((r) => [Number(r.Year), r]))
// Months as "MM-YYYY".
const priceMonth = new Map((await rvd('1.4M.csv')).map((r) => [r.Month, r]))
const monthPrice = (y, m) => value(priceMonth.get(`${String(m).padStart(2, '0')}-${y}`)?.['All Classes'])

// Stock at year end; the game uses mid-year, so the mean of two year ends.
const privateEnd = new Map((await rvd('Private_Domestic-Stock.csv')).map((r) => [Number(r.Year), Number(r['Total (Stock)'])]))
const completions = new Map((await rvd('Private_Domestic-Completions.csv')).map((r) => [Number(r.Year), r]))

// The stock falls by 85,000 between the 2002 and 2003 year ends although 26,000 flats were completed:
// village houses stopped being counted. Earlier year ends are scaled down by the share they made up.
const VILLAGE_BREAK = 2003
const villageScale =
  privateEnd.get(VILLAGE_BREAK) /
  (privateEnd.get(VILLAGE_BREAK - 1) + Number(completions.get(VILLAGE_BREAK)['Total (Completions)']))
for (const [y, v] of privateEnd) if (y < VILLAGE_BREAK) privateEnd.set(y, v * villageScale)

/** A year end not yet published: the last one plus this year's completions so far, scaled to the whole year. */
function privateEndEstimate(y) {
  const r = completions.get(y)
  const upTo = r?.['Total (Completions) - Remarks']?.match(/up to \d{2}\.(\d{2})\.\d{4}/)
  if (!r || !upTo || !privateEnd.has(y - 1)) return undefined
  return privateEnd.get(y - 1) + (Number(r['Total (Completions)']) * 12) / Number(upTo[1])
}

// ---- Public housing (transcribed; no single open dataset covers 1997–2026) ----

/**
 * Public rental housing and subsidised sale flats at end-March (thousands): C&SD Hong Kong Annual
 * Digest of Statistics, table "Stock of permanent living quarters by type and area", 2010–2014
 * editions (PDF) for 1999–2013 and 2019 and 2025 editions (CSV) for 2014–2025, where overlapping
 * editions agree; 2026 from the Housing Authority's Housing in Figures 2026.
 */
const PUBLIC_STOCK = {
  1999: [705.8, 270.3], 2000: [691.1, 324.7], 2001: [685.2, 380.9], 2002: [685.8, 371.7], 2003: [685.3, 396.6],
  2004: [691.5, 393.2], 2005: [709.2, 388.8], 2006: [716.9, 391.7], 2007: [717.4, 397.6], 2008: [721.6, 397.0],
  2009: [741.2, 395.8], 2010: [744.6, 392.9], 2011: [747.1, 391.2], 2012: [768.1, 390.9], 2013: [772.1, 391.6],
  2014: [781.5, 393.9], 2015: [783.2, 396.0], 2016: [786.7, 398.9], 2017: [805.4, 403.1], 2018: [812.9, 409.0],
  2019: [830.1, 418.8], 2020: [832.1, 424.1], 2021: [843.1, 429.8], 2022: [850.7, 441.7], 2023: [858.6, 448.6],
  2024: [862.5, 451.2], 2025: [870.9, 466.6], 2026: [886, 473],
}
/**
 * Households living in each (annual averages, thousands): Annual Digest 2000, table 1.10. No edition
 * still published has the 1997–1998 stock, so it is estimated from these, scaled to the 1999 stock.
 */
const PUBLIC_HOUSEHOLDS = { 1997: [714.5, 222.2], 1998: [716.6, 250.0], 1999: [720.0, 290.5] }

function publicEnd(y) {
  if (PUBLIC_STOCK[y]) return PUBLIC_STOCK[y][0] + PUBLIC_STOCK[y][1]
  const h = PUBLIC_HOUSEHOLDS[y]
  if (!h) return undefined
  const [s, b] = [PUBLIC_STOCK[1999], PUBLIC_HOUSEHOLDS[1999]]
  return h[0] * (s[0] / b[0]) + h[1] * (s[1] / b[1])
}

/** Mid-year stock from end-March figures: a quarter of the way to the next end-March. */
function publicMidYear(y) {
  const now = publicEnd(y)
  const next = publicEnd(y + 1) ?? now + (now - publicEnd(y - 1))
  return now + (next - now) / 4
}

// ---- Public finances (C&SD 340-47011, 340-47012; Treasury monthly results), HK$ million by financial year ----

// A financial year runs from April; the game files it under the calendar year it starts in.
const revenueRows = await csd('340-47011')
const spendingRows = await csd('340-47012')
const csdRevenue = byPeriod(revenueRows, { REV_TYPEDesc: 'Total' })
const csdSpending = byPeriod(spendingRows, { EXP_TYPEDesc: 'Total' })

/** The Treasury's monthly results for one financial year (rows Apr–latest month), or undefined if not published. */
async function treasuryYear(fy) {
  const res = await fetch(`https://www.try.gov.hk/internet/trymthfinr/press_release_${fy}-${String((fy + 1) % 100).padStart(2, '0')}_e.csv`)
  if (!res.ok) return undefined
  const [header, ...lines] = (await res.text()).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const names = header.split(',').map((n) => n.trim())
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [names[i], v.trim()])))
}
const treasury = new Map()
for (let fy = 2019; ; fy++) {
  const rows = await treasuryYear(fy)
  if (!rows) break
  treasury.set(fy, rows)
}

const cumulative = (row) => ({
  revenue: Number(row['Cumulative Consolidated Revenue for the financial year']),
  spending: -Number(row['Cumulative Consolidated Expenditure for the financial year']),
})

/**
 * Consolidated revenue (excluding proceeds from government bonds) and expenditure for a financial
 * year: C&SD's table, else the Treasury's full year, else the months so far plus the rest of last year.
 */
function finances(fy) {
  const rev = num(csdRevenue.get(String(fy)))
  const exp = num(csdSpending.get(String(fy)))
  if (rev !== undefined && exp !== undefined) return { revenue: rev, spending: exp, estimated: false, provisional: false }
  const rows = treasury.get(fy)
  if (!rows) return undefined
  const last = rows[rows.length - 1]
  const provisional = last.Month.includes('provisional')
  if (rows.length === 12) return { ...cumulative(last), estimated: false, provisional }
  const prev = treasury.get(fy - 1)
  if (!prev || prev.length < 12) return undefined
  const [now, same, full] = [cumulative(last), cumulative(prev[rows.length - 1]), cumulative(prev[11])]
  return {
    revenue: now.revenue + full.revenue - same.revenue,
    spending: now.spending + full.spending - same.spending,
    estimated: true,
    provisional: false,
  }
}

/**
 * Fiscal reserves net of government bonds. From 2019-20 bond proceeds were added to the reserves,
 * but the real city in the game has no debt, so the reserves start from end-March 2019 and move by
 * each year's surplus before bonds (backwards for earlier years).
 */
const RESERVES_ANCHOR_FY = 2018
const reservesAnchor = Number(treasury.get(RESERVES_ANCHOR_FY + 1)[0]['Fiscal Reserves at start of the financial year'])
function reserves(fy) {
  if (fy === RESERVES_ANCHOR_FY) return reservesAnchor
  if (fy > RESERVES_ANCHOR_FY) {
    const [before, f] = [reserves(fy - 1), finances(fy)]
    return before === undefined || !f ? undefined : before + f.revenue - f.spending
  }
  const [after, f] = [reserves(fy + 1), finances(fy + 1)]
  return after === undefined || !f ? undefined : after - (f.revenue - f.spending)
}

/** Revenue codes in C&SD 340-47011 behind each of the game's revenue sources; the rest is "other". */
const REVENUE_CODES = {
  salaries: ['1115', '1113'],
  profits: ['1112'],
  rates: ['128'],
  stamp: ['124'],
  land: ['2311', '221'],
  investment: ['1361', '1362', '137'],
}
const revenueByCode = new Map()
for (const r of revenueRows) revenueByCode.set(`${r.REV_TYPE}:${r.period}`, num(r) ?? 0)

function revenueShares(fy) {
  const total = num(csdRevenue.get(String(fy)))
  if (total === undefined) return undefined
  const shares = {}
  let rest = 100
  for (const [k, codes] of Object.entries(REVENUE_CODES)) {
    shares[k] = round((100 * codes.reduce((a, c) => a + (revenueByCode.get(`${c}:${fy}`) ?? 0), 0)) / total, 1)
    rest -= shares[k]
  }
  shares.other = round(rest, 1)
  return shares
}

// ---- Interest rates (HKMA API: three-month HIBOR at the end of each month) ----

const hiborRes = await fetch(
  'https://api.hkma.gov.hk/public/market-data-and-statistics/monthly-statistical-bulletin/er-ir/hk-interbank-ir-endperiod?pagesize=1000',
)
const hiborJson = await hiborRes.json()
if (!hiborJson.header?.success || hiborJson.result.datasize >= 1000) throw new Error('HKMA HIBOR: unexpected response')
const hibor = new Map(hiborJson.result.records.map((r) => [r.end_of_month, r.ir_3m]))
const hiborMonths = (y) =>
  Array.from({ length: 12 }, (_, i) => hibor.get(`${y}-${String(i + 1).padStart(2, '0')}`)).filter((v) => typeof v === 'number')

const lastOf = (values) => values[values.length - 1]

const OFFICIAL = {
  population: series('population', {
    tables: ['110-01001'],
    decimals: 2,
    official: (y) => fromRow(popTotal.get(`${y}06`), 0.1),
  }),
  births: vital(births, 'births'),
  deaths: vital(deaths, 'deaths'),
  childShare: series('childShare', {
    tables: ['110-01001'],
    decimals: 1,
    official: (y) => ageShare(y, (lo) => lo < 15),
  }),
  elderlyShare: series('elderlyShare', {
    tables: ['110-01001'],
    decimals: 1,
    official: (y) => ageShare(y, (lo) => lo >= 65),
  }),
  householdSize: series('householdSize', {
    tables: ['130-06601', '130-06602'],
    decimals: 2,
    official: (y) => {
      const v = householdSize('Y', String(y))
      return v === undefined ? undefined : { value: v, provisional: false }
    },
    estimate: (y) => {
      const q = ['03', '06', '09', '12'].map((m) => householdSize('Q', `${y}${m}`)).filter((x) => x !== undefined)
      return q.length ? mean(q) : undefined
    },
    estimateNote: '未有全年數字的年份，用已公布季度的平均',
  }),
  unemployment: series('unemployment', {
    tables: ['210-06101'],
    decimals: 1,
    official: (y) => fromRow(urYear.get(String(y))),
    estimate: (y) => quarterMean(urQuarter, y),
    estimateNote: '未有全年數字的年份，用已公布季度的平均',
  }),
  postSecondary: series('postSecondary', {
    tables: ['210-06203', '210-06703'],
    decimals: 1,
    official: (y) => {
      const v = postSecondaryShare('Y', String(y))
      return v === undefined ? undefined : { value: v, provisional: false }
    },
    estimate: (y) => {
      const xs = ['03', '06', '09', '12'].map((m) => postSecondaryShare('Q', `${y}${m}`)).filter((x) => x !== undefined)
      return xs.length ? mean(xs) : undefined
    },
    estimateNote: '未有全年數字的年份，用已公布季度的平均',
  }),
  gdpPerCapita: series('gdpPerCapita', {
    tables: ['310-31001'],
    decimals: 1,
    official: (y) => fromRow(gdpPc.get(String(y)), 0.001),
    estimate: (y, values) => {
      const g = ['03', '06', '09', '12'].map((m) => num(gdpGrowthQ.get(`${y}${m}`))).filter((x) => x !== undefined)
      const popGrowth = num(popTotal.get(`${y}06`)) / num(popTotal.get(`${y - 1}06`))
      return g.length ? (lastOf(values) * (1 + mean(g) / 100)) / popGrowth : undefined
    },
    estimateNote: '未有全年數字的年份，用上一年數字乘以已公布季度的本地生產總值按年增長，再按人口增長調整',
  }),
  cpi: series('cpi', {
    tables: ['510-60001'],
    decimals: 3,
    official: (y) => {
      const r = cpiYear.get(String(y))
      return r && { value: num(r) / cpiBase, provisional: isProvisional(r) }
    },
    estimate: (y) => {
      const xs = Array.from({ length: 12 }, (_, i) => num(cpiMonth.get(`${y}${String(i + 1).padStart(2, '0')}`)))
      const known = xs.filter((x) => x !== undefined)
      return known.length ? mean(known) / cpiBase : undefined
    },
    estimateNote: '未有全年數字的年份，用已公布月份的平均',
  }),
  publicUnits: series('publicUnits', {
    tables: ['ADS', 'HIF'],
    decimals: 2,
    official: (y) =>
      PUBLIC_STOCK[y] && PUBLIC_STOCK[y + 1] ? { value: publicMidYear(y) / 10, provisional: false } : undefined,
    estimate: (y) => (publicEnd(y) === undefined ? undefined : publicMidYear(y) / 10),
    estimateNote:
      '1997–1998 年沒有存量數字，按住在公屋和資助出售單位的住戶數，以 1999 年的存量比例推算；最近一年要用下一年 3 月的數字，按上一年的增幅推算',
  }),
  privateUnits: series('privateUnits', {
    tables: ['RVD'],
    decimals: 2,
    official: (y) =>
      privateEnd.has(y - 1) && privateEnd.has(y)
        ? { value: (privateEnd.get(y - 1) + privateEnd.get(y)) / 2 / 10000, provisional: false }
        : undefined,
    estimate: (y) => {
      const end = privateEndEstimate(y)
      return end === undefined ? undefined : (privateEnd.get(y - 1) + end) / 2 / 10000
    },
    estimateNote:
      '2003 年起差估署的存量不再包括村屋，之前的數字按 2003 年的比例調低；年底存量未公布的年份，用上一年底存量加今年至今的落成量（按全年比例）推算',
  }),
  priceIndex: series('priceIndex', {
    tables: ['RVD'],
    decimals: 1,
    official: (y) => {
      const r = priceYear.get(y)
      const v = value(r?.['All Classes'])
      return v === undefined ? undefined : { value: v, provisional: r['All Classes - Remarks'] === 'P' }
    },
    estimate: (y) => {
      const xs = Array.from({ length: 12 }, (_, i) => monthPrice(y, i + 1)).filter((x) => x !== undefined)
      return xs.length ? mean(xs) : undefined
    },
    estimateNote: '未有全年數字的年份，用已公布月份的平均',
  }),
  reserves: series('reserves', {
    tables: ['340-47011', '340-47012', 'TRY'],
    decimals: 0,
    official: (y) => {
      const [f, v] = [finances(y), reserves(y)]
      return v === undefined || !f || f.estimated ? undefined : { value: v / 100, provisional: f.provisional }
    },
    estimate: (y) => {
      const v = reserves(y)
      return v === undefined ? undefined : v / 100
    },
    estimateNote: '財政年度未完結，用至今的收支加上去年同期之後的收支推算',
  }),
  expenditure: series('expenditure', {
    tables: ['340-47012', 'TRY'],
    decimals: 0,
    official: (y) => {
      const f = finances(y)
      return f && !f.estimated ? { value: f.spending / 100, provisional: f.provisional } : undefined
    },
    estimate: (y) => {
      const f = finances(y)
      return f ? f.spending / 100 : undefined
    },
    estimateNote: '財政年度未完結，用至今的開支加上去年同期之後的開支推算',
  }),
  interestRate: series('interestRate', {
    tables: ['HKMA'],
    decimals: 2,
    official: (y) => {
      const xs = hiborMonths(y)
      return xs.length === 12 ? { value: mean(xs), provisional: false } : undefined
    },
    estimate: (y) => {
      const xs = hiborMonths(y)
      return xs.length ? mean(xs) : undefined
    },
    estimateNote: '未有全年數字的年份，用已公布月份的平均',
  }),
  lifeExpectancy: series('lifeExpectancy', {
    tables: ['DH'],
    decimals: 2,
    official: (y) => (life.has(y) ? { value: life.get(y), provisional: false } : undefined),
    estimate: (_y, values) => lastOf(values),
    estimateNote: '未公布的年份沿用最近一年的數字',
  }),
}

// ---- Higher-frequency figures for statistics releases (C&SD 310-31001, 510-60001; RVD) ----

/** Values from FIRST_YEAR's first period up to the latest published one. */
function untilMissing(values) {
  const i = values.findIndex((v) => v === undefined)
  return i === -1 ? values : values.slice(0, i)
}
const periodic = (map, periods) => untilMissing(periods.map((p) => num(map.get(p))))

const quarters = YEARS.flatMap((y) => ['03', '06', '09', '12'].map((m) => `${y}${m}`))
const months = YEARS.flatMap((y) => Array.from({ length: 12 }, (_, i) => `${y}${String(i + 1).padStart(2, '0')}`))
const realGrowthQ = byPeriod(gdp, { sv: 'CON', freq: 'Q', svDesc: 'Year-on-year % change' })
const realGrowthY = byPeriod(gdp, { sv: 'CON', freq: 'Y', svDesc: 'Year-on-year % change' })
const inflationM = byPeriod(cpiRows, { sv: 'CC_CM_1920', freq: 'M', svDesc: 'Year-on-year % change' })

const RELEASES = {
  gdpGrowthQuarterly: periodic(realGrowthQ, quarters),
  gdpGrowthYearly: periodic(realGrowthY, YEARS.map(String)),
  inflationMonthly: periodic(inflationM, months),
  priceIndexMonthly: untilMissing(YEARS.flatMap((y) => Array.from({ length: 12 }, (_, i) => monthPrice(y, i + 1)))),
}

const retrieved = new Date().toISOString().slice(0, 10)
const body = Object.entries(OFFICIAL)
  .map(([id, s]) => `  ${id}: ${JSON.stringify(s)},`)
  .join('\n')

writeFileSync(
  OUT,
  `// Generated by scripts/fetch-official.mjs on ${retrieved}. Do not edit; run \`npm run data:official\`.

export interface OfficialSeries {
  /** C&SD table IDs, or a source code from SOURCES in real.ts (DH, RVD, ADS, HIF, TRY, HKMA). */
  tables: string[]
  /** Index 0 = ${FIRST_YEAR}. */
  values: number[]
  /** Years whose figures are provisional. */
  provisional: number[]
  /** Years not yet published, filled as described in estimateNote. */
  estimated: number[]
  estimateNote?: string
}

export const RETRIEVED = '${retrieved}'

export const OFFICIAL = {
${body}
} satisfies Record<string, OfficialSeries>

/**
 * Share of government revenue by source (%), one anchor per financial year at the middle of the
 * calendar year it starts in (C&SD 340-47011). Codes per source: ${JSON.stringify(REVENUE_CODES)}.
 */
export const REVENUE_SHARES = [
${YEARS.filter((y) => revenueShares(y))
  .map((y) => `  { year: ${y + 0.5}, shares: ${JSON.stringify(revenueShares(y))} },`)
  .join('\n')}
]

/** Figures for statistics releases, up to the latest published period (C&SD 310-31001, 510-60001; RVD). */
export const RELEASES = {
  /** Real GDP growth, quarterly from ${FIRST_YEAR} Q1. */
  gdpGrowthQuarterly: ${JSON.stringify(RELEASES.gdpGrowthQuarterly)},
  /** Real GDP growth, yearly from ${FIRST_YEAR}. */
  gdpGrowthYearly: ${JSON.stringify(RELEASES.gdpGrowthYearly)},
  /** Composite CPI inflation, monthly from January ${FIRST_YEAR}. */
  inflationMonthly: ${JSON.stringify(RELEASES.inflationMonthly)},
  /** RVD private domestic price index (1999 = 100), monthly from January ${FIRST_YEAR}. */
  priceIndexMonthly: ${JSON.stringify(RELEASES.priceIndexMonthly)},
}
`,
)

for (const [id, s] of Object.entries(OFFICIAL)) {
  console.log(id.padEnd(15), s.values.join(' '), s.estimated.length ? `| est ${s.estimated}` : '', s.provisional.length ? `| prov ${s.provisional}` : '')
}
