import { memo } from 'react'
import { CATEGORY_LABEL } from '../data/cityEvents'
import { monthOf, yearOf } from '../engine/time'
import type { NewsItem } from '../engine/types'

const KIND_TAG: Partial<Record<NewsItem['kind'], string>> = {
  history: '大事',
  inbox: '新抉擇',
  decision: '決定',
  parallel: '城市動態',
  milestone: '里程碑',
  report: '年度報告',
}

function tagFor(n: NewsItem): string | undefined {
  return n.kind === 'city' && n.category ? CATEGORY_LABEL[n.category] : KIND_TAG[n.kind]
}

interface Props {
  news: NewsItem[]
  /** News only ever grows, so its length tells whether anything changed. */
  count: number
}

function NewsFeedView({ news }: Props) {
  // Keyed by position in the whole feed, so only new items mount (and fade in).
  const byYear = new Map<number, { n: NewsItem; i: number }[]>()
  for (let i = news.length - 1; i >= 0; i--) {
    const year = yearOf(news[i].t)
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({ n: news[i], i })
  }

  return (
    <section className="news" aria-label="城市新聞">
      <h2 className="news-title">城市新聞</h2>
      {news.length === 0 && <p className="muted small">時間開始流動後，新聞會在這裡出現。</p>}
      {[...byYear.entries()].map(([year, items]) => (
        <div key={year} className="news-year">
          <div className="news-year-label">{year}</div>
          <ul>
            {items.map(({ n, i }) => {
              const tag = tagFor(n)
              return (
                <li key={i} className={`news-item kind-${n.kind} ${n.tone ? `tone-${n.tone}` : ''}`}>
                  <span className="news-month">{monthOf(n.t)} 月</span>
                  <span className="news-body">
                    {tag && <span className={`tag tag-${n.kind}`}>{tag}</span>}
                    {n.text}
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

export const NewsFeed = memo(NewsFeedView, (a, b) => a.count === b.count)
