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
        標明「官方數字」的系列取自政府統計處、衞生署、差餉物業估價署、房屋委員會和庫務署的公開數據（{RETRIEVED} 下載）。其餘仍是根據公開報道整理的約數，會逐項換成官方數據。
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
          <strong>統計數字新聞：本地生產總值實質增長（每季、每年）、綜合消費物價指數按年變動（每月）、私人住宅售價指數（每月）</strong>
          <div className="small">
            政府統計處、差餉物業估價署
            <TableLinks tables={['310-31001', '510-60001', 'RVD']} />
          </div>
          <div className="muted small">官方數字，加上你的城市跟真實歷史的差距</div>
        </li>
        <li>
          <strong>收入來源比例（薪俸稅、利得稅、差餉、印花稅、賣地、投資收入、其他）</strong>
          <div className="small">
            政府統計處（按財政年度）
            <TableLinks tables={['340-47011']} />
          </div>
          <div className="muted small">官方數字；2025 年起沿用 2024 年的比例</div>
        </li>
        <li>
          <strong>地圖：土地用途</strong>
          <div className="small">
            規劃署《香港土地用途》，經空間數據共享平台的地圖服務下載，縮成 250 米一格
            <TableLinks tables={['PLAND']} />
          </div>
          <div className="muted small">
            官方數據（2025 年）；1997 年後的發展（例如赤鱲角機場、啟德、將軍澳、西九龍）按公開資料人手整理，用來倒推之前的樣子，年份和範圍是約數
          </div>
        </li>
        <li>
          <strong>地圖：鐵路站、樓價、人口密度</strong>
          <div className="small">
            地政總署（鐵路站和輕鐵站坐標）、差餉物業估價署（私人住宅分區平均售價，100 平方米以下）
            <TableLinks tables={['IGEOCOM', 'RVD']} />
          </div>
          <div className="muted small">官方數據；路線和通車日期按港鐵公布人手整理；人口密度按各類住宅每格的單位數估算</div>
        </li>
        <li>
          <strong>各部門開支比例、真實政府的撥款水平、各行業比重</strong>
          <div className="small">按財政預算案的開支結構，以及各時期的主要政策估算。</div>
          <div className="muted small">
            約數：各政策範疇的開支沒有可直接下載的官方數據；各行業比重的官方數字只有 2000 年起，留待之後補上
          </div>
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
        <li>
          民望看政府有沒有回應市民的問題：問題越嚴重、政府越久沒有加撥款、改政策或回覆抉擇，民望跌得越快；服務失修也會令市民不滿。加稅和不受歡迎的政策會即時扣民望。民望連續一年低於 25，任期提早結束。民望不會改變城市的任何數字。
        </li>
        <li>結局不評分，而是把你的香港跟真實的香港比較：六項指標、財政和人口。</li>
        <li>種子碼決定效果的隨機浮動和城市新聞。同一種子加同樣操作，結果必定相同。</li>
        <li>模型是簡化的遊戲模型，不是預測，也不代表對任何政策的評價。</li>
      </ul>
      <p className="muted small">靈感來自網頁人生模擬遊戲《80億分之1》，並參考 SimCity、Cities: Skylines 的預算和需求機制。</p>
    </Dialog>
  )
}
