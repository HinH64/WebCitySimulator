// Downloads the map data:
// - src/data/mapStations.ts: railway stations and light rail stops from the Lands Department's iGeoCom.
// - src/data/mapBase.ts: the Planning Department's 2025 land use grid. The CSDI download link is blocked,
//   but the dataset's WMS works. GetMap draws each land use code as a grey, and GetFeatureInfo returns the
//   code at a point, so the script reads the greys for the whole territory at 25 m and checks which code
//   each grey stands for. Each 250 m cell then takes its most common land use.
//
// Run: npm run data:map            (--stations-only skips the land use; --preview <file.png> draws the grid)
import { X509Certificate } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { rootCertificates } from 'node:tls'
import { deflateSync, inflateRawSync, inflateSync } from 'node:zlib'

const DATASET = 'pland_rcd_1754559265139_25057'
const WMS = `https://portal.csdi.gov.hk/server/services/common/${DATASET}/MapServer/WMSServer`
const SOURCE_URL = `https://portal.csdi.gov.hk/geoportal/?datasetId=${DATASET}`

// Hong Kong 1980 Grid (EPSG:2326). The grid's top-left corner is (E0, N1).
const E0 = 800000
const N1 = 848000
const COLS = 255
const ROWS = 192
const CELL = 250
const SUB = 10 // samples per cell side, 25 m apart
const TILE_COLS = 85
const TILE_ROWS = 64

// Planning Department land use codes, grouped into the game's tiles. Order is the tile index.
const TILES = [
  ['sea', [0]],
  ['private', [1]], // private residential
  ['public', [2]], // public residential, including subsidised and temporary housing
  ['village', [3]], // rural settlement
  ['commercial', [11]], // commercial, business and office
  ['industrial', [21]], // industrial land
  ['sciencePark', [22]], // industrial estates, science and technology parks
  ['logistics', [23]], // warehouse and open storage
  ['institution', [31]], // government, institutional and community facilities
  ['park', [32]], // open space and recreation
  ['road', [41]], // roads and transport facilities
  ['rail', [42]],
  ['airport', [43]],
  ['port', [44]],
  ['cemetery', [51]],
  ['utility', [52]],
  ['construction', [53]], // vacant land and construction in progress
  ['otherUrban', [54]],
  ['farm', [61]],
  ['fishPond', [62]],
  ['woodland', [71]],
  ['shrubGrass', [72, 73]], // shrubland, grassland
  ['wetland', [74]], // mangrove and swamp
  ['barren', [81, 82, 83]], // badland, rocky shore
  ['water', [91, 92]], // reservoirs, streams and nullahs
]
const TILE_OF_CODE = new Map(TILES.flatMap(([, codes], i) => codes.map((c) => [c, i])))
const SEA = 0
const LINEAR = new Set([TILE_OF_CODE.get(41), TILE_OF_CODE.get(42)])

const preview = process.argv.includes('--preview') ? process.argv[process.argv.indexOf('--preview') + 1] : undefined
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, as) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url)
    if (res.ok) return as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer())
    if (attempt >= 2) throw new Error(`${res.status} for ${url}`)
    await sleep(5000)
  }
}

function decodePng(buf) {
  let p = 8
  let w, h, bpp
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const d = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = d.readUInt32BE(0)
      h = d.readUInt32BE(4)
      bpp = { 2: 3, 6: 4 }[d[9]]
      if (d[8] !== 8 || !bpp) throw new Error(`unexpected PNG: depth ${d[8]}, colour type ${d[9]}`)
    }
    if (type === 'IDAT') idat.push(d)
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const b = y ? px[(y - 1) * stride + x] : 0
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0
      let v = raw[y * (stride + 1) + 1 + x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const q = a + b - c
        const pa = Math.abs(q - a)
        const pb = Math.abs(q - b)
        const pc = Math.abs(q - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + x] = v & 255
    }
  }
  const grey = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (px[i * bpp] !== px[i * bpp + 1] || px[i * bpp] !== px[i * bpp + 2]) throw new Error('expected a grey image')
    grey[i] = px[i * bpp]
  }
  return { w, h, grey }
}

// ---- Railway stations (iGeoCom) ----

