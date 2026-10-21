/**
 * Five-sector economy. Each year a sector grows at the economy's real rate plus a deviation;
 * deviations are normalised so the real economy's total growth stays as it was. A city with a
 * different mix therefore feels the same historical shocks differently.
 */

export const SECTORS = ['finance', 'trade', 'tourism', 'professional', 'local'] as const
export type SectorId = (typeof SECTORS)[number]

export const SECTOR_LABEL: Record<SectorId, string> = {
  finance: '金融',
  trade: '貿易物流',
  tourism: '旅遊',
  professional: '專業服務及創科',
  local: '本地服務及地產',
}

/** Share of GDP in 1997 (%), approximate. */
export const SECTOR_SHARE_1997: Record<SectorId, number> = {
  finance: 12,
  trade: 24,
  tourism: 4,
  professional: 11,
  local: 49,
}

type Dev = Partial<Record<SectorId, number>>

/** Long-run trends (percentage points of growth relative to the whole economy). */
function trend(year: number): Dev {
  return {
    finance: 2.0,
    trade: year >= 2009 ? -1.5 : 0,
    tourism: year >= 2004 && year <= 2018 ? 3 : 0,
    professional: 0.5,
    local: -0.3,
  }
}

/** Historical shocks by year (percentage points relative to the whole economy). */
const SHOCKS: Record<number, Dev> = {
  1998: { finance: -8, local: -3 },
  2001: { trade: -4 },
  2003: { tourism: -20, local: -2 },
  2008: { finance: -5 },
  2009: { finance: -4, trade: -10 },
  2015: { tourism: -5 },
  2016: { tourism: -3 },
  2019: { tourism: -15, local: -3 },
  2020: { tourism: -70, local: -5 },
  2021: { tourism: -10 },
  2022: { tourism: -10, local: -3 },
  2023: { tourism: 80 },
  2024: { tourism: 10 },
}

/** Raw sector deviation in percentage points for one year (before normalisation). */
export function sectorDeviation(year: number): Record<SectorId, number> {
  const t = trend(year)
  const s = SHOCKS[year] ?? {}
  const out = {} as Record<SectorId, number>
  for (const k of SECTORS) out[k] = (t[k] ?? 0) + (s[k] ?? 0)
  return out
}
