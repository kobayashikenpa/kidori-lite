// kidori の packing/guillotine.test.ts をもとに、材料ごとの片（expandPieces）を決まった大きさの片（fixtures/pieces.ts）にしたもの。
// 「見本」は kidori の見本（本棚）のランバー18・ベニヤ4 と同じ大きさの片で、配置の値は kidori と同じ。
// 簡易版の見本（仕様書 6章の棚）は 4×8 で確かめる。同じ幅を優先する並べ方の選び方（chooseWay）は kidori の sameWidthChoice.test.ts から
import { describe, expect, it } from 'vitest'
import { kidoriLumberPieces, kidoriVeneerPieces, piece, shelfRotatablePieces } from '../fixtures/pieces'
import type { Placement, Rect } from '../types'
import { chooseWay, packGuillotine, preferSameWidth, type GuillotineResult } from './guillotine'
import type { Piece } from './pieces'
import { usableRect } from './sheet'

const KERF = 3
const SABUROKU = { width: 910, length: 1820 }

function packBoard(pieces: Piece[], mode: 'vertical' | 'horizontal'): GuillotineResult {
  return packGuillotine(pieces, usableRect(SABUROKU, 5, mode), KERF, mode)
}
const lumber = (mode: 'vertical' | 'horizontal') => packBoard(kidoriLumberPieces(), mode)
const veneer = (mode: 'vertical' | 'horizontal') => packBoard(kidoriVeneerPieces(), mode)

function placements(r: GuillotineResult, sheet: number): Placement[] {
  return r.sheets[sheet].strips.flatMap((s) => s.items.map((i) => i.placement))
}

function names(r: GuillotineResult): string[][] {
  return r.sheets.map((_, i) =>
    placements(r, i)
      .map((p) => p.name)
      .sort(),
  )
}

const rect = (p: Rect) => ({ x: p.x, y: p.y, w: p.w, h: p.h })

/** 範囲内・重ならない・隣り合う片の間が刃厚以上あく */
function expectValid(r: GuillotineResult, usable: Rect, kerf: number) {
  for (let s = 0; s < r.sheets.length; s++) {
    const ps = placements(r, s)
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(usable.x)
      expect(p.y).toBeGreaterThanOrEqual(usable.y)
      expect(p.x + p.w).toBeLessThanOrEqual(usable.x + usable.w + 1e-9)
      expect(p.y + p.h).toBeLessThanOrEqual(usable.y + usable.h + 1e-9)
    }
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i]
        const b = ps[j]
        const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
        const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(kerf - 1e-9)
      }
    }
    // 帯の中の片は帯の中にある
    for (const st of r.sheets[s].strips) {
      for (const it of st.items) {
        const p = it.placement
        expect(p.x).toBeGreaterThanOrEqual(st.rect.x)
        expect(p.y).toBeGreaterThanOrEqual(st.rect.y)
        expect(p.x + p.w).toBeLessThanOrEqual(st.rect.x + st.rect.w + 1e-9)
        expect(p.y + p.h).toBeLessThanOrEqual(st.rect.y + st.rect.h + 1e-9)
      }
    }
  }
}

const SABUROKU_USABLE: Rect = { x: 0, y: 0, w: 905, h: 1820 }

