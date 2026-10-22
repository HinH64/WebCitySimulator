import type { TileKind } from '../data/mapProjects'

/** Plain map colours after the Planning Department's land use legend; the same in light and dark themes. */
export const KIND_COLOUR: Record<TileKind, string> = {
  sea: '#cfe0ee',
  private: '#d9776a',
  public: '#e8a24a',
  village: '#c9a27e',
  commercial: '#b0569a',
  industrial: '#8f7fb8',
  sciencePark: '#5f86c9',
  logistics: '#a39a87',
  institution: '#86acd0',
  park: '#9ccc84',
  road: '#b2b2b2',
  rail: '#6b6b6b',
  airport: '#bdbdc6',
  port: '#7d8799',
  cemetery: '#adb5a3',
  utility: '#b3aba0',
  construction: '#e6dcaa',
  otherUrban: '#cfc6bc',
  farm: '#dce7a3',
  fishPond: '#a5d0d8',
  woodland: '#4f8f58',
  shrubGrass: '#86b36f',
  wetland: '#68ab97',
  barren: '#d2c9b6',
  water: '#76acdf',
}

/** Legend for the land use layer: kinds that read as one group share a swatch. */
export const LAND_LEGEND: { label: string; kinds: TileKind[] }[] = [
  { label: '公營房屋', kinds: ['public'] },
  { label: '私人住宅', kinds: ['private'] },
  { label: '鄉村', kinds: ['village'] },
  { label: '商業', kinds: ['commercial'] },
  { label: '工業', kinds: ['industrial'] },
  { label: '科學園、工業邨', kinds: ['sciencePark'] },
  { label: '貨倉、露天貯物', kinds: ['logistics'] },
  { label: '政府及社區', kinds: ['institution'] },
  { label: '休憩', kinds: ['park'] },
  { label: '機場', kinds: ['airport'] },
  { label: '港口', kinds: ['port'] },
  { label: '建造中、空置', kinds: ['construction'] },
  { label: '農地', kinds: ['farm'] },
  { label: '魚塘', kinds: ['fishPond'] },
  { label: '林地', kinds: ['woodland'] },
  { label: '灌木、草地', kinds: ['shrubGrass'] },
  { label: '水塘、河道', kinds: ['water'] },
]

/** Sequential scales for the data layers, light to dark. */
export const DENSITY_SCALE = ['#fde5cf', '#f8b98b', '#ec8150', '#cf5128', '#9c2f12']
export const PRICE_SCALE = ['#efedf8', '#d2cdec', '#aea4dc', '#8a7bc9', '#6853b0', '#47328c']

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** Colour at position f (0–1) of a scale, stepped so the legend can show each band. */
export function scaleColour(scale: string[], f: number): string {
  return scale[Math.min(scale.length - 1, Math.max(0, Math.floor(f * scale.length)))]
}
