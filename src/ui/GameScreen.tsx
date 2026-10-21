import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { demandRows, topConcerns, type DemandRow } from '../engine/demand'
import { computeIndicators } from '../engine/indicators'
import { answer, debtTotal, metricsNow, step } from '../engine/sim'
import { START_YEAR, monthOf, yearOf } from '../engine/time'
import type { GameState, Signal } from '../engine/types'
import { Inbox } from './Inbox'
import { Indicators } from './Indicators'
import { NewsFeed } from './NewsFeed'
import { BudgetPanel } from './panels/BudgetPanel'
import { DebtPanel } from './panels/DebtPanel'
import { DemandPanel } from './panels/DemandPanel'
import { PolicyPanel } from './panels/PolicyPanel'
import { PopulationPanel } from './panels/PopulationPanel'
import { TaxPanel } from './panels/TaxPanel'
import { SettingsDialog } from './SettingsDialog'
import { SourcesDialog } from './SourcesDialog'
import { formatNumber, money, signed } from './format'
import { saveSpeed, type Settings, type Speed } from './storage'

const MONTH_MS: Record<Speed, number> = { slow: 1600, normal: 1000, fast: 400 }
const SPEED_LABEL: Record<Speed, string> = { slow: '慢', normal: '中', fast: '快' }
const NEXT_SPEED: Record<Speed, Speed> = { slow: 'normal', normal: 'fast', fast: 'slow' }
const FRAME_MS = 100

type PanelId = 'budget' | 'tax' | 'debt' | 'policy' | 'demand' | 'population'
const PANELS: { id: PanelId; label: string }[] = [
  { id: 'budget', label: '預算' },
  { id: 'demand', label: '需求' },
  { id: 'population', label: '人口' },
  { id: 'tax', label: '稅率' },
  { id: 'policy', label: '政策' },
  { id: 'debt', label: '債務' },
]

/** Why the clock should stop after a month, given the player's settings. */
function pauseReason(signals: Signal[], settings: Settings, game: GameState): string | null {
  const year = yearOf(game.t - 1)
  if (signals.includes('crisis') && settings.pauseOnCrisis) return '財政告急，已自動暫停。看看預算、稅率和債務。'
  if (signals.includes('choice') && settings.pauseOnChoice) return '收件匣有新抉擇，已自動暫停。'
  if (signals.includes('yearEnd') && settings.periodic > 0 && (year - START_YEAR) % settings.periodic === settings.periodic - 1) {
    return `${year} 年完結，已按設定暫停。`
  }
  return null
}

interface Props {
  game: GameState
  initialSpeed: Speed
  settings: Settings
  onSettings: (s: Settings) => void
  onEnd: () => void
  onQuit: () => void
}

