import { describe, expect, it } from 'vitest'
import { HISTORY_CHOICES } from '../src/data/events'
import { POLICY_BY_ID } from '../src/data/policies'
import { choiceAreas, optionEffectWords, policyEffectWords } from '../src/engine/effects'
import { FOLLOW_HISTORY, newGame, playThrough, setPolicy, step } from '../src/engine/sim'

const option = (choice: string, id: string) => HISTORY_CHOICES.find((c) => c.id === choice)!.options.find((o) => o.id === id)!

describe('what decisions and policies do, in words', () => {
  it('says which way a policy level moves things, and nothing for the neutral level', () => {
    expect(policyEffectWords(POLICY_BY_ID.hos, 'on')).toEqual(['開支↑', '公營單位↑（約 3 年後）', '樓價↓'])
    expect(policyEffectWords(POLICY_BY_ID.hos, 'off')).toEqual([])
    expect(policyEffectWords(POLICY_BY_ID.landRatio, 'p70')).toEqual(['公營單位↑', '私人單位↓', '賣地收入↓'])
    expect(policyEffectWords(POLICY_BY_ID.countryPark, 'on')).toEqual(expect.arrayContaining(['保護區↓', '民望↓（即時）']))
    for (const word of Object.values(POLICY_BY_ID).flatMap((p) => p.levels.flatMap((l) => policyEffectWords(p, l.id)))) {
      expect(word, 'directions only, never amounts').not.toMatch(/[0-9]+(\.[0-9]+)? *(億|萬|%)/)
    }
  })

  it('describes each option of a decision, and an option that changes nothing as keeping things as they are', () => {
    expect(optionEffectWords(option('disney', 'build'))).toEqual(['開支↑（6 年內）', '旅遊業↑（約 6 年後）', '經濟↑（約 6 年後）', '保護區↓（約 1 年後）'])
    expect(optionEffectWords(option('disney', 'skip'))).toEqual(['維持現狀'])
    for (const c of HISTORY_CHOICES) for (const o of c.options) expect(optionEffectWords(o).length, `${c.id} ${o.id}`).toBeGreaterThan(0)
    expect(choiceAreas('disney', HISTORY_CHOICES.find((c) => c.id === 'disney')!.options)).toEqual(['jobs'])
  })

  it('says what changing a policy does from its level now, and that keeping it changes nothing', () => {
    const now = () => 'on'
    expect(optionEffectWords(option('hosStop', 'stop'), true, now)).toEqual(['「資助出售房屋」改為「停建」（開支↓、公營單位↓（約 3 年後）、樓價↑）'])
    expect(optionEffectWords(option('hosStop', 'keep'), true, now)).toEqual(['維持現狀'])
  })

  it('puts the expected effects in the decision news, and what they brought in the yearly report', () => {
    const s = playThrough(1, FOLLOW_HISTORY, { events: false })
    expect(s.news.find((n) => n.kind === 'decision' && n.text.startsWith('主題樂園'))?.text).toBe('主題樂園：你決定「合作興建」。預計：開支↑（6 年內）、旅遊業↑（約 6 年後）、經濟↑（約 6 年後）、保護區↓（約 1 年後）。')
    const report2005 = s.news.find((n) => n.kind === 'report' && n.text.startsWith('2005 年你的決定帶來'))
    expect(report2005?.text).toContain('主題樂園（旅遊業↑、經濟↑）')
    // The 2002 decision to stop subsidised sale flats comes into full effect two years later.
    expect(s.news.find((n) => n.kind === 'report' && n.text.startsWith('2004 年你的決定帶來'))?.text).toContain('「資助出售房屋」停建全面生效')
  })

  it('remembers since when each policy has been at its level', () => {
    const s = newGame(1, { events: false })
    expect(s.policySince.hos).toEqual({ level: 'on', from: 0 })
    step(s)
    step(s)
    setPolicy(s, 'hos', 'off')
    const changed = s.t
    step(s)
    expect(s.policySince.hos).toEqual({ level: 'off', from: changed })
  })
})
