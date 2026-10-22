// 部材の表示用の名前と、名前・枚数が空の部材の扱い（第1.1版。仕様書 15.1）
// - 名前は空でもよい。空の部材は画面で「#3」（job.parts の並びで 1 から数えた行番号）と出す
// - 名前の無い部材は式から参照できない（式の「部材」のボタンに出さない）
// - 枚数が空（quantity: null）の部材は、寸法は計算するが木取り・必要な枚数・進み具合・比べに入れない
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

/** 式から参照できる部材（名前のある部材。並びはそのまま）。式の「部材」のボタンの一覧に使う */
export function referableParts<T extends Pick<Part, 'name'>>(parts: readonly T[]): T[] {
  return parts.filter(hasName)
}

/** 切り出す枚数。枚数が空（null）と 0（寸法だけの行）は 0 */
export function cutQuantity(quantity: number | null): number {
  return quantity ?? 0
}
