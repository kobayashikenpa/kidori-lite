// kidori の packing/yield.test.ts をもとに、材料ごとの片（expandPieces）を決まった大きさの片（fixtures/pieces.ts）にしたもの。
// 「見本」は kidori の見本（本棚）のランバー18・ベニヤ4 と同じ大きさの片で、歩留まりの値は kidori と同じ
import { describe, expect, it } from 'vitest'
import { kidoriLumberPieces, kidoriVeneerPieces, shelfRotatablePieces } from '../fixtures/pieces'
import { packGuillotine } from './guillotine'
import type { Piece } from './pieces'
import { usableRect } from './sheet'
import { combineYield, sheetYield } from './yield'

const pct = (r: number) => Math.round(r * 1000) / 10
const SABUROKU = { width: 910, length: 1820 }
const SHIHACHI = { width: 1220, length: 2430 }
const LUMBER_18_ID = 'lumber'
const VENEER_4_ID = 'veneer'

function yieldsOf(pieces: Piece[], board: { width: number; length: number }) {
  const r = packGuillotine(pieces, usableRect(board, 5), 3, 'vertical')
  return r.sheets.map((sh) => sheetYield(sh.strips.flatMap((s) => s.items.map((i) => i.placement)), board))
}

function sheetYields(kind: string) {
  return yieldsOf(kind === LUMBER_18_ID ? kidoriLumberPieces() : kidoriVeneerPieces(), SABUROKU)
}

describe('歩留まり（木取り寸法の面積 ÷ 板全体の面積）', () => {
  it('板1枚：側板2枚 1810×410 ×2 ÷ 910×1820 = 89.6%', () => {
    const y = sheetYield(
      [
        { x: 495, y: 10, w: 410, h: 1810 },
        { x: 82, y: 10, w: 410, h: 1810 },
      ],
      SABUROKU,
    )
    expect(y.usedArea).toBe(1_484_200)
    expect(y.boardArea).toBe(1_656_200)
    expect(pct(y.yieldRate)).toBe(89.6)
  })

  it('見本・縦切り優先：ランバーの片 1枚目 89.6%、2枚目 84.4%、3枚目 41.1%', () => {
    expect(sheetYields(LUMBER_18_ID).map((y) => pct(y.yieldRate))).toEqual([89.6, 84.4, 41.1])
  })

  it('見本・縦切り優先：ランバー全体 71.7%、ベニヤ 97.8%、全体 78.2%', () => {
    const lumber = sheetYields(LUMBER_18_ID)
    const veneer = sheetYields(VENEER_4_ID)
    expect(pct(combineYield(lumber).yieldRate)).toBe(71.7)
    expect(pct(combineYield(veneer).yieldRate)).toBe(97.8)
    expect(pct(combineYield([...lumber, ...veneer]).yieldRate)).toBe(78.2)
  })

  it('まとめた面積は合計になる', () => {
    const c = combineYield(sheetYields(LUMBER_18_ID))
    expect(c.usedArea).toBe(1_484_200 + 1_397_620 + 680_940)
    expect(c.boardArea).toBe(1_656_200 * 3)
  })

  it('板がなければ歩留まり 0（0 で割らない）', () => {
    expect(combineYield([])).toEqual({ usedArea: 0, boardArea: 0, yieldRate: 0 })
    expect(sheetYield([], { width: 0, length: 0 }).yieldRate).toBe(0)
  })
})

describe('簡易版の見本（仕様書 6章の棚・4×8・縦切り優先・全部「回転してよい」）', () => {
  it('1枚目：天板 1810×410 ＋ 側板 710×410 ×2 ＋ 棚板 1770×389 ÷ 1220×2430 ＝ 67.9%、2枚目：棚板 ×2 ＝ 46.5%', () => {
    const ys = yieldsOf(shelfRotatablePieces(), SHIHACHI)
    expect(ys.map((y) => y.usedArea)).toEqual([1810 * 410 + 710 * 410 * 2 + 1770 * 389, 1770 * 389 * 2])
    expect(ys.map((y) => y.boardArea)).toEqual([1220 * 2430, 1220 * 2430])
    expect(ys.map((y) => pct(y.yieldRate))).toEqual([67.9, 46.5])
  })

  it('全体：木取り寸法の面積の合計 ÷ 板2枚の面積 ＝ 57.2%', () => {
    expect(pct(combineYield(yieldsOf(shelfRotatablePieces(), SHIHACHI)).yieldRate)).toBe(57.2)
  })
})
