import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { MAP_TILE_KINDS } from '../data/mapBase'
import { monthOf, yearOf } from '../engine/time'
import { DISTRICTS, changesBetween, districtCamera, districtCells, gridPoint, mostChangedDistrict, transformFor, unproject, type Camera, type District, type Projection } from './geometry'
import { renderScene } from './render'
import { SCENARIOS, buildStudyRun, sharedFrames, type ScenarioId, type StudyFrame, type StudyRun } from './scenes'

type StudyData = Record<ScenarioId | 'history', StudyRun>
const cache = new Map<string, StudyData>()
const date = (t: number) => `${yearOf(t)} 年 ${monthOf(t)} 月`
const digits = new Intl.NumberFormat('zh-HK', { maximumFractionDigits: 0 })
const format = (n: number) => digits.format(n)

function useStudy(seed: number, events: boolean) {
  const key = `${seed}:${events}`
  const [result, setResult] = useState<{ key: string; data: StudyData } | null>(null)
  const data = result?.key === key ? result.data : null
  const [progress, setProgress] = useState('')
  useEffect(() => {
    let cancelled = false
    if (cache.has(key)) { setResult({ key, data: cache.get(key)! }); return }
    const nextFrame = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    void (async () => {
      await nextFrame()
      if (cancelled) return
      const next = {} as StudyData
      for (const id of ['history', ...SCENARIOS.map((s) => s.id)] as const) {
        setProgress(id === 'history' ? '照歷史發展' : SCENARIOS.find((s) => s.id === id)!.label)
        await nextFrame()
        if (cancelled) return
        next[id] = buildStudyRun(id, seed, events)
      }
      cache.set(key, next)
      if (!cancelled) setResult({ key, data: next })
    })()
    return () => { cancelled = true }
  }, [seed, events, key])
  return { data, progress }
}

function localStats(frame: StudyFrame, district: District) {
  const kinds = districtCells(district).map((i) => MAP_TILE_KINDS[frame.map.grid[i]])
  const cam = districtCamera(district)
  const stations = frame.map.rail.stations.filter((s) => {
    const [c, r] = gridPoint(s.e, s.n)
    return Math.abs(c - cam.cx) <= district.cols / 2 && Math.abs(r - cam.cy) <= district.rows / 2
  }).length
  return {
    public: kinds.filter((k) => k === 'public').length,
    private: kinds.filter((k) => k === 'private').length,
    sites: kinds.filter((k) => k === 'construction').length,
    stations,
  }
}

interface MapPanelProps {
  title: string
  frame: StudyFrame
  other: StudyFrame
  district: District
  camera: Camera
  onCamera: (camera: Camera) => void
  projection: Projection
  highlight: boolean
  dark: boolean
}

