// 保存データ・共有とバックアップのファイルの中身の形の確かめ（store/storage.ts から移した。第1.1版 E-11）。
// 手で書き換えたデータや途中までのデータで画面が真っ白にならないよう、形が違えば「読めない」とする
import { CELL_COLS, type Adjust, type CellClip, type CellCut, type CellRange, type FrozenSheet, type Job, type Part, type Settings, type Sheet } from './types'

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const isString = (v: unknown): v is string => typeof v === 'string'
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNonNegative = (v: unknown): v is number => isFiniteNumber(v) && v >= 0
const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0

function isSheet(v: unknown): v is Sheet {
  return (
    isRecord(v) &&
    (v.sizeKind === 'saburoku' || v.sizeKind === 'shihachi' || v.sizeKind === 'custom') &&
    isPositive(v.width) &&
    isPositive(v.length)
  )
}

function isSettings(v: unknown): v is Settings {
  return (
    isRecord(v) &&
    isSheet(v.sheet) &&
    isNonNegative(v.kerf) &&
    isNonNegative(v.trim) &&
    isNonNegative(v.allowance) &&
    (v.cutMode === 'vertical' || v.cutMode === 'horizontal' || v.cutMode === 'auto')
  )
}

function isExpr(v: unknown): v is Part['expr'] {
  return isRecord(v) && isString(v.W) && isString(v.H)
}

export function isPart(v: unknown): v is Part {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isExpr(v.expr) &&
    // 枚数は 0 以上の整数か、空（null。第1.1版）
    (v.quantity === null || (Number.isInteger(v.quantity) && (v.quantity as number) >= 0)) &&
    typeof v.rotatable === 'boolean' &&
    typeof v.finishedDone === 'boolean'
  )
}

/** 部材の表の四角い範囲（第1.3版）：整数で、行は 0 から・列は表の中、1行×1列以上 */
export function isCellRange(v: unknown): v is CellRange {
  if (!isRecord(v) || ![v.top, v.left, v.rows, v.cols].every((n) => Number.isInteger(n))) return false
  const { top, left, rows, cols } = v as unknown as CellRange
  return top >= 0 && left >= 0 && rows >= 1 && cols >= 1 && left + cols <= CELL_COLS.length
}

/** 切り取りの元（第1.3版）：仕事の id と、クリップと同じ形の範囲 */
function isCellCut(v: unknown, rows: number, cols: number): v is CellCut {
  return isRecord(v) && isString(v.jobId) && isCellRange(v.range) && v.range.rows === rows && v.range.cols === cols
}

/**
 * コピーしたセル（第1.2版）：1〜部材の表の列の数の四角い形で、中身は全部文字。
 * 切り取りの元 cut（第1.3版）は無くてもよい（第1.2版の保存データ）。あるときは形も確かめる
 */
export function isCellClip(v: unknown): v is CellClip {
  if (!isRecord(v) || !Number.isInteger(v.rows) || !Number.isInteger(v.cols)) return false
  const rows = v.rows as number
  const cols = v.cols as number
  if (rows < 1 || cols < 1 || cols > CELL_COLS.length) return false
  if (v.cut !== undefined && !isCellCut(v.cut, rows, cols)) return false
  return (
    Array.isArray(v.cells) &&
    v.cells.length === rows &&
    v.cells.every((r) => Array.isArray(r) && r.length === cols && r.every(isString))
  )
}

/**
 * 保存データのコピーしたセルを読む。形が違えば null。切り取りの元だけ形が違うときは、元を外してふつうのコピーとして読む（暫定）
 */
export function readCellClip(v: unknown): CellClip | null {
  if (isCellClip(v)) return v
  if (!isRecord(v) || v.cut === undefined) return null
  const { cut: _cut, ...rest } = v
  return isCellClip(rest) ? rest : null
}

/** 固定した1枚は計算の写しなので、画面が使う所（id・板・1枚の片・チェック）だけ確かめる */
function isFrozenSheet(v: unknown): v is FrozenSheet {
  if (!isRecord(v) || !isString(v.id) || !isSheet(v.sheet) || !isString(v.frozenAt)) return false
  if (v.mode !== 'vertical' && v.mode !== 'horizontal') return false
  if (!isNonNegative(v.kerf) || !isNonNegative(v.trim)) return false
  if (!Array.isArray(v.checked) || !v.checked.every(isString)) return false
  if (v.completedAt !== undefined && !isString(v.completedAt)) return false
  const l = v.layout
  return isRecord(l) && Array.isArray(l.placements) && Array.isArray(l.trims) && Array.isArray(l.cuts) && Array.isArray(l.scraps) && isRecord(l.usable)
}

export function isJob(v: unknown): v is Job {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isSettings(v.settings) &&
    Array.isArray(v.parts) &&
    v.parts.every(isPart) &&
    Array.isArray(v.frozenSheets) &&
    v.frozenSheets.every(isFrozenSheet) &&
    isString(v.createdAt) &&
    isString(v.updatedAt)
  )
}

export function isAdjust(v: unknown): v is Adjust {
  return isRecord(v) && isString(v.id) && isString(v.name) && isPositive(v.value)
}
