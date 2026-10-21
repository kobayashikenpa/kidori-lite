// 木取りの画面。U-02 では見出しだけ（結果・配置図・切り出しチェックは U-09 から作る）
import { Help } from '../components/Help'

export function KidoriScreen() {
  return (
    <section>
      <h2>
        <Help title="木取り">必要な板の枚数・歩留まり・配置図・端材を出します。</Help>
      </h2>
      <p className="placeholder">準備中です</p>
    </section>
  )
}
