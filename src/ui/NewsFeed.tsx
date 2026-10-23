import { memo, useState } from 'react'
import { CITIZEN_BY_ID } from '../data/citizens'
import { CATEGORY_LABEL } from '../data/cityEvents'
import { monthOf, yearOf } from '../engine/time'
import type { NewsItem, Place } from '../engine/types'

const KIND_TAG: Partial<Record<NewsItem['kind'], string>> = {
  history: '大事',
  inbox: '新抉擇',
  decision: '決定',
  parallel: '城市動態',
  project: '工程',
  citizen: '市民故事',
  stats: '統計數字',
  milestone: '里程碑',
  report: '年度報告',
}

function tagFor(n: NewsItem): string | undefined {
  if (n.kind === 'city' && n.category) return CATEGORY_LABEL[n.category]
  if (n.kind === 'citizen' && n.citizen) return CITIZEN_BY_ID[n.citizen]?.name
  return KIND_TAG[n.kind]
}

interface Props {
  news: NewsItem[]
  /** News only ever grows, so its length tells whether anything changed. */
  count: number
  /** Shows where a piece of news happened on the map. */
  onPlace: (place: Place) => void
}

function NewsFeedView({ news, onPlace }: Props) {
  const [onlyPeople, setOnlyPeople] = useState(false)
  const hasPeople = news.some((n) => n.kind === 'citizen')
  const shown = onlyPeople && hasPeople ? (n: NewsItem) => n.kind === 'citizen' : () => true
  // Keyed by position in the whole feed, so only new items mount (and fade in).
  const byYear = new Map<number, { n: NewsItem; i: number }[]>()
  for (let i = news.length - 1; i >= 0; i--) {
    if (!shown(news[i])) continue
    const year = yearOf(news[i].t)
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({ n: news[i], i })
  }

  return (
    <section className="news" aria-label="城市新聞">
      <div className="news-head">
        <h2 className="news-title">城市新聞</h2>
        {hasPeople && (
          <div className="segmented small-seg" role="group" aria-label="顯示">
            <button className={onlyPeople ? '' : 'active'} aria-pressed={!onlyPeople} onClick={() => setOnlyPeople(false)}>
              全部
            </button>
            <button className={onlyPeople ? 'active' : ''} aria-pressed={onlyPeople} onClick={() => setOnlyPeople(true)}>
              市民故事
            </button>
          </div>
        )}
      </div>
      {news.length === 0 && <p className="muted small">時間開始流動後，新聞會在這裡出現。</p>}
      {[...byYear.entries()].map(([year, items]) => (
        <div key={year} className="news-year">
          <div className="news-year-label">{year}</div>
          <ul>
            {items.map(({ n, i }) => {
              const tag = tagFor(n)
              const place = n.place
              return (
                <li key={i} className={`news-item kind-${n.kind} ${n.tone ? `tone-${n.tone}` : ''}`}>
                  <span className="news-month">{monthOf(n.t)} 月</span>
                  <span className="news-body">
                    {tag && <span className={`tag tag-${n.kind}`}>{tag}</span>}
                    {n.text}
                    {place && (
                      <button className="place-button" onClick={() => onPlace(place)} aria-label="在地圖上顯示這則新聞的位置">
                        地圖
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

export const NewsFeed = memo(NewsFeedView, (a, b) => a.count === b.count && a.onPlace === b.onPlace)
