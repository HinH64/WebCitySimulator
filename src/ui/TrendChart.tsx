import { formatNumber, signed } from './format'

const W = 280
const H = 110
const PAD = { top: 10, right: 8, bottom: 18, left: 8 }

interface Props {
  title: string
  colorClass: string
  years: number[]
  yours: number[]
  real: number[]
  /** Fixed range for 0–100 indicators; omitted means fit the data. */
  range?: [number, number]
  unit?: string
  higherIsBetter?: boolean
}

/** The player's line against real history. */
export function TrendChart({ title, colorClass, years, yours, real, range, unit = '', higherIsBetter = true }: Props) {
  const [lo, hi] = range ?? [Math.min(...yours, ...real, 0), Math.max(...yours, ...real) * 1.05 || 1]
  const first = years[0]
  const span = Math.max(1, years[years.length - 1] - first)
  const x = (y: number) => PAD.left + ((y - first) / span) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom)
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(years[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const gap = yours[yours.length - 1] - real[real.length - 1]
  const good = higherIsBetter ? gap > 0 : gap < 0
  const small = Math.abs(gap) < (range ? 0.5 : Math.abs(real[real.length - 1]) * 0.005 + 1e-9)

  return (
    <figure className={`trend ${colorClass}`}>
      <figcaption>
        <span>{title}</span>
        <span className={small ? 'muted' : good ? 'good' : 'bad'}>
          {small ? '＝真實' : range ? signed(gap, 0) : `${signed(gap, 0)}${unit}`}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}：你的走勢與真實香港`}>
        {range && <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y((lo + hi) / 2)} y2={y((lo + hi) / 2)} />}
        <path className="line-real" d={path(real)} />
        <path className="line-yours" d={path(yours)} />
        <text className="axis" x={PAD.left} y={H - 4}>
          {first}
        </text>
        <text className="axis" x={W - PAD.right} y={H - 4} textAnchor="end">
          {years[years.length - 1]}
        </text>
        {!range && (
          <text className="axis" x={W - PAD.right} y={PAD.top + 8} textAnchor="end">
            {formatNumber(yours[yours.length - 1])}
            {unit}
          </text>
        )}
      </svg>
    </figure>
  )
}
