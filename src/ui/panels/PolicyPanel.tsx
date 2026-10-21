import { POLICIES } from '../../data/policies'
import { cpiAt } from '../../engine/real'
import { playerPolicyLevel, setPolicy } from '../../engine/sim'
import { LAST_MONTH_INDEX, isBefore } from '../../engine/time'
import type { GameState } from '../../engine/types'
import { formatNumber } from '../format'

export function PolicyPanel({ game, onChange }: { game: GameState; onChange: () => void }) {
  const t = Math.min(game.t, LAST_MONTH_INDEX)

  return (
    <div className="panel">
      <p className="muted small">
        長期政策會一直生效，直到你改變。標示「預設」的政策會按當時情況自動推行或停止；你一改動，就由你決定。部分抉擇也會改變政策。
      </p>
      <ul className="policy-list">
        {POLICIES.map((p) => {
          const locked = isBefore(t, p.availableFrom)
          const level = playerPolicyLevel(game, p, t)
          const isDefault = game.policies[p.id] === undefined
          const effect = p.effects[level] ?? {}
          const cost = (effect.cost ?? 0) * cpiAt(t)
          return (
            <li key={p.id} className={`policy ${locked ? 'locked' : ''}`}>
              <div className="dept-head">
                <strong>{p.label}</strong>
                {locked ? (
                  <span className="muted small">{p.availableFrom[0]} 年起可推行</span>
                ) : isDefault ? (
                  <span className="tag">預設</span>
                ) : (
                  <button
                    className="link small"
                    onClick={() => {
                      setPolicy(game, p.id, undefined)
                      onChange()
                    }}
                  >
                    恢復預設
                  </button>
                )}
              </div>
              <p className="muted small">{p.description}</p>
              <div className="segmented small-seg">
                {p.levels.map((l) => (
                  <button
                    key={l.id}
                    className={level === l.id ? 'active' : ''}
                    disabled={locked}
                    aria-pressed={level === l.id}
                    onClick={() => {
                      setPolicy(game, p.id, l.id)
                      onChange()
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              {cost !== 0 && <p className="small muted">每年約 {formatNumber(cost)} 億元</p>}
              {effect.costGdpShare && effect.costGdpShare < 0 && <p className="small muted">每年收入約本地生產總值的 {formatNumber(-effect.costGdpShare * 100, 0)}%</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