describe('packGuillotine 縦切り優先（右から帯詰め、帯の中は上から）', () => {
  it('見本（kidori のランバー18 と同じ片）：3×6 で3枚（1枚目 側板×2、2枚目 天地板×2＋棚板×2、3枚目 棚板×2）', () => {
    const r = lumber('vertical')
    expect(r.sheets).toHaveLength(3)
    expect(names(r)).toEqual([
      ['側板', '側板'],
      ['天地板', '天地板', '棚板', '棚板'],
      ['棚板', '棚板'],
    ])
  })

  it('見本（kidori のベニヤ4 と同じ片）：1枚。背板は右上（x=5〜905、y=20〜1820）に置く', () => {
    const r = veneer('vertical')
    expect(r.sheets).toHaveLength(1)
    expect(rect(placements(r, 0)[0])).toEqual({ x: 5, y: 20, w: 900, h: 1800 })
  })

  it('1枚目：最初の側板は右上（右端 x=905、上端 y=1820）、次の帯はその左に刃厚3をあける', () => {
    const r = lumber('vertical')
    const ps = placements(r, 0)
    expect(rect(ps[0])).toEqual({ x: 495, y: 10, w: 410, h: 1810 })
    expect(rect(ps[1])).toEqual({ x: 82, y: 10, w: 410, h: 1810 })
    expect(r.sheets[0].strips.map((s) => rect(s.rect))).toEqual([
      { x: 495, y: 0, w: 410, h: 1820 },
      { x: 82, y: 0, w: 410, h: 1820 },
    ])
  })

  it('2枚目：帯の中は上（奥、y=1820）から刃厚をあけて下へ詰める。細い棚板は次の帯', () => {
    const r = lumber('vertical')
    expect(placements(r, 1).map((p) => [p.name, rect(p)])).toEqual([
      ['天地板', { x: 495, y: 946, w: 410, h: 874 }],
      ['天地板', { x: 495, y: 69, w: 410, h: 874 }],
      ['棚板', { x: 102, y: 947, w: 390, h: 873 }],
      ['棚板', { x: 102, y: 71, w: 390, h: 873 }],
    ])
    expect(placements(r, 2).map((p) => rect(p))).toEqual([
      { x: 515, y: 947, w: 390, h: 873 },
      { x: 515, y: 71, w: 390, h: 873 },
    ])
  })

  it('配置に部材の情報（片の id・回転・寸法の表記）が付く', () => {
    const r = lumber('vertical')
    const p = placements(r, 0)[0]
    expect(p).toMatchObject({ pieceId: 'part-gawaita#1', partId: 'part-gawaita', name: '側板', rotated: false })
    expect(p.sizeLabel).toBe('410×1810')
  })

  it('見本のすべての片が範囲内・重ならない・間が刃厚以上', () => {
    expectValid(lumber('vertical'), SABUROKU_USABLE, KERF)
    expectValid(veneer('vertical'), SABUROKU_USABLE, KERF)
  })

  it('帯の幅：410 + 3 + 410 + 3 + 79 はぴったり入る（3本目の帯 79 が x=0 に届く）', () => {
    const r = packGuillotine([piece('a', 410, 1820), piece('b', 410, 1820), piece('c', 79, 1820)], SABUROKU_USABLE, 3, 'vertical')
    expect(r.sheets).toHaveLength(1)
    expect(placements(r, 0).map((p) => p.x)).toEqual([495, 82, 0])
  })

  it('帯の中の片は上端 y=1820 から詰め、最後の片が下端 y=0 にぴったり届く（908.5 + 3 + 908.5）', () => {
    const r = packGuillotine([piece('a', 300, 908.5), piece('b', 300, 908.5)], SABUROKU_USABLE, 3, 'vertical')
    expect(placements(r, 0).map((p) => [p.y, p.y + p.h])).toEqual([
      [911.5, 1820],
      [0, 908.5],
    ])
  })

  it('帯の幅が1mm 足りないと次の板に回る（80 は入らない）', () => {
    const r = packGuillotine([piece('a', 410, 1820), piece('b', 410, 1820), piece('c', 80, 1820)], SABUROKU_USABLE, 3, 'vertical')
    expect(r.sheets).toHaveLength(2)
  })

  it('帯の長さ：1820 に 908.5 + 3 + 908.5 は入り、909 + 3 + 909 は入らない', () => {
    const fit = packGuillotine([piece('a', 300, 908.5), piece('b', 300, 908.5)], SABUROKU_USABLE, 3, 'vertical')
    expect(fit.sheets[0].strips).toHaveLength(1)
    const over = packGuillotine([piece('a', 300, 909), piece('b', 300, 909)], SABUROKU_USABLE, 3, 'vertical')
    expect(over.sheets[0].strips).toHaveLength(2)
  })

  it('刃厚ぶん入らない：1820 に 910 + 910 は、刃厚3があるので同じ帯に入らない', () => {
    const r = packGuillotine([piece('a', 300, 910), piece('b', 300, 910)], SABUROKU_USABLE, 3, 'vertical')
    expect(r.sheets[0].strips).toHaveLength(2)
    const r0 = packGuillotine([piece('a', 300, 910), piece('b', 300, 910)], SABUROKU_USABLE, 0, 'vertical')
    expect(r0.sheets[0].strips).toHaveLength(1)
  })

  it('帯より細い片は帯の右端に寄せ、前の片の下に刃厚をあけて置く（板の残りの幅が足りず、新しい帯を作れないとき）', () => {
    // 700 の帯の左の残りは 905 − 700 − 3 = 202 で、300 の帯は作れない
    const r = packGuillotine([piece('wide', 700, 1000), piece('narrow', 300, 800)], SABUROKU_USABLE, 3, 'vertical')
    expect(r.sheets[0].strips).toHaveLength(1)
    expect(rect(placements(r, 0)[1])).toEqual({ x: 605, y: 17, w: 300, h: 800 })
  })

  describe('帯の中は同じ幅の部材を優先する（kidori 17.13。仕様書 7）', () => {
    it('幅 400 の帯があっても、板の残りの幅があれば幅 300 の片は新しい帯に入る', () => {
      const r = packGuillotine([piece('wide', 400, 1000), piece('narrow', 300, 800)], SABUROKU_USABLE, 3, 'vertical')
      expect(r.sheets[0].strips.map((st) => st.local.pw)).toEqual([400, 300])
      expect(rect(placements(r, 0)[1])).toEqual({ x: 202, y: 1020, w: 300, h: 800 })
    })

    it('板の残りの幅がちょうど足りれば新しい帯、1mm 足りなければ広い帯に入る', () => {
      // 使える幅 905：602 ＋ 刃厚 3 ＋ 300 ＝ 905 ぴったり
      const fit = packGuillotine([piece('a', 602, 1000), piece('b', 300, 800)], SABUROKU_USABLE, 3, 'vertical')
      expect(fit.sheets[0].strips).toHaveLength(2)
      const over = packGuillotine([piece('a', 603, 1000), piece('b', 300, 800)], SABUROKU_USABLE, 3, 'vertical')
      expect(over.sheets[0].strips.map((st) => st.items.map((i) => i.placement.name))).toEqual([['a', 'b']])
    })

    it('同じ幅の帯があれば、先にある広い帯より同じ幅の帯に入る', () => {
      const r = packGuillotine(
        [piece('w', 400, 1000), piece('n1', 300, 1000), piece('n2', 300, 500)],
        SABUROKU_USABLE,
        3,
        'vertical',
      )
      expect(r.sheets[0].strips.map((st) => st.items.map((i) => i.placement.name))).toEqual([['w'], ['n1', 'n2']])
      // kidori 第2.4版までの並べ方（First Fit）では、先にある広い帯（400）の残りに入れていた
      const old = packGuillotine(
        [piece('w', 400, 1000), piece('n1', 300, 1000), piece('n2', 300, 500)],
        SABUROKU_USABLE,
        3,
        'vertical',
        false,
      )
      expect(old.sheets[0].strips.map((st) => st.items.map((i) => i.placement.name))).toEqual([['w', 'n2'], ['n1']])
    })

    it('同じ幅の帯でも、残りの長さに刃厚ぶん入らなければ使わない', () => {
      // 300 の帯の残り：1820 − 1500 − 3 ＝ 317。長さ 317 は入り、318 は入らない（新しい帯）
      const fit = packGuillotine([piece('a', 300, 1500), piece('b', 300, 317)], SABUROKU_USABLE, 3, 'vertical')
      expect(fit.sheets[0].strips).toHaveLength(1)
      const over = packGuillotine([piece('a', 300, 1500), piece('b', 300, 318)], SABUROKU_USABLE, 3, 'vertical')
      expect(over.sheets[0].strips).toHaveLength(2)
    })
  })

  it('前の板の帯に空きがあれば、そこに戻して入れる（First Fit）', () => {
    // 1枚目：900幅の帯（長さ 1500）→ 2枚目：900幅の帯 → 小さい片は1枚目の帯の残り（1820−1500−3=317）に入る
    const r = packGuillotine(
      [piece('a', 900, 1500), piece('b', 900, 1500), piece('small', 200, 300)],
      SABUROKU_USABLE,
      3,
      'vertical',
    )
    expect(r.sheets).toHaveLength(2)
    expect(placements(r, 0).map((p) => p.name)).toEqual(['a', 'small'])
  })

  it('「回転してよい」は入る向きに回して詰める', () => {
    // 900幅の帯（長さ 1500）の残り 317 に、300×850 の片を横に倒して入れる
    const r = packGuillotine([piece('a', 900, 1500), piece('any', 300, 850, true)], SABUROKU_USABLE, 3, 'vertical')
    expect(r.sheets).toHaveLength(1)
    const p = placements(r, 0)[1]
    expect(rect(p)).toEqual({ x: 55, y: 17, w: 850, h: 300 })
    expect(p.rotated).toBe(true)
  })

  it('使える範囲に入らない片は板を出さずに unplaced に返す', () => {
    const r = packGuillotine([piece('big', 1000, 300)], SABUROKU_USABLE, 3, 'vertical')
    expect(r.sheets).toEqual([])
    expect(r.unplaced.map((p) => p.partId)).toEqual(['big'])
  })

  it('片がなければ板は0枚', () => {
    expect(packGuillotine([], SABUROKU_USABLE, 3, 'vertical').sheets).toEqual([])
  })

  it('150枚でも範囲内・重ならない・刃厚あき、すぐ終わる', () => {
    const ps: Piece[] = []
    for (let i = 0; i < 150; i++) ps.push(piece(`p${i}`, 100 + ((i * 37) % 400), 150 + ((i * 53) % 900), i % 3 === 0))
    const t = performance.now()
    const r = packGuillotine(ps, SABUROKU_USABLE, 3, 'vertical')
    expect(performance.now() - t).toBeLessThan(200)
    expect(r.sheets.flatMap((_, i) => placements(r, i))).toHaveLength(150)
    expectValid(r, SABUROKU_USABLE, 3)
  })
})

