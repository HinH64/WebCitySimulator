import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { demandRows, topConcerns, type DemandRow } from '../engine/demand'
import { computeIndicators } from '../engine/indicators'
import { APPROVAL } from '../engine/approval'
import { answer, debtTotal, metricsNow, step } from '../engine/sim'
import { START_YEAR, monthOf, yearOf } from '../engine/time'
import type { GameState, Place, Signal } from '../engine/types'
import { Inbox } from './Inbox'
import { Concerns, IndicatorStrip } from './Indicators'
import { MapCard, MapView, type MapFocus } from './MapView'
import { NewsFeed } from './NewsFeed'
import { BudgetPanel } from './panels/BudgetPanel'
import { DebtPanel } from './panels/DebtPanel'
import { DemandPanel } from './panels/DemandPanel'
import { PolicyPanel } from './panels/PolicyPanel'
import { PopulationPanel } from './panels/PopulationPanel'
import { TaxPanel } from './panels/TaxPanel'
import { SettingsDialog } from './SettingsDialog'
import { SourcesDialog } from './SourcesDialog'
import { SpeedMenu } from './SpeedMenu'
import { formatNumber, money, signed } from './format'
import { dueStop, monthMs, skipStop } from './speed'
import { saveSpeed, type Settings, type Speed } from './storage'

const FRAME_MS = 100
/** At high speed one tick may simulate a few months, but never more, so the page keeps up. */
const MAX_STEPS_PER_TICK = 4

type PanelId = 'map' | 'budget' | 'tax' | 'debt' | 'policy' | 'demand' | 'population'
const PANELS: { id: PanelId; label: string }[] = [
  { id: 'budget', label: '預算' },
  { id: 'demand', label: '需求' },
  { id: 'population', label: '人口' },
  { id: 'tax', label: '稅率' },
  { id: 'policy', label: '政策' },
  { id: 'debt', label: '債務' },
]
/** On narrow screens the map is a panel too; on wide screens it sits above the news. */
const NARROW_PANELS: { id: PanelId; label: string }[] = [{ id: 'map', label: '地圖' }, ...PANELS]

const CHOICE_PAUSE = '有新抉擇待決定，已自動暫停。'

