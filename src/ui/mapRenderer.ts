import { MAP_COLS, MAP_ROWS, MAP_TILE_KINDS } from '../data/mapBase'
import type { TileKind } from '../data/mapProjects'
import { lightRailStops, realMapAt, type CityMap, type RailSegment, type Railway } from '../engine/map'
import type { LandmarkShape } from '../data/landmarks'
import type { LandmarkView } from '../engine/landmarks'
import type { CityWork } from '../engine/projects'
import type { Place } from '../engine/types'
import { KIND_COLOUR, hexToRgb } from './mapStyle'
import { gridPoint, project, transformFor, visibleBounds, type Camera, type Projection, type Transform } from './mapGeometry'

/** Historical snapshots lack a pipeline: callers leave works and railBuilding absent. */
export interface MapScene {
  t: number
  map: CityMap
  works?: readonly CityWork[]
  railBuilding?: Railway
  landmarks?: readonly LandmarkView[]
}

export interface RenderOptions {
  frame: MapScene
  other?: CityMap
  camera: Camera
  projection: Projection
  width: number
  height: number
  dpr: number
  changed?: Set<number>
  highlight?: boolean
  dark: boolean
  /** Flat analytical colours; always drawn in the plan projection. */
  bitmap?: HTMLCanvasElement | null
  outline?: { cells: readonly number[]; rail: Railway } | null
  flash?: readonly number[]
  marker?: Place | null
  sea?: string
}

/** CSS pixels a cell needs before buildings are drawn; below it the ground is flat, in legend colours. */
export const DETAIL_SCALE = 5

interface Sprite { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }
let spriteSettings = ''
const sprites = new Map<string, Sprite>()

/** The land use when the term starts; a cell that differs has been built on since. */
let startGrid: Uint8Array | undefined

