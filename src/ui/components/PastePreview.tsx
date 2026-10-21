// 貼り付けの確認（仕様書 5.3）：すぐには足さずに、「5件を追加します（足せないもの 1件）」と行ごとの名前・W・H・枚数、
// 足せない理由・注意を見せる。「追加する」で足せる部材だけを今の部材の後ろに足し、「やめる」で何もしない。
// 足せる／足せないと注意は engine（previewPaste）、足すのは store（pasteParts → engine の applyPaste）に任せる
import { useMemo } from 'react'
import { previewPaste } from '../../engine/clipboard/copy'
import { formulaText } from '../../engine/formula/display'
import { AXES } from '../../engine/types'
import { useJobStore } from '../../store/useJobStore'
import { Sheet } from './Sheet'

interface Props {
  onClose: () => void
  /** 足したとき（足した件数） */
  onPasted: (count: number) => void
  onError: (message: string) => void
}

export function PastePreview({ onClose, onPasted, onError }: Props) {
  const { job, data, dispatch } = useJobStore()
  const copied = data.clipboard
  const preview = useMemo(() => (job && copied ? previewPaste(job, copied, data.adjusts) : null), [job, copied, data.adjusts])
  if (!job || !copied || !preview) return null

  const add = () => {
    const r = dispatch({ type: 'pasteParts' })
    if (r.ok) onPasted(preview.addCount)
    else onError(r.message)
    onClose()
  }

  return (
    <Sheet title="貼り付け" onClose={onClose}>
      <p className="paste-sum" role="status">
        <b className="num">{preview.addCount}件</b>を追加します
        {preview.skipCount > 0 && <span className="paste-skip num">（足せないもの {preview.skipCount}件）</span>}
      </p>
      {preview.hasWarnings && <p className="msg warn">式に無い部材があります（足したあと、式のエラーとして知らせます）</p>}
      <ul className="paste-list">
        {preview.rows.map((row, i) => (
          <li key={i} className={`paste-row${row.ok ? '' : ' skip'}`}>
            <div className="paste-head">
              <span className="paste-name">{row.part.name}</span>
              <span className="paste-qty num">{row.part.quantity === 0 ? '寸法だけ' : `×${row.part.quantity}枚`}</span>
              {row.part.rotatable && <span className="part-rot">回転可</span>}
            </div>
            <div className="paste-dims">
              {AXES.map((axis) => (
                <span key={axis} className="paste-dim">
                  <span className="paste-axis">{axis}</span>
                  <span className="num">{row.part.expr[axis].trim() === '' ? '（空）' : formulaText(row.part.expr[axis], data.adjusts)}</span>
                </span>
              ))}
            </div>
            {!row.ok && <p className="paste-reason">足せません：{row.message}</p>}
            {row.warnings.map((w) => (
              <p key={w} className="paste-warn">
                {w}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <div className="foot">
        <button type="button" className="btn" onClick={onClose}>
          やめる
        </button>
        <button type="button" className="btn primary" disabled={preview.addCount === 0} onClick={add}>
          追加する
        </button>
      </div>
    </Sheet>
  )
}
