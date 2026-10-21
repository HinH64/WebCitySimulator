import { LABELS, realScores } from '../engine/model'
import { START_YEAR, type IndicatorKey, type Scores } from '../engine/types'
import { signed } from './format'

const W = 280
const H = 110
const PAD = { top: 10, right: 8, bottom: 18, left: 8 }

/** Player's line against real history for one indicator. */
export function TrendChart({ k, trail, endYear }: { k: IndicatorKey; trail: Record<number, Scores>; endYear: number }) {
  const years: number[] = []
  for (let y = START_YEAR; y <= endYear; y++) if (trail[y]) years.push(y)
  const span = Math.max(1, endYear - START_YEAR)
  const x = (y: number) => PAD.left + ((y - START_YEAR) / span) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom)
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(years[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')

  const yours = years.map((yr) => trail[yr][k])
  const real = years.map((yr) => realScores(yr)[k])
  const gap = yours[yours.length - 1] - real[real.length - 1]

  return (
    <figure className={`trend ind-${k}`}>
      <figcaption>
        <span>{LABELS[k]}</span>
        <span className={gap > 0.5 ? 'good' : gap < -0.5 ? 'bad' : 'muted'}>
          {Math.abs(gap) < 0.5 ? '＝歷史' : signed(gap)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${LABELS[k]}：你的走勢與真實歷史`}>
        <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(50)} y2={y(50)} />
        <path className="line-real" d={path(real)} />
        <path className="line-yours" d={path(yours)} />
        <text className="axis" x={PAD.left} y={H - 4}>
          {START_YEAR}
        </text>
        <text className="axis" x={W - PAD.right} y={H - 4} textAnchor="end">
          {endYear}
        </text>
      </svg>
    </figure>
  )
}
