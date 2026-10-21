import type { DemandRow } from '../engine/demand'
import { INDICATOR_LABEL } from '../engine/indicators'
import { INDICATOR_IDS, type IndicatorId } from '../engine/types'
import { signed } from './format'

/** Demand-panel row that explains each indicator. */
export const INDICATOR_ROW: Record<IndicatorId, DemandRow['id']> = {
  economy: 'jobs',
  housing: 'housing',
  mobility: 'transport',
  wellbeing: 'care',
  talent: 'education',
  environment: 'environment',
}

interface Props {
  values: Record<IndicatorId, number>
  lastYear?: Record<IndicatorId, number>
  concerns: DemandRow[]
  onSelect: (row: DemandRow['id']) => void
}

export function Indicators({ values, lastYear, concerns, onSelect }: Props) {
  return (
    <section className="card indicators" aria-label="發展指標">
      <h2 className="card-title">發展指標</h2>
      <div className="indicator-list">
        {INDICATOR_IDS.map((k) => {
          const v = values[k]
          const change = lastYear ? v - lastYear[k] : 0
          return (
            <button key={k} className={`indicator ind-${k}`} onClick={() => onSelect(INDICATOR_ROW[k])} title="按此查看原因">
              <span className="indicator-top">
                <span className="indicator-name">{INDICATOR_LABEL[k]}</span>
                <span className="indicator-value">{Math.round(v)}</span>
                <span className={`trend-arrow ${change > 0.5 ? 'good' : change < -0.5 ? 'bad' : 'muted'}`}>
                  {Math.abs(change) < 0.5 ? '–' : `${change > 0 ? '▲' : '▼'} ${signed(change, 0)}`}
                </span>
              </span>
              <span className="bar" aria-hidden="true">
                <span className="bar-fill" style={{ width: `${v}%` }} />
              </span>
            </button>
          )
        })}
      </div>
      <p className="muted small">變化與一年前比較。按指標查看原因。</p>

      {concerns.length > 0 && (
        <div className="concerns">
          <h3 className="card-subtitle">市民最關心</h3>
          <ol>
            {concerns.map((c) => (
              <li key={c.id}>
                <button className="link" onClick={() => onSelect(c.id)}>
                  {c.title}：{c.headline}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
