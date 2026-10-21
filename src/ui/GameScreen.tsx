import { useCallback, useEffect, useRef, useState } from 'react'
import { POPULATION } from '../data/history'
import { choose, finishYear, historyChoice, setAllocation, tick, yearEndMonth } from '../engine/sim'
import { START_YEAR, type Allocation, type ChoiceRecord, type GameState, type NewsItem } from '../engine/types'
import { AllocationDialog } from './AllocationDialog'
import { ChoiceDialog, RevealDialog } from './ChoiceDialog'
import { IndicatorPanel } from './IndicatorPanel'
import { NewsFeed } from './NewsFeed'
import { SourcesDialog } from './SourcesDialog'
import { saveSpeed, type Speed } from './storage'

const MONTH_MS: Record<Speed, number> = { slow: 1400, normal: 800, fast: 330 }
const SPEED_LABEL: Record<Speed, string> = { slow: '慢', normal: '中', fast: '快' }
const NEXT_SPEED: Record<Speed, Speed> = { slow: 'normal', normal: 'fast', fast: 'slow' }
const FRAME_MS = 80

interface Props {
  game: GameState
  initialSpeed: Speed
  onEnd: () => void
  onQuit: () => void
}

export function GameScreen({ game, initialSpeed, onEnd, onQuit }: Props) {
  const [, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState<Speed>(initialSpeed)
  const [auto, setAuto] = useState(false)
  const [reveal, setReveal] = useState<{ record: ChoiceRecord; news?: NewsItem } | null>(null)
  const [editing, setEditing] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const progress = useRef(game.month)

  const blocked = Boolean(reveal) || editing || showSources
  const running = game.status === 'running' && !paused && !blocked

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      progress.current += (now - last) / MONTH_MS[speed]
      last = now
      const endMonth = yearEndMonth(game)
      tick(game, Math.min(Math.floor(progress.current), endMonth))
      if (game.status === 'running' && progress.current >= endMonth + 1) {
        finishYear(game)
        progress.current = game.month
      }
      bump()
    }, FRAME_MS)
    return () => window.clearInterval(id)
  }, [running, speed, game, bump])

  // Auto mode follows real history at decision points and keeps the current focus.
  useEffect(() => {
    if (!auto || reveal) return
    if (game.status === 'choice') {
      choose(game, historyChoice(game.pending!))
      bump()
    } else if (game.status === 'allocate') {
      setAllocation(game, game.alloc)
      progress.current = game.month
      bump()
    }
  }, [auto, reveal, game, game.status, bump])

  useEffect(() => {
    if (game.status !== 'ended') return
    const id = window.setTimeout(onEnd, 1800)
    return () => window.clearTimeout(id)
  }, [game.status, onEnd])

  const onChoose = (optionId: string) => {
    const record = choose(game, optionId)
    setReveal({ record, news: game.news[game.news.length - 1] })
    bump()
  }

  const onAllocate = (alloc: Allocation) => {
    const atPeriodStart = game.status === 'allocate'
    setAllocation(game, alloc)
    if (atPeriodStart) progress.current = game.month
    setEditing(false)
    bump()
  }

  const changeSpeed = () => {
    const next = NEXT_SPEED[speed]
    setSpeed(next)
    saveSpeed(next)
  }

  const monthShown = Math.min(Math.max(1, Math.floor(progress.current)), 12)
  const yearFraction = Math.min(1, Math.max(0, (progress.current - 1) / 12))
  const population = POPULATION[game.year - START_YEAR]
  const latest = game.news[game.news.length - 1]
  const pendingChange =
    game.allocByYear[game.year] && JSON.stringify(game.allocByYear[game.year]) !== JSON.stringify(game.alloc)

  return (
    <div className="game">
      <header className="game-head">
        <div className="clock">
          <div className="year">{game.year}</div>
          <div className="clock-meta">
            <span>{monthShown} 月</span>
            <span className="muted">人口 {Math.round(population * 100)} 萬（真實）</span>
          </div>
          <div className="year-progress" aria-hidden="true">
            <div style={{ width: `${yearFraction * 100}%` }} />
          </div>
        </div>
        <div className="controls">
          <button
            className="button"
            onClick={() => setPaused(!paused)}
            disabled={game.status !== 'running'}
            aria-label={paused ? '繼續' : '暫停'}
          >
            {paused ? '▶ 繼續' : '❚❚ 暫停'}
          </button>
          <button className="button" onClick={changeSpeed} aria-label="切換速度">
            速度：{SPEED_LABEL[speed]}
          </button>
          <label className="toggle" title="自動跟隨真實歷史的選擇，並沿用目前的施政重心">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            自動
          </label>
        </div>
        {latest && (
          <div className="ticker" aria-hidden="true">
            <span className="muted">{latest.month} 月</span> {latest.text}
          </div>
        )}
      </header>

      <main className="game-body">
        <div className="left-col">
          <IndicatorPanel game={game} />
          <div className="left-actions">
            <button className="button primary" onClick={() => setEditing(true)} disabled={game.status === 'ended'}>
              調整施政重心
            </button>
            {pendingChange && <span className="muted small">新分配由 {game.year + 1} 年生效</span>}
          </div>
          <div className="left-links">
            <button className="link" onClick={() => setShowSources(true)}>
              數據來源與模型
            </button>
            <button className="link" onClick={onQuit}>
              離開這局
            </button>
          </div>
        </div>
        <NewsFeed news={game.news} />
      </main>

      {game.status === 'allocate' && !auto && <AllocationDialog game={game} mandatory onConfirm={onAllocate} />}
      {editing && game.status !== 'allocate' && (
        <AllocationDialog game={game} mandatory={false} onConfirm={onAllocate} onCancel={() => setEditing(false)} />
      )}
      {game.status === 'choice' && game.pending && !auto && !reveal && (
        <ChoiceDialog choice={game.pending} onChoose={onChoose} />
      )}
      {reveal && <RevealDialog record={reveal.record} news={reveal.news} onContinue={() => setReveal(null)} />}
      {showSources && <SourcesDialog onClose={() => setShowSources(false)} />}
    </div>
  )
}
