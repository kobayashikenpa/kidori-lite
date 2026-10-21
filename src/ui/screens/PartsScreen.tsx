// 部材の画面。上にたたんだ設定（U-04）。［仕上がり］［木取り］のタブと部材の一覧は U-06 から作る
import { Help } from '../components/Help'
import { SettingsPanel } from '../components/SettingsPanel'

export function PartsScreen() {
  return (
    <section>
      <SettingsPanel />
      <h2>
        <Help title="部材">部材の名前・W・H・枚数を、仕上がり寸法で入れます。木取り寸法（仕上がり寸法 ＋ 切り代）は自動で出ます。</Help>
      </h2>
      <p className="placeholder">準備中です</p>
    </section>
  )
}
