import { MAP_COLS, MAP_TILE_KINDS } from '../data/mapBase'
import type { TileKind } from '../data/mapProjects'
import type { CityMap, RailSegment } from '../engine/map'
import { KIND_COLOUR, hexToRgb } from '../ui/mapStyle'
import { gridPoint, project, transformFor, visibleBounds, type Camera, type Projection, type Transform } from './geometry'
import type { StudyFrame } from './scenes'

export interface RenderOptions {
  frame: StudyFrame
  other: CityMap
  camera: Camera
  projection: Projection
  width: number
  height: number
  dpr: number
  changed: Set<number>
  highlight: boolean
  dark: boolean
}

interface Sprite { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }
let spriteSettings = ''
const sprites = new Map<string, Sprite>()

/** Repeated buildings use the same tiny drawing. Clear on scale/DPR changes to bound memory. */
function cellSprite(tr: Transform, dpr: number, kind: TileKind, ornament: number, building: boolean, ground: boolean): Sprite {
  const settings = `${tr.projection}:${tr.scale.toFixed(4)}:${dpr}`
  if (spriteSettings !== settings) { sprites.clear(); spriteSettings = settings }
  const key = `${kind}:${ground ? 'ground' : ornament}:${kind === 'construction' && building}`
  const cached = sprites.get(key)
  if (cached) return cached
  const iso = tr.projection === 'iso'
  const x = iso ? tr.scale + 2 : 2
  const y = iso && !ground ? 3 * tr.scale + 2 : 2
  const w = Math.ceil((iso ? 2 : 1) * tr.scale + 4)
  const h = Math.ceil((iso ? ground ? 1 : 4 : 1) * tr.scale + 4)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * dpr)
  canvas.height = Math.ceil(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const local = { ...tr, cx: ornament, cy: 0, ox: x, oy: y }
  if (ground) {
    const colour = ['public', 'private', 'commercial', 'institution', 'sciencePark'].includes(kind) ? '#cdd3c5' : KIND_COLOUR[kind]
    polygon(ctx, footprint(local, ornament, 0, 0, 0, 1.015, 1.015), colour)
  } else objects(ctx, local, ornament, 0, kind, building)
  const sprite = { canvas, x, y, w: canvas.width / dpr, h: canvas.height / dpr }
  sprites.set(key, sprite)
  return sprite
}

function tint(colour: string, amount: number): string {
  const rgb = hexToRgb(colour)
  return `rgb(${rgb.map((v) => Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount))).join(',')})`
}

function polygon(ctx: CanvasRenderingContext2D, points: [number, number][], fill: string, stroke?: string) {
  ctx.beginPath()
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.stroke() }
}

function footprint(tr: Transform, c: number, r: number, x: number, y: number, w: number, h: number) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([dx, dy]) => project(tr, c + dx, r + dy)) as [number, number][]
}

function block(ctx: CanvasRenderingContext2D, tr: Transform, c: number, r: number, x: number, y: number, w: number, depth: number, height: number, colour: string) {
  const base = footprint(tr, c, r, x, y, w, depth)
  if (tr.projection === 'plan') {
    polygon(ctx, base.map(([px, py]) => [px + 1, py + 1]), 'rgba(20,38,40,0.16)')
    polygon(ctx, base, colour, tint(colour, -0.25))
    if (tr.scale > 18) {
      const [px, py] = base[0]
      ctx.fillStyle = tint(colour, 0.5)
      ctx.fillRect(px + 2, py + 2, Math.max(1, w * tr.scale - 4), 1)
    }
    return
  }
  const z = height * tr.scale
  const roof = base.map(([px, py]) => [px, py - z]) as [number, number][]
  polygon(ctx, [base[1], base[2], roof[2], roof[1]], tint(colour, -0.3))
  polygon(ctx, [base[2], base[3], roof[3], roof[2]], tint(colour, -0.12))
  polygon(ctx, roof, tint(colour, 0.3), tint(colour, -0.14))
  if (tr.scale >= 10 && height > 0.7) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 0.65
    for (let n = 0.3; n < height - 0.1; n += 0.34) {
      ctx.beginPath()
      ctx.moveTo(base[2][0], base[2][1] - n * tr.scale)
      ctx.lineTo(base[3][0], base[3][1] - n * tr.scale)
      ctx.stroke()
    }
  }
}