/** 横長に置いたサブロク（端切り5）：x は長手方向 0〜1815、y は妻手方向 5〜910（下の長手を端切り） */
const LANDSCAPE_USABLE: Rect = { x: 0, y: 5, w: 1815, h: 905 }

describe('packGuillotine 横切り優先（横長に置き、右から妻手の幅いっぱいの帯、帯の中は上から）', () => {
  it('見本（kidori のランバー18 と同じ片）：3×6 で3枚（1枚目 側板×2、2枚目 天地板×2＋棚板×2、3枚目 棚板×2）、ベニヤの片は1枚', () => {
    const r = lumber('horizontal')
    expect(names(r)).toEqual([
      ['側板', '側板'],
      ['天地板', '天地板', '棚板', '棚板'],
      ['棚板', '棚板'],
    ])
    expect(veneer('horizontal').sheets).toHaveLength(1)
  })

  it('1枚目：帯は右端 x=1815 に接し、妻手の高さいっぱい（y 5〜910）。側板は長手方向に寝かせ、上端 y=910 から下へ詰める', () => {
    const r = lumber('horizontal')
    expect(r.sheets[0].strips.map((s) => rect(s.rect))).toEqual([{ x: 5, y: 5, w: 1810, h: 905 }])
    expect(placements(r, 0).map((p) => rect(p))).toEqual([
      { x: 5, y: 500, w: 1810, h: 410 },
      { x: 5, y: 87, w: 1810, h: 410 },
    ])
  })

  it('2枚目・3枚目：帯は右から左へ刃厚3をあけて並ぶ。余りは左に残る', () => {
    const r = lumber('horizontal')
    expect(r.sheets[1].strips.map((s) => rect(s.rect))).toEqual([
      { x: 941, y: 5, w: 874, h: 905 },
      { x: 65, y: 5, w: 873, h: 905 },
    ])
    expect(placements(r, 1).map((p) => [p.name, rect(p)])).toEqual([
      ['天地板', { x: 941, y: 500, w: 874, h: 410 }],
      ['天地板', { x: 941, y: 87, w: 874, h: 410 }],
      ['棚板', { x: 65, y: 520, w: 873, h: 390 }],
      ['棚板', { x: 65, y: 127, w: 873, h: 390 }],
    ])
    expect(placements(r, 2).map((p) => rect(p))).toEqual([
      { x: 942, y: 520, w: 873, h: 390 },
      { x: 942, y: 127, w: 873, h: 390 },
    ])
  })

  it('見本のベニヤ：背板（回転しない。H＝長手方向）は右上 x 15〜1815・y 10〜910', () => {
    const r = veneer('horizontal')
    expect(rect(placements(r, 0)[0])).toEqual({ x: 15, y: 10, w: 1800, h: 900 })
  })

  it('回転しない片（W を妻手、H を長手）は rotated=false のまま', () => {
    const r = lumber('horizontal')
    expect(placements(r, 0)[0]).toMatchObject({ name: '側板', rotated: false, sizeLabel: '410×1810' })
  })

  it('見本のすべての片が範囲内・重ならない・間が刃厚以上', () => {
    expectValid(lumber('horizontal'), LANDSCAPE_USABLE, KERF)
    expectValid(veneer('horizontal'), LANDSCAPE_USABLE, KERF)
  })

  it('帯を並べる長さ（1815）：912 + 3 + 900 はぴったり入り（2本目が x=0 に届く）、913 だと次の板', () => {
    const fit = packGuillotine([piece('a', 600, 900), piece('b', 600, 912)], LANDSCAPE_USABLE, 3, 'horizontal')
    expect(fit.sheets).toHaveLength(1)
    expect(placements(fit, 0).map((p) => p.x)).toEqual([903, 0])
    const over = packGuillotine([piece('a', 600, 900), piece('b', 600, 913)], LANDSCAPE_USABLE, 3, 'horizontal')
    expect(over.sheets).toHaveLength(2)
  })

  it('帯の中の長さ（905）：492 + 3 + 410 はぴったり（最後の片が下の端切りの線 y=5 に届く）、493 は入らない', () => {
    const fit = packGuillotine([piece('a', 410, 800), piece('b', 492, 800)], LANDSCAPE_USABLE, 3, 'horizontal')
    expect(fit.sheets[0].strips).toHaveLength(1)
    expect(placements(fit, 0).map((p) => [p.y, p.y + p.h])).toEqual([
      [418, 910],
      [5, 415],
    ])
    const over = packGuillotine([piece('a', 410, 800), piece('b', 493, 800)], LANDSCAPE_USABLE, 3, 'horizontal')
    expect(over.sheets[0].strips).toHaveLength(2)
  })

  it('刃厚ぶん入らない：905 に 452 + 452 は刃厚3があるので同じ帯に入らない（刃厚0なら入る）', () => {
    expect(packGuillotine([piece('a', 452, 800), piece('b', 452, 800)], LANDSCAPE_USABLE, 3, 'horizontal').sheets[0].strips).toHaveLength(2)
    expect(packGuillotine([piece('a', 452, 800), piece('b', 452, 800)], LANDSCAPE_USABLE, 0, 'horizontal').sheets[0].strips).toHaveLength(1)
  })

  it('長手 1815 ぴったりの片は入り、1816 は入らない（右の妻手を端切りするため）', () => {
    expect(packGuillotine([piece('a', 300, 1815)], LANDSCAPE_USABLE, 3, 'horizontal').sheets).toHaveLength(1)
    const r = packGuillotine([piece('a', 300, 1816)], LANDSCAPE_USABLE, 3, 'horizontal')
    expect(r.sheets).toEqual([])
    expect(r.unplaced.map((p) => p.partId)).toEqual(['a'])
  })

  it('帯より細い片は帯の右端に寄せ、前の片の下に刃厚をあけて置く', () => {
    // 1100 の帯の左の残りは 1815 − 1100 − 3 ＝ 712 で、800 の帯は作れない
    const r = packGuillotine([piece('wide', 400, 1100), piece('narrow', 300, 800)], LANDSCAPE_USABLE, 3, 'horizontal')
    expect(r.sheets[0].strips).toHaveLength(1)
    expect(placements(r, 0).map((p) => rect(p))).toEqual([
      { x: 715, y: 510, w: 1100, h: 400 },
      { x: 1015, y: 207, w: 800, h: 300 },
    ])
  })

  it('150枚でも範囲内・重ならない・刃厚あき、すぐ終わる', () => {
    const ps: Piece[] = []
    for (let i = 0; i < 150; i++) ps.push(piece(`p${i}`, 100 + ((i * 37) % 400), 150 + ((i * 53) % 900), i % 3 === 0))
    const t = performance.now()
    const r = packGuillotine(ps, LANDSCAPE_USABLE, 3, 'horizontal')
    expect(performance.now() - t).toBeLessThan(200)
    expect(r.sheets.flatMap((_, i) => placements(r, i))).toHaveLength(150)
    expectValid(r, LANDSCAPE_USABLE, 3)
  })
})

