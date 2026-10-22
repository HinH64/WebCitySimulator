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
  lifeExpectancy: series('lifeExpectancy', {
    tables: ['DH'],
    decimals: 2,
    official: (y) => (life.has(y) ? { value: life.get(y), provisional: false } : undefined),
    estimate: (_y, values) => lastOf(values),
    estimateNote: '未公布的年份沿用最近一年的數字',
  }),
}

const retrieved = new Date().toISOString().slice(0, 10)
const body = Object.entries(OFFICIAL)
  .map(([id, s]) => `  ${id}: ${JSON.stringify(s)},`)
  .join('\n')

writeFileSync(
  OUT,
  `// Generated by scripts/fetch-official.mjs on ${retrieved}. Do not edit; run \`npm run data:official\`.

export interface OfficialSeries {
  /** C&SD table IDs, or 'DH' for the Department of Health. */
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
`,
)

for (const [id, s] of Object.entries(OFFICIAL)) {
  console.log(id.padEnd(15), s.values.join(' '), s.estimated.length ? `| est ${s.estimated}` : '', s.provisional.length ? `| prov ${s.provisional}` : '')
}
