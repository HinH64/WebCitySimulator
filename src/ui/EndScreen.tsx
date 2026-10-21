import { useMemo, useState } from 'react'
import { computeResult } from '../engine/endings'
import { LABELS } from '../engine/model'
import { INDICATORS, type GameState } from '../engine/types'
import { formatNumber, pointsToPercent, signed } from './format'
import { TrendChart } from './TrendChart'

interface Props {
  game: GameState
  onReplaySeed: () => void
  onNewGame: () => void
}

export function EndScreen({ game, onReplaySeed, onNewGame }: Props) {
  const result = useMemo(() => computeResult(game), [game])
  const [copied, setCopied] = useState(false)
  const historyChoices = game.choices.filter((c) => c.kind === 'history')
  const sameAsHistory = historyChoices.filter((c) => c.optionId === c.realOptionId).length
  const legacy = INDICATORS.filter((k) => Math.abs(result.legacy[k]) >= 0.5)

  const shareText = [
    `平行香港 1997–${result.endYear}`,
    `我的香港：${result.title}（評級 ${result.rating}）`,
    INDICATORS.map((k) => `${LABELS[k]} ${signed(result.gaps[k], 0)}`).join('　'),
    `種子碼 ${game.seed}`,
  ].join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="end">
      <section className="end-hero">
        <div className="eyebrow">{result.endedEarly ? `${result.endYear} 年・任期提早結束` : `${result.endYear} 年・回到現在`}</div>
        <h1>{result.title}</h1>
        <p className="end-sub">{result.subtitle}</p>
        <div className={`rating rating-${result.rating}`} aria-label={`評級 ${result.rating}`}>
          {result.rating}
        </div>
        <p className="muted small">
          六項指標合計比真實歷史 {signed(result.total, 0)} 分。種子碼 {game.seed}。
        </p>
      </section>

      <section>
        <h2 className="section-title">你的香港 vs 真實香港</h2>
        <div className="trend-grid">
          {INDICATORS.map((k) => (
            <TrendChart key={k} k={k} trail={game.trail} endYear={result.endYear} />
          ))}
        </div>
        <p className="muted small chart-legend">
          <span className="legend-line yours" /> 你的香港　<span className="legend-line real" /> 真實歷史
        </p>
      </section>

      <section>
        <h2 className="section-title">{result.endYear} 年的真實數字</h2>
        <div className="table-wrap">
          <table className="metrics">
            <thead>
              <tr>
                <th>數據</th>
                <th>真實</th>
                <th>你的香港</th>
              </tr>
            </thead>
            <tbody>
              {result.metrics.map((m) => {
                const same = Math.abs(m.yours - m.real) < Math.pow(10, -m.decimals) / 2
                return (
                  <tr key={m.id}>
                    <td>
                      {m.label}
                      <span className="muted small"> {m.unit}</span>
                    </td>
                    <td className="mono">{formatNumber(m.real, m.decimals)}</td>
                    <td className={`mono ${same ? '' : m.better ? 'good' : 'bad'}`}>{formatNumber(m.yours, m.decimals)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          「你的香港」由你跟歷史的指標差距換算，是遊戲模型的推算，不是預測。真實數字為約數，詳見數據來源。
        </p>
      </section>

      <section>
        <h2 className="section-title">施政重心：你 vs 真實政府（估算）</h2>
        <div className="periods">
          {result.periods.map((p) => (
            <div key={p.year} className="period">
              <div className="period-head">
                <strong>
                  {p.year}–{p.endYear}
                </strong>
                <span className="muted small">{p.summary}</span>
              </div>
              <StackBar label="你" alloc={p.yours} />
              <StackBar label="真實" alloc={p.real} />
            </div>
          ))}
        </div>
        <div className="stack-legend small">
          {INDICATORS.map((k) => (
            <span key={k} className={`ind-${k}`}>
              <span className="swatch" />
              {LABELS[k]}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">
          你的抉擇 vs 歷史（{historyChoices.length} 個關口中有 {sameAsHistory} 個跟歷史一樣）
        </h2>
        <ol className="choice-list">
          {game.choices.map((c, i) => (
            <li key={`${c.id}-${i}`} className={c.kind === 'parallel' ? 'parallel' : c.optionId === c.realOptionId ? 'same' : 'diff'}>
              <span className="mono">{c.year}</span>
              <div>
                <strong>{c.title}</strong>
                {c.kind === 'history' ? (
                  c.optionId === c.realOptionId ? (
                    <div>你跟歷史一樣：「{c.optionLabel}」</div>
                  ) : (
                    <div>
                      你：「{c.optionLabel}」／歷史：「{c.realOptionLabel}」
                    </div>
                  )
                ) : (
                  <div>
                    <span className="tag">平行時空</span>你：「{c.optionLabel}」
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {legacy.length > 0 && (
        <section>
          <h2 className="section-title">留給下一屆</h2>
          <p className="muted small">這些投入在 {result.endYear} 年後才會見效：</p>
          <div className="chips">
            {legacy.map((k) => (
              <span key={k} className={`chip ${result.legacy[k] > 0 ? 'good' : 'bad'}`}>
                {LABELS[k]} {signed(result.legacy[k])}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="end-actions">
        <button className="button primary" onClick={onNewGame}>
          再玩一局
        </button>
        <button className="button" onClick={onReplaySeed}>
          用同一種子重玩
        </button>
        <button className="button" onClick={copy}>
          {copied ? '已複製' : '複製結果'}
        </button>
      </section>
    </div>
  )
}

function StackBar({ label, alloc }: { label: string; alloc: Record<string, number> }) {
  return (
    <div className="stack-row">
      <span className="stack-label small">{label}</span>
      <div className="stack">
        {INDICATORS.map((k) =>
          alloc[k] > 0 ? (
            <div
              key={k}
              className={`stack-seg ind-${k}`}
              style={{ flexGrow: alloc[k] }}
              title={`${LABELS[k]} ${pointsToPercent(alloc[k])}`}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}