function objects(ctx: CanvasRenderingContext2D, tr: Transform, c: number, r: number, kind: TileKind, building: boolean) {
  const variation = ((c * 31 + r * 17) % 5) * 0.08
  const colour = KIND_COLOUR[kind]
  const b = (x: number, y: number, w: number, d: number, h: number, col = colour) => block(ctx, tr, c, r, x, y, w, d, h, col)
  if (kind === 'public') {
    b(0.12, 0.12, 0.22, 0.7, 1.5 + variation, '#d3aa65')
    b(0.57, 0.12, 0.22, 0.7, 1.5 + variation, '#e7c98d')
  } else if (kind === 'private') {
    for (const [x, y] of [[0.12, 0.12], [0.57, 0.12], [0.12, 0.57], [0.57, 0.57]]) b(x, y, 0.28, 0.28, 1.05 + variation, '#cb8c83')
  } else if (kind === 'commercial') {
    b(0.12, 0.12, 0.3, 0.55, 2 + variation, '#8a93b0')
    b(0.57, 0.3, 0.28, 0.5, 1.5 + variation, '#b0b7ca')
  } else if (kind === 'industrial' || kind === 'logistics' || kind === 'port') {
    b(0.12, 0.12, 0.72, 0.27, 0.35, kind === 'port' ? '#718d9f' : '#9c99ac')
    b(0.12, 0.58, 0.72, 0.27, 0.35, '#bac0c6')
  } else if (kind === 'institution' || kind === 'sciencePark') {
    b(0.15, 0.12, 0.62, 0.24, 0.6, '#c7d5d9')
    b(0.15, 0.58, 0.62, 0.24, 0.6, '#85a8b1')
  } else if (kind === 'village') {
    b(0.12, 0.15, 0.27, 0.27, 0.35, '#c5a18a')
    b(0.58, 0.5, 0.27, 0.3, 0.3, '#d8c8ab')
  } else if (kind === 'construction') {
    ctx.strokeStyle = '#a28649'
    ctx.lineWidth = Math.max(0.7, tr.scale * 0.045)
    for (const y of [0.25, 0.55, 0.8]) {
      const a = project(tr, c + 0.15, r + y)
      const z = project(tr, c + 0.85, r + y)
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...z); ctx.stroke()
    }
    if (building && tr.scale > 9) {
      const [x, y] = project(tr, c + 0.5, r + 0.5)
      ctx.strokeStyle = '#66583c'
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - tr.scale * 1.25); ctx.lineTo(x + tr.scale * 0.6, y - tr.scale * 1.25); ctx.lineTo(x + tr.scale * 0.6, y - tr.scale * 0.65); ctx.stroke()
    }
  } else if (kind === 'woodland' || kind === 'park' || kind === 'shrubGrass') {
    if ((c + r) % 2 === 0 || kind === 'park') {
      const [x, y] = project(tr, c + 0.5, r + 0.5)
      ctx.fillStyle = kind === 'woodland' ? '#3e7654' : '#6c9868'
      ctx.beginPath()
      ctx.ellipse(x, y - (tr.projection === 'iso' ? tr.scale * 0.2 : 0), tr.scale * 0.18, tr.scale * 0.25, 0, 0, 2 * Math.PI)
      ctx.fill()
    }
  }
}

