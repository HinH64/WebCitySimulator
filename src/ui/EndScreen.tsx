import { useMemo, useState } from 'react'
import { DEPARTMENTS, DEPT_INFO } from '../data/budget'
import { computeResult } from '../engine/endings'
import { INDICATOR_LABEL } from '../engine/indicators'
import { INDICATOR_IDS, type GameState } from '../engine/types'
import { formatNumber, percent } from './format'
import { CitizensEnd } from './CitizensEnd'
import { MapCompare } from './MapCompare'
import { TrendChart } from './TrendChart'
import { LandmarksList } from './LandmarksList'
import { WorksList } from './WorksList'

interface Props {
  game: GameState
  onReplaySeed: () => void
  onNewGame: () => void
}

export function EndScreen({ game, onReplaySeed, onNewGame }: Props) {
  const r = useMemo(() => computeResult(game), [game])
  const [copied, setCopied] = useState(false)
  const years = r.trend.map((p) => p.year)
  const same = r.reveals.filter((x) => x.same).length

  const shareText = [`平行香港 1997–${r.endYear}`, `我的香港：${r.title}`, ...r.summary.map((l) => l.text), `種子碼 ${game.seed}`].join('\n')

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
        <div className="eyebrow">{r.endedEarly ? `${r.endYear} 年・任期提早結束` : `${r.endYear} 年 10 月・回到現在`}</div>
        <h1>{r.title}</h1>
        <ul className="end-summary">
          {r.summary.map((l) => (
            <li key={l.text} className={`tone-${l.tone}`}>
              {l.text}
            </li>
          ))}
        </ul>
        <p className="muted small">以上跟真實的香港比較，指標滿分 100。種子碼 {game.seed}。</p>
      </section>

      <CitizensEnd game={game} />

      <section>
        <h2 className="section-title">地圖：你的香港 vs 真實香港</h2>
        <MapCompare game={game} endT={r.endT} />
      </section>

      <WorksList game={game} />

      <LandmarksList game={game} endT={r.endT} />

      <section>
        <h2 className="section-title">你的香港 vs 真實香港</h2>
        <div className="trend-grid">
          {INDICATOR_IDS.map((k) => (
            <TrendChart
              key={k}
              title={INDICATOR_LABEL[k]}
              colorClass={`ind-${k}`}
              years={years}
              yours={r.trend.map((p) => p.yours[k])}
              real={r.trend.map((p) => p.real[k])}
              range={[0, 100]}
            />
          ))}
          <TrendChart
            title="財政儲備減債務"
            colorClass="ind-finance"
            years={years}
            yours={r.trend.map((p) => p.yours.reserves)}
            real={r.trend.map((p) => p.real.reserves)}
            unit=" 億"
          />
          <TrendChart
            title="人口"
            colorClass="ind-population"
            years={years}
            yours={r.trend.map((p) => p.yours.population)}
            real={r.trend.map((p) => p.real.population)}
            unit=" 萬"
          />
          <TrendChart title="民望（真實香港不比較）" colorClass="ind-approval" years={years} yours={r.approval} range={[0, 100]} />
        </div>
        <p className="muted small chart-legend">
          <span className="legend-line yours" /> 你的香港　<span className="legend-line real" /> 真實香港
        </p>
      </section>

      <section>
        <h2 className="section-title">{r.endYear} 年的數字</h2>
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
              {r.comparison.map((row) => {
                const diff = row.yours - row.real
                const tiny = Math.abs(diff) < Math.pow(10, -row.decimals) / 2
                const tone =
                  tiny || row.higherIsBetter === undefined ? '' : (row.higherIsBetter ? diff > 0 : diff < 0) ? 'good' : 'bad'
                return (
                  <tr key={row.label}>
                    <td>
                      {row.label}
                      {row.unit && <span className="muted small"> {row.unit}</span>}
                    </td>
                    <td className="mono">{formatNumber(row.real, row.decimals)}</td>
                    <td className={`mono ${tone}`}>{formatNumber(row.yours, row.decimals)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">「你的香港」是遊戲模型的推算，不是預測。真實數字部分仍為約數，詳見數據來源。</p>
      </section>

      <section>
        <h2 className="section-title">
          歷史抉擇（你遇到的 {r.reveals.length} 個關口中有 {same} 個跟歷史一樣）
        </h2>
        <ol className="reveal-list">
          {r.reveals.map((x) => (
            <li key={x.id} className={x.same ? 'same' : 'diff'}>
              <span className="mono">{x.year}</span>
              <div>
                <strong>{x.title}</strong>
                <div className="small">
                  你：「{x.yours ?? '未回覆'}」{x.expired ? '（限期已過）' : ''}
                  {!x.same && <> ／ 歷史：「{x.real}」</>}
                </div>
                <p className="small muted">{x.reveal}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="section-title">
          政策與稅率對比（{r.policies.length} 項中有 {r.policies.filter((p) => p.same).length} 項跟真實一樣）
        </h2>
        <div className="table-wrap">
          <table className="metrics policy-table">
            <thead>
              <tr>
                <th>政策／稅率</th>
                <th>你的香港</th>
                <th>真實香港</th>
              </tr>
            </thead>
            <tbody>
              {r.policies.map((p) => (
                <tr key={p.id} className={p.same ? '' : 'diff'}>
                  <td>{p.label}</td>
                  <td>{p.yours}</td>
                  <td>
                    {p.real}
                    {p.realHistory.includes('→') && <div className="muted small">{p.realHistory}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">{r.endYear} 年的政策和稅率。真實香港一欄下面是它歷年的改變。</p>
      </section>

      <section>
        <h2 className="section-title">你的撥款 vs 真實政府（平均撥款水平）</h2>
        <div className="table-wrap">
          <table className="metrics funding-table">
            <thead>
              <tr>
                <th>時期</th>
                {DEPARTMENTS.map((d) => (
                  <th key={d}>{DEPT_INFO[d].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.funding.map((p) => (
                <tr key={p.from}>
                  <td>
                    {p.from}–{p.to}
                  </td>
                  {DEPARTMENTS.map((d) => (
                    <td key={d} className="mono">
                      {percent(p.yours[d])}
                      <span className="muted small"> ／{percent(p.real[d])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">每格：你的撥款水平 ／ 真實政府（估算）。100% = 維持現有服務。</p>
      </section>

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
