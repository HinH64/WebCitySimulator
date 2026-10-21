import { HISTORY_CHOICES } from '../src/data/events'
import { nextRandom } from '../src/engine/rng'
import { FOLLOW_HISTORY, type Strategy } from '../src/engine/sim'
import { INDICATORS, type Allocation } from '../src/engine/types'

export function ALL_IN(k: (typeof INDICATORS)[number]): Strategy {
  return {
    allocate: () => {
      const a = Object.fromEntries(INDICATORS.map((i) => [i, 0])) as Allocation
      a[k] = 20
      return a
    },
    choose: FOLLOW_HISTORY.choose,
  }
}

/** Real allocation with `n` points moved from one indicator to another. */
export function SHIFT(to: (typeof INDICATORS)[number], from: (typeof INDICATORS)[number], n: number): Strategy {
  return {
    allocate: (s) => {
      const real = FOLLOW_HISTORY.allocate(s)
      const moved = Math.min(n, real[from])
      return { ...real, [from]: real[from] - moved, [to]: real[to] + moved }
    },
    choose: FOLLOW_HISTORY.choose,
  }
}

export function randomStrategy(seed: number): Strategy {
  let state = seed * 7919 + 1
  const r = () => {
    const [v, next] = nextRandom(state)
    state = next
    return v
  }
  return {
    allocate: () => {
      const a = Object.fromEntries(INDICATORS.map((i) => [i, 0])) as Allocation
      for (let i = 0; i < 20; i++) a[INDICATORS[Math.floor(r() * INDICATORS.length)]]++
      return a
    },
    choose: (_s, p) => p.options[Math.floor(r() * p.options.length)].id,
  }
}

/** Weights points by how much each indicator needs help, the model's own diminishing-returns logic. */
export const NEED_WEIGHTED: Strategy = {
  allocate: (s) => {
    const w = INDICATORS.map((k) => (1.5 - s.values[k] / 100) ** 2)
    const total = w.reduce((a, b) => a + b, 0)
    const a = Object.fromEntries(INDICATORS.map((k, i) => [k, Math.floor((w[i] / total) * 20)])) as Allocation
    let left = 20 - INDICATORS.reduce((sum, k) => sum + a[k], 0)
    const order = [...INDICATORS].sort((x, y) => s.values[x] - s.values[y])
    for (let i = 0; left > 0; i++, left--) a[order[i % order.length]]++
    return a
  },
  choose: (_s, p) => {
    const opts = p.kind === 'history' ? HISTORY_CHOICES.find((c) => c.id === p.id)!.options : p.options
    let best = opts[0]
    let bestValue = -Infinity
    for (const o of opts) {
      const v = o.effects.reduce((sum, e) => sum + e.v, 0)
      if (v > bestValue) {
        bestValue = v
        best = o
      }
    }
    return best.id
  },
}