/** Draws only the supplied model output. Geometry is decorative and never consumes a simulation RNG. */
export function renderScene(canvas: HTMLCanvasElement, options: RenderOptions): number {
  const start = performance.now()
  const { frame, camera, projection, width, height, dpr, changed, highlight, other, dark } = options
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const tr = transformFor(camera, projection, width, height)
  const bounds = visibleBounds(tr, width, height)
  const sea = dark ? '#233f4b' : '#d5e6e8'
  ctx.fillStyle = sea
  ctx.fillRect(0, 0, width, height)
  const cells: number[] = []
  for (let r = bounds.r0; r <= bounds.r1; r++) for (let c = bounds.c0; c <= bounds.c1; c++) cells.push(r * MAP_COLS + c)
  if (projection === 'iso') cells.sort((a, b) => (a % MAP_COLS + Math.floor(a / MAP_COLS)) - (b % MAP_COLS + Math.floor(b / MAP_COLS)) || a - b)
  // All ground first, so a neighbouring tile cannot paint over the top of a building.
  for (const i of cells) {
    const kind = MAP_TILE_KINDS[frame.map.grid[i]] as TileKind
    if (kind === 'sea') continue
    const c = i % MAP_COLS
    const r = Math.floor(i / MAP_COLS)
    const [x, y] = project(tr, c, r)
    if (x + tr.scale * 1.05 < 0 || x - tr.scale * 1.05 > width || y + tr.scale * 1.05 < 0 || y > height) continue
    const sprite = cellSprite(tr, dpr, kind, 0, false, true)
    ctx.drawImage(sprite.canvas, x - sprite.x, y - sprite.y, sprite.w, sprite.h)
  }
  if (tr.scale >= 5) {
    const building = new Set(frame.works.flatMap((w) => w.building))
    for (const i of cells) {
      const kind = MAP_TILE_KINDS[frame.map.grid[i]] as TileKind
      if (!['public', 'private', 'commercial', 'industrial', 'logistics', 'port', 'institution', 'sciencePark', 'village', 'construction', 'woodland', 'park', 'shrubGrass'].includes(kind)) continue
      const c = i % MAP_COLS
      const r = Math.floor(i / MAP_COLS)
      const [x, y] = project(tr, c, r)
      if (x + tr.scale < 0 || x - tr.scale > width || y + tr.scale < 0 || y - 3 * tr.scale > height) continue
      if ((kind === 'woodland' || kind === 'shrubGrass') && (c + r) % 2 !== 0) continue
      const sprite = cellSprite(tr, dpr, kind, (c * 31 + r * 17) % 10, building.has(i), false)
      ctx.drawImage(sprite.canvas, x - sprite.x, y - sprite.y, sprite.w, sprite.h)
    }
  }
  if (frame.map.haze > 0) {
    ctx.fillStyle = `rgba(150,150,145,${frame.map.haze * 0.12})`
    ctx.fillRect(0, 0, width, height)
  }
  if (highlight) {
    ctx.strokeStyle = '#f4a340'
    ctx.lineWidth = 1.8
    for (const i of cells) if (changed.has(i)) {
      const points = footprint(tr, i % MAP_COLS, Math.floor(i / MAP_COLS), 0.04, 0.04, 0.92, 0.92)
      ctx.beginPath(); points.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke()
    }
  }
  const routeIds = new Set(other.rail.segments.map((s) => s.route))
  const line = (s: RailSegment, building: boolean) => {
    const a = project(tr, ...gridPoint(...s.from))
    const b = project(tr, ...gridPoint(...s.to))
    ctx.setLineDash(building ? [5, 4] : [])
    for (const [colour, lw] of [[dark ? '#c2d4d7' : '#ffffff', 4], [highlight && !routeIds.has(s.route) ? '#d28120' : '#365d68', 2]] as const) {
      ctx.strokeStyle = colour; ctx.lineWidth = lw
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
    }
  }
  frame.railBuilding.segments.forEach((s) => line(s, true))
  frame.map.rail.segments.forEach((s) => line(s, false))
  ctx.setLineDash([])
  ctx.font = '11px system-ui, "Microsoft JhengHei", sans-serif'
  const labels: { x: number; y: number; w: number }[] = []
  for (const station of frame.map.rail.stations) {
    const [x, y] = project(tr, ...gridPoint(station.e, station.n))
    if (x < 8 || x > width - 8 || y < 18 || y > height - 18) continue
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#365d68'; ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.arc(x, y, tr.scale < 5 ? 1.8 : 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (tr.scale < 6) continue
    const w = ctx.measureText(station.name).width
    if (x + w + 10 > width || labels.some((l) => Math.abs(l.y - y) < 14 && x + 5 < l.x + l.w && x + 5 + w > l.x)) continue
    labels.push({ x: x + 5, y, w })
    ctx.strokeStyle = dark ? '#1b313a' : '#f5f8ef'; ctx.lineWidth = 3
    ctx.strokeText(station.name, x + 5, y - 5)
    ctx.fillStyle = dark ? '#e8eee5' : '#25444b'; ctx.fillText(station.name, x + 5, y - 5)
  }
  // A modest scale indicator follows the same world-to-screen transform as the city.
  const origin = project(tr, camera.cx, camera.cy)
  const kilometre = project(tr, camera.cx + 4, camera.cy)
  const scaleWidth = kilometre[0] - origin[0]
  const scaleHeight = kilometre[1] - origin[1]
  if (scaleWidth < width * 0.6) {
    ctx.fillStyle = dark ? '#e4eee7' : '#30525b'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(18, height - 20 - scaleHeight); ctx.lineTo(18 + scaleWidth, height - 20); ctx.stroke()
    ctx.font = '10px system-ui, sans-serif'; ctx.fillText('1 公里（地面東西向）', 18, height - 28 - scaleHeight)
  }
  return performance.now() - start
}
