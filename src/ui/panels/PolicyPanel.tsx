import { AREA_LABEL } from '../../data/areas'
import { POLICIES, POLICY_CATEGORY_LABEL, type PolicyCategory, type PolicyDef, type PolicyEffect } from '../../data/policies'
import { delayedEffect, effectStart, optionEffectWords, policyEffectWords } from '../../engine/effects'
import { cpiAt } from '../../engine/real'
import { POLICY_PHASE_IN, playerPolicyLevel, scheduledPolicy, setPolicy } from '../../engine/sim'
import { LAST_MONTH_INDEX, isBefore, monthOf, yearOf } from '../../engine/time'
import type { ChoiceRecord, GameState } from '../../engine/types'
import { formatNumber } from '../format'

/**
 * What the current level has done since it started, worked out from the policy's yearly effects: homes
 * and money add up over the years, the rest phases in over about two years.
 */
function soFar(game: GameState, p: PolicyDef, level: string, t: number): string | undefined {
  const since = game.policySince[p.id]
  const label = p.levels.find((l) => l.id === level)!.label
  if (since?.level !== level) return `剛改為「${label}」，下月起生效。`
  const neutral = level === p.levels[0].id
  if (neutral) return since.from > 0 ? `自 ${yearOf(since.from)} 年起「${label}」。` : undefined
  const e: PolicyEffect = p.effects[level] ?? {}
  const n: PolicyEffect = p.effects[p.levels[0].id] ?? {}
  const d = (k: keyof PolicyEffect) => ((e[k] as number | undefined) ?? 0) - ((n[k] as number | undefined) ?? 0)
  const years = (t - since.from) / 12
  const parts: string[] = []
  const publicUnits = (d('publicUnits') + d('publicUnitsFast')) * years
  if (publicUnits) parts.push(`公營單位約${publicUnits > 0 ? '多' : '少'} ${formatNumber(Math.abs(publicUnits), 1)} 萬個（部分仍在興建）`)
  if (d('privateUnits')) parts.push(`私人單位約多 ${formatNumber(d('privateUnits') * years, 1)} 萬個（部分仍在興建）`)
  if (d('demolish')) parts.push(`約拆卸 ${formatNumber(d('demolish') * years, 1)} 萬個舊單位`)
  if (d('talent')) parts.push(`約多 ${formatNumber(d('talent') * years, 1)} 萬人移入`)
  const cost = d('cost') * years * cpiAt(t)
  if (cost > 0) parts.push(`開支約 ${formatNumber(cost)} 億`)
  if (cost < 0) parts.push(`收入約 ${formatNumber(-cost)} 億`)
  const gradual = (['publicLandShare', 'priceDrift', 'stampFactor', 'growth', 'unemployment', 'welfare', 'attract', 'pm10', 'green'] as const).some((k) => d(k)) || e.sectorBoost
  const months = t - since.from
  if (gradual) parts.push(months >= POLICY_PHASE_IN ? '其他效果已全面生效' : `其他效果約 ${POLICY_PHASE_IN - months} 個月後全面生效`)
  return `自 ${yearOf(since.from)} 年起「${label}」：${parts.join('，')}。`
}

/** The latest answered decision that set this policy to its current level, if any. */
function decidedBy(game: GameState, p: PolicyDef, level: string): ChoiceRecord | undefined {
  return [...game.choices].reverse().find((c) => c.effects.some((e) => e.kind === 'policy' && e.id === p.id && e.level === level))
}

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
  const levelWords = p.levels.slice(1).map((l) => ({ label: l.label, words: policyEffectWords(p, l.id) })).filter((x) => x.words.length)
  const done = locked ? undefined : soFar(game, p, level, t)
  const by = decidedBy(game, p, level)
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
      {levelWords.length > 0 && (
        <ul className="effect-lines small">
          {levelWords.map((x) => (
            <li key={x.label}>
              <span className="effect-level">{x.label}</span>
              {x.words.join('　')}
            </li>
          ))}
        </ul>
      )}
      {cost > 0 && <p className="small muted">每年約 {formatNumber(cost)} 億元</p>}
      {cost < 0 && <p className="small muted">每年收入約 {formatNumber(-cost)} 億元</p>}
      {effect.costGdpShare && effect.costGdpShare < 0 && <p className="small muted">每年收入約本地生產總值的 {formatNumber(-effect.costGdpShare * 100, 0)}%</p>}
      {done && <p className="small">{done}</p>}
      {by && <p className="small muted">由 {yearOf(by.t)} 年抉擇「{by.title}」設定。</p>}
      {p.area && <p className="small muted">改動算作回應「{AREA_LABEL[p.area]}」。</p>}
      {scheduled && (
        <p className="small warn">
          已決定：{yearOf(scheduled.t)} 年 {monthOf(scheduled.t)} 月起改為「{scheduledLabel}」。現在改動會取代這個決定。
        </p>
      )}
    </li>
  )
}

/** The decisions answered so far: what was chosen, what it does, and whether that has started. */
function ChoiceHistory({ game }: { game: GameState }) {
  const t = Math.min(game.t, LAST_MONTH_INDEX)
  if (game.choices.length === 0) return null
  return (
    <section>
      <h3 className="card-subtitle">你的抉擇</h3>
      <ul className="policy-list">
        {[...game.choices].reverse().map((c) => {
          const words = optionEffectWords({ id: c.optionId, label: c.optionLabel, effects: c.effects }, true, (id) => c.policiesBefore[id])
          const starts = c.effects.filter(delayedEffect).map((e) => effectStart(c, e))
          const next = starts.filter((s) => s > t).sort((a, b) => a - b)[0]
          return (
            <li key={`${c.id}:${c.t}`} className="policy">
              <div className="dept-head">
                <strong>{c.title}</strong>
                <span className="muted small">{yearOf(c.t)} 年</span>
              </div>
              <p className="small">
                「{c.optionLabel}」{c.expired ? '（限期過後維持）' : ''}：{words.join('　')}
              </p>
              {starts.length > 0 && <p className="small muted">{next === undefined ? '效果已出現。' : `約 ${yearOf(next)} 年起見效。`}</p>}
            </li>
          )
        })}
      </ul>
    </section>
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
      <p className="muted small">銷售稅在「稅率」分頁。↑↓ 只表示方向，實際幅度看城市的情況。</p>
      <ChoiceHistory game={game} />
    </div>
  )
}
