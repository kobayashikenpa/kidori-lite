// 部材の表の番号を押して出るメニュー（仕様書 15.1）：回転してよい／回転しない・仕上がりの完了・複製・上に行を入れる・削除。
// 回転と仕上がりの完了は押すとすぐ保存し、メニューは開いたまま（今の状態が見えるように）。複製・上に行を入れる・削除はメニューを閉じる。
// 削除は、ほかの部材の式がこの部材の寸法を使っているときだけ確認する（engine の partsReferencing）。そうでなければすぐ消す
import { useState } from 'react'
import { partsReferencing } from '../../engine/dimensions/resolve'
import { partLabel, partLabelAt } from '../../engine/parts'
import type { Job } from '../../engine/types'
import { currentJob, type ReduceResult, type StoreAction } from '../../store/reducer'
import { Segmented } from './Segmented'
import { Sheet } from './Sheet'

interface Props {
  job: Job
  partId: string
  dispatch: (action: StoreAction) => ReduceResult
  onClose: () => void
  /** 「上に行を入れる」：index の位置に空の行を入れてほしい（入れたあと名前の欄を選ぶのは呼ぶ側） */
  onInsertAbove: (index: number) => void
  onNotice: (message: string) => void
  onError: (message: string | null) => void
}

type Rotate = 'fixed' | 'free'
type Done = 'open' | 'done'

export function PartMenu({ job, partId, dispatch, onClose, onInsertAbove, onNotice, onError }: Props) {
  const [confirm, setConfirm] = useState(false)
  const index = job.parts.findIndex((p) => p.id === partId)
  const part = job.parts[index]
  if (!part) return null
  const label = partLabelAt(part, index)
  const title = part.name.trim() === '' ? label : `${index + 1}  ${label}`

  const update = (patch: { rotatable?: boolean; finishedDone?: boolean }) => {
    const r = dispatch({ type: 'updatePart', partId, patch })
    onError(r.ok ? null : r.message)
  }

  const duplicate = () => {
    const r = dispatch({ type: 'duplicatePart', partId })
    if (!r.ok) {
      onError(r.message)
      return
    }
    onError(null)
    const next = currentJob(r.state)
    const copyName = next && r.id ? partLabel(next, r.id) : ''
    onNotice(`${label} を複製して、すぐ下に「${copyName}」を足しました`)
    onClose()
  }

  const remove = () => {
    const r = dispatch({ type: 'removePart', partId })
    if (!r.ok) {
      onError(r.message)
      return
    }
    onError(null)
    onNotice(`${label} を削除しました`)
    onClose()
  }

  const referencing = partsReferencing(job.parts, partId)
  const pressRemove = () => {
    if (referencing.length > 0) setConfirm(true)
    else remove()
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="field">
        <span className="label">回転</span>
        <Segmented<Rotate>
          ariaLabel="回転"
          value={part.rotatable ? 'free' : 'fixed'}
          options={[
            { value: 'fixed', label: '回転しない' },
            { value: 'free', label: '回転してよい ↺' },
          ]}
          onChange={(v) => update({ rotatable: v === 'free' })}
        />
      </div>
      <div className="field">
        <span className="label">仕上がりの完了</span>
        <Segmented<Done>
          ariaLabel="仕上がりの完了"
          value={part.finishedDone ? 'done' : 'open'}
          options={[
            { value: 'open', label: 'まだ' },
            { value: 'done', label: '仕上がった' },
          ]}
          onChange={(v) => update({ finishedDone: v === 'done' })}
        />
      </div>
      {confirm ? (
        <div className="confirm-box stack" role="alertdialog" aria-label="部材の削除の確認">
          <p className="confirm-text">
            <b>{referencing.map((r) => `${r.name}（${r.axes.join('・')}）`).join('・')}</b> の式がこの部材の寸法を使っています。削除すると、その式はエラーになります。
          </p>
          <p className="confirm-text">「{label}」を削除しますか？</p>
          <div className="foot">
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              やめる
            </button>
            <button type="button" className="btn danger solid" onClick={remove}>
              削除する
            </button>
          </div>
        </div>
      ) : (
        <div className="menu-actions">
          <button type="button" className="btn" onClick={duplicate}>
            複製（すぐ下に足す）
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onError(null)
              onInsertAbove(index)
            }}
          >
            上に行を入れる
          </button>
          <button type="button" className="btn danger" onClick={pressRemove}>
            削除
          </button>
        </div>
      )}
    </Sheet>
  )
}