// open.hkmapservice.gov.hk sends its root certificate but not the intermediate, so certificate checks fail.
// Fetch the intermediate from the address in the site's certificate, confirm it is signed by Hongkong Post
// Root CA 3 from Node's own root store, and add it to the chain. Verification stays on.
async function hkPostCa() {
  const inter = new X509Certificate(await get('http://www1.eCert.gov.hk/root/ecert_ssl_ca_3-17.crt'))
  const root = rootCertificates.map((p) => new X509Certificate(p)).find((c) => c.subject.includes('CN=Hongkong Post Root CA 3'))
  if (!root || !inter.verify(root.publicKey)) throw new Error('could not verify the Hongkong Post intermediate certificate')
  return [...rootCertificates, inter.toString()]
}

function httpsBuffer(url, ca) {
  return new Promise((resolve, reject) =>
    httpsGet(url, { ca }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(httpsBuffer(new URL(res.headers.location, url).href, ca))
        return
      }
      if (res.statusCode !== 200) reject(new Error(`${res.statusCode} for ${url}`))
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject),
  )
}

/** The one file in a zip archive, found through the central directory. */
function unzipSingle(zip) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const cd = zip.readUInt32LE(eocd + 16)
  if (zip.readUInt32LE(cd) !== 0x02014b50) throw new Error('bad zip central directory')
  const method = zip.readUInt16LE(cd + 10)
  const size = zip.readUInt32LE(cd + 20)
  const local = zip.readUInt32LE(cd + 42)
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
  const data = zip.subarray(start, start + size)
  if (method === 0) return data
  if (method === 8) return inflateRawSync(data)
  throw new Error(`zip method ${method}`)
}

function parseCsv(text) {
  const rows = []
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line) continue
    const cells = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') quoted = false
        else cur += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') {
        cells.push(cur)
        cur = ''
      } else cur += ch
    }
    cells.push(cur)
    rows.push(cells)
  }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])))
}

{
  const IGEOCOM = 'https://open.hkmapservice.gov.hk/OpenData/directDownload?productName=iGeoCom&sheetName=iGeoCom&productFormat=CSV'
  const pois = parseCsv(unzipSingle(await httpsBuffer(IGEOCOM, await hkPostCa())).toString('utf8'))
  // RSN: railway station, HSN: the high speed rail terminus, LRA: light rail stop.
  const stations = pois
    .filter((p) => p.CLASS === 'TRS' && ['RSN', 'HSN', 'LRA'].includes(p.TYPE))
    .map((p) => ({
      zh: p.CHINESENAME.replace(/^香港鐵路|^香港|^輕鐵－/, '').replace(/站$/, ''),
      en: p.ENGLISHNAME.replace(/^Mass Transit Railway |^Hong Kong |^LR-/, '').replace(/ Station$/, ''),
      e: Number(p.EASTING),
      n: Number(p.NORTHING),
      ...(p.TYPE === 'LRA' ? { light: true } : {}),
    }))
    .sort((a, b) => Number(Boolean(a.light)) - Number(Boolean(b.light)) || a.e - b.e)
  const heavy = stations.filter((s) => !s.light).length
  if (heavy < 95 || stations.length - heavy < 60) throw new Error(`unexpected station count: ${heavy} rail, ${stations.length - heavy} light rail`)
  writeFileSync(
    'src/data/mapStations.ts',
    `// Generated by scripts/fetch-map.mjs on ${new Date().toISOString().slice(0, 10)}. Do not edit; run \`npm run data:map\`.
// Lands Department, GeoCommunity Database (iGeoCom): https://data.gov.hk/en-data/dataset/hk-landsd-openmap-development-hkms-digital-geocom

export interface MapStation {
  zh: string
  en: string
  /** Hong Kong 1980 Grid, metres. */
  e: number
  n: number
  light?: boolean
}

/** Railway stations (${heavy}) and light rail stops (${stations.length - heavy}) as they stand today. */
export const MAP_STATIONS: MapStation[] = [
${stations.map((s) => `  ${JSON.stringify(s)},`).join('\n')}
]
`,
  )
  console.log(`src/data/mapStations.ts: ${heavy} stations, ${stations.length - heavy} light rail stops`)
  if (process.argv.includes('--stations-only')) process.exit(0)
}

// ---- Greys for the whole territory, 25 m apart ----

