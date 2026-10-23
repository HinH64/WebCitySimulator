import { useMemo } from 'react'
import { DEPARTMENTS, DEPT_INFO, FUNDING_MAX, FUNDING_MIN, type DeptId } from '../../data/budget'
import { upcoming } from '../../engine/pipeline'
import { cityWorks, flats, suspended, type CityWork, type WorkKind } from '../../engine/projects'
import { levelAt } from '../../engine/real'
import { baselines, setFunding } from '../../engine/sim'
import { LAST_MONTH_INDEX, yearOf } from '../../engine/time'
import type { GameState, Metrics, Place } from '../../engine/types'
import { formatNumber, money, percent, signed } from '../format'

type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'plain'

function fundingStatus(f: number): { text: string; tone: Tone } {
  if (f < 0.7) return { text: '服務急跌', tone: 'bad' }
  if (f < 0.95) return { text: '服務慢慢下滑', tone: 'warn' }
  if (f <= 1.0) return { text: '維持現有服務', tone: 'muted' }
  return { text: '擴建中', tone: 'good' }
}

/** What people notice when upkeep slips: a little, then a lot (below 85%). */
const RUN_DOWN: Record<DeptId, [string, string]> = {
  housing: ['屋邨維修開始積壓', '屋邨失修，升降機和水管經常故障'],
  transport: ['道路和鐵路維修延誤', '鐵路故障頻繁，道路坑窪處處'],
  economy: ['產業支援和招商縮減', '中小企支援和招商幾乎停頓'],
  education: ['學校削減支援和課外活動', '大班教學，教師大量流失'],
  health: ['醫院人手緊張，輪候時間延長', '急症室和病房嚴重超負荷'],
  environment: ['垃圾清理和環境巡查減少', '街道骯髒，泳灘水質轉差'],
}

const INDUSTRY_LABEL: Record<string, string> = { finance: '商廈', trade: '物流設施', tourism: '旅遊設施', professional: '科技園區' }

interface Line {
  text: string
  tone: Tone
  place?: Place
}

function workLine(w: CityWork, t: number): Line {
  const due = w.due !== undefined ? `${yearOf(w.due)} 年` : '數年內'
  if (w.kind === 'rail') {
    if (w.state === 'building') return { text: `${w.name}：施工中，預計${w.due !== undefined ? ' ' : ''}${due}通車`, tone: 'plain', place: w.place }
    if (w.state === 'built') return { text: `${w.name}：已通車`, tone: 'plain', place: w.place }
    return { text: `${w.name}：撥款不足，${suspended(w.key, t) ? '部分服務暫停' : '未能通車'}`, tone: 'bad', place: w.place }
  }
  if (w.kind === 'industry') return { text: `${w.name}：${INDUSTRY_LABEL[w.use!]}已落成`, tone: 'plain', place: w.place }
  if (w.kind === 'renewal') return { text: `${w.name}：${flats(w.unitsBuilding)}舊樓單位拆卸重建中`, tone: 'plain', place: w.place }
  if (w.state === 'delayed') return { text: `${w.name}：撥款不足，${flats(w.units)}單位延遲`, tone: 'bad', place: w.place }
  if (w.state === 'built') return { text: `${w.name}：已建成${flats(w.units)}單位`, tone: 'plain', place: w.place }
  if (w.clearing) return { text: `${w.name}：平整土地中，準備建屋`, tone: 'plain', place: w.place }
  return { text: `${w.name}：${flats(w.unitsBuilding)}單位施工中，${due}起入伙`, tone: 'plain', place: w.place }
}

/** At most this many works a department; the rest are counted. */
const MAX_WORKS = 3

/** What is going on in each department now: its works, what is due, and how run down it is. */
function deptLines(game: GameState, d: DeptId, works: CityWork[]): Line[] {
  const t = game.t
  const lines: Line[] = []
  const kinds: WorkKind[] = d === 'housing' ? ['housing', 'renewal'] : d === 'transport' ? ['rail'] : d === 'economy' ? ['industry'] : []
  if (kinds.length) {
    // Under construction first (soonest due), then delayed, then the most recently finished.
    const builtAt = (w: CityWork) => game.works[w.key]?.built ?? 0
    const mine = works
      .filter((w) => kinds.includes(w.kind))
      .sort((a, b) => {
        const rank = { building: 0, delayed: 1, built: 2 }
        return rank[a.state] - rank[b.state] || (a.due ?? 0) - (b.due ?? 0) || builtAt(b) - builtAt(a)
      })
    lines.push(...mine.slice(0, MAX_WORKS).map((w) => workLine(w, t)))
    if (mine.length > MAX_WORKS) lines.push({ text: `另有 ${mine.length - MAX_WORKS} 項工程`, tone: 'muted' })
  }
  switch (d) {
    case 'housing': {
      const v = levelAt('publicUnits', t + 36) - levelAt('publicUnits', t) + upcoming(game, 'publicUnits', 36)
      lines.push({ text: `未來三年約 ${formatNumber(Math.max(0, v), 1)} 萬個公營單位落成`, tone: 'muted' })
      break
    }
    case 'transport': {
      const v = levelAt('railKm', t + 60) - levelAt('railKm', t) + upcoming(game, 'rail', 60)
      lines.push({ text: `未來五年約 ${formatNumber(Math.max(0, v))} 公里新鐵路通車`, tone: 'muted' })
      break
    }
    case 'health': {
      const v = levelAt('careCapacity', t + 36) - levelAt('careCapacity', t) + upcoming(game, 'care', 36)
      lines.push({ text: `未來三年約 ${formatNumber(Math.max(0, v) * 10000)} 個病床及宿位落成`, tone: 'muted' })
      break
    }
    case 'education': {
      const v = levelAt('postSecondary', t + 60) - levelAt('postSecondary', t) + upcoming(game, 'postSecondary', 60)
      lines.push({ text: `未來五年具專上教育程度的人口比例約 ${signed(v, 1)} 個百分點`, tone: 'muted' })
      break
    }
    case 'environment': {
      const v = levelAt('pm10', t + 36) - levelAt('pm10', t) + upcoming(game, 'pm10', 36)
      lines.push({ text: `未來三年 PM10 約 ${signed(v, 1)} 微克/立方米`, tone: 'muted' })
      break
    }
  }
  const q = game.quality[d]
  if (q < 0.99) lines.push({ text: `設施質素 ${percent(q)}：${RUN_DOWN[d][q < 0.85 ? 1 : 0]}`, tone: q < 0.8 ? 'bad' : 'warn' })
  return lines
}

