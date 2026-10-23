import { REAL_LANDMARKS, SITE_LANDMARKS } from '../data/landmarks'
import { CANDIDATE_SITES } from '../data/mapProjects'
import { landmarkDecided } from '../engine/landmarks'
import { monthIndex, yearOf } from '../engine/time'
import type { GameState } from '../engine/types'
import { mapMoments, sceneAtMoment } from './mapHistory'

interface Row {
  key: string
  year: number
  name: string
  story: string
  real: string
  differs: boolean
}

/** The end screen's landmarks: which opened as in real Hong Kong, which waited or were never built, and the city's own. */
export function LandmarksList({ game, endT }: { game: GameState; endT: number }) {
  const rows: Row[] = []
  for (const l of REAL_LANDMARKS) {
    const due = monthIndex(...l.opened)
    if (due > endT) continue
    const log = game.landmarks[l.id]
    const real = `真實香港 ${yearOf(due)} 年${l.verb}`
    if (!landmarkDecided(game, l)) rows.push({ key: l.id, year: yearOf(due), name: l.name, story: '你的決定令它沒有興建。', real, differs: true })
    else if (log?.opened === undefined) rows.push({ key: l.id, year: yearOf(due), name: l.name, story: `任期內未能${l.verb}。`, real, differs: true })
    else if (log.opened > due) {
      const years = Math.round((log.opened - due) / 12)
      rows.push({ key: l.id, year: yearOf(log.opened), name: l.name, story: `${yearOf(log.opened)} 年才${l.verb}，${years >= 1 ? `遲了約 ${years} 年` : '遲了幾個月'}。`, real, differs: true })
    } else rows.push({ key: l.id, year: yearOf(due), name: l.name, story: `${yearOf(due)} 年${l.verb}。`, real: '跟真實香港相同', differs: false })
  }
  const last = mapMoments(game, endT).at(-1)!
  const own = sceneAtMoment(last, game).landmarks?.filter((l) => l.id.startsWith('site:')) ?? []
  for (const l of own) {
    const site = CANDIDATE_SITES.find((c) => `site:${c.id}` === l.id)!
    const named = SITE_LANDMARKS.find((s) => s.site === site.id)!
    rows.push({ key: l.id, year: yearOf(endT), name: named.name, story: '你的城市自己的發展，任期完結時已成規模。', real: `真實香港沒有。來源：${site.source}`, differs: true })
  }
  const differing = rows.filter((r) => r.differs)
  const same = rows.filter((r) => !r.differs)
  return (
    <section>
      <h2 className="section-title">你的香港的地標（{differing.length} 個跟真實香港不同）</h2>
      {differing.length > 0 && <ol className="reveal-list works-list">
        {differing.map((r) => (
          <li key={r.key} className="diff">
            <span className="mono">{r.year}</span>
            <div>
              <strong>{r.name}</strong>
              <div className="small">{r.story}</div>
              <p className="small muted">{r.real}</p>
            </div>
          </li>
        ))}
      </ol>}
      {same.length > 0 && <p className="small">跟真實香港同年{same.length === REAL_LANDMARKS.length ? '，全部' : ''}：{same.map((r) => `${r.name}（${r.year}）`).join('、')}。</p>}
      <p className="muted small">真實地標按真實日期開幕；你的城市在相關方面遠遠落後時會延遲，追上後才開幕。地標只作顯示，不改變城市的數字。</p>
    </section>
  )
}