/** Why the clock should stop after a month, given the player's settings. */
function pauseReason(signals: Signal[], settings: Settings, game: GameState): string | null {
  const year = yearOf(game.t - 1)
  if (signals.includes('crisis') && settings.pauseOnCrisis) return '財政告急，已自動暫停。看看預算、稅率和債務。'
  if (signals.includes('approval') && settings.pauseOnCrisis) return '民望告急，已自動暫停。看看需求面板，市民覺得政府對哪些問題沒有回應。'
  if (signals.includes('choice') && settings.pauseOnChoice) return CHOICE_PAUSE
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

const NARROW = '(max-width: 900px)'

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const update = () => setNarrow(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}

export function GameScreen({ game, initialSpeed, settings, onSettings, onEnd, onQuit }: Props) {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const [paused, setPaused] = useState(false)
  const [pauseNote, setPauseNote] = useState<string | null>(null)
  const [speed, setSpeed] = useState<Speed>(initialSpeed)
  const [skipping, setSkipping] = useState(false)
  /** The decision fast-forwarding last stopped for; pressing it again lets that one expire. */
  const warnedDue = useRef<number | undefined>(undefined)
  const [panel, setPanel] = useState<PanelId>('budget')
  const [focusRow, setFocusRow] = useState<DemandRow['id']>()
  const [sideOpen, setSideOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null)
  const narrow = useNarrow()
  const progress = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  // The side panel sits just below the sticky header, whose height changes with the window.
  useLayoutEffect(() => {
    const header = headerRef.current
    const root = rootRef.current
    if (!header || !root) return
    const update = () => root.style.setProperty('--header-h', `${header.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  const panelOpen = narrow ? sheetOpen : sideOpen
  const editingNow = narrow ? sheetOpen : editing
  const blocked = showSettings || showSources || (settings.pauseWhileEditing && editingNow)
  const running = game.status === 'running' && !paused && !blocked && !skipping

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      progress.current += (now - last) / monthMs(speed)
      last = now
      for (let n = 0; progress.current >= 1 && n < MAX_STEPS_PER_TICK && game.status === 'running'; n++) {
        progress.current -= 1
        step(game)
        const reason = pauseReason(game.signals, settings, game)
        if (reason) {
          setPaused(true)
          setPauseNote(reason)
          break
        }
      }
      progress.current = Math.min(progress.current, 0.99)
      bump()
    }, FRAME_MS)
    return () => window.clearInterval(id)
  }, [running, speed, settings, game, bump])

  // Fast-forwarding: one month a frame, so the clock is still seen moving, until something needs the player.
  useEffect(() => {
    if (!skipping || blocked) return
    let id = 0
    const frame = () => {
      if (game.status !== 'running') {
        setSkipping(false)
        return
      }
      step(game)
      bump()
      const stop = skipStop(game)
      if (stop) {
        warnedDue.current = stop.due
        setSkipping(false)
        setPaused(true)
        setPauseNote(stop.text)
        return
      }
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  }, [skipping, blocked, game, bump])

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
    return {
      m,
      rows,
      indicators: computeIndicators(m, game),
      lastYear: lastYear?.indicators,
      lastApproval: lastYear?.approval,
      concerns: topConcerns(rows),
    }
  }, [game, version])

  const openPanel = (id: PanelId, row?: DemandRow['id']) => {
    if (narrow && sheetOpen && panel === id && !row) {
      setSheetOpen(false)
      return
    }
    setPanel(id)
    setFocusRow(row)
    if (narrow) setSheetOpen(true)
    else setSideOpen(true)
  }

  const closePanel = () => {
    if (narrow) setSheetOpen(false)
    else setSideOpen(false)
    setEditing(false)
  }

  // On wide screens the map card above the news unfolds; on narrow ones the map panel opens.
  const showPlace = useCallback(
    (place: Place) => {
      setMapFocus({ place, key: performance.now() })
      if (narrow) {
        setPanel('map')
        setSheetOpen(true)
      }
    },
    [narrow],
  )
  const mapFocused = useCallback(() => setMapFocus(null), [])

  const onAnswer = (uid: number, optionId: string) => {
    answer(game, uid, optionId)
    if (paused && pauseNote === CHOICE_PAUSE && game.inbox.length === 0) {
      setPaused(false)
      setPauseNote(null)
    }
    bump()
  }

  const togglePause = () => {
    if (skipping) {
      setSkipping(false)
      setPaused(true)
    } else setPaused(!paused)
    setPauseNote(null)
  }

  const chooseSpeed = (next: Speed) => {
    setSpeed(next)
    saveSpeed(next)
    setSkipping(false)
  }

  const startSkip = () => {
    // A decision that would expire in the very first month stops it before it starts, once.
    const stop = dueStop(game, warnedDue.current)
    if (stop) {
      warnedDue.current = stop.due
      setPaused(true)
      setPauseNote(stop.text)
      return
    }
    setPaused(false)
    setPauseNote(null)
    setSkipping(true)
  }

  const panels = narrow ? NARROW_PANELS : PANELS
  const shown: PanelId = !narrow && panel === 'map' ? 'budget' : panel
  const t = game.status === 'ended' ? game.t - 1 : game.t
  const month = monthOf(t)
  const debt = debtTotal(game)
  const balance = game.last.revenueTotal - game.last.spendingTotal
  const { m } = view
  const approval = game.approval.value
  const approvalTone = approval < APPROVAL.warnLine ? 'bad' : approval < APPROVAL.recoverLine + 5 ? 'warn' : ''

  const tabs = (className: string) => (
    <nav className={className} role="tablist" aria-label="面板">
      {panels.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={panelOpen && shown === p.id}
          className={panelOpen && shown === p.id ? 'active' : ''}
          onClick={() => openPanel(p.id)}
        >
          {p.label}
        </button>
      ))}
    </nav>
  )

  return (
    <div className={`game ${narrow ? 'narrow' : ''}`} ref={rootRef}>
      <header className="topbar" ref={headerRef}>
        <div className="topbar-row">
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
            <div className="vital" title={`0–100。連續一年低於 ${APPROVAL.removeLine} 會被迫下台。`}>
              <span className="eyebrow">民望</span>
              <strong className={approvalTone}>{formatNumber(approval)}</strong>
              {view.lastApproval !== undefined && (
                <span className={`small ${approval >= view.lastApproval ? 'good' : 'bad'}`}>{signed(approval - view.lastApproval, 0)}／年</span>
              )}
            </div>
          </div>
          <div className="controls">
            <button className="button" onClick={togglePause} disabled={game.status !== 'running'} aria-label={paused ? '繼續' : '暫停'}>
              {paused ? '▶' : '❚❚'}
              <span className="control-label">{paused ? ' 繼續' : ' 暫停'}</span>
            </button>
            <SpeedMenu speed={speed} skipping={skipping} disabled={game.status !== 'running'} onSpeed={chooseSpeed} onSkip={startSkip} />
            <button className="button icon" onClick={() => setShowSettings(true)} aria-label="設定">
              ⚙
            </button>
          </div>
        </div>
        <IndicatorStrip values={view.indicators} lastYear={view.lastYear} onSelect={(row) => openPanel('demand', row)} />
      </header>

      {paused && pauseNote && (
        <div className="pause-note" role="status">
          <span>{pauseNote}</span>
          <button className="button primary small-button" onClick={togglePause}>
            繼續
          </button>
        </div>
      )}
      {skipping && (
        <div className="pause-note" role="status">
          <span>快轉中：遇到新抉擇、危機或抉擇快到期就會停下。</span>
          <button className="button small-button" onClick={togglePause}>
            停止
          </button>
        </div>
      )}

      <main className={`layout ${!narrow && !sideOpen ? 'side-closed' : ''}`}>
        <div className="news-col">
          {!narrow && <MapCard game={game} focus={mapFocus} onFocused={mapFocused} />}
          <Concerns concerns={view.concerns} onSelect={(row) => openPanel('demand', row)} />
          <Inbox items={game.inbox} now={game.t} onAnswer={onAnswer} />
          <NewsFeed news={game.news} count={game.news.length} onPlace={showPlace} />
        </div>

        {!narrow && !sideOpen && tabs('side-rail')}

        {narrow && sheetOpen && <div className="sheet-backdrop" onClick={closePanel} aria-hidden="true" />}
        {panelOpen && (
          <aside
            className={narrow ? 'side sheet' : 'side'}
            onPointerEnter={() => setEditing(true)}
            onPointerLeave={() => setEditing(false)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            aria-label="面板"
          >
            <div className="side-head">
              <h2 className="sheet-title">{panels.find((p) => p.id === shown)?.label}</h2>
              {tabs('tabs')}
              <button className="icon-button side-close" onClick={closePanel} aria-label={narrow ? '關閉面板' : '收起面板'}>
                {narrow ? '×' : '»'}
              </button>
            </div>
            <div className="side-body">
              {shown === 'map' && <MapView game={game} focus={mapFocus} onFocused={mapFocused} />}
              {shown === 'budget' && <BudgetPanel game={game} metrics={m} onChange={bump} onPlace={showPlace} />}
              {shown === 'demand' && <DemandPanel rows={view.rows} focus={focusRow} />}
              {shown === 'population' && <PopulationPanel game={game} metrics={m} />}
              {shown === 'tax' && <TaxPanel game={game} onChange={bump} />}
              {shown === 'policy' && <PolicyPanel game={game} onChange={bump} />}
              {shown === 'debt' && <DebtPanel game={game} metrics={m} onChange={bump} />}
            </div>
          </aside>
        )}
      </main>

      {narrow && tabs('bottom-tabs')}

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
