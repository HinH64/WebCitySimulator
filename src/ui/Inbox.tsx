import type { InboxItem } from '../engine/types'

interface Props {
  items: InboxItem[]
  now: number
  onAnswer: (uid: number, optionId: string) => void
}

/** Pending decisions, shown as cards at the top of the news. Time keeps flowing while they wait. */
export function Inbox({ items, now, onAnswer }: Props) {
  if (items.length === 0) return null
  return (
    <section className="decisions" aria-label="待決定" aria-live="polite">
      <h2 className="decisions-title">
        待決定 <span className="badge">{items.length}</span>
      </h2>
      {items.map((item) => {
        const left = item.deadline - now
        const def = item.options.find((o) => o.id === item.defaultOptionId)
        return (
          <article key={item.uid} className="decision-card">
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
