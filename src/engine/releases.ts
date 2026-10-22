import { RELEASES as OFFICIAL } from '../data/official'
import { FIRST_YEAR, yearValue } from '../data/real'
import { realMetrics } from './metrics'
import { START_YEAR, monthIndex, monthOf, yearOf } from './time'
import type { GameState, Metrics, NewsItem, StatsPoint } from './types'

/**
 * Statistics releases: the city's figures, published on the government's schedule (unemployment
 * and prices monthly, GDP quarterly, mid-year population every August). GDP, prices and population
 * start from the official figures and add how far the city has moved from history, so a city that
 * follows history reads the real headlines. Only notable figures make the news. Releases report and
 * never change anything or draw random numbers, so they also run with city events off.
 */

type Release = Required<Pick<NewsItem, 'text' | 'tone'>>

/** Change in the three-month unemployment rate since the last report that makes the news (points). */
const UNEMPLOYMENT_STEP = 0.5
/** GDP comes out two months after each quarter: the fourth quarter in February, the first in May and so on. */
const GDP_MONTHS = [2, 5, 8, 11]
const QUARTER = ['', '第一季', '第二季', '第三季', '第四季']
const STRONG_GROWTH = 0.06
/**
 * Inflation bands (three-month average, %). Leaving a band takes a clear move back, so a rate
 * hovering at a threshold, or a one-off relief measure, is not reported again and again.
 */
const INFLATION = { highFrom: 4, highUntil: 3, deflationFrom: -0.3, deflationUntil: 0.5 }
/** A fall in property prices over a year that makes the news; reported again once prices recover half of it. */
const PRICE_FALL = -0.1
/** Months between reports of new record property prices. */
const PRICE_HIGH_GAP = 24

const FORMATS = [0, 1].map((d) => new Intl.NumberFormat('zh-HK', { minimumFractionDigits: d, maximumFractionDigits: d }))

function fmt(v: number, d: 0 | 1 = 1): string {
  return FORMATS[d].format(v)
}

const pct = (v: number) => fmt(Math.abs(v) * 100)

/** A logged figure at month t; before the game starts the city is history itself. */
function at(s: GameState, key: keyof StatsPoint, t: number): number {
  if (t >= 0) return s.statsLog[t][key]
  return key === 'gdpRatio' || key === 'perCapitaRatio' || key === 'priceRatio' ? 1 : 0
}

/** Index into the monthly official series (January 1997 = 0) for month t. */
const calendarMonth = (t: number) => (yearOf(t) - FIRST_YEAR) * 12 + monthOf(t) - 1

/** Mean of a logged figure over the n months ending at month t. */
function avg(s: GameState, key: keyof StatsPoint, t: number, n: number): number {
  let sum = 0
  for (let k = t - n + 1; k <= t; k++) sum += at(s, key, k)
  return sum / n
}

/** Monthly: the latest three-month rate, when it has moved half a point since the last report. */
function unemployment(s: GameState, t: number): Release | undefined {
  if (t < 2) return undefined
  const u = avg(s, 'unemployment', t, 3)
  const last = s.releases.unemployment
  if (!last) {
    s.releases.unemployment = { t, v: u }
    return undefined
  }
  const diff = u - last.v
  if (Math.abs(diff) < UNEMPLOYMENT_STEP || t - last.t < 3) return undefined
  s.releases.unemployment = { t, v: u }
  const up = diff > 0
  // The last month the rate was at least this high (or low).
  let k = t - 1
  while (k >= 2 && (up ? avg(s, 'unemployment', k, 3) < u : avg(s, 'unemployment', k, 3) > u)) k--
  const word = up ? '最高' : '最低'
  const years = Math.floor((t - k) / 12)
  const record = k < 2 && t >= 36 ? `，是 ${START_YEAR} 年以來${word}` : years >= 3 ? `，是 ${years} 年來${word}` : ''
  const since = t - last.t <= 12 ? `${t - last.t} 個月前` : `${yearOf(last.t)} 年 ${monthOf(last.t)} 月`
  return {
    text: `最新失業率為 ${fmt(u)}%，比 ${since}的 ${fmt(last.v)}% ${up ? '上升' : '下降'} ${fmt(Math.abs(diff))} 個百分點${record}。`,
    tone: up ? 'bad' : 'good',
  }
}

