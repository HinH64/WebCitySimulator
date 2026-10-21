import { useCallback, useState } from 'react'
import { computeResult } from './engine/endings'
import { newGame } from './engine/sim'
import type { GameState } from './engine/types'
import { EndScreen } from './ui/EndScreen'
import { GameScreen } from './ui/GameScreen'
import { StartScreen } from './ui/StartScreen'
import { loadSpeed, saveTerm, type Speed } from './ui/storage'

type Screen =
  | { kind: 'start' }
  | { kind: 'game'; run: number; game: GameState; speed: Speed }
  | { kind: 'end'; game: GameState }

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'start' })

  const start = useCallback((seed: number, speed: Speed) => {
    setScreen({ kind: 'game', run: Date.now(), game: newGame(seed), speed })
    window.scrollTo(0, 0)
  }, [])

  const end = useCallback((game: GameState) => {
    const r = computeResult(game)
    saveTerm({
      at: new Date().toISOString(),
      seed: game.seed,
      title: r.title,
      rating: r.rating,
      total: Math.round(r.total),
      endYear: r.endYear,
    })
    setScreen({ kind: 'end', game })
    window.scrollTo(0, 0)
  }, [])

  if (screen.kind === 'game') {
    const { game } = screen
    return (
      <GameScreen
        key={screen.run}
        game={game}
        initialSpeed={screen.speed}
        onEnd={() => end(game)}
        onQuit={() => setScreen({ kind: 'start' })}
      />
    )
  }
  if (screen.kind === 'end') {
    return (
      <EndScreen
        game={screen.game}
        onReplaySeed={() => start(screen.game.seed, loadSpeed())}
        onNewGame={() => setScreen({ kind: 'start' })}
      />
    )
  }
  return <StartScreen initialSpeed={loadSpeed()} onStart={start} />
}
