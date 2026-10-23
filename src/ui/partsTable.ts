// 部材の表（仕様書 15.1）の行と欄の決まり。画面から切り離して試せるようにする（寸法の計算はしない）
import { partsReferencing } from '../engine/dimensions/resolve'
import { isBlankPart } from '../engine/parts'
import type { Adjust, Axis, DimensionError, Part, PartDimensions } from '../engine/types'
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

/** 「＋ 5行足す」で足す空の行の数（仕様書 16.6） */
export const ADD_ROWS = 5

/**
 * 表の行の数：部材の数 ＋ いつも空の行1つ、ただし minRows（初めは 10 行。「＋ 5行足す」で増える）に満たなければ minRows 行
 */
export function tableRowCount(partCount: number, minRows: number = TABLE_MIN_ROWS): number {
  return Math.max(TABLE_MIN_ROWS, minRows, partCount + 1)
}

/** 「＋ 5行足す」を押したあとの、表の行の数の下限（今の行の数 ＋ 5） */
export function addRowsMin(partCount: number, minRows: number = TABLE_MIN_ROWS): number {
  return tableRowCount(partCount, minRows) + ADD_ROWS
}

/**
 * 足した空の行は、アプリを開いている間だけ仕事ごとに覚える（保存しない。仕様書 16.6）。
 * 部材の画面を離れて戻っても残るよう、画面の外（このモジュール）に持つ
 */
const sessionMinRows = new Map<string, number>()

export function sessionTableMinRows(jobId: string): number {
  return sessionMinRows.get(jobId) ?? TABLE_MIN_ROWS
}

export function setSessionTableMinRows(jobId: string, minRows: number): void {
  sessionMinRows.set(jobId, minRows)
}

/** 何も入っていない部材か（engine の isBlankPart。第1.2版でセルの消す・貼り付けでも使うので engine に移した） */
export { isBlankPart }

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

/** 木取りのタブの W・H の欄：空、または木取り寸法（仕上がり ＋ 切り代）の欄 */
export function cutDimCell(part: Part, dims: PartDimensions | undefined, axis: Axis, adjusts: readonly Adjust[]): TableDimCell {
  if (part.expr[axis].trim() === '') return { kind: 'empty' }
  return dimCell(part, dims, axis, 'cut', adjusts)
}

/** 木取りのタブの枚数の欄：空は空、0 は「切らない」 */
export function cutQuantityText(q: number | null): string {
  if (q === null) return ''
  return q === 0 ? '切らない' : String(q)
}

/** 「全部回転してよい」の今の状態：全部回転してよい・一部・なし（部材が無ければなし） */
export type RotationState = 'all' | 'some' | 'none'

export function rotationState(parts: readonly Pick<Part, 'rotatable'>[]): RotationState {
  const n = parts.filter((p) => p.rotatable).length
  if (n === 0) return 'none'
  return n === parts.length ? 'all' : 'some'
}

/**
 * 消す部材（partIds）の寸法を式で使っている、残る部材（engine の partsReferencing をまとめただけ。並びは部材の順）。
 * 消す部材どうしの参照は数えない。空なら確認なしで消してよい
 */
export function referencingOthers(parts: readonly Part[], partIds: readonly string[]): { partId: string; name: string; axes: Axis[] }[] {
  const ids = new Set(partIds)
  const found = new Map<string, Set<Axis>>()
  const names = new Map<string, string>()
  for (const id of partIds) {
    for (const r of partsReferencing(parts, id)) {
      if (ids.has(r.partId)) continue
      const axes = found.get(r.partId) ?? new Set<Axis>()
      for (const a of r.axes) axes.add(a)
      found.set(r.partId, axes)
      names.set(r.partId, r.name)
    }
  }
  const order: Axis[] = ['W', 'H']
  return parts
    .filter((p) => found.has(p.id))
    .map((p) => ({ partId: p.id, name: names.get(p.id)!, axes: order.filter((a) => found.get(p.id)!.has(a)) }))
}

/**
 * 入力中のセル（W・H のキーを出しているセル）で出すエラー（仕様書 18.5）。
 * 式の書き方のエラー（記号が抜けている・途中で終わる・かっこ）は出さない。打っている途中に一時的に出やすい
 * 0 以下・0 で割る も出さない（暫定）。存在しない部材・削除した調整寸法・循環参照・参照先のエラー（from のあるもの）は出す。
 * 入力を終えたら、表の欄は今までどおり赤い「エラー」
 */
export function errorsWhileEditing(errors: readonly DimensionError[]): DimensionError[] {
  return errors.filter((e) => e.from !== undefined || (e.kind !== 'syntax' && e.kind !== 'nonPositive' && e.kind !== 'divideByZero'))
}
