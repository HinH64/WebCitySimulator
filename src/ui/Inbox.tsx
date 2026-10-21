import type { InboxItem } from '../engine/types'

interface Props {
  items: InboxItem[]
  now: number
  onAnswer: (uid: number, optionId: string) => void
}

export function Inbox({ items, now, onAnswer }: Props) {
  return (
    <section className={`card inbox ${items.length > 0 ? 'has-items' : ''}`} aria-label="收件匣" aria-live="polite">
      <h2 className="card-title">
        收件匣{items.length > 0 && <span className="badge">{items.length}</span>}
      </h2>
      {items.length === 0 && <p className="muted small">暫時沒有要決定的事。</p>}
      {items.map((item) => {
        const left = item.deadline - now
        const def = item.options.find((o) => o.id === item.defaultOptionId)
        return (
          <article key={item.uid} className="inbox-item">
            <header>
              <strong>{item.title}</strong>
              <span className={`deadline ${left <= 3 ? 'urgent' : ''}`}>剩 {Math.max(0, left)} 個月</span>
            </header>
            <p>{item.text}</p>
            <div className="options">
              {item.options.map((o) => (
                <button key={o.id} className="option" onClick={() => onAnswer(item.uid, o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
            {def && <p className="muted small">限期過後會維持：「{def.label}」</p>}
          </article>
        )
      })}
    </section>
  )
}
