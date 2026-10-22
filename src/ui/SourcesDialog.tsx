import { RETRIEVED } from '../data/official'
import { REAL, tableLink, type Series } from '../data/real'
import { Dialog } from './Dialog'

function TableLinks({ tables }: { tables: string[] }) {
  return tables.map((t) => {
    const link = tableLink(t)
    return (
      <span key={t}>
        {' · '}
        <a className="link" href={link.url} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      </span>
    )
  })
}

export function SourcesDialog({ onClose }: { onClose: () => void }) {
  const series: [string, Series][] = Object.entries(REAL)
  return (
    <Dialog title="數據來源與模型" onClose={onClose} wide>
      <h3>數據</h3>
      <p className="warn-box small">
        標明「官方數字」的系列取自政府統計處和衞生署的公開數據（{RETRIEVED} 下載）。其餘仍是根據公開報道整理的約數，會逐項換成官方數據。
      </p>
      <ul className="sources">
        {series.map(([id, s]) => (
          <li key={id}>
            <strong>
              {s.label}（{s.unit}）
            </strong>
            <div className="small">
              {s.source}
              {s.tables && <TableLinks tables={s.tables} />}
            </div>
            <div className="muted small">{s.note}</div>
          </li>
        ))}
        <li>
          <strong>統計數字新聞：本地生產總值實質增長（每季、每年）、綜合消費物價指數按年變動（每月）</strong>
          <div className="small">
            政府統計處
            <TableLinks tables={['310-31001', '510-60001']} />
          </div>
          <div className="muted small">官方數字，加上你的城市跟真實歷史的差距</div>
        </li>
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
        <li>大事件照真實歷史發生。政策只會在你改變或作出抉擇時改變，不會自動跟隨歷史。</li>
        <li>其他城市新聞按你的城市狀況隨機發生，例如輪候長就多劏房新聞、新鐵路通車就多乘客創新高的新聞。</li>
        <li>如果完全照真實政府的撥款、政策和抉擇去做（並關掉隨機新聞），結果會等於真實的香港。</li>
        <li>結局按城市本身評分：六項指標、財政和人口。真實的香港用同一標準評分，在結局揭曉。</li>
        <li>種子碼決定效果的隨機浮動和城市新聞。同一種子加同樣操作，結果必定相同。</li>
        <li>模型是簡化的遊戲模型，不是預測，也不代表對任何政策的評價。</li>
      </ul>
      <p className="muted small">靈感來自網頁人生模擬遊戲《80億分之1》，並參考 SimCity、Cities: Skylines 的預算和需求機制。</p>
    </Dialog>
  )
}
