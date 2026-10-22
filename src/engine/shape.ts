// 保存データ・共有とバックアップのファイルの中身の形の確かめ（store/storage.ts から移した。第1.1版 E-11）。
// 手で書き換えたデータや途中までのデータで画面が真っ白にならないよう、形が違えば「読めない」とする
import type { Adjust, CopiedPart, FrozenSheet, Job, Part, Settings, Sheet } from './types'

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

export function isCopiedPart(v: unknown): v is CopiedPart {
  return (
    isRecord(v) &&
    isString(v.name) &&
    isExpr(v.expr) &&
    // 枚数は 0 以上の整数か、空（null。第1.1版）
    (v.quantity === null || (Number.isInteger(v.quantity) && (v.quantity as number) >= 0)) &&
    typeof v.rotatable === 'boolean'
  )
}

export function isPart(v: unknown): v is Part {
  return isCopiedPart(v) && isString((v as Record<string, unknown>).id) && typeof (v as Record<string, unknown>).finishedDone === 'boolean'
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
