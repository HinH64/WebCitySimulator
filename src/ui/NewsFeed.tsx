import type { NewsItem } from '../engine/types'
import { effectLabel, monthLabel } from './format'

const KIND_TAG: Partial<Record<NewsItem['kind'], string>> = {
  choice: '你的決定',
  parallel: '平行時空',
  project: '施政',
}

export function EffectChips({ effects }: { effects?: NewsItem['effects'] }) {
  if (!effects || effects.length === 0) return null
  return (
    <span className="chips">
      {effects.map((e) => (
        <span key={e.k} className={`chip ${e.v > 0 ? 'good' : 'bad'}`}>
          {effectLabel(e.k, e.v)}
        </span>
      ))}
    </span>
  )
}

export function NewsFeed({ news }: { news: NewsItem[] }) {
  const byYear = new Map<number, NewsItem[]>()
  for (let i = news.length - 1; i >= 0; i--) {
    const n = news[i]
    if (!byYear.has(n.year)) byYear.set(n.year, [])
    byYear.get(n.year)!.push(n)
  }

  return (
    <section className="news" aria-label="城市新聞" aria-live="polite">
      <h2 className="section-title">城市新聞</h2>
      {news.length === 0 && <p className="muted">時間開始流動後，新聞會在這裡出現。</p>}
      {[...byYear.entries()].map(([year, items]) => (
        <div key={year} className="news-year">
          <div className="news-year-label">{year}</div>
          <ul>
            {items.map((n, i) => (
              <li key={`${n.month}-${i}-${n.text}`} className={`news-item kind-${n.kind}`}>
                <span className="news-month">{monthLabel(n.month)}</span>
                <span className="news-body">
                  {KIND_TAG[n.kind] && <span className="tag">{KIND_TAG[n.kind]}</span>}
                  {n.text}
                  <EffectChips effects={n.effects} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
