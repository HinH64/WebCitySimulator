import { useMemo } from 'react'
import { citizenEndings } from '../engine/citizens'
import type { GameState } from '../engine/types'

/** The end screen's 「他們的 2026」: how each followed person fared, and how they would have in real Hong Kong. */
export function CitizensEnd({ game }: { game: GameState }) {
  const endings = useMemo(() => citizenEndings(game), [game])
  if (endings.length === 0) return null
  return (
    <section>
      <h2 className="section-title">他們的 {Math.min(2026, game.snapshots.at(-1)?.year ?? 2026)}</h2>
      <ul className="citizen-endings">
        {endings.map((e) => (
          <li key={e.id}>
            <strong>{e.name}</strong>
            <span className="muted small">{e.who}</span>
            <p>你的香港：{e.yours}。</p>
            <p className={e.same ? 'muted small' : 'small'}>{e.same ? '在真實的香港也一樣。' : `在真實的香港：${e.real}。`}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
