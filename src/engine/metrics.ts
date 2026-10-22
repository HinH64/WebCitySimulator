import type { DeptId } from '../data/budget'
import type { SectorId } from '../data/sectors'
import { cpiAt, levelAt, realFelt, realGdp, realSectors, realTaxes } from './real'
import type { Deviations, GameState, Metrics } from './types'

/** Share of migrants by age group. */
const MIGRANT_CHILD = 0.15
const MIGRANT_WORKING = 0.8
const MIGRANT_ELDERLY = 0.05
/** Public housing allocations per year (萬), used to turn extra units into shorter waits. */
const ALLOCATIONS_PER_YEAR = 2.5
/** Share of extra households that queue for public housing. */
const QUEUEING_SHARE = 0.35

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export type MetricInput = Pick<GameState, 'dev' | 'quality' | 'taxes' | 'policyLevels' | 'sectors'>

export function computeMetrics(s: MetricInput, t: number): Metrics {
  const { dev, quality: q } = s
  const popReal = levelAt('population', t)
  const population = popReal + dev.pop
  const childShare = levelAt('childShare', t) / 100
  const elderlyShare = levelAt('elderlyShare', t) / 100
  const childrenReal = popReal * childShare
  const elderlyReal = popReal * elderlyShare
  const workingReal = popReal - childrenReal - elderlyReal
  const children = childrenReal + MIGRANT_CHILD * dev.pop
  const elderly = elderlyReal + MIGRANT_ELDERLY * dev.pop
  const working = workingReal + MIGRANT_WORKING * dev.pop

  const householdSize = levelAt('householdSize', t)
  const households = population / householdSize
  const householdsReal = popReal / householdSize
  const publicUnits = levelAt('publicUnits', t) + dev.publicUnits
  const privateUnits = levelAt('privateUnits', t) + dev.privateUnits
  const prhWait = clamp(
    levelAt('prhWait', t) - (dev.publicUnits - QUEUEING_SHARE * (households - householdsReal)) / ALLOCATIONS_PER_YEAR,
    0.3,
    15,
  )
  const priceIndex = levelAt('priceIndex', t) * Math.exp(dev.lnPrice)

  const uReal = levelAt('unemployment', t) / 100
  const labourRatio = working / workingReal
  const jobsRatio = Math.exp(0.3 * dev.lnProductivity) * Math.pow(labourRatio, 0.8)
  const uMarket = clamp(1 - ((1 - uReal) * jobsRatio) / labourRatio, 0.012, 0.3)
  const unemployment = clamp(uMarket * 100 + s.policyLevels.unemployment, 1.2, 30)
  const employedRatio = (labourRatio * (1 - unemployment / 100)) / (1 - uReal)
  const gdp = realGdp(t) * Math.exp(dev.lnProductivity) * Math.pow(employedRatio, 0.6)
  const gdpPerCapita = gdp / (population * 0.1)
  const cpi = cpiAt(t)

  const railKm = levelAt('railKm', t) + dev.rail
  const gdpRatio = gdp / realGdp(t)
  const pm10 = Math.max(
    5,
    levelAt('pm10', t) * Math.pow(gdpRatio, 0.3) + dev.pm10 + s.policyLevels.pm10 + (1 - q.environment) * 10,
  )
  const careCapacity = (levelAt('careCapacity', t) + dev.care) * (0.5 + 0.5 * q.health)

  return {
    population,
    children,
    working,
    elderly,
    households,
    publicUnits,
    privateUnits,
    prhWait,
    priceIndex,
    // Rates are charged on rent, so each point above the real rate adds about 1% to the cost of housing.
    affordability: (priceIndex / (gdpPerCapita / 210)) * (1 + (s.taxes.rates - realTaxes(t).rates) / 100),
    unemployment,
    gdp,
    gdpPerCapita,
    realGdpPerCapita: gdpPerCapita / cpi,
    railKm,
    railPerMillion: railKm / (population / 100),
    pm10,
    green: levelAt('greenShare', t) + dev.green + s.policyLevels.green,
    lifeExpectancy: levelAt('lifeExpectancy', t) + dev.lifeExpectancy,
    careCapacity,
    carePerThousandElderly: (careCapacity / elderly) * 1000,
    postSecondary: levelAt('postSecondary', t) + dev.postSecondary,
    professionalShare: s.sectors.professional * 100,
    sectors: s.sectors,
    taxes: { ...s.taxes },
  }
}

export function zeroDeviations(): Deviations {
  return {
    pop: 0,
    publicUnits: 0,
    privateUnits: 0,
    rail: 0,
    care: 0,
    postSecondary: 0,
    pm10: 0,
    green: 0,
    lnProductivity: 0,
    lnPrice: 0,
    priceShift: 0,
    lifeExpectancy: 0,
  }
}

export function fullQuality(): Record<DeptId, number> {
  return { housing: 1, transport: 1, economy: 1, education: 1, health: 1, environment: 1 }
}

const realCache: Metrics[] = []
const realEndCache: Metrics[] = []

function realAt(t: number, sectorMonth: number): Metrics {
  return computeMetrics(
    {
      dev: zeroDeviations(),
      quality: fullQuality(),
      taxes: realTaxes(t),
      policyLevels: { unemployment: 0, welfare: 0, attract: 0, pm10: 0, green: 0 },
      sectors: realSectors(sectorMonth) as Record<SectorId, number>,
    },
    t,
  )
}

/** The city as it really was at the start of month t. */
export function realMetrics(t: number): Metrics {
  return (realCache[t] ??= realAt(t, t))
}

/** The city as it really was at the end of month t, to compare with the state after a step. */
export function realMetricsEnd(t: number): Metrics {
  return (realEndCache[t] ??= realAt(t, t + 1))
}

export interface Attractiveness {
  total: number
  factors: { jobs: number; income: number; housing: number; services: number; environment: number; tax: number; policy: number }
}

/** How attractive the city is to live in, relative to how it really was at the same time (1 = same). */
export function attractiveness(
  m: Metrics,
  real: Metrics,
  s: Pick<GameState, 'quality' | 'felt' | 'policyLevels' | 'dev'>,
  t: number,
): Attractiveness {
  const feltReal = realFelt(t)
  const factors = {
    jobs: Math.pow((1 - m.unemployment / 100) / (1 - real.unemployment / 100), 1.5),
    income: Math.pow(m.gdpPerCapita / real.gdpPerCapita, 0.5),
    housing:
      Math.pow(real.prhWait / m.prhWait, 0.08) *
      Math.pow(real.affordability / m.affordability, 0.2) *
      Math.pow(feltReal.rates / s.felt.rates, 0.05) *
      (0.9 + 0.1 * s.quality.housing),
    services:
      Math.pow(m.carePerThousandElderly / real.carePerThousandElderly, 0.1) *
      (0.9 + 0.1 * s.quality.health) *
      (1 + 0.002 * s.dev.postSecondary),
    environment: Math.pow(real.pm10 / m.pm10, 0.1) * (1 + 0.005 * (m.green - real.green)),
    tax: Math.pow(feltReal.salaries / s.felt.salaries, 0.2),
    policy: 1 + s.policyLevels.attract,
  }
  const total = Object.values(factors).reduce((a, b) => a * b, 1)
  return { total, factors }
}
