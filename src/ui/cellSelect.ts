// セルを選ぶ（第1.3版。仕様書 17.1）の画面の手伝い：選んでいる範囲（四角）の持ち方と、コピー・貼り付けの知らせの文。
// 計算（コピー・貼り付け・消す・行を削除）は engine/clipboard/cells.ts と store の reducer が行う
import type { PasteSkip } from '../engine/clipboard/cells'
import type { CellClip, CellCol, CellPos, CellRange } from '../engine/types'

/** セルの鍵（"行:列"） */
export const cellKey = (pos: CellPos): string => `${pos.row}:${pos.col}`

/** 表の中の1つのセルの位置（col は列の位置。0＝名前 … 3＝枚数。engine の CellRange の left と同じ数え方） */
export interface GridPoint {
  row: number
  col: number
}

/** 1つのセルの範囲 */
export function singleRange(p: GridPoint): CellRange {
  return { top: p.row, left: p.col, rows: 1, cols: 1 }
}

/** 2つのセルを角にした四角（どちらが左上でもよい） */
export function spanRange(a: GridPoint, b: GridPoint): CellRange {
  const top = Math.min(a.row, b.row)
  const left = Math.min(a.col, b.col)
  return { top, left, rows: Math.abs(a.row - b.row) + 1, cols: Math.abs(a.col - b.col) + 1 }
}

/** そのセルが範囲の中か */
export function rangeHas(r: CellRange, p: GridPoint): boolean {
  return p.row >= r.top && p.row < r.top + r.rows && p.col >= r.left && p.col < r.left + r.cols
}

/** 範囲が、そのセル1つだけか */
export function isSingleAt(r: CellRange | null, p: GridPoint): boolean {
  return r !== null && r.rows === 1 && r.cols === 1 && r.top === p.row && r.left === p.col
}

/** 範囲の右下のセル */
export function rangeEnd(r: CellRange): GridPoint {
  return { row: r.top + r.rows - 1, col: r.left + r.cols - 1 }
}

/**
 * 取っ手を引くとき、動かない角：左上の取っ手（start）なら右下、右下の取っ手（end）なら左上。
 * 引いた先のセルとこの角で、新しい範囲（spanRange）を作る
 */
export function fixedCorner(r: CellRange, handle: 'start' | 'end'): GridPoint {
  return handle === 'start' ? rangeEnd(r) : { row: r.top, col: r.left }
}

/** 範囲を変えたあとの起点（アクティブセル）：今の起点が新しい範囲の中ならそのまま、外に出たら動かない角 */
export function keepActive(active: GridPoint, r: CellRange, fixed: GridPoint): GridPoint {
  return rangeHas(r, active) ? active : fixed
}

/** 範囲を表の行の数に収める（行が減って、範囲が表の下にはみ出したとき）。全部はみ出したら null */
export function clampRange(r: CellRange, rowCount: number): CellRange | null {
  if (r.top >= rowCount) return null
  return { ...r, rows: Math.min(r.rows, rowCount - r.top) }
}

const CLIP_TEXT_MAX = 10

/** 今コピーしているもの：「コピー中：1つ（400）」「コピー中：2行×2列」。無ければ null */
export function clipText(clip: CellClip | null): string | null {
  if (!clip) return null
  if (clip.rows === 1 && clip.cols === 1) {
    const t = clip.cells[0]?.[0] ?? ''
    const shown = t === '' ? '空' : [...t].length > CLIP_TEXT_MAX ? `${[...t].slice(0, CLIP_TEXT_MAX).join('')}…` : t
    return `コピー中：1つ（${shown}）`
  }
  return `コピー中：${clip.rows}行×${clip.cols}列`
}

/** 貼り付けの知らせ：「3つのセルに貼りました（貼れなかったもの 1つ：同じ名前は貼れません）」 */
export function pasteText(pasted: number, skipped: readonly PasteSkip[]): string {
  if (pasted === 0 && skipped.length === 0) return '貼れるセルがありませんでした'
  const head = pasted === 0 ? '貼れませんでした' : `${pasted}つのセルに貼りました`
  if (skipped.length === 0) return head
  const reasons = [...new Set(skipped.map((s) => s.message))].join('・')
  return `${head}（貼れなかったもの ${skipped.length}つ：${reasons}）`
}

/** 選んでいるセルの中に、部材の行（表の行が部材の数より小さい）があるか */
export function hasPartCell(cells: readonly CellPos[], partCount: number): boolean {
  return cells.some((c) => c.row < partCount)
}

export const CELL_COL_LABEL: Record<CellCol, string> = { name: '名前', W: 'W', H: 'H', qty: '枚数' }
