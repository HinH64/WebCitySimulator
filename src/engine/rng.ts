/** mulberry32: small, fast, deterministic. The state is a plain number so it can live in GameState. */
export function nextRandom(state: number): [value: number, nextState: number] {
  const s = (state + 0x6d2b79f5) | 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, s]
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

/** Seeds are shown to players as short codes, so accept any string and hash it. */
export function seedFromText(text: string): number {
  const trimmed = text.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) % 4294967296
  let h = 2166136261
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
