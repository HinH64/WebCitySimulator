import { useEffect, useRef } from 'react'
import type { DemandRow } from '../../engine/demand'

const STATUS_LABEL = { good: '良好', warn: '緊張', bad: '嚴重' } as const
const RESPONSE_LABEL = { yes: '市民覺得政府有回應', some: '市民覺得政府回應不足', no: '市民覺得政府沒有回應' } as const

export function DemandPanel({ rows, focus }: { rows: DemandRow[]; focus?: DemandRow['id'] }) {
  const refs = useRef<Partial<Record<DemandRow['id'], HTMLElement | null>>>({})

  useEffect(() => {
    if (focus) refs.current[focus]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focus])

  return (
    <div className="panel">
      <p className="muted small">
        城市缺甚麼、為甚麼。原因會隨你的撥款、政策和人口變化而改變。問題嚴重而政府沒有回應（加撥款、改政策、回覆抉擇），民望就會下跌。
      </p>
      <div className="demand-list">
        {rows.map((r) => (
          <article
            key={r.id}
            ref={(el) => {
              refs.current[r.id] = el
            }}
            className={`demand status-${r.status} ${focus === r.id ? 'focused' : ''}`}
          >
            <header>
              <strong>{r.title}</strong>
              <span className={`status-pill ${r.status}`}>{STATUS_LABEL[r.status]}</span>
            </header>
            <p className="demand-headline">{r.headline}</p>
            {r.response && <p className={`response response-${r.response}`}>{RESPONSE_LABEL[r.response]}</p>}
            <dl className="figures">
              {r.figures.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
            {r.reasons.length > 0 && (
              <ul className="reasons">
                {r.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
