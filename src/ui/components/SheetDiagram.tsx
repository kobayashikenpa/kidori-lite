// 配置図（SVG。仕様書 8）：板を engine の置き方（layout.orientation）で置き、端切り・部材（名前と木取り寸法）・端材（寸法）を色分けして描く。
// 縦長（portrait、縦切り優先）は長手が縦、横長（landscape、横切り優先）は長手が横。
// 位置と大きさはすべて engine の結果（SheetLayout）をそのまま使い、viewBox を板の寸法（mm）にして画面幅に合わせる。
// engine は左下が原点（y は上が +）なので、描くときに上下を反転する。
// kidori の ui/components/SheetDiagram.tsx をもとに、木目・残りの材料を外し、端材を足したもの
import { useId } from 'react'
import type { Rect, SheetLayout } from '../../engine/types'
import { fmt } from '../format'
import { scrapLabel } from '../kidoriView'

interface Props {
  layout: SheetLayout
  /** 通し番号（固定した1枚と計算した1枚を合わせて振り直したもの。layout.index は使わない） */
  no: number
  /** 部材ごとの色の番号（0〜5） */
  colorOf: (partId: string) => number
  /** チェックした片の pieceId（グレーにして「済」の印を付ける） */
  checked?: readonly string[]
  /** 部材の今の表示名（無い部材・渡さないときは片に写した名前を使う） */
  labelOf?: (partId: string) => string | undefined
}

/** 部材の色の数（index.css の --pc0〜--pc5） */
const PIECE_COLORS = 6

interface Label {
  lines: string[]
  size: number
  rotate: boolean
}

/** 文字の幅の見積もり（1文字の幅 ÷ 文字の大きさ）。和文は全角、英数字・記号は細め（多めに見積もる） */
function textEm(text: string): number {
  let em = 0
  for (const ch of text) em += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.62
  return em
}

const LINE_HEIGHT = 1.25

/** 長方形の中に文字が収まる大きさを探す。横書き → 縦向き（90°回す）の大きいほう、候補を順に試し、
 *  最小の大きさでも入らなければ出さない（null） */
function fitLabel(w: number, h: number, candidates: string[][], max: number, min: number): Label | null {
  for (const lines of candidates) {
    const em = Math.max(...lines.map(textEm))
    const tall = lines.length * LINE_HEIGHT
    const sizeFor = (bw: number, bh: number) => Math.min(max, (bw * 0.88) / em, (bh * 0.88) / tall)
    const flat = sizeFor(w, h)
    const turned = sizeFor(h, w)
    const rotate = flat < max && turned > flat
    const size = rotate ? turned : flat
    if (size >= min) return { lines, size, rotate }
  }
  return null
}

function flipY(r: Rect, height: number): Rect {
  return { x: r.x, y: height - r.y - r.h, w: r.w, h: r.h }
}

function LabelText({ r, label, className }: { r: Rect; label: Label; className: string }) {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const lh = label.size * LINE_HEIGHT
  const top = -((label.lines.length - 1) * lh) / 2
  return (
    <text
      className={className}
      fontSize={label.size}
      textAnchor="middle"
      dominantBaseline="central"
      transform={`translate(${cx} ${cy})${label.rotate ? ' rotate(-90)' : ''}`}
    >
      {label.lines.map((t, i) => (
        <tspan key={i} x={0} y={top + i * lh} className={i === 0 ? 'l1' : 'l2'}>
          {t}
        </tspan>
      ))}
    </text>
  )
}

export function SheetDiagram({ layout, no, colorOf, checked = [], labelOf }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const landscape = layout.orientation === 'landscape'
  // 図の横（W）と縦（L）。横長なら長手が横
  const W = landscape ? layout.boardLength : layout.boardWidth
  const L = landscape ? layout.boardWidth : layout.boardLength
  // 文字の大きさ（mm）。図はいつもカードの幅いっぱいに描くので、図の横幅に対する割合で決める（幅 375px でおよそ 8〜14px）
  const maxFont = W * 0.042
  const minFont = W * 0.026
  const done = new Set(checked)

  return (
    <svg
      className={landscape ? 'diagram landscape' : 'diagram'}
      viewBox={`0 0 ${W} ${L}`}
      role="img"
      aria-label={`${no}枚目の配置図：板 ${fmt(layout.boardWidth)}×${fmt(layout.boardLength)}、部材 ${layout.placements.length}枚、端材 ${layout.scraps.length}つ`}
    >
      <defs>
        <pattern id={`scrap-${uid}`} patternUnits="userSpaceOnUse" width={W * 0.03} height={W * 0.03} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={W * 0.03} className="dg-hatch" />
        </pattern>
        {layout.placements.map((p, i) => {
          const r = flipY(p, L)
          return (
            <clipPath key={i} id={`clip-${uid}-${i}`}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} />
            </clipPath>
          )
        })}
      </defs>

      {/* 板（部材のすき間は刃で消える部分） */}
      <rect className="dg-board" x={0} y={0} width={W} height={L} />

      {layout.scraps.map((s, i) => {
        const r = flipY(s, L)
        return (
          <g key={`s${i}`}>
            <rect className="dg-scrap" x={r.x} y={r.y} width={r.w} height={r.h} />
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#scrap-${uid})`} pointerEvents="none" />
          </g>
        )
      })}

      {layout.placements.map((p) => {
        const r = flipY(p, L)
        return (
          <rect
            key={p.pieceId}
            className={done.has(p.pieceId) ? 'dg-piece done' : `dg-piece pc${colorOf(p.partId) % PIECE_COLORS}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
          />
        )
      })}

      {layout.trims.map((t, i) => {
        const r = flipY(t, L)
        return <rect key={`t${i}`} className="dg-trim" x={r.x} y={r.y} width={r.w} height={r.h} />
      })}
      <rect className="dg-outline" x={0} y={0} width={W} height={L} />

      {layout.placements.map((p, i) => {
        const r = flipY(p, L)
        const isDone = done.has(p.pieceId)
        const current = labelOf?.(p.partId) ?? p.name
        const name = isDone ? `済 ${current}` : current
        const label = fitLabel(
          r.w,
          r.h,
          isDone ? [[name, p.sizeLabel], [name], ['済']] : [[name, p.sizeLabel], [name]],
          maxFont,
          minFont,
        )
        return (
          label && (
            <g key={p.pieceId} clipPath={`url(#clip-${uid}-${i})`}>
              <LabelText r={r} label={label} className={isDone ? 'dg-text done' : 'dg-text'} />
            </g>
          )
        )
      })}

      {layout.scraps.map((s, i) => {
        const r = flipY(s, L)
        const label = fitLabel(r.w, r.h, [[scrapLabel(s, layout.orientation)]], maxFont * 0.9, minFont)
        return label && <LabelText key={`sl${i}`} r={r} label={label} className="dg-text scrap" />
      })}
    </svg>
  )
}
