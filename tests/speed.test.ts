import { describe, expect, it } from 'vitest'
import { newGame, step } from '../src/engine/sim'
import { dueStop, playTime, skipStop } from '../src/ui/speed'
import { SPEEDS } from '../src/ui/storage'

describe('speed', () => {
  it('says roughly how long a term takes at each speed', () => {
    expect(SPEEDS.map(playTime)).toEqual(['約 9 分半', '約 4 分半', '約 2 分半', '約 1 分鐘', '約 45 秒', '約 35 秒'])
  })

  it('stops fast-forwarding for a new decision, and again before it expires', () => {
    const g = newGame(1, { events: false })
    while (!g.signals.includes('choice')) step(g)
    expect(skipStop(g)?.text).toContain('新抉擇')
    const item = g.inbox[0]
    while (!dueStop(g)) step(g)
    // Stopped the month before it would expire, so the player can still answer it.
    expect(g.inbox).toContainEqual(item)
    expect(item.deadline).toBe(g.t)
    expect(dueStop(g)).toEqual({ text: expect.stringContaining(item.title), due: item.uid })
    // Once warned, fast-forwarding again lets it expire.
    expect(dueStop(g, item.uid)).toBeNull()
    step(g)
    expect(g.inbox).not.toContainEqual(item)
  })
})