interface Props {
  game: GameState
  metrics: Metrics
  onChange: () => void
  /** Shows a work on the map. */
  onPlace: (place: Place) => void
}

export function BudgetPanel({ game, metrics, onChange, onPlace }: Props) {
  const base = baselines(Math.min(game.t, LAST_MONTH_INDEX), metrics)
  const deptSpend = DEPARTMENTS.map((d) => base[d] * game.funding[d])
  const last = game.last
  const balance = last.revenueTotal - last.spendingTotal
  const total = last.spendingTotal || deptSpend.reduce((a, b) => a + b, 0)
  // Works change slowly; work them out once a quarter, like the map.
  const quarter = Math.floor(game.t / 3)
  const works = useMemo(() => cityWorks(game).works, [game, quarter, game.status])

  return (
    <div className="panel budget-panel">
      <div className="summary-grid">
        <div>
          <div className="eyebrow">上月收入</div>
          <div className="big-number">{money(last.revenueTotal)}</div>
        </div>
        <div>
          <div className="eyebrow">上月開支</div>
          <div className="big-number">{money(last.spendingTotal)}</div>
        </div>
        <div>
          <div className="eyebrow">{balance >= 0 ? '盈餘' : '赤字'}</div>
          <div className={`big-number ${balance >= 0 ? 'good' : 'bad'}`}>{money(Math.abs(balance))}</div>
          <div className="muted small">全年約 {money(balance * 12)}</div>
        </div>
      </div>
      <p className="muted small">
        100% = 維持現有服務所需的錢。低於 95% 服務會變差，高於 100% 的錢用來擴建，工程要幾年才見效。調整由下個月起生效，遊戲不會暫停。
      </p>

      <div className="dept-list">
        {DEPARTMENTS.map((d, i) => {
          const f = game.funding[d]
          const st = fundingStatus(f)
          const lines = deptLines(game, d, works)
          const hasWorks = lines.some((l) => l.place)
          return (
            <div key={d} className={`dept dept-${d}`}>
              <div className="dept-head">
                <div>
                  <strong>{DEPT_INFO[d].label}</strong>
                  <span className="muted small"> {DEPT_INFO[d].covers}</span>
                </div>
                <div className="dept-value">{percent(f)}</div>
              </div>
              <input
                type="range"
                min={FUNDING_MIN * 100}
                max={FUNDING_MAX * 100}
                step={5}
                value={Math.round(f * 100)}
                onChange={(e) => {
                  setFunding(game, d, Number(e.target.value) / 100)
                  onChange()
                }}
                aria-label={`${DEPT_INFO[d].label}撥款水平`}
              />
              <div className="dept-foot small">
                <span className={st.tone}>
                  {st.text}
                  {f > 1 && !hasWorks ? `：${DEPT_INFO[d].builds}` : ''}
                </span>
                <span className="muted">
                  每月 {money(deptSpend[i])}（{percent(deptSpend[i] / total)}）
                </span>
              </div>
              {lines.length > 0 && (
                <ul className="dept-lines small">
                  {lines.map((l) => (
                    <li key={l.text} className={l.tone}>
                      {l.text}
                      {l.place && (
                        <button className="place-button" onClick={() => onPlace(l.place!)} aria-label={`在地圖上顯示${l.text.split('：')[0]}`}>
                          地圖
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <div className="fixed-lines small">
        <div>
          <span>其他開支（治安、行政等，不可調）</span>
          <span>{money(last.spending.other ?? 0)}／月</span>
        </div>
        {Math.abs(last.spending.policies ?? 0) > 0.05 && (
          <div>
            <span>政策開支</span>
            <span>{money(last.spending.policies ?? 0)}／月</span>
          </div>
        )}
        {Math.abs(last.spending.projects ?? 0) > 0.05 && (
          <div>
            <span>大型項目及一次性開支</span>
            <span>{money(last.spending.projects ?? 0)}／月</span>
          </div>
        )}
        {(last.spending.interest ?? 0) > 0.05 && (
          <div>
            <span>債務利息</span>
            <span>{money(last.spending.interest ?? 0)}／月</span>
          </div>
        )}
      </div>
    </div>
  )
}
