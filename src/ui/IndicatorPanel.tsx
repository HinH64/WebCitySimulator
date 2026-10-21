import { LABELS, realScores } from '../engine/model'
import { INDICATORS, type Allocation, type GameState, type Scores } from '../engine/types'
import { signed } from './format'

/** Sum of effects already committed but not yet landed, per indicator. */
export function pipeline(game: GameState): Scores {
  const p = { housing: 0, economy: 0, transport: 0, environment: 0, livelihood: 0, finance: 0 }
  for (const e of game.scheduled) if (e.year > game.year) p[e.k] += e.v
  return p
}

function Dots({ points }: { points: number }) {
  return (
    <span className="dots" aria-label={`${points} 點`}>
      {Array.from({ length: points }, (_, i) => (
        <span key={i} className="dot" />
      ))}
    </span>
  )
}

export function IndicatorPanel({ game }: { game: GameState }) {
  const real = realScores(game.year)
  const applied: Allocation = game.allocByYear[game.year] ?? game.alloc
  const upcoming = pipeline(game)

  return (
    <section className="indicators" aria-label="城市指標">
      <div className="indicators-head">
        <span>指標</span>
        <span className="legend">
          <span className="legend-real" /> 真實歷史
        </span>
      </div>
      {INDICATORS.map((k) => {
        const v = game.values[k]
        const gap = v - real[k]
        const next = upcoming[k]
        return (
          <div key={k} className={`indicator ind-${k}`}>
            <div className="indicator-top">
              <span className="indicator-name">{LABELS[k]}</span>
              <span className="indicator-value">{Math.round(v)}</span>
              <span className={`gap ${gap > 0.5 ? 'good' : gap < -0.5 ? 'bad' : ''}`} title="相對真實歷史">
                {Math.abs(gap) < 0.5 ? '＝歷史' : signed(gap)}
              </span>
            </div>
            <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
              <div className="bar-fill" style={{ width: `${v}%` }} />
              <div className="bar-real" style={{ left: `${real[k]}%` }} title={`真實：${Math.round(real[k])}`} />
            </div>
            <div className="indicator-bottom">
              <Dots points={applied[k]} />
              {Math.abs(next) >= 0.5 && (
                <span className={`upcoming ${next > 0 ? 'good' : 'bad'}`}>即將見效 {signed(next)}</span>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
