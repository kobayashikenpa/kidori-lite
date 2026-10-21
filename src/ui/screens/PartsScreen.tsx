// 部材の画面（仕様書 5.1・5.2・9）：上にたたんだ設定、その下に［仕上がり］［木取り］のタブと部材の一覧・追加。
// 寸法の計算は engine（computeDimensions）、切り出しの進み具合は engine（partCutProgress）に任せる
import { useMemo, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { partCutProgress } from '../../engine/progress/partProgress'
import { browserStorage } from '../../store/storage'
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'
import { PartRow } from '../components/PartRow'
import { SettingsPanel } from '../components/SettingsPanel'
import { fmt } from '../format'
import { loadPartsTab, PARTS_TABS, savePartsTab, type PartsTab } from '../partsTab'

/** 編集している部材（null は新しく足す） */
type Editing = { partId: string | null } | null

export function PartsScreen() {
  const { job, data, dispatch } = useJobStore()
  const [tab, setTabState] = useState<PartsTab>(() => loadPartsTab(browserStorage()))
  const [, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const adjusts = data.adjusts
  const dims = useMemo(() => (job ? computeDimensions(job, adjusts) : null), [job, adjusts])
  const progress = useMemo(() => (job ? partCutProgress(job) : []), [job])
  if (!job || !dims) return null

  const setTab = (t: PartsTab) => {
    setTabState(t)
    savePartsTab(browserStorage(), t)
  }
  const finishedTab = tab === 'finished'

  const toggleDone = (partId: string, done: boolean) => {
    const r = dispatch({ type: 'updatePart', partId, patch: { finishedDone: done } })
    setError(r.ok ? null : r.message)
  }

  return (
    <section>
      <SettingsPanel />
      <h2>
        <Help title="部材">
          部材の名前・W・H・枚数を、仕上がり寸法で入れます（入力は［仕上がり］のタブだけ）。木取り寸法（仕上がり寸法 ＋
          切り代）は［木取り］のタブで見られます。式で入れた寸法は、式の隣に計算した寸法が出ます。式が長いときやエラーのときは、寸法の欄を押すと全文・理由が出ます。
        </Help>
      </h2>

      <div className="parts-tabs" role="tablist" aria-label="仕上がりと木取りの切り替え">
        {PARTS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={`parts-tab ${t.value === 'finished' ? 'fin' : 'cut'}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`parts-band ${finishedTab ? 'fin' : 'cut'}`}>
        {finishedTab ? (
          <Help title="仕上がり寸法">
            家具として完成したときの寸法です。行を押すと編集できます。左のチェックは仕上げ終わった部材の印です（木取りの計算には影響しません）。
          </Help>
        ) : (
          <Help title={`木取り寸法（仕上がり ＋ 切り代 ${fmt(job.settings.allowance)}）`}>
            パネルソーで切る寸法です。見るだけで、ここでは編集できません（入力は［仕上がり］のタブ）。「切った 2/5」は木取りの画面でチェックした数です。
          </Help>
        )}
      </div>

      {job.parts.length === 0 ? (
        <p className="placeholder">部材はまだありません</p>
      ) : (
        <>
          <div className={`part-row part-colhead ${finishedTab ? 'fin' : 'cut'}`} aria-hidden="true">
            {finishedTab && <span />}
            <span>部材</span>
            <span>W</span>
            <span>H</span>
          </div>
          <ul className={`part-list ${finishedTab ? 'fin' : 'cut'}`}>
            {job.parts.map((p) => (
              <PartRow
                key={p.id}
                part={p}
                dims={dims.parts.find((d) => d.partId === p.id)}
                tab={tab}
                adjusts={adjusts}
                progress={progress.find((x) => x.partId === p.id)}
                onEdit={() => setEditing({ partId: p.id })}
                onToggleDone={() => toggleDone(p.id, !p.finishedDone)}
              />
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      {finishedTab && (
        <button type="button" className="btn wide parts-add" onClick={() => setEditing({ partId: null })}>
          ＋ 部材を追加
        </button>
      )}
    </section>
  )
}
