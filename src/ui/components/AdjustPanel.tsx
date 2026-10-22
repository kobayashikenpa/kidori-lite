// 部材の画面の上にたたんで置く「調整寸法」（仕様書 4.1・16.5）：調整寸法の一覧と追加（アプリ全体で1つの一覧）。
// 第1.2版で「設定」は調整寸法だけになったので、名前を「調整寸法」にした（板のサイズ〜切り方は木取りの画面へ）
import { useId, useState } from 'react'
import { adjustName } from '../../engine/defaults'
import { useJobStore } from '../../store/useJobStore'
import { AdjustList } from './AdjustList'
import { Help } from './Help'

export function AdjustPanel() {
  const { data } = useJobStore()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const names = data.adjusts.map(adjustName)

  return (
    <div className={`card settings${open ? ' open' : ''}`}>
      <button
        type="button"
        className="settings-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="settings-title">調整寸法</span>
        <span className="settings-sum">{names.length > 0 ? names.join('・') : 'なし'}</span>
        <span className={`settings-arrow${open ? ' open' : ''}`} aria-hidden="true">
          ›
        </span>
      </button>

      {open && (
        <div id={bodyId} className="settings-body">
          <section className="settings-sec" aria-label="調整寸法">
            <h3>
              <Help title="調整寸法の一覧">
                逃げ・ほぞ・メラミンなど、仕上がり寸法を伸ばしたり短くしたりする寸法です。名前と寸法で登録し、式のボタンで入れて足し引きします。どの仕事でも同じ一覧を使います。式のキーの「調整寸法」のタブの「＋ 追加」からも足せます。
              </Help>
            </h3>
            <AdjustList />
          </section>
        </div>
      )}
    </div>
  )
}
