// 木取りの画面に出す文字（計算はしない。engine の結果を並べる形にするだけ）
import type { Rect, SheetOrientation } from '../engine/types'
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
