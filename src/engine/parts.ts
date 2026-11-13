// 部材の表示用の名前と、名前・枚数が空の部材の扱い（第1.1版。仕様書 15.1）
// - 名前は空でもよい。空の部材は画面で「#3」（job.parts の並びで 1 から数えた行番号）と出す
// - 名前の無い部材は式から参照できない（第1.6版：表のセルを押しても式に入れない）
// - 枚数が空（quantity: null）の部材は、寸法は計算するが木取り・必要な枚数・進み具合・比べに入れない
import { normalizePartName } from './formula/tokenize'
import type { Job, Part } from './types'

/** 名前があるか（前後の空白を外して空でない） */
export function hasName(part: Pick<Part, 'name'>): boolean {
  return part.name.trim() !== ''
}

/** 表示用の名前：名前があれば名前、空なら「#行番号」。index は job.parts の中の位置（0 から） */
export function partLabelAt(part: Pick<Part, 'name'>, index: number): string {
  return hasName(part) ? part.name : `#${index + 1}`
}

/** 部材の id → 表示用の名前（partLabelAt）。たくさんの部材の名前を出すときに使う */
export function partLabels(parts: readonly Pick<Part, 'id' | 'name'>[]): Map<string, string> {
  return new Map(parts.map((p, i) => [p.id, partLabelAt(p, i)]))
}

/** 部材の表示用の名前（名前が空なら「#行番号」）。部材が無ければ空の文字 */
export function partLabel(job: Pick<Job, 'parts'>, partId: string): string {
  const i = job.parts.findIndex((p) => p.id === partId)
  return i < 0 ? '' : partLabelAt(job.parts[i], i)
}

/** 式から参照できる部材（名前のある部材。並びはそのまま） */
export function referableParts<T extends Pick<Part, 'name'>>(parts: readonly T[]): T[] {
  return parts.filter(hasName)
}

/** 切り出す枚数。枚数が空（null）と 0（寸法だけの行）は 0 */
export function cutQuantity(quantity: number | null): number {
  return quantity ?? 0
}

/**
 * 何も入っていない部材か（名前・厚み・W・H が空で、枚数も空）。この部材は表から外す（保存しない）。
 * 回転・仕上がりの完了・調整は見ない。厚みだけ入っている行は部材として残す（第2.2版。仕様書 26.8）
 */
export function isBlankPart(part: Pick<Part, 'name' | 'expr' | 'quantity' | 'thickness'>): boolean {
  return part.name.trim() === '' && part.thickness === null && part.expr.W.trim() === '' && part.expr.H.trim() === '' && part.quantity === null
}

/** 同じ名前の部材の名前のセルに出す文（第2.2版。仕様書 26.6） */
export const DUPLICATE_NAME_MESSAGE = '同じ名前があります'

/**
 * 同じ名前の部材の数（第2.2版。仕様書 26.6）：そろえた名前（normalizePartName。全角・半角の違いは同じ）→ 数。2つ以上の名前だけ。
 * 空の名前（空白だけも）は数えない
 */
export function duplicateNameCounts(parts: readonly Pick<Part, 'name'>[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of parts) {
    if (!hasName(p)) continue
    const key = normalizePartName(p.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [k, n] of counts) if (n < 2) counts.delete(k)
  return counts
}

/**
 * 同じ名前の部材の id の集まり（第2.2版。仕様書 26.6）。貼り付け・オートフィルで同じ名前になった部材を、
 * 画面が名前のセルで「同じ名前があります」（DUPLICATE_NAME_MESSAGE）にするのに使う。空の名前は数えない
 */
export function duplicateNameIds(parts: readonly Pick<Part, 'id' | 'name'>[]): Set<string> {
  const counts = duplicateNameCounts(parts)
  return new Set(parts.filter((p) => hasName(p) && counts.has(normalizePartName(p.name))).map((p) => p.id))
}