/** Quarterly: contractions, recoveries and strong growth; every February also the whole of last year. */
function gdp(s: GameState, t: number): Release | undefined {
  const month = monthOf(t)
  if (!GDP_MONTHS.includes(month)) return undefined
  const end = t - 2
  const q = monthOf(end) / 3
  const official = OFFICIAL.gdpGrowthQuarterly[(yearOf(end) - FIRST_YEAR) * 4 + q - 1]
  if (official === undefined) return undefined
  const g = (1 + official / 100) * (avg(s, 'gdpRatio', end, 3) / avg(s, 'gdpRatio', end - 12, 3)) - 1
  const last = s.releases.gdp
  const shrinking = g < 0 ? (last && last.v < 0 ? (last.n ?? 0) : 0) + 1 : 0
  s.releases.gdp = { t, v: g, n: shrinking }

  let note: Release | undefined
  if (g < 0) {
    note =
      shrinking === 1
        ? { text: `經濟轉差：${QUARTER[q]}按年實質收縮 ${pct(g)}%。`, tone: 'bad' }
        : { text: `經濟連續 ${shrinking} 季收縮，${QUARTER[q]}按年實質收縮 ${pct(g)}%。`, tone: 'bad' }
  } else if (last && last.v < 0) {
    note = { text: `經濟重拾增長：${QUARTER[q]}按年實質增長 ${pct(g)}%。`, tone: 'good' }
  } else if (g >= STRONG_GROWTH && (!last || last.v < STRONG_GROWTH)) {
    note = { text: `經濟強勁增長：${QUARTER[q]}按年實質增長 ${pct(g)}%。`, tone: 'good' }
  }

  const year = yearOf(t) - 1
  const yearly = OFFICIAL.gdpGrowthYearly[year - FIRST_YEAR]
  if (month !== 2 || yearly === undefined) return note
  const dec = monthIndex(year, 12)
  const y = (1 + yearly / 100) * (avg(s, 'gdpRatio', dec, 12) / avg(s, 'gdpRatio', dec - 12, 12)) - 1
  const perCapita = (yearValue('gdpPerCapita', year) * avg(s, 'perCapitaRatio', dec, 12)) / 10
  return {
    text: `${year} 年經濟實質${y >= 0 ? '增長' : '收縮'} ${pct(y)}%，人均本地生產總值約 ${fmt(perCapita)} 萬元。${note?.text ?? ''}`,
    tone: note?.tone ?? (y >= 0 ? 'neutral' : 'bad'),
  }
}

/** Monthly, for the three months to last month: prices moving into or out of deflation or high inflation. */
function prices(s: GameState, t: number): Release | undefined {
  const i = calendarMonth(t - 1)
  const recent = OFFICIAL.inflationMonthly.slice(i - 2, i + 1)
  if (i < 2 || recent.length < 3) return undefined
  const inflation = (recent[0] + recent[1] + recent[2]) / 3
  const was = s.releases.prices?.v
  let band = was ?? 0
  if (inflation < INFLATION.deflationFrom) band = -1
  else if (inflation >= INFLATION.highFrom) band = 1
  else if (band === -1 && inflation >= INFLATION.deflationUntil) band = 0
  else if (band === 1 && inflation < INFLATION.highUntil) band = 0
  if (was === undefined) {
    s.releases.prices = { t, v: band }
    return undefined
  }
  if (band === was) return undefined
  s.releases.prices = { t, v: band }
  const x = fmt(Math.abs(inflation))
  if (band < 0) return { text: `綜合消費物價指數按年下跌 ${x}%，香港出現通縮。`, tone: 'bad' }
  if (band > 0) return { text: `通脹升溫，綜合消費物價指數按年上升 ${x}%。`, tone: 'bad' }
  return was < 0
    ? { text: `通縮結束，綜合消費物價指數按年回升 ${x}%。`, tone: 'good' }
    : { text: `通脹回落，綜合消費物價指數按年上升 ${x}%。`, tone: 'good' }
}

