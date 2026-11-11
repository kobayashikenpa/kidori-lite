// 部材の表の［調整］のタブ（第2.1版。仕様書 25.2）：［仕上がり］と同じ表の形（番号・名前・W・H・枚数）。
// W・H の欄は「調整の値 ｜ 調整後の寸法」（例：−メラミン1 ｜ 379）。調整が空の欄は仕上がり寸法を薄く、エラーは赤で「エラー」。
// 部材のある行だけ（空の行・「＋ 5行足す」は出さない。仕様書 25.9）。
// 計算は engine（computeDimensions の adjustedByAxis）、欄に出すものは partsTable.ts の adjustDimCell
import { hasName } from '../../engine/parts'
import type { Adjust, Axis, DimensionResult, Job } from '../../engine/types'
import { fmt } from '../format'
import { adjustCellLabel, adjustDimCell, type AdjustDimCell } from '../partsTable'

interface Props {
  job: Job
  dims: DimensionResult
  adjusts: readonly Adjust[]
}

export function PartAdjustTable({ job, dims, adjusts }: Props) {
  const parts = job.parts
  if (parts.length === 0) return <p className="placeholder">部材はまだありません（［仕上がり］のタブで入れます）</p>
  return (
    <div className="pt adjtab" role="table" aria-label="部材の表（調整）">
      <div className="pt-row pt-head" role="row">
        <span role="columnheader">番号</span>
        <span role="columnheader">名前</span>
        <span role="columnheader">W</span>
        <span role="columnheader">H</span>
        <span role="columnheader">枚数</span>
      </div>
      {parts.map((part, i) => {
        const d = dims.parts.find((x) => x.partId === part.id)
        const named = hasName(part)
        const label = named ? part.name : `#${i + 1}`
        const rowClass = ['pt-row', 'part', part.quantity === null ? 'noqty' : ''].filter(Boolean).join(' ')
        const dimEl = (axis: Axis) => {
          const c = adjustDimCell(part, d, axis, adjusts)
          return (
            <span role="cell" className={`pt-cell pt-dim pa${c.kind === 'error' ? ' bad' : ''}`} aria-label={`${label} の ${axis}：${adjustCellLabel(c)}`}>
              <AdjustCellBody cell={c} />
            </span>
          )
        }
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
              <span role="cell" className="pt-cell pt-name">
                {named ? part.name : ''}
              </span>
              {dimEl('W')}
              {dimEl('H')}
              <span role="cell" className="pt-cell pt-qty num">
                {part.quantity ?? ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 欄の中身：調整の値を上に小さく、調整後の寸法を下に（375px の幅に収めるため2段）。調整が空なら仕上がり寸法を薄く */
export function AdjustCellBody({ cell: c }: { cell: AdjustDimCell }) {
  switch (c.kind) {
    case 'empty':
      return null
    case 'finished':
      return <span className="num pa-fin">{fmt(c.value)}</span>
    case 'adjusted':
      return (
        <>
          <span className="pa-label num">{c.label}</span>
          <span className="num pa-val">{fmt(c.value)}</span>
        </>
      )
    case 'error':
      return (
        <>
          {c.label && <span className="pa-label num">{c.label}</span>}
          <span className="pa-err">エラー</span>
        </>
      )
  }
}
