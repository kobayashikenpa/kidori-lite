// 部材の表の［木取り］のタブ（仕様書 15.1・5.1）：仕上がりのタブと同じ表の形で、番号・名前・厚み・木取り寸法 W・H・枚数（切った数）を見るだけ。
// 厚みは［仕上がり］で入れたものを見るだけ（切り代は足さない。仕様書 26.1）。
// 押しても編集しない（入力は［仕上がり］［調整］のタブ）。枚数 0 は「切らない」、枚数が空の行は薄く出す。
// 木取り寸法（調整後 ＋ 切り代。第2.1版 仕様書 25.1）は engine（computeDimensions の cutByAxis）、切った数は engine（partCutProgress）の結果を並べるだけ
// 第2.1版（仕様書 25.8。kidori-simple 28.1 と同じ）：W・H・枚数のセルを押すと選んだ印（枠）を付け、タブのすぐ下の式の欄に、
// その部材の仕上がりの式（または数字。枚数は枚数）を見るだけで出す（欄を押しても入力しない・✓ は無い）。
// もう一度押すか、ほかの所を押すと選ぶのをやめる
import { useEffect, useRef, useState } from 'react'
import { DUPLICATE_NAME_MESSAGE, duplicateNameIds, hasName } from '../../engine/parts'
import type { PartCutProgress } from '../../engine/progress/partProgress'
import { CELL_COLS, type Adjust, type Axis, type DimensionResult, type Job } from '../../engine/types'
import { CELL_COL_LABEL } from '../cellSelect'
import { fmt } from '../format'
import { barErrors, partBar } from '../fxBar'
import { cutDimCell, cutQuantityText, thicknessText } from '../partsTable'
import { useOutsideEnd } from '../useGrid'
import { FormulaBar } from './FormulaBar'

interface Props {
  job: Job
  dims: DimensionResult
  adjusts: readonly Adjust[]
  progress: readonly PartCutProgress[]
  /** 式の欄の置き場所（PartsScreen のタブのすぐ下。仕様書 25.8） */
  barSlot: HTMLElement | null
}

/** 押して選んだセル（部材の id と 名前・厚み・W・H・枚数。名前は欄を空にし、同じ名前のときは理由だけ出す） */
interface Picked {
  partId: string
  field: Axis | 'T' | 'qty' | 'name'
}

