import { useState } from 'react'
import { CANDIDATE_ROUTES, CANDIDATE_SITES } from '../data/mapProjects'
import { railKey, siteKey } from '../engine/map'
import { suspended, workInfo, type WorkKind } from '../engine/projects'
import { yearOf } from '../engine/time'
import type { GameState, WorkLog } from '../engine/types'

const PLANS = new Map<string, string>([
  ...CANDIDATE_SITES.map((s): [string, string] => [siteKey(s.id), s.source]),
  ...CANDIDATE_ROUTES.map((r): [string, string] => [railKey(r.id), r.source]),
])

/** Rows shown before the rest are folded away. */
const FIRST_ROWS = 8

const y = (t: number) => `${yearOf(t)} 年`

/** What happened to one of the city's works over the term. */
function story(key: string, kind: WorkKind, log: WorkLog): string {
  const done = kind === 'rail' ? '通車' : kind === 'industry' ? '落成' : '第一批屋邨落成'
  const parts: string[] = []
  if (log.built !== undefined) {
    if (log.building !== undefined && log.building < log.built) parts.push(`${y(log.building)}動工`)
    parts.push(`${y(log.built)}${done}`)
  } else if (log.building !== undefined) parts.push(`${y(log.building)}動工，任期完結時仍在施工`)
  if (log.delayed !== undefined) {
    const stopped = kind === 'rail' && suspended(key, log.delayed)
    parts.push(`${y(log.delayed)}${stopped ? '撥款不足，部分服務暫停' : '因撥款不足延遲'}`)
    if (log.caughtUp !== undefined) parts.push(`${y(log.caughtUp)}${stopped ? '恢復服務' : kind === 'rail' ? '終於通車' : '終於落成'}`)
    else parts.push('任期內未能完成')
  }
  return parts.join('，') + '。'
}

/** How real Hong Kong compares: when it had the same, or the plan a new work came from. */
function reality(key: string, kind: WorkKind, log: WorkLog): string {
  const had = kind === 'rail' ? '通車' : '建成'
  if (log.realAt === undefined) return `真實香港沒有在這時興建。來源：${PLANS.get(key) ?? '規劃研究'}`
  const first = log.built ?? log.delayed!
  if (log.built !== undefined && log.realAt > first) {
    const years = Math.round((log.realAt - first) / 12)
    return years >= 1 ? `比真實香港早約 ${years} 年（真實香港 ${y(log.realAt)}${had}）` : `比真實香港早幾個月（真實香港 ${y(log.realAt)}${had}）`
  }
  return `真實香港 ${y(log.realAt)}已${had}`
}

/** The end screen's list of the city's own works: what it built that history did not, and what it delayed. */
export function WorksList({ game }: { game: GameState }) {
  const [all, setAll] = useState(false)
  const first = (log: WorkLog) => Math.min(...[log.building, log.built, log.delayed].filter((v): v is number => v !== undefined))
  const rows = Object.entries(game.works)
    .map(([key, log]) => ({ key, log, info: workInfo(key) }))
    .filter(({ log }) => log.building !== undefined || log.built !== undefined || log.delayed !== undefined)
    .sort((a, b) => first(a.log) - first(b.log))
  if (rows.length === 0) return null
  const shown = all ? rows : rows.slice(0, FIRST_ROWS)
  return (
    <section>
      <h2 className="section-title">你的香港的工程（{rows.length} 項跟真實香港不同）</h2>
      <ol className="reveal-list works-list">
        {shown.map(({ key, log, info }) => (
          <li key={key} className={log.delayed !== undefined && log.caughtUp === undefined ? 'diff' : 'same'}>
            <span className="mono">{yearOf(first(log))}</span>
            <div>
              <strong>{info.name}</strong>
              <div className="small">{story(key, info.kind, log)}</div>
              <p className="small muted">{reality(key, info.kind, log)}</p>
            </div>
          </li>
        ))}
      </ol>
      {rows.length > FIRST_ROWS && (
        <button className="link" onClick={() => setAll(!all)}>
          {all ? '只顯示頭 8 項' : `顯示全部 ${rows.length} 項`}
        </button>
      )}
      <p className="muted small">你的撥款和政策帶來的新發展，以及提早或延遲的工程。真實香港的年份按地圖數據，屬約數。</p>
    </section>
  )
}
