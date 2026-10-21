import type { ChoiceRecord, NewsItem, PendingChoice } from '../engine/types'
import { Dialog } from './Dialog'
import { monthLabel } from './format'
import { EffectChips } from './NewsFeed'

export function ChoiceDialog({ choice, onChoose }: { choice: PendingChoice; onChoose: (optionId: string) => void }) {
  return (
    <Dialog
      title={choice.title}
      label={`${choice.year} 年 ${monthLabel(choice.month)}${choice.kind === 'parallel' ? '・平行時空' : '・歷史關口'}`}
    >
      <p className="choice-text">{choice.text}</p>
      <div className="options">
        {choice.options.map((o) => (
          <button key={o.id} className="option" onClick={() => onChoose(o.id)}>
            {o.label}
            {o.detail && <span className="muted small">{o.detail}</span>}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

/** Shown after a choice: what really happened, and how this decision moves the city against history. */
export function RevealDialog({
  record,
  news,
  onContinue,
}: {
  record: ChoiceRecord
  news?: NewsItem
  onContinue: () => void
}) {
  const same = record.kind === 'history' && record.optionId === record.realOptionId
  return (
    <Dialog title={record.title} label={record.kind === 'history' ? '歷史揭曉' : '平行時空'}>
      <p>
        你選擇了「{record.optionLabel}」。
        {record.kind === 'history' && (same ? '跟真實歷史一樣。' : `真實歷史選了「${record.realOptionLabel}」。`)}
      </p>
      {record.reveal && <p className="reveal-text">{record.reveal}</p>}
      {news?.effects && news.effects.length > 0 ? (
        <div className="reveal-effects">
          <div className="eyebrow">{record.kind === 'history' ? '相對真實歷史的影響（會隨時間逐步出現）' : '影響'}</div>
          <EffectChips effects={news.effects} />
        </div>
      ) : (
        record.kind === 'history' && <p className="muted small">你的香港在這件事上跟歷史一樣。</p>
      )}
      <div className="dialog-actions">
        <span />
        <button className="button primary" onClick={onContinue} autoFocus>
          繼續
        </button>
      </div>
    </Dialog>
  )
}
