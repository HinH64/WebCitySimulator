const MINUS = '−'

export function signed(v: number, decimals = 1): string {
  const r = Number(v.toFixed(decimals))
  if (r === 0) return (0).toFixed(decimals)
  return (r > 0 ? '+' : MINUS) + formatNumber(Math.abs(r), decimals)
}

export function formatNumber(v: number, decimals = 0): string {
  return new Intl.NumberFormat('zh-HK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)
}

/** Money in 億 with a sensible precision. */
export function money(v: number): string {
  const abs = Math.abs(v)
  const s = formatNumber(abs, abs < 10 ? 1 : 0)
  return `${v < 0 ? MINUS : ''}${s} 億`
}

export function percent(f: number): string {
  return `${Math.round(f * 100)}%`
}