export function GameScreen({ game, initialSpeed, settings, onSettings, onEnd, onQuit }: Props) {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [paused, setPaused] = useState(false)
  const [pauseNote, setPauseNote] = useState<string | null>(null)
  const [speed, setSpeed] = useState<Speed>(initialSpeed)
  const [panel, setPanel] = useState<PanelId>('budget')
  const [focusRow, setFocusRow] = useState<DemandRow['id']>()
  const [editing, setEditing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const progress = useRef(0)

  const blocked = showSettings || showSources || (settings.pauseWhileEditing && editing)
  const running = game.status === 'running' && !paused && !blocked

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      progress.current += (now - last) / MONTH_MS[speed]
      last = now
      if (progress.current >= 1) {
        progress.current = Math.min(progress.current - 1, 0.99)
        step(game)
        const reason = pauseReason(game.signals, settings, game)
        if (reason) {
          setPaused(true)
          setPauseNote(reason)
        }
      }
      bump()
    }, FRAME_MS)
    return () => window.clearInterval(id)
  }, [running, speed, settings, game, bump])

  useEffect(() => {
    if (game.status !== 'ended') return
    const id = window.setTimeout(onEnd, 1500)
    return () => window.clearTimeout(id)
  }, [game.status, onEnd])

  // Recomputed every render tick; cheap compared to the month step.
  const view = useMemo(() => {
    const m = metricsNow(game)
    const rows = demandRows(game, m)
    const lastYear = [...game.snapshots].reverse().find((snap) => snap.t <= game.t - 12)
    return { m, rows, indicators: computeIndicators(m, game), lastYear: lastYear?.indicators, concerns: topConcerns(rows) }
  }, [game, version])

  const onAnswer = (uid: number, optionId: string) => {
    answer(game, uid, optionId)
    if (paused && pauseNote?.startsWith('收件匣') && game.inbox.length === 0) {
      setPaused(false)
      setPauseNote(null)
    }
    bump()
  }

  const togglePause = () => {
    setPaused(!paused)
    setPauseNote(null)
  }

  const changeSpeed = () => {
    const next = NEXT_SPEED[speed]
    setSpeed(next)
    saveSpeed(next)
  }

  const t = game.status === 'ended' ? game.t - 1 : game.t
  const month = monthOf(t)
  const debt = debtTotal(game)
  const balance = game.last.revenueTotal - game.last.spendingTotal
  const latest = game.news[game.news.length - 1]
  const { m } = view

  return (
    <div className="game">
      <header className="topbar">
        <div className="clock">
          <div className="year">{yearOf(t)}</div>
          <div className="clock-meta">
            <span>{month} 月</span>
            <div className="year-progress" aria-hidden="true">
              <div style={{ width: `${((month - 1 + progress.current) / 12) * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="vitals">
          <div className="vital">
            <span className="eyebrow">庫房</span>
            <strong>{money(game.reserves)}</strong>
            <span className={`small ${balance >= 0 ? 'good' : 'bad'}`}>
              {balance >= 0 ? '▲' : '▼'} {money(Math.abs(balance))}／月
            </span>
          </div>
          {debt > 0 && (
            <div className="vital">
              <span className="eyebrow">債務</span>
              <strong className="warn">{money(debt)}</strong>
            </div>
          )}
          <div className="vital">
            <span className="eyebrow">人口</span>
            <strong>{formatNumber(m.population, 1)} 萬</strong>
            <span className={`small ${game.last.popChange >= 0 ? 'good' : 'bad'}`}>{signed(game.last.popChange * 12, 1)} 萬／年</span>
          </div>
        </div>
        <div className="controls">
          <button className="button" onClick={togglePause} disabled={game.status !== 'running'}>
            {paused ? '▶ 繼續' : '❚❚ 暫停'}
          </button>
          <button className="button" onClick={changeSpeed}>
            速度：{SPEED_LABEL[speed]}
          </button>
          <button className="button icon" onClick={() => setShowSettings(true)} aria-label="設定">
            ⚙
          </button>
        </div>
        {latest && (
          <div className="ticker" aria-hidden="true">
            <span className="muted">{monthOf(latest.t)} 月</span> {latest.text}
          </div>
        )}
      </header>

      {paused && pauseNote && (
        <div className="pause-note" role="status">
          <span>{pauseNote}</span>
          <button className="button primary small-button" onClick={togglePause}>
            繼續
          </button>
        </div>
      )}

      <main className="layout">
        <div className="col-left">
          <Indicators
            values={view.indicators}
            lastYear={view.lastYear}
            concerns={view.concerns}
            onSelect={(row) => {
              setPanel('demand')
              setFocusRow(row)
            }}
          />
        </div>

        <section
          className="card col-center"
          onPointerEnter={() => setEditing(true)}
          onPointerLeave={() => setEditing(false)}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          aria-label="面板"
        >
          <nav className="tabs" role="tablist">
            {PANELS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={panel === p.id}
                className={panel === p.id ? 'active' : ''}
                onClick={() => {
                  setPanel(p.id)
                  setFocusRow(undefined)
                }}
              >
                {p.label}
              </button>
            ))}
          </nav>
          {panel === 'budget' && <BudgetPanel game={game} metrics={m} onChange={bump} />}
          {panel === 'demand' && <DemandPanel rows={view.rows} focus={focusRow} />}
          {panel === 'population' && <PopulationPanel game={game} metrics={m} />}
          {panel === 'tax' && <TaxPanel game={game} onChange={bump} />}
          {panel === 'policy' && <PolicyPanel game={game} onChange={bump} />}
          {panel === 'debt' && <DebtPanel game={game} metrics={m} onChange={bump} />}
        </section>

        <div className="col-right">
          <Inbox items={game.inbox} now={game.t} onAnswer={onAnswer} />
          <NewsFeed news={game.news} />
        </div>
      </main>

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onChange={onSettings}
          onClose={() => setShowSettings(false)}
          onSources={() => {
            setShowSettings(false)
            setShowSources(true)
          }}
          onQuit={onQuit}
        />
      )}
      {showSources && <SourcesDialog onClose={() => setShowSources(false)} />}
    </div>
  )
}
