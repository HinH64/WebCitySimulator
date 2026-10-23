export interface PastTerm {
  at: string
  seed: number
  title: string
  /** How many of the six indicators beat real Hong Kong. */
  betterThanReal: number
  endYear: number
}

/** How many times faster than 1×, which is 1.6 seconds a month. */
export const SPEEDS = [1, 2, 4, 8, 12, 16] as const
export type Speed = (typeof SPEEDS)[number]

export interface Settings {
  /** Pause after every N years; 0 never pauses. */
  periodic: 0 | 1 | 3 | 5
  pauseOnChoice: boolean
  pauseOnCrisis: boolean
  pauseWhileEditing: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  periodic: 0,
  pauseOnChoice: true,
  pauseOnCrisis: true,
  pauseWhileEditing: false,
}

const TERMS_KEY = 'parallel-hk.terms.v4'
const SPEED_KEY = 'parallel-hk.speed.v2'
/** Before 1×–16×: slow, normal and fast. */
const OLD_SPEED_KEY = 'parallel-hk.speed.v1'
const OLD_SPEED: Record<string, Speed> = { slow: 1, normal: 2, fast: 4 }
const DEFAULT_SPEED: Speed = 2
const SETTINGS_KEY = 'parallel-hk.settings.v1'
const MAX_TERMS = 20

// Storage can be unavailable (private mode, blocked site data); the game must work without it.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function loadTerms(): PastTerm[] {
  const terms = read<PastTerm[]>(TERMS_KEY, [])
  return Array.isArray(terms) ? terms : []
}

export function saveTerm(term: PastTerm) {
  write(TERMS_KEY, [term, ...loadTerms()].slice(0, MAX_TERMS))
}

export function clearTerms() {
  write(TERMS_KEY, [])
}

export function loadSpeed(): Speed {
  const s = read<unknown>(SPEED_KEY, null)
  if (SPEEDS.includes(s as Speed)) return s as Speed
  return OLD_SPEED[read<string>(OLD_SPEED_KEY, '')] ?? DEFAULT_SPEED
}

export function saveSpeed(speed: Speed) {
  write(SPEED_KEY, speed)
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(SETTINGS_KEY, {})
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }
}

export function saveSettings(settings: Settings) {
  write(SETTINGS_KEY, settings)
}

export type MapLayer = 'land' | 'density' | 'price' | 'rail'

export interface MapPrefs {
  /** Whether the map card is open above the news (wide screens). */
  open: boolean
  layer: MapLayer
  /** Outline the city's own developments. */
  mine: boolean
  projection: 'plan' | 'iso'
}

const MAP_KEY = 'parallel-hk.map.v1'
const MAP_LAYERS: MapLayer[] = ['land', 'density', 'price', 'rail']

export function loadMapPrefs(): MapPrefs {
  const p = read<Partial<MapPrefs>>(MAP_KEY, {})
  return {
    open: typeof p?.open === 'boolean' ? p.open : true,
    layer: p && MAP_LAYERS.includes(p.layer as MapLayer) ? (p.layer as MapLayer) : 'land',
    mine: typeof p?.mine === 'boolean' ? p.mine : false,
    projection: p?.projection === 'plan' ? 'plan' : 'iso',
  }
}

export function saveMapPrefs(prefs: MapPrefs) {
  write(MAP_KEY, prefs)
}
