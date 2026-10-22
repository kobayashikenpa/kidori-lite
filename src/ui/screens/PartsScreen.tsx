// 部材の画面（仕様書 5.1・5.2・9・15.1）：上にたたんだ設定、その下に［仕上がり］［木取り］のタブと部材の表。
// ［仕上がり］は入力できる表（番号を押すとメニュー）、［木取り］は同じ形の表を見るだけ。
// 寸法の計算は engine（computeDimensions）、切り出しの進み具合は engine（partCutProgress）に任せる
import { useMemo, useRef, useState } from 'react'
import type { CellPos } from '../../engine/types'
import { computeDimensions } from '../../engine/dimensions'
import { partCutProgress } from '../../engine/progress/partProgress'
import { currentJob } from '../../store/reducer'
import { browserStorage } from '../../store/storage'
import { useJobStore } from '../../store/useJobStore'
import { toggleCell } from '../cellSelect'
import { AdjustPanel } from '../components/AdjustPanel'
import { CellBar } from '../components/CellBar'
import { CutTable } from '../components/CutTable'
import { Help } from '../components/Help'
import { PartMenu } from '../components/PartMenu'
import { PartsTable, type PartsTableHandle } from '../components/PartsTable'
import { SettingsPanel } from '../components/SettingsPanel'
import { fmt } from '../format'
import { rotationState } from '../partsTable'
import { loadPartsTab, PARTS_TABS, savePartsTab, type PartsTab } from '../partsTab'

const ROTATION_TEXT = { all: 'オン', some: '一部', none: 'オフ' } as const

export function PartsScreen() {
  const { job, data, dispatch } = useJobStore()
  const [tab, setTabState] = useState<PartsTab>(() => loadPartsTab(browserStorage()))
  // 番号のメニューを開いている部材
  const [menuPartId, setMenuPartId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 操作の知らせ（「3件をコピーしました」など）
  const [notice, setNotice] = useState<string | null>(null)
  // セルを選ぶ状態（仕様書 16.1）で選んでいるセル。null は選ぶ状態でない
  const [selecting, setSelecting] = useState<CellPos[] | null>(null)
  const tableRef = useRef<PartsTableHandle>(null)
  const adjusts = data.adjusts
  const dims = useMemo(() => (job ? computeDimensions(job, adjusts) : null), [job, adjusts])
  const progress = useMemo(() => (job ? partCutProgress(job) : []), [job])
  if (!job || !dims) return null

  const setTab = (t: PartsTab) => {
    setTabState(t)
    // ［木取り］のタブに切り替えたら、選ぶ状態を終わる
    setSelecting(null)
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

  const toggleSelecting = () => {
    setNotice(null)
    setError(null)
    setMenuPartId(null)
    setSelecting((cur) => (cur ? null : []))
  }

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

  return (
    <section>
      <AdjustPanel />
      <SettingsPanel />
      <h2>
        <Help title="部材">
          部材の名前・W・H・枚数を、［仕上がり］のタブの表に仕上がり寸法で入れます。木取り寸法（仕上がり寸法 ＋
          切り代）は［木取り］のタブで見られます。番号を押すと、回転・仕上がりの完了・複製・上に行を入れる・削除ができます。「選ぶ」を押すとセルを選べて、コピー・貼り付け・消す・行を削除ができます。
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
            <button
              type="button"
              className={`btn small select-btn${selecting ? ' on' : ''}`}
              aria-pressed={selecting !== null}
              onClick={toggleSelecting}
            >
              選ぶ
            </button>
            <Help className="rot-all-label" title="全部回転してよい">
              オンにすると全部の部材が「回転してよい」（W・H を入れ替えて置いてもよい）に、オフにすると全部「回転しない」（W を板の妻手、H を板の長手に合わせて置く）になります。部材ごとに違うときは「一部」と出ます。部材ごとの回転は、番号を押して変えます。
            </Help>
            <button
              type="button"
              role="switch"
              aria-checked={rotation === 'all' ? 'true' : rotation === 'some' ? 'mixed' : 'false'}
              aria-label={`全部回転してよい：${ROTATION_TEXT[rotation]}`}
              className={`rot-switch ${rotation}`}
              disabled={job.parts.length === 0 || selecting !== null}
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
            selecting={selecting}
            onToggleCell={(pos) => setSelecting((cur) => (cur ? toggleCell(cur, pos) : cur))}
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
      {finishedTab && selecting && (
        <CellBar
          job={job}
          cells={selecting}
          clip={data.cellClip}
          dispatch={dispatch}
          onCells={setSelecting}
          onDone={() => setSelecting(null)}
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
