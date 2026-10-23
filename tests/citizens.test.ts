import { describe, expect, it } from 'vitest'
import { CITIZENS } from '../src/data/citizens'
import { FOLLOWED, citizenEndings } from '../src/engine/citizens'
import { newGame, playThrough, type Strategy } from '../src/engine/sim'
import type { GameState } from '../src/engine/types'
import { FOLLOW_HISTORY, boost, randomStrategy } from './strategies'

const ALL = CITIZENS.map((c) => c.id)
const ending = (g: GameState, id: string) => citizenEndings(g).find((e) => e.id === id)!

describe('the people the game follows', () => {
  it('are three different people picked by the seed, the same every time', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const ids = newGame(seed).citizens.map((c) => c.id)
      expect(new Set(ids).size, String(seed)).toBe(FOLLOWED)
      expect(newGame(seed).citizens.map((c) => c.id)).toEqual(ids)
      ids.forEach((id) => seen.add(id))
    }
    expect([...seen].sort()).toEqual([...ALL].sort())
  })

  it('never change the city', () => {
    for (const seed of [2, 7]) {
      const followed = playThrough(seed, randomStrategy(seed), { removal: false })
      const alone = playThrough(seed, randomStrategy(seed), { removal: false, citizens: false })
      expect(followed.news.some((n) => n.kind === 'citizen')).toBe(true)
      expect(followed.snapshots).toEqual(alone.snapshots)
      expect(followed.news.filter((n) => n.kind !== 'citizen')).toEqual(alone.news)
    }
  })

  it('live the same lives as in real Hong Kong when the city follows history', () => {
    const g = playThrough(1, FOLLOW_HISTORY, { events: false, citizens: ALL })
    for (const e of citizenEndings(g)) expect(e.same, `${e.name}: ${e.yours} / ${e.real}`).toBe(true)
  })

  it('fare better or worse with the city', () => {
    const housed = playThrough(1, boost('housing', 1.8), { removal: false, citizens: ['subdivided'] })
    const wait = (text: string) => Number(text.match(/輪候 ([\d.]+) 年/)![1])
    expect(wait(ending(housed, 'subdivided').yours)).toBeLessThan(wait(ending(housed, 'subdivided').real) - 1)

    const starved = playThrough(1, boost('health', 0.7), { removal: false, citizens: ['elderly'] })
    expect(wait(ending(starved, 'elderly').yours)).toBeGreaterThan(wait(ending(starved, 'elderly').real))

    const noRelief: Strategy = { ...FOLLOW_HISTORY, choose: (s, item) => (item.id === 'ess' ? 'none' : FOLLOW_HISTORY.choose(s, item)) }
    const shop = ending(playThrough(1, noRelief, { citizens: ['shop'] }), 'shop')
    expect(shop.yours).toMatch(/^20\d\d 年結業$/)
    expect(shop.real).toContain('保就業')
  })

  it('are heard from at least once a year while waiting', () => {
    const g = playThrough(1, FOLLOW_HISTORY, { events: false, citizens: ['subdivided'] })
    const lines = g.news.filter((n) => n.citizen === 'subdivided')
    const housed = lines.findIndex((n) => n.text.includes('終於上樓'))
    expect(housed).toBeGreaterThan(0)
    for (let i = 1; i <= housed; i++) expect(lines[i].t - lines[i - 1].t).toBeLessThanOrEqual(12)
  })
})
