import { DEPARTMENTS, TAXES, TAX_INFO, type DeptId } from '../src/data/budget'
import { POLICIES } from '../src/data/policies'
import { demandRows } from '../src/engine/demand'
import { realFunding } from '../src/engine/real'
import { nextRandom } from '../src/engine/rng'
import { FOLLOW_HISTORY, baselines, debtTotal, metricsNow, setFunding, setPolicy, setTax, type Strategy } from '../src/engine/sim'
import { monthOf } from '../src/engine/time'

export { FOLLOW_HISTORY }

/** Never touches anything and lets every decision expire. */
export const UNTOUCHED: Strategy = { choose: () => undefined }

/** Real choices, with every department held at one funding level. */
export function allFunding(level: number): Strategy {
  return {
    onMonth: (s) => {
      for (const d of DEPARTMENTS) setFunding(s, d, level)
    },
    choose: FOLLOW_HISTORY.choose,
  }
}

/** Real funding except one department. */
export function boost(dept: DeptId, level: number): Strategy {
  return {
    onMonth: (s) => {
      FOLLOW_HISTORY.onMonth!(s)
      setFunding(s, dept, level)
    },
    choose: FOLLOW_HISTORY.choose,
  }
}

/** Real funding with low taxes. */
export const TAX_CUT: Strategy = {
  onMonth: (s) => {
    FOLLOW_HISTORY.onMonth!(s)
    setTax(s, 'salaries', 10)
    setTax(s, 'profits', 10)
  },
  choose: FOLLOW_HISTORY.choose,
}

const ROW_DEPT: Record<string, DeptId> = {
  housing: 'housing',
  jobs: 'economy',
  transport: 'transport',
  care: 'health',
  education: 'education',
  environment: 'environment',
}

/**
 * Reads the demand panel every January and moves 4% of department spending from the calmer
 * departments to the two most pressing needs, keeping the budget balanced like a careful player.
 */
export const THOUGHTFUL: Strategy = {
  onMonth: (s) => {
    if (s.t > 0 && monthOf(s.t) !== 1) return
    const m = metricsNow(s)
    const rows = demandRows(s, m).sort((a, b) => b.severity - a.severity)
    const base = baselines(s.t, m)
    for (const d of DEPARTMENTS) setFunding(s, d, realFunding(d, s.t))
    const priority = rows.slice(0, 2).map((r) => ROW_DEPT[r.id])
    const others = DEPARTMENTS.filter((d) => !priority.includes(d))
    const shift = 0.04 * DEPARTMENTS.reduce((a, d) => a + base[d] * s.funding[d], 0)
    for (const d of priority) setFunding(s, d, s.funding[d] + shift / 2 / base[d])
    const othersBase = others.reduce((a, d) => a + base[d], 0)
    for (const d of others) setFunding(s, d, Math.max(0.95, s.funding[d] - shift / othersBase))
  },
  choose: FOLLOW_HISTORY.choose,
}

/** A demand-led government that also invests in jobs and housing while it has a year's buffer. */
export const SKILLED: Strategy = {
  onMonth: (s) => {
    THOUGHTFUL.onMonth!(s)
    if (s.t > 0 && monthOf(s.t) !== 1) return
    if (s.reserves - debtTotal(s) < s.last.spendingTotal * 12) return
    setFunding(s, 'economy', Math.max(s.funding.economy, 1.4))
    setFunding(s, 'housing', Math.max(s.funding.housing, realFunding('housing', s.t) + 0.3))
  },
  choose: THOUGHTFUL.choose,
}

/** Follow history except for one policy, including when a historical decision sets that policy. */
export function withPolicy(id: string, level: string): Strategy {
  return {
    onMonth: (s) => {
      FOLLOW_HISTORY.onMonth!(s)
      setPolicy(s, id, level)
    },
    choose: FOLLOW_HISTORY.choose,
  }
}

/** Random funding, taxes and policies every year; random answers. */
export function randomStrategy(seed: number): Strategy {
  let state = seed * 7919 + 1
  const r = () => {
    const [v, next] = nextRandom(state)
    state = next
    return v
  }
  return {
    onMonth: (s) => {
      if (s.t > 0 && monthOf(s.t) !== 1) return
      for (const d of DEPARTMENTS) setFunding(s, d, 0.6 + r() * 1.0)
      for (const k of TAXES) setTax(s, k, TAX_INFO[k].min + r() * (TAX_INFO[k].max - TAX_INFO[k].min) * 0.5)
      for (const p of POLICIES) if (r() < 0.3) setPolicy(s, p.id, p.levels[Math.floor(r() * p.levels.length)].id)
    },
    choose: (_s, item) => item.options[Math.floor(r() * item.options.length)].id,
  }
}
