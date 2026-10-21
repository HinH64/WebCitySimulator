import { LABELS } from '../engine/model'
import type { IndicatorKey } from '../engine/types'

const MINUS = '−'

export function signed(v: number, decimals = 1): string {
  const r = Number(v.toFixed(decimals))
  if (r === 0) return (0).toFixed(decimals)
  return (r > 0 ? '+' : MINUS) + Math.abs(r).toFixed(decimals)
}

export function formatNumber(v: number, decimals: number): string {
  return new Intl.NumberFormat('zh-HK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)
}

export function effectLabel(k: IndicatorKey, v: number): string {
  return `${LABELS[k]} ${signed(v)}`
}

export function monthLabel(month: number): string {
  return `${month} 月`
}

export function pointsToPercent(points: number): string {
  return `${Math.round(points * 5)}%`
}