export function CutTable({ job, dims, adjusts, progress, barSlot }: Props) {
  const parts = job.parts
  const [picked, setPicked] = useState<Picked | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const barSlotRef = useRef(barSlot)
  useEffect(() => {
    barSlotRef.current = barSlot
  })
  // 部材が無くなった（仕事を切り替えた・消した）ら、選んでいないことにする
  const pickedRow = picked ? parts.findIndex((p) => p.id === picked.partId) : -1
  const pickedPart = pickedRow >= 0 ? parts[pickedRow] : undefined
  const on = picked !== null && pickedPart !== undefined
  // ほかの所（表と式の欄の外）を押したら選ぶのをやめる
  useOutsideEnd(on, (t) => !!tableRef.current?.contains(t) || !!barSlotRef.current?.contains(t), () => setPicked(null))

  if (parts.length === 0) return <p className="placeholder">部材はまだありません</p>

  const press = (partId: string, field: Picked['field']) =>
    setPicked((cur) => (cur && cur.partId === partId && cur.field === field ? null : { partId, field }))
  const range = on ? { top: pickedRow, left: CELL_COLS.indexOf(picked.field), rows: 1, cols: 1 } : null
  const bar = partBar(parts, range, 'cut')
  const barWho = pickedPart ? (hasName(pickedPart) ? pickedPart.name : `#${pickedRow + 1}`) : ''
  const d0 = pickedPart ? dims.parts.find((x) => x.partId === pickedPart.id) : undefined
  // 同じ名前の部材の名前は赤（仕様書 26.6）
  const dupIds = duplicateNameIds(parts)
  const errs =
    on && (picked.field === 'W' || picked.field === 'H')
      ? barErrors(d0?.errors ?? [], picked.field, 'cut', false)
      : on && picked.field === 'name' && dupIds.has(picked.partId)
        ? [DUPLICATE_NAME_MESSAGE]
        : []

  return (
    <>
      <div className="pt cut" ref={tableRef} role="table" aria-label="部材の表（木取り寸法。見るだけ。W・H・枚数を押すと仕上がりの式を上の欄に出す）">
        <div className="pt-row pt-head" role="row">
          <span role="columnheader">番号</span>
          <span role="columnheader">名前</span>
          <span role="columnheader">厚み</span>
          <span role="columnheader">W</span>
          <span role="columnheader">H</span>
          <span role="columnheader">枚数</span>
        </div>
        {parts.map((part, i) => {
          const d = dims.parts.find((x) => x.partId === part.id)
          const prog = progress.find((x) => x.partId === part.id)
          const named = hasName(part)
          const label = named ? part.name : `#${i + 1}`
          const noCut = part.quantity === 0
          const rowClass = ['pt-row', 'part', part.quantity === null ? 'noqty' : '', noCut ? 'nocut' : ''].filter(Boolean).join(' ')
          const isPicked = (f: Picked['field']) => on && picked.partId === part.id && picked.field === f
          const dimEl = (axis: Axis) => {
            const c = cutDimCell(part, d, axis, adjusts)
            const text = c.kind === 'empty' ? '空' : c.kind === 'error' ? 'エラー' : fmt(c.value)
            return (
              <button
                type="button"
                role="cell"
                className={`pt-cell pt-dim${c.kind === 'error' ? ' bad' : ''}${isPicked(axis) ? ' picked' : ''}`}
                aria-label={`${label} の ${axis}：${text}（押すと仕上がりの式を上の欄に出す）`}
                aria-pressed={isPicked(axis)}
                onClick={() => press(part.id, axis)}
              >
                {c.kind === 'error' ? (
                  'エラー'
                ) : c.kind === 'empty' ? null : (
                  <>
                    <span className="num">{fmt(c.value)}</span>
                    {c.kind === 'formula' && (
                      <span className="pt-f" aria-hidden="true">
                        ƒ
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          }
          const allCut = prog !== undefined && prog.done >= prog.total
          return (
            <div key={part.id} className="pt-item" role="rowgroup">
              <div className={rowClass} role="row">
                <span role="cell" className="pt-cell pt-no">
                  <span className="num">{named ? i + 1 : `#${i + 1}`}</span>
                  {part.rotatable && (
                    <span className="pt-rot" aria-label="回転してよい">
                      ↺
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  role="cell"
                  className={`pt-cell pt-name${dupIds.has(part.id) ? ' dup' : ''}${isPicked('name') ? ' picked' : ''}`}
                  aria-label={`${i + 1}行目の名前：${named ? part.name : '空'}${dupIds.has(part.id) ? `（${DUPLICATE_NAME_MESSAGE}）` : ''}`}
                  aria-pressed={isPicked('name')}
                  onClick={() => press(part.id, 'name')}
                >
                  {named ? part.name : ''}
                </button>
                <button
                  type="button"
                  role="cell"
                  className={`pt-cell pt-thick num${isPicked('T') ? ' picked' : ''}`}
                  aria-label={`${label} の厚み：${part.thickness === null ? '空' : thicknessText(part.thickness)}`}
                  aria-pressed={isPicked('T')}
                  onClick={() => press(part.id, 'T')}
                >
                  {thicknessText(part.thickness)}
                </button>
                {dimEl('W')}
                {dimEl('H')}
                <button
                  type="button"
                  role="cell"
                  className={`pt-cell pt-qty${isPicked('qty') ? ' picked' : ''}`}
                  aria-label={`${label} の枚数：${part.quantity === null ? '空' : cutQuantityText(part.quantity)}`}
                  aria-pressed={isPicked('qty')}
                  onClick={() => press(part.id, 'qty')}
                >
                  <span className={`pt-qty-n${noCut ? ' small' : ''}`}>{cutQuantityText(part.quantity)}</span>
                  {prog && (
                    <span className={`pt-cutn num${allCut ? ' all' : ''}`}>
                      切った {prog.done}/{prog.total}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <FormulaBar
        slot={barSlot}
        content={bar}
        adjusts={adjusts}
        label={on ? `${barWho} の ${picked.field === 'W' || picked.field === 'H' ? `仕上がりの${CELL_COL_LABEL[picked.field]}` : CELL_COL_LABEL[picked.field]}` : ''}
        errors={errs}
      />
    </>
  )
}
