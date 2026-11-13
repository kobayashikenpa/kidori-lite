import { describe, expect, it } from 'vitest'
import { gapAt, rowShift, targetGap, type RowBox } from './dragRows'

// 高さ 46px の行が5つ（表の見出しの下 44px から）
const rows: RowBox[] = Array.from({ length: 5 }, (_, i) => ({ top: 44 + i * 46, height: 46 }))

describe('指の位置から動かす先（仕様書 26.5）', () => {
  it('行の真ん中より上ならその行の上、下なら次の行の上', () => {
    expect(gapAt(0, rows, 5)).toBe(0)
    expect(gapAt(44 + 24, rows, 5)).toBe(1)
    expect(gapAt(44 + 21, rows, 5)).toBe(0)
    expect(gapAt(44 + 46 * 2 + 10, rows, 5)).toBe(2)
  })
  it('いちばん下の行の真ん中より下は、いちばん下', () => {
    expect(gapAt(1000, rows, 5)).toBe(5)
  })
  it('部材の行（limit）より下の空の行は数えない', () => {
    expect(gapAt(44 + 46 * 4 + 10, rows, 3)).toBe(3)
  })
})

describe('並びが変わらない所は動かさない', () => {
  it('動かす行の中・すぐ上・すぐ下は null', () => {
    // 4行目（3）だけを動かす
    expect(targetGap(3, 3, 1)).toBeNull()
    expect(targetGap(4, 3, 1)).toBeNull()
    expect(targetGap(2, 3, 1)).toBe(2)
    expect(targetGap(5, 3, 1)).toBe(5)
    // 2〜3行目（1・2）をまとめて
    expect(targetGap(1, 1, 2)).toBeNull()
    expect(targetGap(3, 1, 2)).toBeNull()
    expect(targetGap(0, 1, 2)).toBe(0)
    expect(targetGap(4, 1, 2)).toBe(4)
  })
})

describe('ほかの行がよける向き', () => {
  it('4行目を2行目と3行目の間へ（上へ）：2〜3行目の下の行（3行目）が下へよける', () => {
    // 4行目＝3、2行目と3行目の間＝2
    expect([0, 1, 2, 3, 4].map((i) => rowShift(i, 3, 1, 2))).toEqual([0, 0, 1, 0, 0])
  })
  it('2〜3行目を一番下へ（下へ）：その下の行が上へよける', () => {
    expect([0, 1, 2, 3, 4].map((i) => rowShift(i, 1, 2, 5))).toEqual([0, 0, 0, -1, -1])
  })
  it('動かす先が無ければ、どの行もよけない', () => {
    expect([0, 1, 2, 3, 4].map((i) => rowShift(i, 1, 2, null))).toEqual([0, 0, 0, 0, 0])
  })
  it('1行目を一番上へは並びが変わらない（null）ので、よけない', () => {
    expect(targetGap(0, 0, 1)).toBeNull()
  })
})
