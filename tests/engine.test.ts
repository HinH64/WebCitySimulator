import { describe, expect, it } from 'vitest'
import { HISTORY_CHOICES, HISTORY_EVENTS, PARALLEL_EVENTS } from '../src/data/events'
import { METRICS, POPULATION, REAL_ALLOCATION } from '../src/data/history'
import { computeResult } from '../src/engine/endings'
import { realScores } from '../src/engine/model'
import { FOLLOW_HISTORY, isValidAllocation, playThrough } from '../src/engine/sim'
import { END_YEAR, INDICATORS, PERIOD_STARTS, START_YEAR } from '../src/engine/types'
import { ALL_IN, SHIFT, randomStrategy } from './strategies'

const YEARS = END_YEAR - START_YEAR + 1

describe('data', () => {
  it('has one value per year for every series', () => {
    for (const m of METRICS) expect(m.series, m.id).toHaveLength(YEARS)
    expect(POPULATION).toHaveLength(YEARS)
  })

  it('keeps real scores inside 0–100', () => {
    for (let y = START_YEAR; y <= END_YEAR; y++) {
      for (const k of INDICATORS) {
        const v = realScores(y)[k]
        expect(v, `${k} ${y}`).toBeGreaterThanOrEqual(0)
        expect(v, `${k} ${y}`).toBeLessThanOrEqual(100)
      }
    }
  })

  it('has a valid real allocation for every period', () => {
    expect(REAL_ALLOCATION.map((p) => p.year)).toEqual([...PERIOD_STARTS])
    for (const p of REAL_ALLOCATION) expect(isValidAllocation(p.alloc), String(p.year)).toBe(true)
  })

  it('gives every historical choice a real option and unique ids', () => {
    const ids = new Set<string>()
    for (const c of HISTORY_CHOICES) {
      expect(c.options.some((o) => o.id === c.realOptionId), c.id).toBe(true)
      expect(ids.has(c.id), c.id).toBe(false)
      ids.add(c.id)
    }
    for (const e of PARALLEL_EVENTS) {
      expect(ids.has(e.id), e.id).toBe(false)
      ids.add(e.id)
      expect(Boolean(e.options) !== Boolean(e.effects), `${e.id} needs options or effects, not both`).toBe(true)
    }
  })

  it('only gates history events on choices made earlier', () => {
    for (const ev of HISTORY_EVENTS) {
      for (const choiceId of Object.keys(ev.requires ?? {})) {
        const ch = HISTORY_CHOICES.find((c) => c.id === choiceId)
        expect(ch, `${ev.id} -> ${choiceId}`).toBeDefined()
        expect(ch!.year * 12 + ch!.month, ev.id).toBeLessThan(ev.year * 12 + ev.month)
      }
    }
  })
})

describe('simulation', () => {
  it('reproduces real history when following the real allocation and choices', () => {
    for (const seed of [1, 42, 123456]) {
      const s = playThrough(seed, FOLLOW_HISTORY)
      expect(s.status).toBe('ended')
      expect(s.endedEarly).toBeUndefined()
      expect(s.year).toBe(END_YEAR)
      for (let y = START_YEAR; y <= END_YEAR; y++) {
        for (const k of INDICATORS) expect(s.trail[y][k], `${k} ${y}`).toBeCloseTo(realScores(y)[k], 6)
      }
      expect(s.news.some((n) => n.kind === 'parallel')).toBe(false)
      const r = computeResult(s)
      expect(r.title).toBe('歷史重演')
      for (const m of r.metrics) expect(m.yours, m.id).toBeCloseTo(m.real, 6)
    }
  })

  it('is deterministic for the same seed and strategy', () => {
    const a = playThrough(7, ALL_IN('housing'))
    const b = playThrough(7, ALL_IN('housing'))
    expect(a.trail).toEqual(b.trail)
    expect(a.news).toEqual(b.news)
  })

  it('keeps every score inside 0–100 under random play', () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = playThrough(seed, randomStrategy(seed))
      for (const scores of Object.values(s.trail)) {
        for (const k of INDICATORS) {
          expect(Number.isFinite(scores[k])).toBe(true)
          expect(scores[k]).toBeGreaterThanOrEqual(0)
          expect(scores[k]).toBeLessThanOrEqual(100)
        }
      }
    }
  })

  it('moves the favoured indicator above history', () => {
    const s = playThrough(3, SHIFT('environment', 'livelihood', 3))
    const r = computeResult(s)
    expect(r.gaps.environment).toBeGreaterThan(5)
  })
})
