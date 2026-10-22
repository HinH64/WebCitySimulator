import { Dialog } from './Dialog'
import type { Settings } from './storage'

const PERIODIC: { v: Settings['periodic']; label: string }[] = [
  { v: 0, label: '不暫停' },
  { v: 1, label: '每 1 年' },
  { v: 3, label: '每 3 年' },
  { v: 5, label: '每 5 年' },
]

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
  onSources: () => void
  onQuit: () => void
}

export function SettingsDialog({ settings, onChange, onClose, onSources, onQuit }: Props) {
  const toggle = (key: 'pauseOnChoice' | 'pauseOnCrisis' | 'pauseWhileEditing') =>
    onChange({ ...settings, [key]: !settings[key] })

  return (
    <Dialog title="設定" onClose={onClose}>
      <h3>自動暫停</h3>
      <p className="muted small">時間預設一直流動。想慢慢想的話，可以在這裡設定甚麼時候自動暫停。</p>
      <div className="setting">
        <span>定期暫停</span>
        <div className="segmented small-seg">
          {PERIODIC.map((p) => (
            <button
              key={p.v}
              className={settings.periodic === p.v ? 'active' : ''}
              aria-pressed={settings.periodic === p.v}
              onClick={() => onChange({ ...settings, periodic: p.v })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <label className="setting check">
        <input type="checkbox" checked={settings.pauseOnChoice} onChange={() => toggle('pauseOnChoice')} />
        收到抉擇時暫停
      </label>
      <label className="setting check">
        <input type="checkbox" checked={settings.pauseOnCrisis} onChange={() => toggle('pauseOnCrisis')} />
        危機時暫停（庫房見底、債務接近上限、民望告急）
      </label>
      <label className="setting check">
        <input type="checkbox" checked={settings.pauseWhileEditing} onChange={() => toggle('pauseWhileEditing')} />
        操作面板時暫停
      </label>

      <div className="dialog-actions">
        <div className="actions-left">
          <button className="link" onClick={onSources}>
            數據來源與模型
          </button>
          <button className="link" onClick={onQuit}>
            離開這局
          </button>
        </div>
        <button className="button primary" onClick={onClose}>
          完成
        </button>
      </div>
    </Dialog>
  )
}
