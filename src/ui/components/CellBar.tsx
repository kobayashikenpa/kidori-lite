// セルを選ぶ状態の下のバー（第1.2版。仕様書 16.1）：コピー・貼り付け・消す・行を削除・やめる と、選んだ数・今コピーしているもの・知らせ。
// 計算は store の reducer（engine/clipboard/cells.ts）に任せる。押せる／押せないの判定も engine の selectionShape・selectedPartIds を使う
import { useState } from 'react'
import { selectedPartIds, selectionShape } from '../../engine/clipboard/cells'
import type { CellClip, CellPos, Job } from '../../engine/types'
import type { ReduceResult, StoreAction } from '../../store/reducer'
import { clipText, hasPartCell, pasteText, selectedText } from '../cellSelect'
import { referencingOthers } from '../partsTable'
import { Help } from './Help'

interface Props {
  job: Job
  cells: readonly CellPos[]
  clip: CellClip | null
  dispatch: (action: StoreAction) => ReduceResult
  /** 選んだセルを変える（コピー・貼り付け・消す・行を削除のあとは空にする） */
  onCells: (cells: CellPos[]) => void
  /** やめる（選ぶ状態を終わる） */
  onDone: () => void
}

type Msg = { kind: 'ok' | 'err'; text: string } | null

export function CellBar({ job, cells, clip, dispatch, onCells, onDone }: Props) {
  const [msg, setMsg] = useState<Msg>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const count = cells.length
  const canCopy = selectionShape(cells).kind === 'range'
  const canPaste = clip !== null && count > 0
  const canClear = hasPartCell(cells, job.parts.length)
  const deleteIds = selectedPartIds(job, cells)
  const canDelete = deleteIds.length > 0

  const run = (action: StoreAction, ok: (r: Extract<ReduceResult, { ok: true }>) => string) => {
    const r = dispatch(action)
    if (!r.ok) {
      setMsg({ kind: 'err', text: r.message })
      return
    }
    setMsg({ kind: 'ok', text: ok(r) })
    // 表の行の位置が変わることがあるので、選んだセルは空にする（選ぶ状態は続ける）
    onCells([])
  }

  const copy = () => {
    if (!canCopy) {
      // 押せないときも理由を出す（engine の文：コピーは1つのセルか、四角い範囲を選んでください）
      const r = dispatch({ type: 'copyCells', cells: [...cells] })
      if (!r.ok) setMsg({ kind: 'err', text: r.message })
      return
    }
    run({ type: 'copyCells', cells: [...cells] }, () => 'コピーしました。貼るセルを選んで「貼り付け」を押します')
  }
  const paste = () => run({ type: 'pasteCells', cells: [...cells] }, (r) => (r.paste ? pasteText(r.paste.pasted, r.paste.skipped) : '貼りました'))
  const clear = () => run({ type: 'clearCells', cells: [...cells] }, () => '消しました')
  const deleteRows = () => {
    const n = deleteIds.length
    setConfirmDelete(false)
    run({ type: 'deleteRows', cells: [...cells] }, () => `${n}件の部材を削除しました`)
  }

  const refs = confirmDelete ? referencingOthers(job.parts, deleteIds) : []
  const clipNow = clipText(clip)

  if (confirmDelete) {
    return (
      <div className="pick-bar cell-bar del" role="group" aria-label="行を削除の確認">
        {refs.length > 0 && (
          <p className="confirm-text">
            <b>{refs.map((r) => `${r.name}（${r.axes.join('・')}）`).join('・')}</b>{' '}
            の式が、消す部材の寸法を使っています。削除すると、その式はエラーになります。
          </p>
        )}
        <p className="confirm-text">
          <b className="num">{deleteIds.length}件</b>の部材を削除しますか？
        </p>
        <div className="foot">
          <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
            やめる
          </button>
          <button type="button" className="btn danger solid" onClick={deleteRows}>
            削除する
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pick-bar cell-bar" role="group" aria-label="選んだセルの操作">
      <div className="cell-bar-head">
        <div className="cell-bar-state">
          <Help className="cell-bar-help" title={<span className="num">{selectedText(count)}</span>}>
            セルを押すたびに選ぶ／外すが切り替わります（離れたセルも、空の行のセルも選べます）。「コピー」は1つのセルか四角い範囲（続いた行 ×
            続いた列）を選んで押します。式は式のままコピーします。「貼り付け」は、1つのセルをコピーしたときは選んだセル全部に、範囲をコピーしたときは選んだセルの一番左上から同じ形で貼ります（行が足りなければ足します）。コピーしたものは、ほかの仕事でも貼れます。同じ名前になるセルと、枚数に整数でないものは貼りません。「消す」は選んだセルの中身を消します。「行を削除」は選んだセルのある行の部材を消します。
          </Help>
          <span className="cell-bar-clip">{clipNow ?? 'コピーしたものはありません'}</span>
        </div>
        <button type="button" className="btn" onClick={onDone}>
          やめる
        </button>
      </div>
      <div className="cell-bar-keys">
        <button type="button" className="btn primary" aria-disabled={!canCopy} disabled={count === 0} onClick={copy}>
          コピー
        </button>
        <button type="button" className="btn primary" disabled={!canPaste} onClick={paste}>
          貼り付け
        </button>
        <button type="button" className="btn" disabled={!canClear} onClick={clear}>
          消す
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={!canDelete}
          onClick={() => {
            setMsg(null)
            setConfirmDelete(true)
          }}
        >
          行を削除
        </button>
      </div>
      {msg && (
        <p className={`msg ${msg.kind} cell-bar-msg`} role={msg.kind === 'err' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
