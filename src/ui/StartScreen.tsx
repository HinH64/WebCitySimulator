import { useState } from 'react'
import { randomSeed, seedFromText } from '../engine/rng'
import { SourcesDialog } from './SourcesDialog'
import { clearTerms, loadTerms, saveSpeed, type PastTerm, type Speed } from './storage'

interface Props {
  initialSpeed: Speed
  onStart: (seed: number, speed: Speed) => void
}

const SPEEDS: { id: Speed; label: string; hint: string }[] = [
  { id: 'slow', label: '慢', hint: '約 9 分鐘' },
  { id: 'normal', label: '中', hint: '約 6 分鐘' },
  { id: 'fast', label: '快', hint: '約 2 分半' },
]

export function StartScreen({ initialSpeed, onStart }: Props) {
  const [seedText, setSeedText] = useState(() => String(randomSeed()))
  const [speed, setSpeed] = useState<Speed>(initialSpeed)
  const [terms, setTerms] = useState<PastTerm[]>(() => loadTerms())
  const [showSources, setShowSources] = useState(false)

  const start = () => {
    saveSpeed(speed)
    onStart(seedFromText(seedText || '0'), speed)
  }

  return (
    <div className="start">
      <section className="start-hero">
        <div className="eyebrow">1997 → 2026</div>
        <h1>平行香港</h1>
        <p className="lead">
          像《模擬城市》一樣經營一座城市，不過起點是真實的香港。1997 年 7 月 1 日，你接手香港的庫房：分配各部門的撥款，看著城市一年一年發展到 2026 年。
        </p>
        <ul className="how small">
          <li>
            <strong>撥款</strong>：調整六個部門的撥款水平。100% 維持現有服務，多於 100% 就擴建，但工程要幾年才見效。
          </li>
          <li>
            <strong>觀看</strong>：時間一直流動，城市新聞報道城市的變化。金融風暴、SARS、金融海嘯、疫情會照真實歷史發生，其他新聞則跟著你的城市走。
          </li>
          <li>
            <strong>其他工具</strong>：稅率、債務、長期政策和待決定的抉擇都可以隨時處理，不會打斷時間。政策只會在你改變時改變。
          </li>
          <li>
            <strong>結局</strong>：2026 年按你的城市本身評分，然後揭曉真實的香港用同一標準得幾分，以及每個關口歷史上怎樣選。
          </li>
        </ul>
      </section>

      <section className="start-form">
        <label className="field">
          <span>種子碼</span>
          <span className="field-row">
            <input value={seedText} onChange={(e) => setSeedText(e.target.value)} inputMode="numeric" aria-describedby="seed-hint" />
            <button className="button" onClick={() => setSeedText(String(randomSeed()))}>
              隨機
            </button>
          </span>
          <span id="seed-hint" className="muted small">
            同一種子加同樣的操作，結果必定相同，可以跟朋友比拼。
          </span>
        </label>

        <fieldset className="field">
          <legend>速度</legend>
          <div className="segmented">
            {SPEEDS.map((s) => (
              <button key={s.id} className={speed === s.id ? 'active' : ''} onClick={() => setSpeed(s.id)} aria-pressed={speed === s.id}>
                {s.label}
                <span className="small muted">{s.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <button className="button primary big" onClick={start}>
          接手香港
        </button>
        <button className="link" onClick={() => setShowSources(true)}>
          數據來源與模型
        </button>
      </section>

      {terms.length > 0 && (
        <section className="terms">
          <h2 className="section-title">過往任期</h2>
          <ul>
            {terms.map((t, i) => (
              <li key={`${t.at}-${i}`}>
                <span className={`rating-chip rating-${t.rating}`}>{t.rating}</span>
                <span>{t.title}</span>
                <span className="mono small">{t.score} 分</span>
                <span className="muted small">
                  {new Date(t.at).toLocaleDateString('zh-HK')}・種子 {t.seed}
                </span>
              </li>
            ))}
          </ul>
          <button
            className="link"
            onClick={() => {
              clearTerms()
              setTerms([])
            }}
          >
            清除紀錄
          </button>
        </section>
      )}

      <footer className="start-foot muted small">靈感來自《80億分之1》。數據為約數，模型為簡化的遊戲模型。</footer>

      {showSources && <SourcesDialog onClose={() => setShowSources(false)} />}
    </div>
  )
}