/** One pixel per cell in land-use colours, sea left clear. A map's grid is not changed once made. */
const landBitmaps = new WeakMap<Uint8Array, HTMLCanvasElement>()
function landBitmap(grid: Uint8Array): HTMLCanvasElement {
  const cached = landBitmaps.get(grid)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = MAP_COLS
  canvas.height = MAP_ROWS
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(MAP_COLS, MAP_ROWS)
  const rgb = MAP_TILE_KINDS.map((kind) => hexToRgb(KIND_COLOUR[kind]))
  for (let i = 0; i < grid.length; i++) {
    if (MAP_TILE_KINDS[grid[i]] === 'sea') continue
    const [r, g, b] = rgb[grid[i]]
    image.data[i * 4] = r
    image.data[i * 4 + 1] = g
    image.data[i * 4 + 2] = b
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  landBitmaps.set(grid, canvas)
  return canvas
}

/** Lays a one-pixel-per-cell image on the ground. Both projections are affine, so one draw covers the city. */
function drawGrid(ctx: CanvasRenderingContext2D, tr: Transform, image: HTMLCanvasElement) {
  const [x, y] = project(tr, 0, 0)
  const [ax, ay] = project(tr, 1, 0)
  const [bx, by] = project(tr, 0, 1)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.transform(ax - x, ay - y, bx - x, by - y, x, y)
  ctx.drawImage(image, 0, 0)
  ctx.restore()
}

/** Repeated buildings use the same tiny drawing. Clear on scale/DPR changes to bound memory. */
function cellSprite(tr: Transform, dpr: number, kind: TileKind, ornament: number, building: boolean, ground: boolean, fresh = false): Sprite {
  const settings = `${tr.projection}:${tr.scale.toFixed(4)}:${dpr}`
  if (spriteSettings !== settings) { sprites.clear(); spriteSettings = settings }
  const key = `${kind}:${ground ? 'ground' : ornament}:${kind === 'construction' && building}:${fresh}`
  const cached = sprites.get(key)
  if (cached) return cached
  const iso = tr.projection === 'iso'
  const x = iso ? tr.scale + 2 : 2
  const y = iso && !ground ? 4 * tr.scale + 2 : 2
  const w = Math.ceil((iso ? 2 : 1) * tr.scale + 4)
  const h = Math.ceil((iso ? ground ? 1 : 5 : 1) * tr.scale + 4)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * dpr)
  canvas.height = Math.ceil(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const local = { ...tr, cx: ornament, cy: 0, ox: x, oy: y }
  if (ground) {
    const colour = ['public', 'private', 'commercial', 'institution', 'sciencePark'].includes(kind) ? '#cdd3c5' : KIND_COLOUR[kind]
    polygon(ctx, footprint(local, ornament, 0, 0, 0, 1.015, 1.015), colour)
  } else objects(ctx, local, ornament, 0, kind, building, fresh)
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

/** A box on the cell, `lift` cells above the ground (2.5D only: the plan view shows its footprint). */
function block(ctx: CanvasRenderingContext2D, tr: Transform, c: number, r: number, x: number, y: number, w: number, depth: number, height: number, colour: string, fresh = false, lift = 0) {
  let base = footprint(tr, c, r, x, y, w, depth)
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
  if (lift) base = base.map(([px, py]) => [px, py - lift * tr.scale])
  const z = height * tr.scale
  const roof = base.map(([px, py]) => [px, py - z]) as [number, number][]
  polygon(ctx, [base[1], base[2], roof[2], roof[1]], tint(colour, -0.3))
  polygon(ctx, [base[2], base[3], roof[3], roof[2]], tint(colour, -0.12))
  polygon(ctx, roof, tint(colour, 0.3), tint(colour, -0.14))
  if (tr.scale >= 10 && height > 0.7) {
    ctx.strokeStyle = fresh ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 0.65
    for (let n = 0.3; n < height - 0.1; n += 0.34) {
      ctx.beginPath()
      ctx.moveTo(base[2][0], base[2][1] - n * tr.scale)
      ctx.lineTo(base[3][0], base[3][1] - n * tr.scale)
      ctx.stroke()
    }
  }
}

/**
 * Buildings on one cell. `fresh` ones went up during the term (real or the city's own, including old
 * flats rebuilt): tall towers in bright colours with lit windows. Older ones are lower and weathered,
 * so a player can tell what was built on their watch.
 */
function objects(ctx: CanvasRenderingContext2D, tr: Transform, c: number, r: number, kind: TileKind, building: boolean, fresh: boolean) {
  const variation = ((c * 31 + r * 17) % 5) * 0.08
  const colour = KIND_COLOUR[kind]
  const b = (x: number, y: number, w: number, d: number, h: number, col = colour) => block(ctx, tr, c, r, x, y, w, d, h, col, fresh)
  if (kind === 'public' && fresh) {
    b(0.14, 0.14, 0.26, 0.26, 2.7 + variation, '#f0a83c')
    b(0.58, 0.52, 0.26, 0.26, 2.4 + variation, '#f6c978')
  } else if (kind === 'public') {
    b(0.12, 0.12, 0.22, 0.7, 1.3 + variation, '#b8a072')
    b(0.57, 0.12, 0.22, 0.7, 1.3 + variation, '#c8b38a')
  } else if (kind === 'private' && fresh) {
    b(0.12, 0.14, 0.24, 0.24, 2.9 + variation, '#e46a5c')
    b(0.6, 0.12, 0.24, 0.24, 2.5 + variation, '#f09a8d')
    b(0.36, 0.6, 0.24, 0.24, 3.2 + variation, '#ea8174')
  } else if (kind === 'private') {
    for (const [x, y] of [[0.12, 0.12], [0.57, 0.12], [0.12, 0.57], [0.57, 0.57]]) b(x, y, 0.28, 0.28, 0.95 + variation, '#ad827b')
  } else if (kind === 'commercial' && fresh) {
    b(0.1, 0.1, 0.8, 0.8, 0.25, '#c9d2e3')
    b(0.3, 0.3, 0.36, 0.36, 3.6 + variation, '#4f86d9')
  } else if (kind === 'commercial') {
    b(0.12, 0.12, 0.3, 0.55, 1.8 + variation, '#868a96')
    b(0.57, 0.3, 0.28, 0.5, 1.3 + variation, '#9fa3ad')
  } else if (kind === 'industrial' || kind === 'logistics' || kind === 'port') {
    if (fresh) {
      b(0.1, 0.12, 0.8, 0.32, 0.45, kind === 'port' ? '#5f86a6' : '#8f9bc0')
      b(0.1, 0.58, 0.8, 0.3, 0.45, '#dde3ea')
    } else {
      b(0.12, 0.12, 0.72, 0.27, 0.35, kind === 'port' ? '#6f8494' : '#8f8d99')
      b(0.12, 0.58, 0.72, 0.27, 0.35, '#a7abb0')
    }
  } else if (kind === 'institution' || kind === 'sciencePark') {
    b(0.15, 0.12, 0.62, 0.24, 0.6, fresh ? '#e3eef0' : '#b9c4c7')
    b(0.15, 0.58, 0.62, 0.24, 0.6, fresh ? '#6fb0c0' : '#8a9fa5')
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

/** A point `z` cells above the ground; the plan view ignores height. */
function lifted(tr: Transform, c: number, r: number, z: number): [number, number] {
  const [x, y] = project(tr, c, r)
  return [x, tr.projection === 'iso' ? y - z * tr.scale : y]
}

/** A flat ellipse lying on the ground plane, `z` cells up. */
function disc(ctx: CanvasRenderingContext2D, tr: Transform, c: number, r: number, rx: number, ry: number, z: number, colour: string) {
  const points: [number, number][] = []
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    points.push(lifted(tr, c + rx * Math.cos(a), r + ry * Math.sin(a), z))
  }
  polygon(ctx, points, colour)
}

/** A round building built up from slices: a drum, or a dome. */
function rotunda(ctx: CanvasRenderingContext2D, tr: Transform, c: number, r: number, rx: number, ry: number, h: number, colour: string, dome = false) {
  const steps = tr.projection === 'iso' ? 8 : 0
  for (let k = 0; k <= steps; k++) {
    const f = steps ? (k / steps) * (dome ? 0.95 : 1) : 0
    const size = dome ? Math.sqrt(1 - f * f) : 1
    disc(ctx, tr, c, r, rx * size, ry * size, h * f, k === steps ? tint(colour, 0.25) : tint(colour, -0.25 + 0.25 * (k / Math.max(1, steps))))
  }
}

/** A pyramid roof or spire on a square `w` cells wide, from `z` up by `h`. */
function spire(ctx: CanvasRenderingContext2D, tr: Transform, c: number, r: number, w: number, z: number, h: number, colour: string) {
  const corners = [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]].map(([dx, dy]) => lifted(tr, c + dx, r + dy, z))
  if (tr.projection === 'plan') return polygon(ctx, corners, colour)
  const apex = lifted(tr, c, r, z + h)
  polygon(ctx, [corners[1], corners[2], apex], tint(colour, -0.3))
  polygon(ctx, [corners[2], corners[3], apex], tint(colour, -0.1))
}

/** A cable, crane jib or boardwalk between two points given as [column, row, height]. */
function strut(ctx: CanvasRenderingContext2D, tr: Transform, a: [number, number, number], b: [number, number, number], colour: string, width: number) {
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.beginPath(); ctx.moveTo(...lifted(tr, ...a)); ctx.lineTo(...lifted(tr, ...b)); ctx.stroke()
}

/** Where a landmark's name goes: about the top of its outline, in cells above the ground. */
const LANDMARK_TOP: Record<LandmarkShape, number> = {
  terminal: 1.7, skyscraper: 6.2, supertall: 6.6, campus: 0.9, castle: 2.1, wetland: 0.4, cableBridge: 2.6, cruise: 0.7,
  station: 0.6, port: 0.5, museum: 2.4, stadium: 0.7, cbd: 4.8, techCampus: 0.8, logisticsHub: 1.7, attraction: 0.7, offices: 3.2,
}

/** Low landmarks are drawn larger than life, so they read at district zoom next to the towers around them. */
const LANDMARK_SIZE: Partial<Record<LandmarkShape, number>> = {
  terminal: 1.5, campus: 1.4, castle: 1.7, wetland: 1.5, cruise: 1.2, station: 1.3, stadium: 1.7, techCampus: 1.4, attraction: 1.5, logisticsHub: 1.2,
}

/**
 * One landmark, centred on (c, r) in cells. Simple outlines a player can learn to recognise: towers,
 * a cable-stayed bridge, a castle, a stadium. Larger than one cell; drawn in place of that cell's buildings.
 */
function drawLandmark(ctx: CanvasRenderingContext2D, tr: Transform, shape: LandmarkShape, c: number, r: number) {
  // Offsets and sizes are in cells from the centre, scaled together by the landmark's size.
  const k = LANDMARK_SIZE[shape] ?? 1
  const B = (x: number, y: number, w: number, d: number, h: number, colour: string, lift = 0) => block(ctx, tr, c, r, x * k, y * k, w * k, d * k, h * k, colour, true, lift * k)
  const R = (x: number, y: number, rx: number, ry: number, h: number, colour: string, dome = false) => rotunda(ctx, tr, c + x * k, r + y * k, rx * k, ry * k, h * k, colour, dome)
  const D = (x: number, y: number, rx: number, ry: number, z: number, colour: string) => disc(ctx, tr, c + x * k, r + y * k, rx * k, ry * k, z * k, colour)
  const S = (x: number, y: number, w: number, z: number, h: number, colour: string) => spire(ctx, tr, c + x * k, r + y * k, w * k, z * k, h * k, colour)
  const L = (a: [number, number, number], b: [number, number, number], colour: string, width: number) =>
    strut(ctx, tr, [c + a[0] * k, r + a[1] * k, a[2] * k], [c + b[0] * k, r + b[1] * k, b[2] * k], colour, width)
  const thin = Math.max(1, tr.scale * 0.05)
  switch (shape) {
    case 'terminal':
      B(-1.2, -0.45, 2.4, 0.9, 0.35, '#d9dde3')
      for (let n = 0; n < 4; n++) B(-1.15 + 0.6 * n, -0.4, 0.5, 0.8, 0.06, '#f1f4f7', 0.35)
      B(0.95, 0.55, 0.12, 0.12, 1.5, '#c9ced6')
      B(0.9, 0.5, 0.22, 0.22, 0.15, '#7fa3c7', 1.5)
      return
    case 'skyscraper':
      B(-0.45, -0.45, 0.9, 0.9, 0.3, '#b8c4d4')
      B(-0.2, -0.2, 0.4, 0.4, 5, '#7f9cc4', 0.3)
      B(-0.15, -0.15, 0.3, 0.3, 0.5, '#9db4d6', 5.3)
      B(-0.08, -0.08, 0.16, 0.16, 0.4, '#c9d6ea', 5.8)
      return
    case 'supertall':
      B(-0.55, -0.45, 1.1, 0.9, 0.35, '#b9c3d0')
      B(-0.22, -0.22, 0.44, 0.44, 5.9, '#5f8fc9', 0.35)
      B(-0.18, -0.18, 0.36, 0.36, 0.3, '#8fb0dd', 6.25)
      return
    case 'campus':
      B(-0.8, -0.5, 0.5, 0.35, 0.5, '#dfe8ec')
      B(-0.2, -0.6, 0.5, 0.35, 0.6, '#e8eef0')
      R(-0.2, 0.2, 0.25, 0.25, 0.5, '#e0b84a', true)
      B(0.3, 0.1, 0.5, 0.35, 0.45, '#d5e2e6')
      return
    case 'castle':
      B(-0.45, -0.3, 0.14, 0.14, 0.8, '#f3d9e4')
      S(-0.38, -0.23, 0.14, 0.8, 0.45, '#3f6fd1')
      B(-0.45, -0.3, 0.9, 0.6, 0.5, '#f3d9e4')
      B(-0.15, -0.15, 0.3, 0.3, 0.9, '#f8e8ef', 0.5)
      S(0, 0, 0.3, 1.4, 0.7, '#3f6fd1')
      B(0.31, 0.16, 0.14, 0.14, 0.8, '#f3d9e4')
      S(0.38, 0.23, 0.14, 0.8, 0.45, '#3f6fd1')
      return
    case 'wetland':
      D(0.35, 0.3, 0.55, 0.35, 0, '#7fb7d6')
      L([-0.1, 0.1, 0.03], [0.65, 0.55, 0.03], '#b08a5a', thin)
      B(-0.6, -0.4, 0.8, 0.45, 0.2, '#c9c2a8')
      B(-0.6, -0.4, 0.8, 0.45, 0.04, '#7fae6a', 0.2)
      return
    case 'cableBridge': {
      // Spans the channel east to west: two pylons with fanned cables.
      const cable = Math.max(0.7, tr.scale * 0.025)
      for (const px of [-0.55, 0.55]) {
        for (const n of [1, 2, 3]) {
          L([px, 0, 2.45], [px - 0.3 * n, 0, 0.56], 'rgba(235,239,243,0.85)', cable)
          L([px, 0, 2.45], [px + 0.3 * n, 0, 0.56], 'rgba(235,239,243,0.85)', cable)
        }
      }
      B(-1.8, -0.08, 3.6, 0.16, 0.06, '#c9ced4', 0.5)
      for (const px of [-0.55, 0.55]) B(px - 0.07, -0.07, 0.14, 0.14, 2.6, '#e2e5e9')
      return
    }
    case 'cruise':
      B(-0.8, -0.25, 1.6, 0.5, 0.3, '#eef2f6')
      for (let n = 0; n < 3; n++) B(-0.75 + 0.52 * n, -0.2, 0.45, 0.4, 0.08, '#dfe6ee', 0.3)
      B(0.2, 0.45, 1, 0.28, 0.22, '#ffffff')
      B(0.35, 0.5, 0.6, 0.18, 0.18, '#f1f3f6', 0.22)
      B(0.75, 0.55, 0.08, 0.08, 0.15, '#c0392b', 0.4)
      return
    case 'station':
      B(-0.7, -0.5, 1.4, 1, 0.25, '#d5ddd8')
      B(-0.6, -0.4, 1.2, 0.8, 0.12, '#8db57d', 0.25)
      B(-0.3, -0.2, 0.6, 0.4, 0.15, '#a7c99a', 0.37)
      return
    case 'port':
      for (let n = 0; n < 5; n++) B(-3 + 0.5 * n, -0.03, 0.06, 0.06, 0.35, '#b0b6bd')
      B(-3.2, -0.06, 2.5, 0.12, 0.05, '#c7ccd2', 0.35)
      B(-0.7, -0.4, 1.4, 0.8, 0.3, '#e6e9ee')
      for (let n = 0; n < 3; n++) B(-0.6 + 0.42 * n, -0.3, 0.36, 0.6, 0.1, '#cfd8e3', 0.3)
      return
    case 'museum':
      B(-0.6, -0.25, 1.2, 0.5, 0.35, '#d6d0c4')
      B(-0.5, -0.06, 1, 0.12, 2, '#4b5a52', 0.35)
      return
    case 'stadium':
      R(0, 0, 0.6, 0.45, 0.55, '#d3dae2')
      D(0, 0, 0.42, 0.3, 0.56, '#6fb36b')
      return
    case 'cbd':
      B(-0.5, -0.4, 0.3, 0.3, 4.2, '#4f86d9')
      B(0, -0.5, 0.3, 0.3, 4.8, '#5f93de')
      B(-0.3, 0.1, 0.3, 0.3, 3.6, '#6a9be0')
      B(0.25, 0, 0.3, 0.3, 4, '#4a7fcf')
      return
    case 'techCampus':
      B(-0.7, -0.4, 0.5, 0.3, 0.5, '#e3eef0')
      B(-0.1, -0.5, 0.5, 0.3, 0.55, '#d7e7ea')
      R(0.3, 0.2, 0.3, 0.3, 0.45, '#6fb0c0', true)
      B(-0.6, 0.2, 0.5, 0.3, 0.45, '#e9f2f3')
      return
    case 'logisticsHub':
      B(-0.8, -0.5, 1.6, 0.6, 0.55, '#8f9bc0')
      B(-0.8, 0.2, 1, 0.5, 0.4, '#dde3ea')
      L([0.6, 0.45, 0], [0.6, 0.45, 1.6], '#d9822b', thin)
      L([0.6, 0.45, 1.6], [0.6, -0.45, 1.6], '#d9822b', thin)
      return
    case 'attraction':
      R(0, 0, 0.55, 0.55, 0.65, '#f1f4f7', true)
      B(-0.8, 0.4, 0.5, 0.3, 0.3, '#e7d7b7')
      return
    case 'offices':
      B(-0.4, -0.4, 0.3, 0.3, 3.2, '#7d93b8')
      B(0.1, -0.3, 0.3, 0.3, 2.6, '#93a8c8')
      B(-0.2, 0.15, 0.3, 0.3, 3, '#6f88b1')
      return
  }
}

/** Draws only the supplied model output. Geometry is decorative and never consumes a simulation RNG. */
export function renderScene(canvas: HTMLCanvasElement, options: RenderOptions): number {
  const start = performance.now()
  const { frame, camera, projection, width, height, dpr, changed, highlight, other, dark, bitmap, outline, flash, marker } = options
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const tr = transformFor(camera, projection, width, height)
  const bounds = visibleBounds(tr, width, height)
  const sea = options.sea || (dark ? '#233f4b' : '#d5e6e8')
  ctx.fillStyle = sea
  ctx.fillRect(0, 0, width, height)
  // Zoomed out, buildings would be specks: the whole city is one flat image, and the legend colours stay readable.
  const flat = Boolean(bitmap) || tr.scale < DETAIL_SCALE
  if (flat) drawGrid(ctx, tr, bitmap ?? landBitmap(frame.map.grid))
  else {
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
    const building = new Set(frame.works?.flatMap((w) => w.building) ?? [])
    const july1997 = (startGrid ??= realMapAt(0))
    const rebuilt = new Set(frame.map.rebuilt)
    const landmarksAt = new Map<number, LandmarkView[]>()
    for (const l of frame.landmarks ?? []) {
      const [c, r] = gridPoint(...l.place)
      const i = Math.floor(r) * MAP_COLS + Math.floor(c)
      landmarksAt.set(i, [...(landmarksAt.get(i) ?? []), l])
    }
    for (const i of cells) {
      // A landmark stands in place of its cell's own buildings, in the same back-to-front order.
      const here = landmarksAt.get(i)
      if (here) {
        for (const l of here) drawLandmark(ctx, tr, l.shape, ...gridPoint(...l.place))
        continue
      }
      const kind = MAP_TILE_KINDS[frame.map.grid[i]] as TileKind
      if (!['public', 'private', 'commercial', 'industrial', 'logistics', 'port', 'institution', 'sciencePark', 'village', 'construction', 'woodland', 'park', 'shrubGrass'].includes(kind)) continue
      const c = i % MAP_COLS
      const r = Math.floor(i / MAP_COLS)
      const [x, y] = project(tr, c, r)
      if (x + tr.scale < 0 || x - tr.scale > width || y + tr.scale < 0 || y - 4 * tr.scale > height) continue
      if ((kind === 'woodland' || kind === 'shrubGrass') && (c + r) % 2 !== 0) continue
      const fresh = frame.map.grid[i] !== july1997[i] || rebuilt.has(i)
      const sprite = cellSprite(tr, dpr, kind, (c * 31 + r * 17) % 10, building.has(i), false, fresh)
      ctx.drawImage(sprite.canvas, x - sprite.x, y - sprite.y, sprite.w, sprite.h)
    }
  }
  if (frame.map.haze > 0) {
    ctx.fillStyle = `rgba(150,150,145,${frame.map.haze * 0.12})`
    ctx.fillRect(0, 0, width, height)
  }
  const outlineCells = (indices: Iterable<number>, colour: string) => {
    ctx.strokeStyle = colour; ctx.lineWidth = 1.8
    for (const i of indices) {
      const c = i % MAP_COLS, r = Math.floor(i / MAP_COLS)
      if (c < bounds.c0 || c > bounds.c1 || r < bounds.r0 || r > bounds.r1) continue
      const points = footprint(tr, c, r, 0.04, 0.04, 0.92, 0.92)
      ctx.beginPath(); points.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke()
    }
  }
  if (highlight && changed) outlineCells(changed, '#f4a340')
  if (outline) outlineCells(outline.cells, '#d6336c')
  if (flash) outlineCells(flash, '#ffd400')
  const routeIds = new Set(other?.rail.segments.map((s) => s.route) ?? [])
  if (outline) {
    ctx.strokeStyle = '#d6336c'; ctx.lineWidth = 7; ctx.lineCap = 'round'
    ctx.beginPath()
    for (const s of outline.rail.segments) { ctx.moveTo(...project(tr, ...gridPoint(...s.from))); ctx.lineTo(...project(tr, ...gridPoint(...s.to))) }
    ctx.stroke()
  }
  const line = (s: RailSegment, building: boolean) => {
    const a = project(tr, ...gridPoint(...s.from))
    const b = project(tr, ...gridPoint(...s.to))
    ctx.setLineDash(building ? [5, 4] : [])
    for (const [colour, lw] of [[dark ? '#c2d4d7' : '#ffffff', 4], [highlight && !routeIds.has(s.route) ? '#d28120' : '#365d68', 2]] as const) {
      ctx.strokeStyle = colour; ctx.lineWidth = lw
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
    }
  }
  frame.railBuilding?.segments.forEach((s) => line(s, true))
  frame.map.rail.segments.forEach((s) => line(s, false))
  ctx.setLineDash([])
  ctx.fillStyle = '#3d7a4a'
  for (const stop of lightRailStops(frame.t)) {
    const [x, y] = project(tr, ...gridPoint(stop.e, stop.n))
    ctx.beginPath(); ctx.arc(x, y, tr.scale < 5 ? 1 : 1.5, 0, Math.PI * 2); ctx.fill()
  }
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
  // Zoomed out, landmarks are small gold diamonds; close up, their outlines carry a name.
  for (const l of frame.landmarks ?? []) {
    const [c, r] = gridPoint(...l.place)
    if (flat) {
      const [x, y] = project(tr, c, r)
      if (x < -6 || x > width + 6 || y < -6 || y > height + 6) continue
      polygon(ctx, [[x, y - 5], [x + 4, y], [x, y + 5], [x - 4, y]], '#e0a526', dark ? '#1b313a' : '#ffffff')
      continue
    }
    if (tr.scale < 6) continue
    const [x, y] = lifted(tr, c, r, LANDMARK_TOP[l.shape] * (LANDMARK_SIZE[l.shape] ?? 1))
    ctx.font = '600 11px system-ui, "Microsoft JhengHei", sans-serif'
    const w = ctx.measureText(l.name).width
    const lx = x - w / 2
    if (lx < 4 || lx + w > width - 4 || y < 16 || y > height - 4) continue
    if (labels.some((o) => Math.abs(o.y - y) < 14 && lx < o.x + o.w && lx + w > o.x)) continue
    labels.push({ x: lx, y, w })
    ctx.strokeStyle = dark ? '#1b313a' : '#f5f8ef'; ctx.lineWidth = 3
    ctx.strokeText(l.name, lx, y - 4)
    ctx.fillStyle = dark ? '#f4d27a' : '#7a5410'; ctx.fillText(l.name, lx, y - 4)
  }
  if (marker) {
    const [x, y] = project(tr, ...gridPoint(...marker))
    const radius = Math.max(12, Math.min(32, tr.scale * 1.5))
    for (const [colour, lw] of [['#fff', 5], ['#c9252d', 2.5]] as const) {
      ctx.strokeStyle = colour; ctx.lineWidth = lw
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.fillStyle = '#c9252d'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
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
  const elapsed = performance.now() - start
  if (import.meta.env.DEV) canvas.dataset.drawMs = elapsed.toFixed(2)
  return elapsed
}
