// 部材の画面。U-02 では見出しだけ（設定・［仕上がり］［木取り］のタブ・部材の一覧は U-04 から作る）
import { Help } from '../components/Help'

export function PartsScreen() {
  return (
    <section>
      <h2>
        <Help title="部材">部材の名前・W・H・枚数を、仕上がり寸法で入れます。木取り寸法（仕上がり寸法 ＋ 切り代）は自動で出ます。</Help>
      </h2>
      <p className="placeholder">準備中です</p>
    </section>
  )
}
