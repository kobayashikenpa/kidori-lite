// 部材の表（仕様書 15.1）の行と欄の決まり。画面から切り離して試せるようにする（寸法の計算はしない）
import { partsReferencing } from '../engine/dimensions/resolve'
import { isBlankAdjustExpr } from '../engine/formula/adjustExpr'
import { formulaText } from '../engine/formula/display'
import { isBlankPart } from '../engine/parts'
import type { Adjust, Axis, CellCol, DimensionError, Part, PartDimensions } from '../engine/types'
import { THICKNESS_MESSAGE } from '../store/jobs'
import { fmt, parseNum } from './format'
import { dimCell, type DimCell } from './partCells'

/** 表の欄（番号の欄は選ばない）。第2.2版で厚み（T）が増えた（engine の CellCol と同じ：名前・厚み・W・H・枚数） */
export type TableField = CellCol

/** 選んでいる欄。row は表の行（0 から。job.parts の位置。parts.length は空の行） */
export interface TableCell {
  row: number
  field: TableField
}

/** 空の行で埋める行の数（5行に満たないときは5行まで。仕様書 21.4。第1.6版までは 10行） */
export const TABLE_MIN_ROWS = 5

/** 「＋ 5行足す」で足す空の行の数（仕様書 16.6） */
export const ADD_ROWS = 5

/**
 * 表の行の数：部材の数 ＋ いつも空の行1つ、ただし minRows（初めは 5 行。「＋ 5行足す」で増える）に満たなければ minRows 行
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

/**
 * 「次へ」の行き先（第2.2版。仕様書 26.2）：名前は次の行の名前、厚みは次の行の厚み（縦に進む）。
 * W・H・枚数は W → H → 枚数 → 次の行の W（横に進み、名前・厚みの列には入らない）。最後の部材の次は空の行（inputRow）
 */
export function nextCell(cell: TableCell, partCount: number): TableCell {
  const below = inputRow(cell.row + 1, partCount)
  switch (cell.field) {
    case 'name':
    case 'T':
      return { row: below, field: cell.field }
    case 'W':
      return { row: cell.row, field: 'H' }
    case 'H':
      return { row: cell.row, field: 'qty' }
    case 'qty':
      return { row: below, field: 'W' }
  }
}

/**
 * ［調整］のタブの「次へ」の行き先（第2.1版）：入れられるのは W・H だけなので W → H → 次の部材の W。
 * 最後の部材の H の次は無い（null。入力を終える。［調整］の表に空の行は無い。仕様書 25.9）
 */
export function nextAdjustTabCell(cell: { row: number; axis: Axis }, partCount: number): { row: number; axis: Axis } | null {
  if (cell.axis === 'W') return { row: cell.row, axis: 'H' }
  return cell.row + 1 < partCount ? { row: cell.row + 1, axis: 'W' } : null
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

/** 厚みの欄の文字（空は ''。小数第1位まで） */
export function thicknessText(t: number | null): string {
  return t === null ? '' : fmt(t)
}

/**
 * 厚みの欄に打った文字から厚み（第2.2版。仕様書 26.1）：空は空（null）、0 より大きい数（小数可）はその数。
 * 0・0.・数でないものは入れられない（理由つき。打っている途中の「2.」は 2 として入れてよい）
 */
export function thicknessFromText(t: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const n = parseNum(t)
  if (n === null) return { ok: true, value: null }
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: THICKNESS_MESSAGE }
  return { ok: true, value: n }
}

/** 表の W・H の欄：空、または一覧と同じ欄（数値・式・エラー。仕上がり寸法） */
export type TableDimCell = { kind: 'empty' } | DimCell

export function tableDimCell(part: Part, dims: PartDimensions | undefined, axis: Axis, adjusts: readonly Adjust[]): TableDimCell {
  if (part.expr[axis].trim() === '') return { kind: 'empty' }
  return dimCell(part, dims, axis, 'finished', adjusts)
}

/**
 * ［調整］のタブの W・H の欄（第2.1版。仕様書 25.2）。計算はせず、engine の結果（computeDimensions）と調整の式の表示を並べるだけ
 * - empty：仕上がりも調整も空
 * - finished：調整が空（調整なし）。仕上がり寸法を薄く出す
 * - adjusted：調整の値 ｜ 調整後の寸法（label は × ÷ − の書き方。例「−メラミン1×2」）
 * - error：赤で「エラー」。仕上がり寸法のエラーも、調整の欄のエラーも出す（仕上がりがエラーなら調整後もエラー）
 */
export type AdjustDimCell =
  | { kind: 'empty' }
  | { kind: 'finished'; value: number }
  | { kind: 'adjusted'; label: string; value: number }
  | { kind: 'error'; label: string | null; messages: string[] }

export function adjustDimCell(part: Part, dims: PartDimensions | undefined, axis: Axis, adjusts: readonly Adjust[]): AdjustDimCell {
  const text = part.adjust[axis]
  const blank = isBlankAdjustExpr(text)
  if (blank && part.expr[axis].trim() === '') return { kind: 'empty' }
  const label = blank ? null : formulaText(text, adjusts)
  // ［調整］のタブは、その軸のエラーを全部（仕上がりの欄のものも）出す
  const errors = dims?.errors.filter((e) => e.axis === axis) ?? []
  const value = blank ? dims?.finishedByAxis[axis] : dims?.adjustedByAxis[axis]
  if (errors.length > 0 || value === undefined) {
    const messages = [...new Set(errors.map((e) => e.message))]
    return { kind: 'error', label, messages: messages.length > 0 ? messages : ['計算できません'] }
  }
  return label === null ? { kind: 'finished', value } : { kind: 'adjusted', label, value }
}

/** ［調整］のタブの W・H の欄の読み上げ用の文（数は小数第1位まで） */
export function adjustCellLabel(c: AdjustDimCell): string {
  switch (c.kind) {
    case 'empty':
      return '空'
    case 'finished':
      return `調整なし（仕上がり ${fmt(c.value)}）`
    case 'adjusted':
      return `${c.label}、調整後 ${fmt(c.value)}`
    case 'error':
      return `${c.label ? `${c.label}、` : ''}エラー`
  }
}

/** 木取りのタブの W・H の欄：空、または木取り寸法（調整後 ＋ 切り代。第2.1版）の欄 */
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
