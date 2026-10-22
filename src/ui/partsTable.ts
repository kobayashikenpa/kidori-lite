// 部材の表（仕様書 15.1）の行と欄の決まり。画面から切り離して試せるようにする（寸法の計算はしない）
import type { Adjust, Axis, Part, PartDimensions } from '../engine/types'
import { dimCell, type DimCell } from './partCells'

/** 表の欄（番号の欄は選ばない） */
export type TableField = 'name' | 'W' | 'H' | 'qty'

/** 選んでいる欄。row は表の行（0 から。job.parts の位置。parts.length は空の行） */
export interface TableCell {
  row: number
  field: TableField
}

/** 空の行で埋める行の数（10行に満たないときは10行まで） */
export const TABLE_MIN_ROWS = 10

/** 表の行の数：部材の数 ＋ いつも空の行1つ、ただし 10 行に満たなければ 10 行 */
export function tableRowCount(partCount: number): number {
  return Math.max(TABLE_MIN_ROWS, partCount + 1)
}

/** 何も入っていない部材か（名前・W・H が空で、枚数も空）。この部材は表から外す（保存しない） */
export function isBlankPart(part: Pick<Part, 'name' | 'expr' | 'quantity'>): boolean {
  return part.name.trim() === '' && part.expr.W.trim() === '' && part.expr.H.trim() === '' && part.quantity === null
}

/**
 * 押した行を、入力できる行にそろえる。部材の行はそのまま、空の行はいちばん上の空の行（部材の数の位置）にする
 * （新しい部材はいつも最後に足すので、途中の空の行に入れても、いちばん上の空の行に入る。暫定）
 */
export function inputRow(row: number, partCount: number): number {
  return Math.max(0, Math.min(row, partCount))
}

/** 「次へ」の行き先：名前 → W → H → 枚数 → 次の行の名前 */
export function nextCell(cell: TableCell, partCount: number): TableCell {
  switch (cell.field) {
    case 'name':
      return { row: cell.row, field: 'W' }
    case 'W':
      return { row: cell.row, field: 'H' }
    case 'H':
      return { row: cell.row, field: 'qty' }
    case 'qty':
      return { row: inputRow(cell.row + 1, partCount), field: 'name' }
  }
}

/** 枚数の欄の文字（空は ''） */
export function quantityText(q: number | null): string {
  return q === null ? '' : String(q)
}

/** 枚数の欄の文字から枚数（空は null） */
export function quantityFromText(t: string): number | null {
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** 表の W・H の欄：空、または一覧と同じ欄（数値・式・エラー。仕上がり寸法） */
export type TableDimCell = { kind: 'empty' } | DimCell

export function tableDimCell(part: Part, dims: PartDimensions | undefined, axis: Axis, adjusts: readonly Adjust[]): TableDimCell {
  if (part.expr[axis].trim() === '') return { kind: 'empty' }
  return dimCell(part, dims, axis, 'finished', adjusts)
}
