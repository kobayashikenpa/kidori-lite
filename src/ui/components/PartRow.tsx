// 部材の一覧の1行（仕様書 5.1・5.2）：名前・枚数・回転の印・W・H（式 ｜ 計算した寸法）。
// ［仕上がり］のタブでは左に仕上がりの完了のチェックを置き、行を押すと編集。［木取り］のタブは見るだけで、切り出しの進み具合を出す。
// W・H の欄は、式が長くて省略しているとき・エラーのときは、押すと行の下に全文・理由を出す
import { useRef, useState } from 'react'
import { AXES, type Adjust, type Axis, type Part, type PartDimensions } from '../../engine/types'
import type { PartCutProgress } from '../../engine/progress/partProgress'
import { fmt } from '../format'
import { dimCell, type DimCell } from '../partCells'
import type { PartsTab } from '../partsTab'

interface Props {
  part: Part
  dims: PartDimensions | undefined
  tab: PartsTab
  adjusts: readonly Adjust[]
  /** 切り出しの進み具合（木取りのタブで出す。枚数0 の部材は無い） */
  progress?: PartCutProgress
  onEdit: () => void
  onToggleDone: () => void
}

function cellLabel(axis: Axis, c: DimCell): string {
  if (c.kind === 'number') return `${axis} ${fmt(c.value)}`
  if (c.kind === 'formula') return `${axis} ${c.formula} ｜ ${fmt(c.value)}`
  return `${axis} エラー`
}

export function PartRow({ part, dims, tab, adjusts, progress, onEdit, onToggleDone }: Props) {
  const finishedTab = tab === 'finished'
  const cells = { W: dimCell(part, dims, 'W', tab, adjusts), H: dimCell(part, dims, 'H', tab, adjusts) }
  // 行の下に全文・理由を出している欄
  const [detail, setDetail] = useState<Axis | null>(null)
  const formulaRefs = useRef<Partial<Record<Axis, HTMLSpanElement | null>>>({})
  const noCut = part.quantity === 0
  const done = finishedTab && part.finishedDone

  const pressCell = (axis: Axis) => {
    const c = cells[axis]
    const el = formulaRefs.current[axis]
    const cut = el ? el.scrollWidth > el.clientWidth + 1 : false
    if (detail === axis) setDetail(null)
    else if (c.kind === 'error' || (c.kind === 'formula' && cut)) setDetail(axis)
    else if (detail !== null) setDetail(null)
    else if (finishedTab) onEdit()
  }

  const sub = [
    noCut ? (finishedTab ? '寸法だけ' : '切らない') : `×${part.quantity}枚`,
    !finishedTab && progress ? `切った ${progress.done}/${progress.total}` : null,
  ].filter((s) => s !== null)

  const main = (
    <>
      <span className="part-name">{part.name}</span>
      <span className="part-sub">
        {sub.map((s) => (
          <span key={s} className={s.startsWith('切った') && progress && progress.done >= progress.total ? 'part-cut-done' : undefined}>
            {s}
          </span>
        ))}
        {part.rotatable && <span className="part-rot">回転可</span>}
      </span>
    </>
  )

  return (
    <li className={`part-item${done ? ' done' : ''}`}>
      <div className={`part-row ${finishedTab ? 'fin' : 'cut'}`}>
        {finishedTab && (
          <button
            type="button"
            className={`part-check${part.finishedDone ? ' on' : ''}`}
            aria-pressed={part.finishedDone}
            aria-label={`${part.name} の仕上がりの完了`}
            onClick={onToggleDone}
          >
            <span className="check-box" aria-hidden="true">
              {part.finishedDone ? '✓' : ''}
            </span>
          </button>
        )}
        {finishedTab ? (
          <button type="button" className="part-main" aria-label={`${part.name} を編集`} onClick={onEdit}>
            {main}
          </button>
        ) : (
          <div className="part-main">{main}</div>
        )}
        {AXES.map((axis) => {
          const c = cells[axis]
          return (
            <button
              key={axis}
              type="button"
              className={`part-dim${c.kind === 'error' ? ' bad' : ''}`}
              aria-label={cellLabel(axis, c)}
              aria-expanded={c.kind === 'number' ? undefined : detail === axis}
              onClick={() => pressCell(axis)}
            >
              {c.kind !== 'number' && (
                <span
                  className="part-formula"
                  ref={(el) => {
                    formulaRefs.current[axis] = el
                  }}
                >
                  {c.formula ?? '（空）'}
                </span>
              )}
              <span className={`part-val num${noCut && !finishedTab ? ' muted' : ''}`}>
                {c.kind === 'error' ? 'エラー' : fmt(c.value)}
              </span>
            </button>
          )
        })}
      </div>
      {detail !== null && (
        <div className={`part-detail${cells[detail].kind === 'error' ? ' bad' : ''}`} role="status">
          <span className="part-detail-axis">{detail}</span>
          {(() => {
            const c = cells[detail]
            if (c.kind === 'error')
              return (
                <span className="part-detail-text">
                  {c.formula && <span className="num">{c.formula}</span>}
                  {c.messages.map((m) => (
                    <span key={m} className="part-detail-err">
                      {m}
                    </span>
                  ))}
                </span>
              )
            return (
              <span className="part-detail-text num">
                {c.kind === 'formula' ? `${c.formula} ｜ ` : ''}
                <b>{fmt(c.value)}</b>
              </span>
            )
          })()}
          <button type="button" className="btn small" onClick={() => setDetail(null)}>
            閉じる
          </button>
        </div>
      )}
    </li>
  )
}
