import { POLICIES, POLICY_CATEGORY_LABEL, type PolicyCategory, type PolicyDef } from '../../data/policies'
import { cpiAt } from '../../engine/real'
import { playerPolicyLevel, scheduledPolicy, setPolicy } from '../../engine/sim'
import { LAST_MONTH_INDEX, isBefore, monthOf, yearOf } from '../../engine/time'
import type { GameState } from '../../engine/types'
import { formatNumber } from '../format'

const CATEGORIES: PolicyCategory[] = ['housing', 'transport', 'economy', 'social', 'environment']

/** One policy with its levels; also used for the sales tax in the tax panel. */
export function PolicyItem({ game, p, onChange }: { game: GameState; p: PolicyDef; onChange: () => void }) {
  const t = Math.min(game.t, LAST_MONTH_INDEX)
  const locked = isBefore(t, p.availableFrom)
  const level = playerPolicyLevel(game, p, t)
  const scheduled = scheduledPolicy(game, p.id)
  const scheduledLabel = scheduled && p.levels.find((l) => l.id === scheduled.level)?.label
  const effect = p.effects[level] ?? {}
  const cost = (effect.cost ?? 0) * cpiAt(t)
  return (
    <li className={`policy ${locked ? 'locked' : ''}`}>
      <div className="dept-head">
        <strong>{p.label}</strong>
        {locked && (
          <span className="muted small">
            {p.availableFrom[0]} 年起可推行
          </span>
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
      {scheduled && (
        <p className="small warn">
          已決定：{yearOf(scheduled.t)} 年 {monthOf(scheduled.t)} 月起改為「{scheduledLabel}」。現在改動會取代這個決定。
        </p>
      )}
      {cost > 0 && <p className="small muted">每年約 {formatNumber(cost)} 億元</p>}
      {cost < 0 && <p className="small muted">每年收入約 {formatNumber(-cost)} 億元</p>}
      {effect.costGdpShare && effect.costGdpShare < 0 && <p className="small muted">每年收入約本地生產總值的 {formatNumber(-effect.costGdpShare * 100, 0)}%</p>}
    </li>
  )
}

export function PolicyPanel({ game, onChange }: { game: GameState; onChange: () => void }) {
  return (
    <div className="panel">
      <p className="muted small">政策會一直生效，直到你改變；不會自動跟隨真實歷史。歷史上的抉擇也會改變政策。效果約兩年內逐步出現。</p>
      {CATEGORIES.map((c) => (
        <section key={c}>
          <h3 className="card-subtitle">{POLICY_CATEGORY_LABEL[c]}</h3>
          <ul className="policy-list">
            {POLICIES.filter((p) => p.category === c).map((p) => (
              <PolicyItem key={p.id} game={game} p={p} onChange={onChange} />
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small">銷售稅在「稅率」分頁。</p>
    </div>
  )
}
