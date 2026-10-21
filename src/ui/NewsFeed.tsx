import { monthOf, yearOf } from '../engine/time'
import type { NewsItem } from '../engine/types'

const KIND_TAG: Partial<Record<NewsItem['kind'], string>> = {
  inbox: '新抉擇',
  decision: '決定',
  parallel: '城市動態',
  report: '年度報告',
}

export function NewsFeed({ news }: { news: NewsItem[] }) {
  const byYear = new Map<number, NewsItem[]>()
  for (let i = news.length - 1; i >= 0; i--) {
    const year = yearOf(news[i].t)
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(news[i])
  }

  return (
    <section className="card news" aria-label="城市新聞">
      <h2 className="card-title">城市新聞</h2>
      {news.length === 0 && <p className="muted small">時間開始流動後，新聞會在這裡出現。</p>}
      {[...byYear.entries()].map(([year, items]) => (
        <div key={year} className="news-year">
          <div className="news-year-label">{year}</div>
          <ul>
            {items.map((n, i) => (
              <li key={`${n.t}-${i}`} className={`news-item kind-${n.kind} ${n.tone ? `tone-${n.tone}` : ''}`}>
                <span className="news-month">{monthOf(n.t)} 月</span>
                <span className="news-body">
                  {KIND_TAG[n.kind] && <span className="tag">{KIND_TAG[n.kind]}</span>}
                  {n.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
