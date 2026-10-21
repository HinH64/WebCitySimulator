import { useState } from 'react'
import { DEBT } from '../../data/budget'
import { bondRate, debtTotal, issueBond, repayBond } from '../../engine/sim'
import { monthOf, yearOf } from '../../engine/time'
import type { GameState, Metrics } from '../../engine/types'
import { formatNumber, money, percent } from '../format'

const AMOUNTS = [100, 500, 1000]

export function DebtPanel({ game, metrics, onChange }: { game: GameState; metrics: Metrics; onChange: () => void }) {
  const [years, setYears] = useState<number>(DEBT.tenors[0])
  const debt = debtTotal(game)
  const ratio = debt / metrics.gdp
  const rate = bondRate(game, metrics)

  return (
    <div className="panel">
      <div className="summary-grid">
        <div>
          <div className="eyebrow">財政儲備</div>
          <div className="big-number">{money(game.reserves)}</div>
        </div>
        <div>
          <div className="eyebrow">政府債務</div>
          <div className={`big-number ${debt > 0 ? 'warn' : ''}`}>{money(debt)}</div>
        </div>
        <div>
          <div className="eyebrow">債務佔本地生產總值</div>
          <div className={`big-number ${ratio > 0.22 ? 'bad' : ''}`}>{percent(ratio)}</div>
        </div>
      </div>
      <div className="ceiling" aria-label="債務上限">
        <div className="ceiling-fill" style={{ width: `${Math.min(100, (ratio / DEBT.ceiling) * 100)}%` }} />
      </div>
      <p className="muted small">
        債務超過本地生產總值的 {percent(DEBT.ceiling)} 會財政崩潰，任期提早結束。庫房見底時，系統會自動發五年期債券維持運作。
      </p>

      <h3 className="card-subtitle">發行債券</h3>
      <p className="small">
        現時新債利率約 <strong>{formatNumber(rate, 1)}%</strong>（市場利率加息差，債務越多息差越高）。
      </p>
      <div className="row-actions">
        <div className="segmented small-seg">
          {DEBT.tenors.map((y) => (
            <button key={y} className={years === y ? 'active' : ''} onClick={() => setYears(y)} aria-pressed={years === y}>
              {y} 年期
            </button>
          ))}
        </div>
        {AMOUNTS.map((a) => (
          <button
            key={a}
            className="button"
            onClick={() => {
              issueBond(game, a, years)
              onChange()
            }}
          >
            借 {formatNumber(a)} 億
          </button>
        ))}
      </div>

      {game.bonds.length > 0 && (
        <>
          <h3 className="card-subtitle">未償還債券</h3>
          <ul className="bond-list">
            {game.bonds.map((b) => (
              <li key={b.id}>
                <span>
                  {money(b.principal)}・年息 {formatNumber(b.rate, 1)}%{b.auto ? '・自動發行' : ''}
                </span>
                <span className="muted small">
                  {yearOf(b.matures)} 年 {monthOf(b.matures)} 月到期
                </span>
                <button
                  className="button small-button"
                  disabled={game.reserves < b.principal}
                  onClick={() => {
                    repayBond(game, b.id)
                    onChange()
                  }}
                >
                  提早還款
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