function MapPanel({ title, frame, other, district, camera, onCamera, projection, highlight, dark }: MapPanelProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 380, dpr: 1 })
  const [visible, setVisible] = useState(true)
  const [timing, setTiming] = useState({ last: 0, p95: 0 })
  const measurements = useRef<number[]>([])
  const measurementKey = useRef('')
  const points = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ camera: Camera; x: number; y: number; distance: number } | null>(null)
  const changed = useMemo(() => changesBetween(frame.map, other.map), [frame, other])
  const stats = useMemo(() => localStats(frame, district), [frame, district])

  useEffect(() => {
    const el = host.current!
    const resize = () => {
      const w = el.clientWidth
      setSize({ w, h: Math.max(320, Math.min(440, w * 0.72)), dpr: window.devicePixelRatio || 1 })
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    window.addEventListener('resize', resize)
    return () => { ro.disconnect(); window.removeEventListener('resize', resize) }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px 0px' })
    observer.observe(host.current!)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!canvas.current || !size.w || !visible) return
    const key = `${projection}:${district.id}:${size.w}:${size.h}:${size.dpr}`
    if (measurementKey.current !== key) { measurements.current = []; measurementKey.current = key }
    const last = renderScene(canvas.current, { frame, other: other.map, camera, projection, width: size.w, height: size.h, dpr: size.dpr, changed, highlight, dark })
    measurements.current = [...measurements.current.slice(-119), last]
    const sorted = [...measurements.current].sort((a, b) => a - b)
    setTiming({ last, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] })
  }, [frame, other, camera, projection, size, changed, highlight, dark, district, visible])

  const startGesture = () => {
    const p = [...points.current.values()]
    gesture.current = p.length ? {
      camera,
      x: p.reduce((a, x) => a + x.x, 0) / p.length,
      y: p.reduce((a, x) => a + x.y, 0) / p.length,
      distance: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0,
    } : null
  }
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const pointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    points.current.delete(e.pointerId)
    startGesture()
  }

  return (
    <article className="scene-panel">
      <header className="scene-heading"><div><span className="scene-kicker">{title}</span><h2>{date(frame.t)}</h2></div><span className="scene-place">{district.name}</span></header>
      <div className="scene-canvas" ref={host} style={{ height: size.h }}>
        <canvas ref={canvas} style={{ width: size.w, height: size.h }} role="img" aria-label={`${title}，${date(frame.t)}，${district.name}，${projection === 'iso' ? '2.5D' : '俯視'}`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); points.current.set(e.pointerId, point(e)); startGesture() }}
          onPointerMove={(e) => {
            const g = gesture.current
            if (!points.current.has(e.pointerId) || !g) return
            points.current.set(e.pointerId, point(e))
            const p = [...points.current.values()]
            const x = p.reduce((a, v) => a + v.x, 0) / p.length
            const y = p.reduce((a, v) => a + v.y, 0) / p.length
            const distance = p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0
            const zoom = g.distance > 0 ? Math.min(3, Math.max(0.7, g.camera.zoom * distance / g.distance)) : g.camera.zoom
            const start = unproject(transformFor(g.camera, projection, size.w, size.h), g.x, g.y)
            const next = { ...g.camera, zoom }
            const end = unproject(transformFor(next, projection, size.w, size.h), x, y)
            onCamera({ ...next, cx: Math.min(255, Math.max(0, next.cx + start[0] - end[0])), cy: Math.min(192, Math.max(0, next.cy + start[1] - end[1])) })
          }}
          onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}
        />
        <span className="scene-view-label">{projection === 'iso' ? '微縮 2.5D' : '俯視 2D'}</span>
      </div>
      <dl className="scene-stats">
        <div><dt className="kind-public">公營住宅</dt><dd>{stats.public}<small> 格</small></dd></div>
        <div><dt className="kind-private">私人住宅</dt><dd>{stats.private}<small> 格</small></dd></div>
        <div><dt className="kind-site">工地／空置</dt><dd>{stats.sites}<small> 格</small></dd></div>
        <div><dt className="kind-station">鐵路站</dt><dd>{stats.stations}<small> 個</small></dd></div>
      </dl>
      <details className="scene-performance"><summary>繪圖量度</summary><span>最近 {timing.last.toFixed(1)} ms · P95 {timing.p95.toFixed(1)} ms（{measurements.current.length} 次）· {Math.round(size.w)} × {Math.round(size.h)} · DPR {size.dpr}。只量度此圖重畫，不代表整體幀率。</span></details>
    </article>
  )
}

