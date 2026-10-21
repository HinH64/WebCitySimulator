import { DEPARTMENTS, DEPT_INFO, FUNDING_MAX, FUNDING_MIN, type DeptId } from '../../data/budget'
import { upcoming } from '../../engine/demand'
import { levelAt } from '../../engine/real'
import { baselines, setFunding } from '../../engine/sim'
import { LAST_MONTH_INDEX } from '../../engine/time'
import type { GameState, Metrics } from '../../engine/types'
import { formatNumber, money, percent } from '../format'

function fundingStatus(f: number): { text: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  if (f < 0.7) return { text: '服務急跌', tone: 'bad' }
  if (f < 0.95) return { text: '服務慢慢下滑', tone: 'warn' }
  if (f <= 1.0) return { text: '維持現有服務', tone: 'muted' }
  return { text: '擴建中', tone: 'good' }
}

function pipelineNote(game: GameState, d: DeptId): string | undefined {
  const t = game.t
  switch (d) {
    case 'housing': {
      const v = levelAt('publicUnits', t + 36) - levelAt('publicUnits', t) + upcoming(game, 'publicUnits', 36)
      return `未來三年約 ${formatNumber(Math.max(0, v), 1)} 萬個公營單位落成`
    }
    case 'transport': {
      const v = levelAt('railKm', t + 60) - levelAt('railKm', t) + upcoming(game, 'rail', 60)
      return `未來五年約 ${formatNumber(Math.max(0, v))} 公里新鐵路通車`
    }
    case 'health': {
      const v = levelAt('careCapacity', t + 36) - levelAt('careCapacity', t) + upcoming(game, 'care', 36)
      return `未來三年約 ${formatNumber(Math.max(0, v) * 10000)} 個病床及宿位落成`
    }
    default:
      return undefined
  }
}

export function BudgetPanel({ game, metrics, onChange }: { game: GameState; metrics: Metrics; onChange: () => void }) {
  const base = baselines(Math.min(game.t, LAST_MONTH_INDEX), metrics)
  const deptSpend = DEPARTMENTS.map((d) => base[d] * game.funding[d])
  const last = game.last
  const balance = last.revenueTotal - last.spendingTotal
  const total = last.spendingTotal || deptSpend.reduce((a, b) => a + b, 0)

  return (
    <div className="panel budget-panel">
      <div className="summary-grid">
        <div>
          <div className="eyebrow">上月收入</div>
          <div className="big-number">{money(last.revenueTotal)}</div>
        </div>
        <div>
          <div className="eyebrow">上月開支</div>
          <div className="big-number">{money(last.spendingTotal)}</div>
        </div>
        <div>
          <div className="eyebrow">{balance >= 0 ? '盈餘' : '赤字'}</div>
          <div className={`big-number ${balance >= 0 ? 'good' : 'bad'}`}>{money(Math.abs(balance))}</div>
          <div className="muted small">全年約 {money(balance * 12)}</div>
        </div>
      </div>
      <p className="muted small">
        100% = 維持現有服務所需的錢。低於 95% 服務會變差，高於 100% 的錢用來擴建，工程要幾年才見效。調整由下個月起生效，遊戲不會暫停。
      </p>

      <div className="dept-list">
        {DEPARTMENTS.map((d, i) => {
          const f = game.funding[d]
          const st = fundingStatus(f)
          const q = game.quality[d]
          const note = pipelineNote(game, d)
          return (
            <div key={d} className={`dept dept-${d}`}>
              <div className="dept-head">
                <div>
                  <strong>{DEPT_INFO[d].label}</strong>
                  <span className="muted small"> {DEPT_INFO[d].covers}</span>
                </div>
                <div className="dept-value">{percent(f)}</div>
              </div>
              <input
                type="range"
                min={FUNDING_MIN * 100}
                max={FUNDING_MAX * 100}
                step={5}
                value={Math.round(f * 100)}
                onChange={(e) => {
                  setFunding(game, d, Number(e.target.value) / 100)
                  onChange()
                }}
                aria-label={`${DEPT_INFO[d].label}撥款水平`}
              />
              <div className="dept-foot small">
                <span className={st.tone}>
                  {st.text}
                  {f > 1 ? `：${DEPT_INFO[d].builds}` : ''}
                </span>
                <span className="muted">
                  每月 {money(deptSpend[i])}（{percent(deptSpend[i] / total)}）
                </span>
              </div>
              {(q < 0.99 || note) && (
                <div className="dept-foot small">
                  {q < 0.99 && <span className={q < 0.8 ? 'bad' : 'warn'}>設施質素 {percent(q)}</span>}
                  {note && <span className="muted">{note}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="fixed-lines small">
        <div>
          <span>其他開支（治安、行政等，不可調）</span>
          <span>{money(last.spending.other ?? 0)}／月</span>
        </div>
        {Math.abs(last.spending.policies ?? 0) > 0.05 && (
          <div>
            <span>政策開支</span>
            <span>{money(last.spending.policies ?? 0)}／月</span>
          </div>
        )}
        {Math.abs(last.spending.projects ?? 0) > 0.05 && (
          <div>
            <span>大型項目及一次性開支</span>
            <span>{money(last.spending.projects ?? 0)}／月</span>
          </div>
        )}
        {(last.spending.interest ?? 0) > 0.05 && (
          <div>
            <span>債務利息</span>
            <span>{money(last.spending.interest ?? 0)}／月</span>
          </div>
        )}
      </div>
    </div>
  )
}
