import type { Rating } from '../engine/endings'

export interface PastTerm {
  at: string
  seed: number
  title: string
  rating: Rating
  total: number
  endYear: number
}

export type Speed = 'slow' | 'normal' | 'fast'

export interface Settings {
  /** Pause after every N years; 0 never pauses. */
  periodic: 0 | 1 | 3 | 5
  pauseOnChoice: boolean
  pauseOnCrisis: boolean
  pauseWhileEditing: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  periodic: 0,
  pauseOnChoice: false,
  pauseOnCrisis: true,
  pauseWhileEditing: false,
}

const TERMS_KEY = 'parallel-hk.terms.v2'
const SPEED_KEY = 'parallel-hk.speed.v1'
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
  const s = read<string>(SPEED_KEY, 'normal')
  return s === 'slow' || s === 'fast' ? s : 'normal'
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
