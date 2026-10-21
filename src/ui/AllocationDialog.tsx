import { useState } from 'react'
import { REAL_ALLOCATION } from '../data/history'
import { LABELS, realScores } from '../engine/model'
import { INDICATORS, PERIOD_STARTS, TOTAL_POINTS, type Allocation, type GameState } from '../engine/types'
import { Dialog } from './Dialog'
import { pointsToPercent, signed } from './format'

interface Props {
  game: GameState
  /** Period start: the game waits for this. Otherwise the change applies from next year. */
  mandatory: boolean
  onConfirm: (alloc: Allocation) => void
  onCancel?: () => void
}

const HINTS = {
  housing: '公營房屋、土地開發',
  economy: '產業、就業、招商',
  transport: '鐵路、道路',
  environment: '空氣、綠化、保育',
  livelihood: '醫療、教育、福利',
  finance: '存起來，轉入儲備',
} as const

function previousPeriod(game: GameState) {
  const i = (PERIOD_STARTS as readonly number[]).indexOf(game.year)
  if (i <= 0) return undefined
  const real = REAL_ALLOCATION[i - 1]
  const years = Object.keys(game.allocByYear)
    .map(Number)
    .filter((y) => y >= real.year && y < game.year)
  const yours = Object.fromEntries(
    INDICATORS.map((k) => [k, years.reduce((s, y) => s + game.allocByYear[y][k], 0) / Math.max(1, years.length)]),
  ) as Allocation
  return { real, yours, end: game.year - 1 }
}

export function AllocationDialog({ game, mandatory, onConfirm, onCancel }: Props) {
  const [alloc, setAlloc] = useState<Allocation>({ ...game.alloc })
  const used = INDICATORS.reduce((s, k) => s + alloc[k], 0)
  const left = TOTAL_POINTS - used
  const prev = mandatory ? previousPeriod(game) : undefined
  const real = realScores(game.year)
  const nextPeriod = (PERIOD_STARTS as readonly number[]).find((y) => y > game.year)

  const change = (k: keyof Allocation, d: number) => {
    const v = alloc[k] + d
    if (v < 0 || (d > 0 && left <= 0)) return
    setAlloc({ ...alloc, [k]: v })
  }

  const title = mandatory
    ? `${game.year}–${(nextPeriod ?? 2027) - 1} 年的施政重心`
    : '調整施政重心'

  return (
    <Dialog title={title} label={mandatory ? '新階段' : '由下一年生效'} onClose={mandatory ? undefined : onCancel} wide>
      {prev && (
        <div className="reveal-box">
          <div className="eyebrow">
            揭曉：{prev.real.year}–{prev.end} 年真實政府的重心（估算）
          </div>
          <p className="muted small">{prev.real.summary}</p>
          <div className="alloc-compare">
            {INDICATORS.map((k) => (
              <div key={k} className={`alloc-compare-row ind-${k}`}>
                <span>{LABELS[k]}</span>
                <span className="mono">
                  你 {pointsToPercent(prev.yours[k])} ／ 真實 {pointsToPercent(prev.real.alloc[k])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="muted small">
        把 {TOTAL_POINTS} 點分配到六項，每點代表 5%。投入有邊際遞減，指標越弱，投入越見效；住屋和交通要等工程完成才見效。
      </p>

      <div className="alloc-rows">
        {INDICATORS.map((k) => {
          const gap = game.values[k] - real[k]
          return (
            <div key={k} className={`alloc-row ind-${k}`}>
              <div className="alloc-label">
                <strong>{LABELS[k]}</strong>
                <span className="muted small">{HINTS[k]}</span>
              </div>
              <div className="alloc-state small muted">
                現時 {Math.round(game.values[k])}（{Math.abs(gap) < 0.5 ? '＝歷史' : `歷史 ${signed(gap)}`}）
              </div>
              <div className="stepper">
                <button className="step" onClick={() => change(k, -1)} disabled={alloc[k] <= 0} aria-label={`減少${LABELS[k]}`}>
                  −
                </button>
                <span className="alloc-dots" aria-label={`${LABELS[k]} ${alloc[k]} 點`}>
                  {Array.from({ length: Math.max(alloc[k], 0) }, (_, i) => (
                    <span key={i} className="dot" />
                  ))}
                  <span className="alloc-pct">{pointsToPercent(alloc[k])}</span>
                </span>
                <button className="step" onClick={() => change(k, 1)} disabled={left <= 0} aria-label={`增加${LABELS[k]}`}>
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="dialog-actions">
        <span className={left === 0 ? 'muted' : 'warn'}>{left === 0 ? '已分配全部點數' : `尚餘 ${left} 點`}</span>
        <div className="actions">
          {onCancel && !mandatory && (
            <button className="button ghost" onClick={onCancel}>
              取消
            </button>
          )}
          <button className="button primary" disabled={left !== 0} onClick={() => onConfirm(alloc)}>
            {mandatory ? '開始這個階段' : '確定'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
