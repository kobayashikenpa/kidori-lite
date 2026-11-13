// 番号を長押しして行を持ち上げ、引いて並べ替える（第2.2版。仕様書 26.5・24.2）の、指の位置と行の動きの決まり。
// 画面から切り離して試せるようにする（行を動かして保存するのは engine の moveParts）

/** 引き始めたときの行の位置（表の上の端からの px。動かす前の位置） */
export interface RowBox {
  top: number
  height: number
}

/**
 * 指の位置（表の上の端からの px）から、動かす先（元の並びの行と行の間。0〜limit。k は k 行目の上）。
 * 行の真ん中より上なら その行の上、どの行の真ん中より下なら いちばん下（limit）
 */
export function gapAt(y: number, rows: readonly RowBox[], limit: number): number {
  for (let i = 0; i < Math.min(limit, rows.length); i++) {
    if (y < rows[i].top + rows[i].height / 2) return i
  }
  return limit
}

/** 動かす先が、動かす行の中・すぐ上・すぐ下なら並びが変わらないので null。そうでなければその間 */
export function targetGap(gap: number, top: number, rows: number): number | null {
  return gap >= top && gap <= top + rows ? null : gap
}

/**
 * ほかの行が、動かす先をあけるためによける向き（-1 上へ・0 そのまま・1 下へ。動かす行の高さぶん）。
 * 下へ動かすときは、動かす行の下から動かす先までの行が上へ。上へ動かすときは、動かす先から動かす行の上までの行が下へ。
 * 動かす行そのもの・動かす先が無いときは 0
 */
export function rowShift(i: number, top: number, rows: number, to: number | null): -1 | 0 | 1 {
  if (to === null || (i >= top && i < top + rows)) return 0
  if (to > top + rows && i >= top + rows && i < to) return -1
  if (to < top && i >= to && i < top) return 1
  return 0
}
