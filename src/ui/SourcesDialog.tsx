import { METRICS } from '../data/history'
import { LABELS } from '../engine/model'
import { Dialog } from './Dialog'

export function SourcesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="數據來源與模型" onClose={onClose} wide>
      <h3>數據</h3>
      <p className="warn-box small">
        這是第一版。開發環境無法連上政府數據網站，以下數字是根據公開報道整理的約數，部分年份為估算，將以官方數據逐項核實。
      </p>
      <ul className="sources">
        {METRICS.map((m) => (
          <li key={m.id}>
            <strong>
              {LABELS[m.k]}・{m.label}
            </strong>
            <div className="small">{m.source}</div>
            <div className="muted small">{m.note}</div>
          </li>
        ))}
        <li>
          <strong>真實政府的施政重心</strong>
          <div className="small">按各時期財政預算的開支比例和主要政策承諾估算，只作比較之用。</div>
        </li>
      </ul>

      <h3>模型怎樣運作</h3>
      <ul className="model-notes small">
        <li>每項指標由真實數據換算成 0–100 分。</li>
        <li>大事件跟真實歷史一致，所以模型只計算你跟歷史的差距：真實的年度變化，加上你的分配和抉擇跟真實的差別帶來的效果。</li>
        <li>完全跟隨真實的分配和抉擇，結果就等於真實歷史。</li>
        <li>投入有邊際遞減；指標越弱，投入越見效；住屋和交通的效果要等數年後工程完成才出現。</li>
        <li>指標互相牽動，例如經濟較好會增加稅收，開發土地會影響環境。差距每年會自然收窄一部分。</li>
        <li>種子碼決定效果的隨機浮動和平行時空事件。同一種子加同樣操作，結果必定相同。</li>
        <li>模型是簡化的遊戲模型，不是預測，也不代表對任何政策的評價。</li>
      </ul>
      <p className="muted small">靈感來自網頁人生模擬遊戲《80億分之1》。</p>
    </Dialog>
  )
}
