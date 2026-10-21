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
  onSelect: (row: DemandRow['id']) => void
}

/** The six indicators as a compact strip under the top bar. */
export function IndicatorStrip({ values, lastYear, onSelect }: Props) {
  return (
    <section className="indicator-strip" aria-label="發展指標（按指標查看原因）">
      {INDICATOR_IDS.map((k) => {
        const v = values[k]
        const change = lastYear ? v - lastYear[k] : 0
        return (
          <button
            key={k}
            className={`indicator ind-${k}`}
            onClick={() => onSelect(INDICATOR_ROW[k])}
            title={`${INDICATOR_LABEL[k]}：按此查看原因（變化與一年前比較）`}
          >
            <span className="indicator-top">
              <span className="indicator-name">{INDICATOR_LABEL[k]}</span>
              <span className="indicator-value">{Math.round(v)}</span>
              <span className={`trend-arrow ${change > 0.5 ? 'good' : change < -0.5 ? 'bad' : 'muted'}`}>
                {Math.abs(change) < 0.5 ? '' : `${change > 0 ? '▲' : '▼'}${signed(change, 0).slice(1)}`}
              </span>
            </span>
            <span className="bar" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${v}%` }} />
            </span>
          </button>
        )
      })}
    </section>
  )
}

/** What people worry about most, shown above the news. */
export function Concerns({ concerns, onSelect }: { concerns: DemandRow[]; onSelect: (row: DemandRow['id']) => void }) {
  if (concerns.length === 0) return null
  return (
    <section className="concerns" aria-label="市民最關心">
      <span className="concerns-label">市民最關心</span>
      <ol>
        {concerns.map((c) => (
          <li key={c.id}>
            <button className={`concern status-${c.status}`} onClick={() => onSelect(c.id)}>
              <strong>{c.title}</strong>
              <span>{c.headline}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