/** 4×8（1220×2430）・端切り5 の使える範囲 */
const SHIHACHI = { width: 1220, length: 2430 }

describe('簡易版の見本（仕様書 6章の棚・木取り寸法・4×8・全部「回転してよい」）', () => {
  it('縦切り優先：2枚。1枚目は 天板 → 側板×2 → 棚板 の帯が右から 410 + 3 + 410 + 3 + 389 ＝ 1215 でぴったり並ぶ', () => {
    const r = packGuillotine(shelfRotatablePieces(), usableRect(SHIHACHI, 5, 'vertical'), KERF, 'vertical')
    expect(r.sheets).toHaveLength(2)
    expect(r.unplaced).toEqual([])
    expect(placements(r, 0).map((p) => [p.name, rect(p), p.rotated])).toEqual([
      ['天板', { x: 805, y: 620, w: 410, h: 1810 }, true],
      ['側板', { x: 392, y: 1720, w: 410, h: 710 }, true],
      ['側板', { x: 392, y: 1007, w: 410, h: 710 }, true],
      ['棚板', { x: 0, y: 660, w: 389, h: 1770 }, true],
    ])
    expect(placements(r, 1).map((p) => [p.name, rect(p)])).toEqual([
      ['棚板', { x: 826, y: 660, w: 389, h: 1770 }],
      ['棚板', { x: 434, y: 660, w: 389, h: 1770 }],
    ])
    expectValid(r, usableRect(SHIHACHI, 5, 'vertical'), KERF)
  })

  it('配置図の寸法は木取り寸法の W×H（回しても W×H のまま）', () => {
    const r = packGuillotine(shelfRotatablePieces(), usableRect(SHIHACHI, 5, 'vertical'), KERF, 'vertical')
    expect(placements(r, 0).map((p) => p.sizeLabel)).toEqual(['1810×410', '710×410', '710×410', '1770×389'])
  })

  it('横切り優先：2枚。範囲内・重ならない・刃厚あき', () => {
    const usable = usableRect(SHIHACHI, 5, 'horizontal')
    const r = packGuillotine(shelfRotatablePieces(), usable, KERF, 'horizontal')
    expect(r.sheets).toHaveLength(2)
    expect(names(r)).toEqual([
      ['側板', '天板', '棚板', '棚板'],
      ['側板', '棚板'],
    ])
    expectValid(r, usable, KERF)
  })

  it('4×8・端切り5：妻手 1215 ぴったりの片は入り、1216 は入らない（端切り0 なら 1220 まで入る）', () => {
    const u5 = usableRect(SHIHACHI, 5, 'vertical')
    expect(packGuillotine([piece('a', 1215, 2430)], u5, KERF, 'vertical').sheets).toHaveLength(1)
    expect(packGuillotine([piece('a', 1216, 2430)], u5, KERF, 'vertical').unplaced.map((p) => p.partId)).toEqual(['a'])
    expect(packGuillotine([piece('a', 1220, 2430)], usableRect(SHIHACHI, 0, 'vertical'), KERF, 'vertical').sheets).toHaveLength(1)
  })

  it('縦切り優先は長手を端切りしないので 2430 まで入り、横切り優先は 2425 まで', () => {
    expect(packGuillotine([piece('a', 300, 2430)], usableRect(SHIHACHI, 5, 'vertical'), KERF, 'vertical').sheets).toHaveLength(1)
    expect(packGuillotine([piece('a', 300, 2430)], usableRect(SHIHACHI, 5, 'horizontal'), KERF, 'horizontal').sheets).toEqual([])
    expect(packGuillotine([piece('a', 300, 2425)], usableRect(SHIHACHI, 5, 'horizontal'), KERF, 'horizontal').sheets).toHaveLength(1)
  })
})

