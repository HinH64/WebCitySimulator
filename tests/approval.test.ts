import { describe, expect, it } from 'vitest'
import { APPROVAL } from '../src/engine/approval'
import { computeResult } from '../src/engine/endings'
import { answer, newGame, playThrough, setFunding, setPolicy, setTax, step } from '../src/engine/sim'
import { yearOf } from '../src/engine/time'
import type { GameState } from '../src/engine/types'
import { FOLLOW_HISTORY, THOUGHTFUL, UNTOUCHED, allFunding } from './strategies'

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const lowest = (g: GameState) => Math.min(...g.snapshots.map((s) => s.approval))

describe('approval', () => {
  it('keeps a government that follows history in office', () => {
    for (const events of [true, false]) {
      for (const seed of SEEDS) {
        const g = playThrough(seed, FOLLOW_HISTORY, { events })
        expect(g.endedEarly, `seed ${seed}`).toBeUndefined()
        expect(lowest(g), `seed ${seed}`).toBeGreaterThanOrEqual(40)
      }
    }
  })

  it('removes a government that never acts, around the late 2000s', () => {
    for (const seed of SEEDS) {
      const g = playThrough(seed, UNTOUCHED)
      expect(g.endedEarly?.cause, `seed ${seed}`).toBe('approval')
      expect(yearOf(g.endedEarly!.t)).toBeGreaterThanOrEqual(2004)
      expect(yearOf(g.endedEarly!.t)).toBeLessThanOrEqual(2010)
    }
  })

  it('keeps a government that reads the demand panel in office', () => {
    for (const seed of SEEDS) expect(playThrough(seed, THOUGHTFUL).endedEarly, `seed ${seed}`).toBeUndefined()
  })

  it('removes a government that starves every department, however many decisions it answers', () => {
    expect(playThrough(1, allFunding(0.7)).endedEarly?.cause).toBe('approval')
  })

  it('only ends the term; the city is the same until then', () => {
    const removed = playThrough(3, UNTOUCHED)
    const kept = playThrough(3, UNTOUCHED, { removal: false })
    expect(kept.endedEarly).toBeUndefined()
    expect(kept.news.some((n) => n.text.includes('你被迫下台'))).toBe(false)
    // The last snapshot of the removed city is the month it ended, not a year end.
    const years = removed.snapshots.length - 1
    expect(years).toBeGreaterThan(5)
    expect(removed.snapshots.slice(0, years)).toEqual(kept.snapshots.slice(0, years))
  })

  it('says why the term ended', () => {
    const g = playThrough(1, UNTOUCHED)
    const r = computeResult(g)
    expect(r.title).toBe('被迫下台')
    expect(r.summary[0].text).toContain('被迫下台')
    expect(r.approval.length).toBe(r.trend.length)
    expect(g.news.some((n) => n.text.includes('如果一年內未能回升'))).toBe(true)
    expect(g.news[g.news.length - 1].text).toContain('你被迫下台')
  })

  it('costs approval at once to raise taxes and bring in unpopular policies', () => {
    const base = newGame(1, { events: false })
    step(base)
    const taxed = newGame(1, { events: false })
    setTax(taxed, 'salaries', 18)
    step(taxed)
    expect(base.approval.value - taxed.approval.value).toBeCloseTo(3 * APPROVAL.taxCost.salaries, 0)
    expect(taxed.news.some((n) => n.text.includes('加至 18%') && n.text.includes('民望下跌 3'))).toBe(true)

    const gst = newGame(1, { events: false })
    setPolicy(gst, 'gst', 'on')
    step(gst)
    expect(base.approval.value - gst.approval.value).toBeGreaterThan(8 - 1)
  })

  it('counts only a raise above every level of the past year as a response', () => {
    const g = newGame(1, { events: false })
    step(g)
    setFunding(g, 'education', 1)
    step(g)
    setFunding(g, 'education', 1.05)
    step(g)
    expect(g.approval.credit.education).toBe(0)
    setFunding(g, 'education', 1.1)
    step(g)
    expect(g.approval.credit.education).toBe(1)
  })

  it('credits answering a decision and costs approval when one expires', () => {
    const g = newGame(1, { events: false })
    while (!g.inbox.some((i) => i.id === 'hos85')) step(g)
    const item = g.inbox.find((i) => i.id === 'hos85')!
    const answered = structuredClone(g)
    answer(answered, item.uid, 'moderate')
    expect(answered.approval.credit.housing).toBe(1)
    expect(answered.approval.active).toBe(1)
    const before = g.approval.value
    answer(g, item.uid, item.defaultOptionId, true)
    expect(g.approval.value).toBe(before - APPROVAL.expiredCost)
  })
})
