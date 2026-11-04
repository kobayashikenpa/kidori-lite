// 最終縦カットの位置（第2.1版。仕様書 25.3）：板1枚の配置から、元の板の右端から いちばん左の帯の左の端 までの距離を出す。
// 値 ＝ 右の端切り ＋ 帯の幅の合計 ＋ 帯の間の刃厚（帯は右から詰めるので、いちばん左の帯の左の端の位置で測れる）。
// 縦切り優先（縦長の図）・横切り優先（横長の図。画面では「最終横カット」）とも、その置き方の図の右から測る。
// 配置図の写し（固定した1枚の layout）からも出せるよう、保存データの形の確かめ（shape.ts の isFrozenSheet）が保証する
// placements・usable・trims だけを使う（orientation・帯の情報は使わない）
import { round1 } from '../round'
import type { SheetLayout } from '../types'

/**
 * 元の板の右端から、いちばん左の帯の左の端までの距離（mm。端切りの分を含む）。
 * - 帯より細い部材は帯の右に寄せて置くので、帯の左の端＝その帯のいちばん広い部材の左の端。全部の部材の左の端の最小がいちばん左の帯の左の端
 * - 元の板の右端は、使える範囲と端切りの部分の右の端の大きいほう（縦長は妻手、横長は長手）
 * - いちばん左の帯が使える範囲の左の端まで届いている（左に余りが無い）とき・部材が1つも無いときは null
 */
export function finalCutFromRight(layout: Pick<SheetLayout, 'placements' | 'usable' | 'trims'>): number | null {
  if (layout.placements.length === 0) return null
  const left = round1(Math.min(...layout.placements.map((p) => p.x)))
  const usableLeft = round1(layout.usable.x)
  if (left <= usableLeft) return null
  const right = Math.max(layout.usable.x + layout.usable.w, ...layout.trims.map((t) => t.x + t.w))
  return round1(right - left)
}
