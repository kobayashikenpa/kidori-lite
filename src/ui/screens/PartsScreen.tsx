// 部材の画面（仕様書 5.1・5.2・9）：上にたたんだ設定、その下に［仕上がり］［木取り］のタブと部材の一覧・追加。
// 寸法の計算は engine（computeDimensions）、切り出しの進み具合は engine（partCutProgress）に任せる
import { useMemo, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { partCutProgress } from '../../engine/progress/partProgress'
import { browserStorage } from '../../store/storage'
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'
import { PartEditor } from '../components/PartEditor'
import { PastePreview } from '../components/PastePreview'
import { PartRow } from '../components/PartRow'
import { SettingsPanel } from '../components/SettingsPanel'
import { fmt } from '../format'
import { loadPartsTab, PARTS_TABS, savePartsTab, type PartsTab } from '../partsTab'

/** 編集している部材（null は新しく足す） */
type Editing = { partId: string | null } | null

export function PartsScreen() {
  const { job, data, dispatch } = useJobStore()
  const [tab, setTabState] = useState<PartsTab>(() => loadPartsTab(browserStorage()))
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  // コピー・貼り付けの知らせ（「3件をコピーしました」）
  const [notice, setNotice] = useState<string | null>(null)
  // 「選んでコピー」で選んでいる部材（null は選んでいない）
  const [picking, setPicking] = useState<ReadonlySet<string> | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const adjusts = data.adjusts
  const dims = useMemo(() => (job ? computeDimensions(job, adjusts) : null), [job, adjusts])
  const progress = useMemo(() => (job ? partCutProgress(job) : []), [job])
  if (!job || !dims) return null

  const setTab = (t: PartsTab) => {
    setTabState(t)
    setPicking(null)
    savePartsTab(browserStorage(), t)
  }
  const finishedTab = tab === 'finished'

  const toggleDone = (partId: string, done: boolean) => {
    const r = dispatch({ type: 'updatePart', partId, patch: { finishedDone: done } })
    setError(r.ok ? null : r.message)
  }

  const startPicking = () => {
    setPicking(new Set())
    setNotice(null)
    setError(null)
  }
  const togglePick = (partId: string) =>
    setPicking((cur) => {
      if (!cur) return cur
      const next = new Set(cur)
      if (next.has(partId)) next.delete(partId)
      else next.add(partId)
      return next
    })
  const copyPicked = () => {
    if (!picking) return
    // コピーは画面の並び（job.parts の順）で覚える
    const ids = job.parts.filter((p) => picking.has(p.id)).map((p) => p.id)
    const r = dispatch({ type: 'copyParts', partIds: ids })
    if (!r.ok) {
      setError(r.message)
      return
    }
    setPicking(null)
    setError(null)
    setNotice(`${ids.length}件をコピーしました。ほかの仕事を開いて「貼り付け」を押すと、部材として足せます`)
  }
  const clipCount = data.clipboard?.length ?? 0

  return (
    <section>
      <SettingsPanel />
      <h2>
        <Help title="部材">
          部材の名前・W・H・枚数を、仕上がり寸法で入れます（入力は［仕上がり］のタブだけ）。木取り寸法（仕上がり寸法 ＋
          切り代）は［木取り］のタブで見られます。式で入れた寸法は、式の隣に計算した寸法が出ます。式が長いときやエラーのときは、寸法の欄を押すと全文・理由が出ます。「選んでコピー」で部材を選んでコピーすると、ほかの仕事の「貼り付け」でまとめて足せます（同じ名前の部材は足しません。同じ仕事の中で増やすときは、部材の編集の「複製」）。
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
          <div className={`part-row part-colhead ${finishedTab ? 'fin has-lead' : 'cut'}`} aria-hidden="true">
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
                select={picking ? { on: picking.has(p.id), onToggle: () => togglePick(p.id) } : undefined}
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
      {notice && (
        <p className="msg ok" role="status">
          {notice}
        </p>
      )}
      {finishedTab && picking && (
        <div className="pick-bar" role="group" aria-label="選んでコピー">
          <span className="pick-count num">{picking.size}件を選んでいます</span>
          <div className="foot">
            <button type="button" className="btn" onClick={() => setPicking(null)}>
              やめる
            </button>
            <button type="button" className="btn primary" disabled={picking.size === 0} onClick={copyPicked}>
              コピー
            </button>
          </div>
        </div>
      )}
      {finishedTab && !picking && (
        <>
          <button type="button" className="btn wide parts-add" onClick={() => setEditing({ partId: null })}>
            ＋ 部材を追加
          </button>
          <div className="parts-copy">
            <button type="button" className="btn" disabled={job.parts.length === 0} onClick={startPicking}>
              選んでコピー
            </button>
            {clipCount > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setNotice(null)
                  setError(null)
                  setPasteOpen(true)
                }}
              >
                貼り付け（<span className="num">{clipCount}</span>件）
              </button>
            )}
          </div>
        </>
      )}
      {pasteOpen && (
        <PastePreview
          onClose={() => setPasteOpen(false)}
          onPasted={(n) => setNotice(`${n}件を追加しました`)}
          onError={setError}
        />
      )}
      {editing && (
        <PartEditor
          key={editing.partId ?? 'new'}
          partId={editing.partId}
          onClose={() => setEditing(null)}
          onOpenPart={(id) => setEditing({ partId: id })}
        />
      )}
    </section>
  )
}
