// 表の上に重ねる取っ手と点線の印（部材の表・調整寸法の表で同じ。仕様書 17.1・17.4）。
// 取っ手は表に1つずつ置き、引いている間に描き直されても同じ要素のままにする（iPhone で指の動きが途切れないように）
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Box, Corners } from '../useGrid'

interface Props {
  /** 取っ手の位置（出さないときは null） */
  handleAt: Corners | null
  onHandleDown: (which: 'start' | 'end' | 'fill') => (e: ReactPointerEvent<HTMLSpanElement>) => void
  /** オートフィルで新しく入れる所と、その中に出す短い文 */
  fillBox: Box | null
  fillLabel: string | null
  /** 切り取った元 */
  cutBox: Box | null
}

export function GridOverlay({ handleAt, onHandleDown, fillBox, fillLabel, cutBox }: Props) {
  return (
    <>
      {handleAt && (
        <>
          <span
            key="start"
            className="pt-handle start"
            style={{ left: handleAt.left - 22, top: handleAt.top - 22 }}
            aria-hidden="true"
            onPointerDown={onHandleDown('start')}
          >
            <span className="pt-dot" />
          </span>
          <span
            key="end"
            className="pt-handle end"
            style={{ left: handleAt.right - 30, top: handleAt.bottom - 22 }}
            aria-hidden="true"
            onPointerDown={onHandleDown('end')}
          >
            <span className="pt-dot" />
          </span>
          <span
            key="fill"
            className="pt-handle fill"
            style={{ left: handleAt.right - 30, top: handleAt.bottom + 22 }}
            aria-hidden="true"
            onPointerDown={onHandleDown('fill')}
          >
            <span className="pt-fill-dot" />
          </span>
        </>
      )}
      {fillBox && (
        <span className="pt-mark fill" style={fillBox} aria-hidden="true">
          {fillLabel && <span className="pt-mark-label">{fillLabel}</span>}
        </span>
      )}
      {cutBox && <span className="pt-mark cut" style={cutBox} aria-hidden="true" />}
    </>
  )
}
