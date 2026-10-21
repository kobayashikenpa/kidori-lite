// 部材の一覧の W・H の欄に出すもの（仕様書 5.2）。計算はせず、engine の計算結果（computeDimensions）と式の表示（formulaText）を並べるだけ
import { formulaText } from '../engine/formula/display'
import { formulaUnits } from '../engine/formula/units'
import type { Adjust, Axis, Part, PartDimensions } from '../engine/types'
import type { PartsTab } from './partsTab'

export type DimCell =
  /** 数値だけで入れた寸法：数値だけを出す */
  | { kind: 'number'; value: number }
  /** 式で入れた寸法：式 ｜ 計算した寸法 */
  | { kind: 'formula'; formula: string; value: number }
  /** 式がエラー：赤で「エラー」、押すと理由。formula は入れた式（空なら null） */
  | { kind: 'error'; formula: string | null; messages: string[] }

/** 式が数値だけか（数字と小数点だけ。空は数値ではない） */
export function isNumberOnly(expr: string): boolean {
  const units = formulaUnits(expr)
  return units.length > 0 && units.every((u) => u.kind === 'digit')
}

/** 1つの欄。仕上がりのタブは仕上がり寸法、木取りのタブは木取り寸法（式の側は同じ式） */
export function dimCell(part: Part, dims: PartDimensions | undefined, axis: Axis, tab: PartsTab, adjusts: readonly Adjust[]): DimCell {
  const expr = part.expr[axis]
  const formula = expr.trim() === '' ? null : formulaText(expr, adjusts)
  const errors = dims?.errors.filter((e) => e.axis === axis) ?? []
  const value = tab === 'finished' ? dims?.finishedByAxis[axis] : dims?.cutByAxis[axis]
  if (errors.length > 0 || value === undefined) {
    const messages = [...new Set(errors.map((e) => e.message))]
    return { kind: 'error', formula, messages: messages.length > 0 ? messages : ['計算できません'] }
  }
  if (isNumberOnly(expr)) return { kind: 'number', value }
  return { kind: 'formula', formula: formula ?? '', value }
}
