// 部材の画面（仕様書 5.1・5.2・9・15.1）：上にたたんだ設定、その下に［仕上がり］［木取り］のタブと部材の表。
// ［仕上がり］は入力できる表（番号を押すとメニュー）、［木取り］は同じ形の表を見るだけ。
// 寸法の計算は engine（computeDimensions）、切り出しの進み具合は engine（partCutProgress）に任せる
import { useMemo, useRef, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { partCutProgress } from '../../engine/progress/partProgress'
import { currentJob } from '../../store/reducer'
import { browserStorage } from '../../store/storage'
import { useJobStore } from '../../store/useJobStore'
import { CutTable } from '../components/CutTable'
import { Help } from '../components/Help'
import { PartMenu } from '../components/PartMenu'
import { PartsTable, type PartsTableHandle } from '../components/PartsTable'
import { PastePreview } from '../components/PastePreview'
import { SettingsPanel } from '../components/SettingsPanel'
import { fmt } from '../format'
import { referencingOthers, rotationState } from '../partsTable'
import { loadPartsTab, PARTS_TABS, savePartsTab, type PartsTab } from '../partsTab'

/** 番号の列のチェックで選んでいるとき：何のために選んでいるか（コピー／削除）と、選んだ部材 */
interface Picking {
  mode: 'copy' | 'delete'
  ids: ReadonlySet<string>
}

const ROTATION_TEXT = { all: 'オン', some: '一部', none: 'オフ' } as const

export function PartsScreen() {
  const { job, data, dispatch } = useJobStore()
  const [tab, setTabState] = useState<PartsTab>(() => loadPartsTab(browserStorage()))
  // 番号のメニューを開いている部材
  const [menuPartId, setMenuPartId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 操作の知らせ（「3件をコピーしました」など）
  const [notice, setNotice] = useState<string | null>(null)
  const [picking, setPicking] = useState<Picking | null>(null)
  // 「選んで削除」の確認を出しているか
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const tableRef = useRef<PartsTableHandle>(null)
  const adjusts = data.adjusts
  const dims = useMemo(() => (job ? computeDimensions(job, adjusts) : null), [job, adjusts])
  const progress = useMemo(() => (job ? partCutProgress(job) : []), [job])
  if (!job || !dims) return null

  const setTab = (t: PartsTab) => {
    setTabState(t)
    setPicking(null)
    setConfirmDelete(false)
    setNotice(null)
    setError(null)
    savePartsTab(browserStorage(), t)
  }
  const finishedTab = tab === 'finished'
  const rotation = rotationState(job.parts)

  const toggleAllRotation = () => {
    const r = dispatch({ type: 'setAllRotatable', rotatable: rotation !== 'all' })
    setError(r.ok ? null : r.message)
  }

  const startPicking = (mode: Picking['mode']) => {
    setPicking({ mode, ids: new Set() })
    setConfirmDelete(false)
    setNotice(null)
    setError(null)
  }
  const stopPicking = () => {
    setPicking(null)
    setConfirmDelete(false)
  }
  const togglePick = (partId: string) => {
    setConfirmDelete(false)
    setPicking((cur) => {
      if (!cur) return cur
      const next = new Set(cur.ids)
      if (next.has(partId)) next.delete(partId)
      else next.add(partId)
      return { ...cur, ids: next }
    })
  }
  // 選んだ部材（画面の並び＝job.parts の順）
  const pickedIds = picking ? job.parts.filter((p) => picking.ids.has(p.id)).map((p) => p.id) : []

  const copyPicked = () => {
    const r = dispatch({ type: 'copyParts', partIds: pickedIds })
    if (!r.ok) {
      setError(r.message)
      return
    }
    stopPicking()
    setError(null)
    setNotice(`${pickedIds.length}件をコピーしました。ほかの仕事を開いて「貼り付け」を押すと、部材として足せます`)
  }
  const deletePicked = () => {
    const r = dispatch({ type: 'removeParts', partIds: pickedIds })
    if (!r.ok) {
      setError(r.message)
      return
    }
    stopPicking()
    setError(null)
    setNotice(`${pickedIds.length}件を削除しました`)
  }
  const deleteRefs = confirmDelete ? referencingOthers(job.parts, pickedIds) : []

  const insertAbove = (index: number) => {
    const r = dispatch({ type: 'insertPart', index, part: { name: '', expr: { W: '', H: '' }, quantity: null } })
    setMenuPartId(null)
    if (!r.ok) {
      setError(r.message)
      return
    }
    const next = currentJob(r.state)
    if (next && r.id) tableRef.current?.editName(next, r.id)
  }

  const clipCount = data.clipboard?.length ?? 0

  return (
    <section>
      <SettingsPanel />
      <h2>
        <Help title="部材">
          部材の名前・W・H・枚数を、［仕上がり］のタブの表に仕上がり寸法で入れます。木取り寸法（仕上がり寸法 ＋
          切り代）は［木取り］のタブで見られます。番号を押すと、回転・仕上がりの完了・複製・上に行を入れる・削除ができます。「選んでコピー」で部材を選んでコピーすると、ほかの仕事の「貼り付け」でまとめて足せます（同じ名前の部材は足しません。同じ仕事の中で増やすときは、番号を押して「複製」）。「選んで削除」で、選んだ部材をまとめて消せます。
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
            家具として完成したときの寸法です。名前の欄を押すとスマホのキーボード、W・H・枚数の欄を押すと下にアプリのキーが出ます（W・H は数字のほか、部材の寸法・調整寸法を使った式も入れられます）。「次へ」で 名前 → W → H → 枚数 → 次の行 と進みます。式で入れた欄は計算した寸法に「ƒ」が付き、エラーは赤で「エラー」と出ます（押すとキーの上に理由）。枚数が空の行は薄く出て、木取りに入りません（0 は寸法だけの行）。番号を押すと、回転・仕上がりの完了・複製・上に行を入れる・削除ができます（↺ は回転してよい部材、グレーの行は仕上がった部材）。何も入っていない行は保存しません。
          </Help>
        ) : (
          <Help title={`木取り寸法（仕上がり ＋ 切り代 ${fmt(job.settings.allowance)}）`}>
            パネルソーで切る寸法です。見るだけで、ここでは編集できません（入力は［仕上がり］のタブ）。「切った 2/5」は木取りの画面でチェックした数です。枚数 0 の行は「切らない」、枚数が空の行は薄く出て、木取りに入りません。
          </Help>
        )}
      </div>

      {finishedTab ? (
        <>
          <div className="rot-all">
            <Help className="rot-all-label" title="全部回転してよい">
              オンにすると全部の部材が「回転してよい」（W・H を入れ替えて置いてもよい）に、オフにすると全部「回転しない」（W を板の妻手、H を板の長手に合わせて置く）になります。部材ごとに違うときは「一部」と出ます。部材ごとの回転は、番号を押して変えます。
            </Help>
            <button
              type="button"
              role="switch"
              aria-checked={rotation === 'all' ? 'true' : rotation === 'some' ? 'mixed' : 'false'}
              aria-label={`全部回転してよい：${ROTATION_TEXT[rotation]}`}
              className={`rot-switch ${rotation}`}
              disabled={job.parts.length === 0 || picking !== null}
              onClick={toggleAllRotation}
            >
              <span className="rot-knob" aria-hidden="true" />
              <span className="rot-text">{ROTATION_TEXT[rotation]}</span>
            </button>
          </div>
          <PartsTable
            ref={tableRef}
            job={job}
            dims={dims}
            adjusts={adjusts}
            dispatch={dispatch}
            picking={picking?.ids ?? null}
            pickVerb={picking?.mode === 'delete' ? '削除' : 'コピー'}
            onTogglePick={togglePick}
            onOpenMenu={(id) => {
              setNotice(null)
              setMenuPartId(id)
            }}
            onError={setError}
          />
        </>
      ) : (
        <CutTable job={job} dims={dims} adjusts={adjusts} progress={progress} />
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
        <div className={`pick-bar${picking.mode === 'delete' ? ' del' : ''}`} role="group" aria-label={picking.mode === 'delete' ? '選んで削除' : '選んでコピー'}>
          {confirmDelete ? (
            <>
              {deleteRefs.length > 0 && (
                <p className="confirm-text">
                  <b>{deleteRefs.map((r) => `${r.name}（${r.axes.join('・')}）`).join('・')}</b>{' '}
                  の式が、消す部材の寸法を使っています。削除すると、その式はエラーになります。
                </p>
              )}
              <p className="confirm-text">
                <b className="num">{pickedIds.length}件</b>の部材を削除しますか？
              </p>
              <div className="foot">
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  やめる
                </button>
                <button type="button" className="btn danger solid" onClick={deletePicked}>
                  削除する
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="pick-count num">
                {picking.mode === 'delete' ? '削除する部材を選んでください' : 'コピーする部材を選んでください'}（{pickedIds.length}件）
              </span>
              <div className="foot">
                <button type="button" className="btn" onClick={stopPicking}>
                  やめる
                </button>
                {picking.mode === 'delete' ? (
                  <button type="button" className="btn danger solid" disabled={pickedIds.length === 0} onClick={() => setConfirmDelete(true)}>
                    削除
                  </button>
                ) : (
                  <button type="button" className="btn primary" disabled={pickedIds.length === 0} onClick={copyPicked}>
                    コピー
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {finishedTab && !picking && (
        <div className="parts-copy">
          <button type="button" className="btn" disabled={job.parts.length === 0} onClick={() => startPicking('copy')}>
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
          <button type="button" className="btn danger" disabled={job.parts.length === 0} onClick={() => startPicking('delete')}>
            選んで削除
          </button>
        </div>
      )}
      {pasteOpen && (
        <PastePreview
          onClose={() => setPasteOpen(false)}
          onPasted={(n) => setNotice(`${n}件を追加しました`)}
          onError={setError}
        />
      )}
      {menuPartId && (
        <PartMenu
          key={menuPartId}
          job={job}
          partId={menuPartId}
          dispatch={dispatch}
          onClose={() => setMenuPartId(null)}
          onInsertAbove={insertAbove}
          onNotice={setNotice}
          onError={setError}
        />
      )}
    </section>
  )
}