/** 3×6 を刃厚・端切り 0 で（帯の幅・長さをそのまま数える） */
const WHOLE_SABUROKU: Rect = { x: 0, y: 0, w: 910, h: 1820 }
const runWay = (ps: () => Piece[]) => (sameWidthFirst: boolean) => packGuillotine(ps(), WHOLE_SABUROKU, 0, 'vertical', sameWidthFirst)

describe('同じ幅を優先するのは板が増えないときだけ（kidori 17.13・sameWidthChoice.test.ts。仕様書 7）', () => {
  // A 546×546 の帯の残りの長さ（1274）に B 364×546 が入る。同じ幅を優先すると B が新しい帯（幅 364）を作り、
  // 板の幅（910）を使い切るので、C 318×1820 が2枚目になる。今までの並べ方なら C は B の左の新しい帯に入って1枚
  const worse = () => [piece('A', 546, 546), piece('B', 364, 546), piece('C', 318, 1820)]

  it('同じ幅を優先すると1枚増える組み合わせ：それだけで並べると2枚、幅が収まる最初の帯に入れる並べ方なら1枚', () => {
    expect(runWay(worse)(true).sheets).toHaveLength(2)
    expect(runWay(worse)(false).sheets).toHaveLength(1)
  })

  it('chooseWay は両方を計算して、板の少ないほう（幅が収まる最初の帯に入れる並べ方）を使う', () => {
    const r = chooseWay(undefined, runWay(worse))
    expect(r.sheets).toHaveLength(1)
    expect(r.sheets).toEqual(runWay(worse)(false).sheets)
    expect(r.unplaced).toEqual([])
  })

  it('板の枚数が同じなら、同じ幅を優先する並べ方を使う（A は右端の帯、B・C は その左の幅 364 の帯）', () => {
    const ps = () => [piece('A', 546, 546), piece('B', 364, 546), piece('C', 364, 546)]
    const same = runWay(ps)(true)
    const old = runWay(ps)(false)
    expect([same.sheets.length, old.sheets.length]).toEqual([1, 1])
    const xs = (r: GuillotineResult) => Object.fromEntries(placements(r, 0).map((p) => [p.pieceId, p.x]))
    expect(xs(old)).not.toEqual(xs(same))
    const r = chooseWay(undefined, runWay(ps))
    expect(r.sheets).toEqual(same.sheets)
    expect(Object.values(xs(r)).sort((a, b) => a - b)).toEqual([0, 0, 364])
  })

  it('fixed を指定すると、その並べ方だけで計算する', () => {
    expect(chooseWay(true, runWay(worse)).sheets).toHaveLength(2)
    expect(chooseWay(false, runWay(worse)).sheets).toHaveLength(1)
  })

  it('比べ方：入らない片が少ないほう → 板が少ないほう → 同じなら同じ幅を優先するほう', () => {
    expect(preferSameWidth({ sheets: [1, 2], unplaced: [] }, { sheets: [1], unplaced: ['x'] })).toBe(true)
    expect(preferSameWidth({ sheets: [1], unplaced: ['x'] }, { sheets: [1, 2], unplaced: [] })).toBe(false)
    expect(preferSameWidth({ sheets: [1, 2], unplaced: [] }, { sheets: [1], unplaced: [] })).toBe(false)
    expect(preferSameWidth({ sheets: [1], unplaced: [] }, { sheets: [1], unplaced: [] })).toBe(true)
  })
})

describe('計算の速さ', () => {
  it('部材 150 枚を 4×8 に、両方の並べ方・両方の切り方（4回）で並べても 200ms 以内', () => {
    const ps: Piece[] = []
    for (let i = 0; i < 150; i++) ps.push(piece(`p${i}`, 100 + ((i * 37) % 500), 150 + ((i * 53) % 1200), i % 3 === 0))
    const t = performance.now()
    for (const mode of ['vertical', 'horizontal'] as const) {
      const r = chooseWay(undefined, (same) => packGuillotine(ps, usableRect(SHIHACHI, 5, mode), KERF, mode, same))
      expect(r.sheets.flatMap((_, i) => placements(r, i))).toHaveLength(150)
      expectValid(r, usableRect(SHIHACHI, 5, mode), KERF)
    }
    expect(performance.now() - t).toBeLessThan(200)
  })
})
