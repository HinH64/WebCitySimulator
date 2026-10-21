import { REAL } from '../data/real'
import { Dialog } from './Dialog'

export function SourcesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="數據來源與模型" onClose={onClose} wide>
      <h3>數據</h3>
      <p className="warn-box small">
        開發環境無法連上政府數據網站，以下數字是根據公開報道整理的約數，部分年份為估算，第 2 階段會以官方數據逐項核實。
      </p>
      <ul className="sources">
        {Object.entries(REAL).map(([id, s]) => (
          <li key={id}>
            <strong>
              {s.label}（{s.unit}）
            </strong>
            <div className="small">{s.source}</div>
            <div className="muted small">{s.note}</div>
          </li>
        ))}
        <li>
          <strong>各部門開支比例、真實政府的撥款水平、收入來源比例、各行業比重</strong>
          <div className="small">按財政預算案的開支和收入結構，以及各時期的主要政策估算。</div>
        </li>
      </ul>

      <h3>模型怎樣運作</h3>
      <ul className="model-notes small">
        <li>每月計算一次。錢以億元計，人口以萬人計。</li>
        <li>每個部門有「基本額」，即維持現有服務所需的錢。撥款低於 95% 服務會慢慢變差；高於 100% 的錢用來擴建，有工程延遲和邊際遞減。</li>
        <li>收入來自薪俸稅、利得稅、差餉、印花稅、賣地和投資收入，會隨經濟、樓價、人口和稅率變化。</li>
        <li>人口由出生、死亡、單程證和其他移入移出組成。城市越吸引人，移入越多。</li>
        <li>大事件照真實歷史發生。如果完全照真實政府的撥款和抉擇去做，結果會等於真實的香港。</li>
        <li>種子碼決定效果的隨機浮動和城市動態事件。同一種子加同樣操作，結果必定相同。</li>
        <li>模型是簡化的遊戲模型，不是預測，也不代表對任何政策的評價。</li>
      </ul>
      <p className="muted small">靈感來自網頁人生模擬遊戲《80億分之1》，並參考 SimCity、Cities: Skylines 的預算和需求機制。</p>
    </Dialog>
  )
}
