import { REVENUE_LABEL, TAXES, TAX_INFO, type RevenueId } from '../../data/budget'
import { POLICIES } from '../../data/policies'
import { setTax } from '../../engine/sim'
import type { GameState } from '../../engine/types'
import { formatNumber, money, percent } from '../format'
import { PolicyItem } from './PolicyPanel'

const EXTRA_LABEL: Record<string, string> = { gst: '銷售稅' }

export function TaxPanel({ game, onChange }: { game: GameState; onChange: () => void }) {
  const revenue = Object.entries(game.last.revenue).filter(([, v]) => Math.abs(v) > 0.01)
  const total = game.last.revenueTotal

  return (
    <div className="panel">
      <p className="muted small">
        開局是 1997 年的稅率，之後只由你調整。稅率改變後，收入下個月起改變；市民和企業的反應要幾年才慢慢出現。
      </p>
      {TAXES.map((k) => {
        const info = TAX_INFO[k]
        const rate = game.taxes[k]
        return (
          <div key={k} className="tax-row">
            <div className="dept-head">
              <strong>{info.label}</strong>
              <span className="dept-value">{formatNumber(rate, 1)}%</span>
            </div>
            <input
              type="range"
              min={info.min}
              max={info.max}
              step={info.step}
              value={rate}
              onChange={(e) => {
                setTax(game, k, Number(e.target.value))
                onChange()
              }}
              aria-label={info.label}
            />
            <div className="dept-foot small">
              <span className="muted">{info.effect}</span>
            </div>
          </div>
        )
      })}

      <ul className="policy-list">
        {POLICIES.filter((p) => p.category === 'tax').map((p) => (
          <PolicyItem key={p.id} game={game} p={p} onChange={onChange} />
        ))}
      </ul>

      <h3 className="card-subtitle">上月收入來源</h3>
      <ul className="breakdown">
        {revenue.map(([k, v]) => (
          <li key={k}>
            <span>{REVENUE_LABEL[k as RevenueId] ?? EXTRA_LABEL[k] ?? k}</span>
            <span className="bar-inline" aria-hidden="true">
              <span style={{ width: `${Math.max(0, (v / total) * 100)}%` }} />
            </span>
            <span className="mono">
              {money(v)}（{percent(v / total)}）
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