// transparent=true matters: without it the server clips the darkest greys, and codes 0–2 all come back black.
const tiles = []
for (let ty = 0; ty < ROWS / TILE_ROWS; ty++) {
  for (let tx = 0; tx < COLS / TILE_COLS; tx++) {
    const minE = E0 + tx * TILE_COLS * CELL
    const maxN = N1 - ty * TILE_ROWS * CELL
    const bbox = [minE, maxN - TILE_ROWS * CELL, minE + TILE_COLS * CELL, maxN]
    const width = TILE_COLS * SUB
    const height = TILE_ROWS * SUB
    const query = `service=WMS&version=1.1.1&layers=BLU&query_layers=BLU&styles=&srs=EPSG:2326&bbox=${bbox.join(',')}&width=${width}&height=${height}`
    const img = decodePng(await get(`${WMS}?${query}&request=GetMap&format=image/png32&transparent=true`))
    if (img.w !== width || img.h !== height) throw new Error(`tile ${tx},${ty}: got ${img.w}x${img.h}`)
    tiles.push({ tx, ty, query, img })
    await sleep(800)
  }
}

// ---- Which code each grey stands for ----

// The server stretches codes 0–92 linearly onto greys (code 0 is grey 2, code 92 is grey 255), so each
// grey gives its code directly. The stretch is checked against GetFeatureInfo, which returns the code at
// a point: for each grey, up to three points in the middle of a 5x5 block of that grey (3x3 for greys too
// rare to have one), queried with a 1 m box around the point so the server cannot pick a neighbouring
// pixel. One match confirms the grey.
const codeFromGrey = (g) => Math.round((g - 2.77) / 2.742)

function findSamples(r) {
  const found = new Map()
  for (const t of tiles) {
    const { w, h, grey } = t.img
    for (let y = r; y < h - r; y += 2 * r + 1) {
      for (let x = r; x < w - r; x += 2 * r + 1) {
        const g = grey[y * w + x]
        const list = found.get(g) ?? []
        if (list.length >= 3) continue
        let uniform = true
        for (let dy = -r; dy <= r && uniform; dy++) for (let dx = -r; dx <= r; dx++) if (grey[(y + dy) * w + x + dx] !== g) uniform = false
        if (uniform && !list.some((s) => s.t === t && Math.abs(s.x - x) + Math.abs(s.y - y) < 40)) {
          list.push({ t, x, y })
          found.set(g, list)
        }
      }
    }
  }
  return found
}
const samples = findSamples(2)
for (const [g, list] of findSamples(1)) if (!samples.has(g)) samples.set(g, list)

const codeOfGrey = new Map()
const greysSeen = new Set(tiles.flatMap((t) => [...new Set(t.img.grey)]))
for (const g of [...greysSeen].sort((a, b) => a - b)) {
  const code = codeFromGrey(g)
  if (!TILE_OF_CODE.has(code)) throw new Error(`grey ${g} gives unknown land use code ${code}`)
  const found = []
  for (const { t, x, y } of samples.get(g) ?? []) {
    const [minE, , , maxN] = t.query.match(/bbox=([^&]+)/)[1].split(',').map(Number)
    const e = minE + (x + 0.5) * (CELL / SUB)
    const n = maxN - (y + 0.5) * (CELL / SUB)
    const box = `service=WMS&version=1.1.1&layers=BLU&query_layers=BLU&styles=&srs=EPSG:2326&bbox=${e - 0.5},${n - 0.5},${e + 0.5},${n + 0.5}&width=1&height=1`
    const text = await get(`${WMS}?${box}&request=GetFeatureInfo&x=0&y=0&info_format=text/plain`, 'text')
    const m = text.match(/Pixel Value;\s*(\d+)/)
    found.push(m ? Number(m[1]) : text.slice(0, 60))
    await sleep(1000)
    if (found.at(-1) === code) break
  }
  if (found.length === 0) console.warn(`grey ${g}: no clean point to check; using code ${code} from the stretch`)
  else if (!found.includes(code)) throw new Error(`grey ${g}: expected code ${code}, the server says ${found.join(', ')}`)
  codeOfGrey.set(g, code)
}

// ---- Each 250 m cell takes its most common use ----

