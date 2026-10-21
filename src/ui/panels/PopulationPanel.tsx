import { attractiveness, realMetrics } from '../../engine/metrics'
import { LAST_MONTH_INDEX } from '../../engine/time'
import type { GameState, Metrics } from '../../engine/types'
import { formatNumber, signed } from '../format'

const FACTOR_LABEL = {
  jobs: '就業機會',
  income: '收入',
  housing: '住屋',
  services: '醫療及教育',
  environment: '環境',
  tax: '稅務',
  policy: '政策',
} as const

function verdict(v: number): { text: string; tone: string } {
  if (v >= 1.01) return { text: '吸引人留下', tone: 'good' }
  if (v <= 0.99) return { text: '推走人', tone: 'bad' }
  return { text: '一般', tone: 'muted' }
}

export function PopulationPanel({ game, metrics: m }: { game: GameState; metrics: Metrics }) {
  const t = Math.min(game.t, LAST_MONTH_INDEX)
  const attract = attractiveness(m, realMetrics(t), game, t)
  const last = game.last
  const year = (v: number) => signed(v * 12, 1)
  const overall = verdict(attract.total)

  return (
    <div className="panel">
      <div className="summary-grid">
        <div>
          <div className="eyebrow">人口</div>
          <div className="big-number">{formatNumber(m.population, 1)} 萬</div>
        </div>
        <div>
          <div className="eyebrow">全年變化（按上月推算）</div>
          <div className={`big-number ${last.popChange >= 0 ? 'good' : 'bad'}`}>{year(last.popChange)} 萬</div>
        </div>
        <div>
          <div className="eyebrow">整體吸引力</div>
          <div className={`big-number ${overall.tone}`}>{overall.text}</div>
        </div>
      </div>

      <h3 className="card-subtitle">人口從哪裡來（全年推算）</h3>
      <ul className="breakdown plain">
        <li>
          <span>出生</span>
          <span className="mono">{year(last.births)} 萬</span>
        </li>
        <li>
          <span>死亡</span>
          <span className="mono">{year(-last.deaths)} 萬</span>
        </li>
        <li>
          <span>單程證移入</span>
          <span className="mono">{year(last.oneWay)} 萬</span>
        </li>
        <li>
          <span>其他移入減移出</span>
          <span className="mono">{year(last.otherNet)} 萬</span>
        </li>
      </ul>

      <h3 className="card-subtitle">年齡結構</h3>
      <div className="age-bar" aria-label="年齡結構">
        <span className="age-child" style={{ flexGrow: m.children }}>
          0–14 歲 {formatNumber((m.children / m.population) * 100, 0)}%
        </span>
        <span className="age-working" style={{ flexGrow: m.working }}>
          15–64 歲 {formatNumber((m.working / m.population) * 100, 0)}%
        </span>
        <span className="age-elderly" style={{ flexGrow: m.elderly }}>
          65+ {formatNumber((m.elderly / m.population) * 100, 0)}%
        </span>
      </div>

      <h3 className="card-subtitle">甚麼令人留下或離開</h3>
      <ul className="factor-list">
        {(Object.keys(FACTOR_LABEL) as (keyof typeof FACTOR_LABEL)[]).map((k) => {
          const v = verdict(attract.factors[k])
          return (
            <li key={k}>
              <span>{FACTOR_LABEL[k]}</span>
              <span className={v.tone}>{v.text}</span>
            </li>
          )
        })}
      </ul>
      <p className="muted small">吸引力高，移入的人多過移出；人口增加會帶來稅收和人手，也會增加住屋、交通和醫療需求。</p>
    </div>
  )
}