/** The city's property price index for month t: the official monthly index times the city's ratio to history. */
function cityPrice(s: GameState, t: number): number | undefined {
  const i = calendarMonth(t)
  const official = i >= 0 ? OFFICIAL.priceIndexMonthly[i] : undefined
  return official === undefined ? undefined : official * at(s, 'priceRatio', t)
}

/**
 * Monthly, for last month: property prices above every earlier month (the 1997 peak at first, so
 * only from mid-1998), or down 10% in a year.
 */
function property(s: GameState, t: number): Release | undefined {
  const index = cityPrice(s, t - 1)
  const yearAgo = cityPrice(s, t - 13)
  if (index === undefined || yearAgo === undefined) return undefined
  const yoy = index / yearAgo - 1

  // The highest index of any earlier month since January 1997, kept as a running value.
  let peak = s.releases.pricePeak?.v
  if (peak === undefined) {
    peak = 0
    for (let k = monthIndex(FIRST_YEAR, 1); k < t - 1; k++) peak = Math.max(peak, cityPrice(s, k) ?? 0)
  }
  s.releases.pricePeak = { t, v: Math.max(peak, index) }
  const high = s.releases.priceHigh
  if (index > peak && t >= 12 && (!high || t - high.t >= PRICE_HIGH_GAP)) {
    s.releases.priceHigh = { t, v: index }
    return high
      ? { text: `樓價再創新高，私人住宅售價指數升至 ${fmt(index, 0)}，一年上升 ${pct(yoy)}%。`, tone: 'neutral' }
      : { text: `私人住宅售價指數升至 ${fmt(index, 0)}，超越 ${START_YEAR} 年的高位。`, tone: 'neutral' }
  }

  const falling = s.releases.priceFall?.v === 1
  if (falling && yoy > PRICE_FALL / 2) s.releases.priceFall = { t, v: 0 }
  if (!falling && yoy <= PRICE_FALL) {
    s.releases.priceFall = { t, v: 1 }
    return { text: `樓價一年下跌 ${pct(yoy)}%，私人住宅售價指數跌至 ${fmt(index, 0)}。`, tone: 'bad' }
  }
  return undefined
}

/** Every August: the mid-year population, its ageing, and last year's births (births follow real history). */
function population(s: GameState, t: number): Release | undefined {
  const year = yearOf(t)
  if (monthOf(t) !== 8 || year - 1 < FIRST_YEAR) return undefined
  const june = monthIndex(year, 6)
  const pop = yearValue('population', year) + at(s, 'popGap', june)
  const change = pop - yearValue('population', year - 1) - at(s, 'popGap', june - 12)
  const elderly = yearValue('elderlyShare', year) + at(s, 'elderlyGap', june)
  const births = yearValue('births', year - 1)
  let fewest = year - 1 >= FIRST_YEAR + 3
  for (let y = FIRST_YEAR; y < year - 1; y++) if (yearValue('births', y) <= births) fewest = false
  return {
    text:
      `年中人口 ${fmt(pop)} 萬，一年${change >= 0 ? '增加' : '減少'} ${fmt(Math.abs(change))} 萬；` +
      `65 歲或以上佔 ${fmt(elderly)}%。${year - 1} 年出生嬰兒 ${fmt(Math.round(births * 100) * 100, 0)} 名` +
      `${fewest ? `，是 ${FIRST_YEAR} 年以來最少` : ''}。`,
    tone: change < 0 ? 'bad' : 'neutral',
  }
}

const RELEASE_CHECKS = [unemployment, gdp, prices, property, population]

/** Records this month's figures and publishes whatever statistics come out this month. */
export function publishReleases(s: GameState, m: Metrics) {
  const t = s.t
  const real = realMetrics(t)
  s.statsLog[t] = {
    gdpRatio: m.gdp / real.gdp,
    perCapitaRatio: m.gdpPerCapita / real.gdpPerCapita,
    popGap: m.population - real.population,
    elderlyGap: (100 * m.elderly) / m.population - (100 * real.elderly) / real.population,
    unemployment: m.unemployment,
    priceRatio: m.priceIndex / real.priceIndex,
  }
  for (const check of RELEASE_CHECKS) {
    const r = check(s, t)
    if (r) s.news.push({ t, kind: 'stats', ...r })
  }
}