// Roads and railways are thin but everywhere, so they only win a cell they mostly cover; rail lines are
// drawn from stations later. Sea wins a cell only if it covers at least half of it.
const cells = new Uint8Array(COLS * ROWS)
const area = new Map()
for (const t of tiles) {
  const { w, grey } = t.img
  for (let cy = 0; cy < TILE_ROWS; cy++) {
    for (let cx = 0; cx < TILE_COLS; cx++) {
      const counts = new Array(TILES.length).fill(0)
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const g = grey[(cy * SUB + sy) * w + cx * SUB + sx]
          const code = codeOfGrey.get(g)
          if (code === undefined) throw new Error(`grey ${g} has no code`)
          counts[TILE_OF_CODE.get(code)]++
          area.set(code, (area.get(code) ?? 0) + 625)
        }
      }
      const total = SUB * SUB
      let best = SEA
      if (counts[SEA] * 2 < total) {
        let bestCount = -1
        for (let i = 0; i < TILES.length; i++) {
          if (i === SEA || (LINEAR.has(i) && counts[i] * 2 < total)) continue
          if (counts[i] > bestCount) {
            best = i
            bestCount = counts[i]
          }
        }
        if (bestCount <= 0) best = counts.indexOf(Math.max(...counts))
      }
      cells[(t.ty * TILE_ROWS + cy) * COLS + t.tx * TILE_COLS + cx] = best
    }
  }
}

// ---- Run-length encode, one letter per tile ----

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
if (TILES.length > LETTERS.length) throw new Error('too many tiles for one letter each')
let rle = ''
for (let i = 0; i < cells.length; ) {
  let j = i
  while (j < cells.length && cells[j] === cells[i]) j++
  rle += (j - i > 1 ? j - i : '') + LETTERS[cells[i]]
  i = j
}

const retrieved = new Date().toISOString().slice(0, 10)
const tileCounts = TILES.map(([name], i) => `${name} ${cells.filter((c) => c === i).length}`)
writeFileSync(
  'src/data/mapBase.ts',
  `// Generated by scripts/fetch-map.mjs on ${retrieved}. Do not edit; run \`npm run data:map\`.
// Planning Department, Land Utilization in Hong Kong 2025 (10 m raster grid), via the CSDI WMS:
// ${SOURCE_URL}

/** Hong Kong 1980 Grid (EPSG:2326) coordinates of the grid's top-left corner, in metres. */
export const MAP_ORIGIN = { e: ${E0}, n: ${N1} }
export const MAP_COLS = ${COLS}
export const MAP_ROWS = ${ROWS}
/** Cell size in metres. */
export const MAP_CELL = ${CELL}
export const MAP_RETRIEVED = '${retrieved}'

/** Tile kinds, in the order the letters a, b, c, ... of MAP_BASE_2025 refer to. */
export const MAP_TILE_KINDS = ${JSON.stringify(TILES.map(([name]) => name))} as const

/**
 * Most common land use in each cell, row by row from the north-west corner, run-length encoded:
 * "12a" is twelve cells of the first kind, a bare letter is one cell.
 */
export const MAP_BASE_2025 =
  '${rle}'
`,
)
console.log(`src/data/mapBase.ts: ${rle.length} characters`)
console.log(tileCounts.join(', '))
console.log(
  'km² by code: ' +
    [...area]
      .sort((a, b) => a[0] - b[0])
      .map(([c, m2]) => `${c}=${(m2 / 1e6).toFixed(1)}`)
      .join(' '),
)

// ---- Optional preview ----

if (preview) {
  // Rough colours for checking the grid by eye; the game's colours live in src/data/mapTiles.ts.
  const COLOURS = {
    sea: [205, 222, 238], private: [214, 96, 77], public: [235, 150, 60], village: [190, 150, 110], commercial: [170, 60, 140],
    industrial: [130, 110, 170], sciencePark: [90, 120, 200], logistics: [150, 140, 120], institution: [120, 160, 200],
    park: [140, 200, 120], road: [150, 150, 150], rail: [60, 60, 60], airport: [180, 180, 190], port: [110, 120, 140],
    cemetery: [160, 170, 150], utility: [170, 160, 150], construction: [225, 215, 160], otherUrban: [200, 190, 180],
    farm: [215, 225, 150], fishPond: [150, 200, 210], woodland: [60, 130, 70], shrubGrass: [120, 170, 100],
    wetland: [90, 160, 140], barren: [200, 190, 170], water: [100, 160, 220],
  }
  const S = 3
  const W = COLS * S
  const H = ROWS * S
  const raw = Buffer.alloc(H * (W * 3 + 1))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = COLOURS[TILES[cells[Math.floor(y / S) * COLS + Math.floor(x / S)]][0]]
      raw.set([r, g, b], y * (W * 3 + 1) + 1 + x * 3)
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  writeFileSync(
    preview,
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
  )
  console.log(`preview: ${preview}`)
}

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
