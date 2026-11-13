// 木取りの画面に出す文字（計算はしない。engine の結果を並べる形にするだけ）
import type { DimensionError, Rect, SheetOrientation } from '../engine/types'
import { fmt } from './format'

/** 歩留まり（0〜1）を「81.2%」の形にする */
export function pct(rate: number): string {
  return `${fmt(rate * 100)}%`
}

/**
 * 端材の大きさを W×H（W＝板の妻手方向、H＝板の長手方向。部材の W・H と同じ向き）で出す。
 * 配置図の座標は、縦長（portrait）なら x＝妻手、横長（landscape）なら x＝長手なので、横長は入れ替える
 */
export function scrapLabel(r: Pick<Rect, 'w' | 'h'>, orientation: SheetOrientation): string {
  const [W, H] = orientation === 'landscape' ? [r.h, r.w] : [r.w, r.h]
  return `${fmt(W)}×${fmt(H)}`
}

/** 計算から外した部材のエラーが、部材の画面のどのタブのどの欄か（例：「［調整］の W」）。直す所が分かるように出す */
export function skippedErrorPlace(e: Pick<DimensionError, 'field' | 'axis'>): string {
  return `［${e.field === 'adjust' ? '調整' : '仕上がり'}］の ${e.axis}`
}

/** 部材名の横に付ける厚みの印（第2.2版。仕様書 26.1）：「t18」（小数第1位まで）。厚みが空なら '' */
export function thicknessTag(thickness: number | null | undefined): string {
  return thickness === null || thickness === undefined ? '' : `t${fmt(thickness)}`
}

/** 部材名に厚みの印を付ける：「棚板 t18」。厚みが空なら名前のまま */
export function withThickness(name: string, thickness: number | null | undefined): string {
  const tag = thicknessTag(thickness)
  return tag === '' ? name : `${name} ${tag}`
}