export function CityStudy() {
  const [scenario, setScenario] = useState<ScenarioId>('housing')
  const [districtId, setDistrictId] = useState('kaiTak')
  const [projection, setProjection] = useState<Projection>('iso')
  const [mode, setMode] = useState<'paths' | 'time'>('paths')
  const [selected, setSelected] = useState(13)
  const [playing, setPlaying] = useState(false)
  const [highlight, setHighlight] = useState(true)
  const [seed, setSeed] = useState(1)
  const [events, setEvents] = useState(false)
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const district = DISTRICTS.find((d) => d.id === districtId)!
  const [camera, setCamera] = useState<Camera>(() => districtCamera(DISTRICTS[0]))
  const { data, progress } = useStudy(seed, events)
  const pairs = useMemo(() => data ? sharedFrames(data.history, data[scenario]) : [], [data, scenario])
  const index = Math.min(selected, pairs.length - 1)
  const right = pairs[index]?.[1]
  const left = right && data ? (mode === 'paths' ? pairs[index][0] : data[scenario].frames.filter((f) => f.t <= Math.max(0, right.t - 60)).at(-1)!) : undefined
  const choice = SCENARIOS.find((s) => s.id === scenario)!
  const onCamera = useCallback((value: Camera) => setCamera(value), [])
  const changeDistrict = (id: string) => { setDistrictId(id); setCamera(districtCamera(DISTRICTS.find((d) => d.id === id)!)) }

  useEffect(() => {
    if (!playing || !pairs.length) return
    if (index >= pairs.length - 1) { setPlaying(false); return }
    const timer = window.setTimeout(() => setSelected(index + 1), 850)
    return () => window.clearTimeout(timer)
  }, [playing, index, pairs.length])

  const changed = useMemo(() => left && right ? changesBetween(left.map, right.map) : new Set<number>(), [left, right])
  const localCells = useMemo(() => new Set(districtCells(district)), [district])
  const localChanged = [...localCells].filter((i) => changed.has(i)).length
  const stations = left && right ? [localStats(left, district).stations, localStats(right, district).stations] : [0, 0]
  const inView = right?.works.filter((w) => w.cells.some((i) => localCells.has(i)) || w.building.some((i) => localCells.has(i)) || (() => {
    const [c, r] = gridPoint(...w.place)
    const cam = districtCamera(district)
    return Math.abs(c - cam.cx) <= district.cols / 2 && Math.abs(r - cam.cy) <= district.rows / 2
  })()).slice(0, 4) ?? []
  return (
    <main className="study" data-theme={dark ? 'dark' : 'light'}>
      <div className="study-shell">
        <header className="study-header"><div><div className="study-eyebrow">平行香港 · 3e.1 城市發展樣板</div><h1>同一個起點，<br className="mobile-break" />建成另一個香港。</h1><p>走近一個地方，看看你的決定留下了甚麼。</p></div><div className="study-header-actions"><button className="quiet-button" onClick={() => setDark(!dark)}>{dark ? '淺色' : '深色'}</button><a href="./">返回遊戲 ↗</a></div></header>

        <section className="study-controls" aria-label="城市比較設定">
          <div className="study-selects"><label>這次怎樣發展<select value={scenario} onChange={(e) => { const id = e.target.value as ScenarioId; setScenario(id); setPlaying(false); changeDistrict(SCENARIOS.find((s) => s.id === id)!.focus) }}>{SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label><label>走近哪個地方<select value={districtId} onChange={(e) => changeDistrict(e.target.value)}>{DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><button className="quiet-button find-change" disabled={!left || !right} onClick={() => left && right && changeDistrict(mostChangedDistrict(left.map, right.map).id)}>找主要變化 ↗</button></div>
          <div className="study-options"><div className="study-segments" role="group" aria-label="比較方式"><button aria-pressed={mode === 'paths'} onClick={() => setMode('paths')}>不同玩法</button><button aria-pressed={mode === 'time'} onClick={() => setMode('time')}>同城前後</button></div><div className="study-segments" role="group" aria-label="地圖畫法"><button aria-pressed={projection === 'plan'} onClick={() => setProjection('plan')}>俯視 2D</button><button aria-pressed={projection === 'iso'} onClick={() => setProjection('iso')}>微縮 2.5D</button></div><label className="study-check"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />標出差異</label><div className="study-zoom"><button aria-label="縮小兩邊地圖" disabled={camera.zoom <= 0.7} onClick={() => setCamera({ ...camera, zoom: Math.max(0.7, camera.zoom / 1.3) })}>−</button><button aria-label="重設兩邊視野" onClick={() => setCamera(districtCamera(district))}>重設視野</button><button aria-label="放大兩邊地圖" disabled={camera.zoom >= 3} onClick={() => setCamera({ ...camera, zoom: Math.min(3, camera.zoom * 1.3) })}>＋</button></div></div>
        </section>

        {!left || !right ? <div className="study-loading" role="status"><span className="loading-dot" />正在推演兩個香港：{progress}…</div> : <>
          <div className="study-time"><button className="play-button" aria-label={playing ? '暫停年份播放' : '播放城市發展'} onClick={() => { if (index === pairs.length - 1) setSelected(0); setPlaying(!playing) }}>{playing ? 'Ⅱ' : '▶'}</button><span className="time-edge">1997</span><input type="range" min={0} max={pairs.length - 1} value={index} aria-label="比較年份" aria-valuetext={date(right.t)} onChange={(e) => { setPlaying(false); setSelected(Number(e.target.value)) }} /><strong>{date(right.t)}</strong></div>
          <div className="study-maps"><MapPanel title={mode === 'paths' ? '照歷史發展' : '同一座城市 · 以前'} frame={left} other={right} district={district} camera={camera} onCamera={onCamera} projection={projection} highlight={highlight} dark={dark} /><MapPanel title={mode === 'paths' ? choice.label : `${choice.label} · 後來`} frame={right} other={left} district={district} camera={camera} onCamera={onCamera} projection={projection} highlight={highlight} dark={dark} /></div>
          <div className="study-reading"><span><i className="difference-swatch" />{district.name}範圍內，兩邊有 <strong>{localChanged} 格</strong>地表用途不同；鐵路站 <strong>{stations[0]} → {stations[1]} 個</strong>。</span><span>拖動其中一張，兩邊會一起移動；手機可兩指縮放。</span></div>
          <section className="study-story"><div className="study-story-intro"><div className="study-eyebrow">決定留下的痕跡</div><h2>{choice.label}</h2><p>{choice.action}。</p><p className="study-small">橙框表示不同的地表；橙色鐵路表示另一邊未有的路線。沒有橙框，也可能只是鐵路或供應數字不同。</p></div><div className="study-projects">{inView.length ? inView.map((w) => <article key={w.key}><span className={`work-dot ${w.state}`} /><div><h3>{w.name}</h3><p>{w.state === 'building' ? '正在施工' : w.state === 'delayed' ? '發展延遲' : '已落成'}{w.unitsBuilding > 0 ? ` · 約 ${format(w.unitsBuilding * 10000)} 個住宅單位施工中` : w.units > 0 ? ` · 約 ${format(w.units * 10000)} 個住宅單位` : ''}{w.due !== undefined && w.state === 'building' ? ` · 預計 ${yearOf(w.due)} 年起落成` : ''}</p></div></article>) : <p className="empty-projects">這個年份，這一帶未有城市自己的具名工程。可以往後看，或按「找主要變化」。</p>}</div><div className="study-city-number"><span>全港公營住宅單位</span><strong>{format(left.metrics.publicUnits * 10000)} <small>→</small><br />{format(right.metrics.publicUnits * 10000)}</strong><span>公屋輪候 {left.metrics.prhWait.toFixed(1)} → {right.metrics.prhWait.toFixed(1)} 年</span><span className="study-small">全港數字，不是這一地區的住戶數。</span></div></section>
          {data?.[scenario].ended && <p className="study-notice">這種玩法在 {date(data[scenario].ended!.t)} 因{data[scenario].ended!.cause === 'debt' ? '財政崩潰' : '民望過低'}結束；上方只比較兩座城市都仍在任內的年度畫面。</p>}
        </>}

        <footer className="study-footer"><p>每格 250 × 250 米。樓群與高度是用地示意，並非真實樓宇；工地／空置也包括原始土地用途資料，只有具名工程代表模擬中的建設。</p><details><summary>比較資料</summary><div className="study-source-controls"><label>種子<select disabled={!data} value={seed} onChange={(e) => { setSeed(Number(e.target.value)); setPlaying(false) }}><option value={1}>1</option><option value={7}>7</option></select></label><label className="study-check"><input type="checkbox" disabled={!data} checked={events} onChange={(e) => { setEvents(e.target.checked); setPlaying(false) }} />開啟一般城市新聞</label></div><p>兩邊使用同一種子及完整模擬規則。年份畫面在推演當時保留，施工狀態來自當時的工程資料；提早結束的城市沒有未來畫面。這是獨立樣板，沒有改動遊戲的模擬或版面。</p></details></footer>
      </div>
    </main>
  )
}
