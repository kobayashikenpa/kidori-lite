// 部材の画面の式の欄（第2.1版。仕様書 25.8。kidori-simple 28章と同じもの）に出す中身。画面から切り離して試せるようにする（計算はしない）。
// 欄はタブのすぐ下に1つ。選んでいる範囲の左上のセルの中身だけを出す（部材名・列の名前は出さない）。
// W・H・枚数のセル（調整寸法の表は寸法のセル）を選んでいる間だけ出し、名前のセル・何も選んでいないときは空（高さは変えない）
import { adjustValueText } from '../engine/adjusts'
import { splitLeadingEquals } from '../engine/formula/tokenize'
import { ADJUST_COLS, CELL_COLS, type AdjustRow, type Axis, type CellRange, type DimensionError, type Part } from '../engine/types'
import { errorsWhileEditing, quantityText, thicknessRaw } from './partsTable'
import type { PartsTab } from './partsTab'

/** 欄の中身：式（部材の寸法・調整寸法の塊を色つきで見せる。expr は保存してある形）か、ただの文字（枚数・調整寸法の寸法） */
export type BarContent = { kind: 'expr'; expr: string } | { kind: 'text'; text: string }

/** 欄を出す列：範囲の左上が 厚み・W・H・枚数なら その列、名前・何も選んでいないときは null（厚みは第2.2版。仕様書 26.8） */
export function barField(range: CellRange | null): Axis | 'T' | 'qty' | null {
  if (!range) return null
  const col = CELL_COLS[range.left]
  return col === 'T' || col === 'W' || col === 'H' || col === 'qty' ? col : null
}

/**
 * 部材の表の欄の中身（範囲の左上のセル。部材の無い空の行は空の中身）。
 * - finished（［仕上がり］）と cut（［木取り］）：仕上がりの式（「＝」で始まる古い式は「＝」を外す）
 * - adjust（［調整］）：調整の式
 * - 枚数・厚みはどのタブも その数（空は ''。厚みは［仕上がり］で入れ、［調整］［木取り］は見るだけ）
 */
export function partBar(parts: readonly Part[], range: CellRange | null, tab: PartsTab): BarContent | null {
  const field = barField(range)
  if (!range || !field) return null
  const part = parts[range.top] as Part | undefined
  if (field === 'qty') return { kind: 'text', text: quantityText(part?.quantity ?? null) }
  if (field === 'T') return { kind: 'text', text: thicknessRaw(part?.thickness ?? null) }
  if (tab === 'adjust') return { kind: 'expr', expr: part?.adjust[field] ?? '' }
  return { kind: 'expr', expr: splitLeadingEquals(part?.expr[field] ?? '').rest }
}

/** 調整寸法の表の欄の中身：寸法のセルならその数字（空は ''）、名前のセル・何も選んでいないときは null */
export function adjustRowBar(rows: readonly AdjustRow[], range: CellRange | null): BarContent | null {
  if (!range || ADJUST_COLS[range.left] !== 'value') return null
  const row = rows[range.top] as AdjustRow | undefined
  return { kind: 'text', text: adjustValueText(row?.value ?? null) }
}

/**
 * 欄のすぐ下に赤で出すエラーの理由（同じ文は1つ）。［仕上がり］は仕上がりの欄のエラーだけ、［調整］［木取り］はその軸のエラー全部。
 * 入力中は、打っている途中に出やすいエラー（errorsWhileEditing で出さないもの）を除く
 */
export function barErrors(errors: readonly DimensionError[], axis: Axis, tab: PartsTab, editing: boolean): string[] {
  const own = errors.filter((e) => e.axis === axis && (tab !== 'finished' || e.field === 'finished'))
  return [...new Set((editing ? errorsWhileEditing(own) : own).map((e) => e.message))]
}
