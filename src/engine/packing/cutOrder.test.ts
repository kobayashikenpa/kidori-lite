// kidori の packing/cutOrder.test.ts をもとに、材料ごとの片（expandPieces）を決まった大きさの片（fixtures/pieces.ts）にしたもの。
// 「見本」は kidori の見本（本棚）のランバー18・ベニヤ4 と同じ大きさの片で、切る順番の値は kidori と同じ
import { describe, expect, it } from 'vitest'
import { kidoriLumberPieces, kidoriVeneerPieces, piece, shelfRotatablePieces } from '../fixtures/pieces'
import type { CutStep, Placement, Rect } from '../types'
import { buildCuts } from './cutOrder'
import { packGuillotine, type StripMode } from './guillotine'
import type { Piece } from './pieces'
import { usableRect } from './sheet'

const BOARD = { width: 910, length: 1820 }
/** 横長に置いた板の全体（x は長手方向、y は妻手方向） */
const LANDSCAPE: Rect = { x: 0, y: 0, w: 1820, h: 910 }
const PORTRAIT: Rect = { x: 0, y: 0, w: 910, h: 1820 }

const LUMBER = 'lumber'
const VENEER = 'veneer'

/** 3×6・刃厚3・端切り5 で並べて切る順番を出す */
function cutsOf(kind: typeof LUMBER | typeof VENEER, mode: StripMode) {
  const pieces = kind === LUMBER ? kidoriLumberPieces() : kidoriVeneerPieces()
  const r = packGuillotine(pieces, usableRect(BOARD, 5, mode), 3, mode)
  return r.sheets.map((sh) => ({
    cuts: buildCuts(sh, r.frame, BOARD, 5),
    placements: sh.strips.flatMap((s) => s.items.map((i) => i.placement)),
  }))
}

const same = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6

/**
 * 板全体から始めて、切る順番どおりに長方形を2つに分けていく。
 * どの切断も「今ある長方形の1つ」を端から端まで一直線に切ること（ギロチン）を確かめ、
 * 最後に残った長方形の中に、配置した片がそのままの形で1つずつあることを確かめる。
 * 刃厚は、測った側（右端・上端から◯mm の◯mm の側）の反対側で消える。
 * 縦に切るときは線の左、「上端から」の横の切断は線の下。端切りの幅は刃厚を含むので、端切りでは刃厚を引かない
 * （縦切り優先：右の長手、横切り優先：下の長手 → 右の妻手）
 */
function expectGuillotine(cuts: CutStep[], placements: Placement[], whole: Rect, kerf: number) {
  let rects: Rect[] = [whole]
  cuts.forEach((c, i) => {
    expect(c.no).toBe(i + 1)
    const idx = rects.findIndex((r) => same(r, c.within))
    expect(idx, `切断 ${c.no} の範囲が、その時点の長方形のどれとも一致しない`).toBeGreaterThanOrEqual(0)
    const r = rects[idx]
    const next: Rect[] = []
    const k = c.kind === 'trim' ? 0 : kerf
    if (c.direction === 'vertical') {
      expect(c.label).toMatch(c.kind === 'trim' ? /^端切り：右の/ : /^右端から /)
      expect(c.at).toBeGreaterThan(r.x)
      expect(c.at).toBeLessThan(r.x + r.w)
      next.push({ x: c.at, y: r.y, w: r.x + r.w - c.at, h: r.h })
      const leftEnd = c.at - k
      if (leftEnd > r.x) next.push({ x: r.x, y: r.y, w: leftEnd - r.x, h: r.h })
    } else {
      // 横の切断は、上側（線より上）が測った側。刃厚は線の下で消える
      expect(c.label).toMatch(c.kind === 'trim' ? /^端切り：下の長手/ : /^上端から /)
      expect(c.at).toBeGreaterThan(r.y)
      expect(c.at).toBeLessThan(r.y + r.h)
      next.push({ x: r.x, y: c.at, w: r.w, h: r.y + r.h - c.at })
      const downEnd = c.at - k
      if (downEnd > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: downEnd - r.y })
    }
    rects = [...rects.slice(0, idx), ...next, ...rects.slice(idx + 1)]
  })
  for (const p of placements) {
    expect(rects.filter((r) => same(r, p)), `${p.pieceId} が切り出されていない`).toHaveLength(1)
  }
}

describe('buildCuts（切る順番）', () => {
  it('見本・縦切り優先の1枚目：端切り → 右端から410mmの縦 → 側板を切り分け → 次の帯', () => {
    const [s1] = cutsOf(LUMBER, 'vertical')
    expect(s1.cuts.map((c) => [c.no, c.kind, c.direction, c.at, c.label])).toEqual([
      [1, 'trim', 'vertical', 905, '端切り：右の長手を 5mm 落とす（縦に切る）'],
      [2, 'strip', 'vertical', 495, '右端から 410mm で縦に切る'],
      [3, 'crosscut', 'horizontal', 10, '上端から 1810mm で横に切る'],
      [4, 'strip', 'vertical', 82, '右端から 410mm で縦に切る'],
      [5, 'crosscut', 'horizontal', 10, '上端から 1810mm で横に切る'],
    ])
    expect(s1.cuts[0].within).toEqual({ x: 0, y: 0, w: 910, h: 1820 })
    expect(s1.cuts[1].within).toEqual({ x: 0, y: 0, w: 905, h: 1820 })
    expect(s1.cuts[2].within).toEqual({ x: 495, y: 0, w: 410, h: 1820 })
    expect(s1.cuts[3].within).toEqual({ x: 0, y: 0, w: 492, h: 1820 })
  })

  it('見本・縦切り優先の2枚目：帯の中は上（奥）から、残りの上端から片の長さずつ横に切る', () => {
    const s2 = cutsOf(LUMBER, 'vertical')[1]
    expect(s2.cuts.map((c) => [c.kind, c.at, c.label])).toEqual([
      ['trim', 905, '端切り：右の長手を 5mm 落とす（縦に切る）'],
      ['strip', 495, '右端から 410mm で縦に切る'],
      ['crosscut', 946, '上端から 874mm で横に切る'],
      ['crosscut', 69, '上端から 874mm で横に切る'],
      ['strip', 102, '右端から 390mm で縦に切る'],
      ['crosscut', 947, '上端から 873mm で横に切る'],
      ['crosscut', 71, '上端から 873mm で横に切る'],
    ])
  })

  it('見本のすべての板・両方の切り方で、切断がギロチン（端から端まで一直線）で、片がすべて切り出せる', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
      for (const id of [LUMBER, VENEER] as const) {
        for (const s of cutsOf(id, mode)) expectGuillotine(s.cuts, s.placements, mode === 'vertical' ? PORTRAIT : LANDSCAPE, 3)
      }
    }
  })

  it('見本・横切り優先の1枚目：端切り（下の長手 → 右の妻手）→ 右端から1810mmの縦 → 上端から410mmの横 ×2', () => {
    const [s1] = cutsOf(LUMBER, 'horizontal')
    expect(s1.cuts.map((c) => [c.no, c.kind, c.direction, c.at, c.label])).toEqual([
      [1, 'trim', 'horizontal', 5, '端切り：下の長手を 5mm 落とす（横に切る）'],
      [2, 'trim', 'vertical', 1815, '端切り：右の妻手を 5mm 落とす（縦に切る）'],
      [3, 'strip', 'vertical', 5, '右端から 1810mm で縦に切る'],
      [4, 'crosscut', 'horizontal', 500, '上端から 410mm で横に切る'],
      [5, 'crosscut', 'horizontal', 87, '上端から 410mm で横に切る'],
    ])
    expect(s1.cuts.map((c) => c.within)).toEqual([
      { x: 0, y: 0, w: 1820, h: 910 },
      { x: 0, y: 5, w: 1820, h: 905 },
      { x: 0, y: 5, w: 1815, h: 905 },
      { x: 5, y: 5, w: 1810, h: 905 },
      { x: 5, y: 5, w: 1810, h: 492 },
    ])
  })

  it('横切り優先：片は下の長手の端切り（y 0〜5）に掛からず、上端（y 910）にぴったり届く', () => {
    for (const s of cutsOf(LUMBER, 'horizontal')) {
      for (const p of s.placements) expect(p.y).toBeGreaterThanOrEqual(5)
      expect(Math.max(...s.placements.map((p) => p.y + p.h))).toBe(910)
    }
  })

  it('見本・横切り優先の2枚目：2本目の帯も残りの右端から測る（右端から 873mm）', () => {
    const [, s2] = cutsOf(LUMBER, 'horizontal')
    expect(s2.cuts.map((c) => [c.kind, c.at, c.label])).toEqual([
      ['trim', 5, '端切り：下の長手を 5mm 落とす（横に切る）'],
      ['trim', 1815, '端切り：右の妻手を 5mm 落とす（縦に切る）'],
      ['strip', 941, '右端から 874mm で縦に切る'],
      ['crosscut', 500, '上端から 410mm で横に切る'],
      ['crosscut', 87, '上端から 410mm で横に切る'],
      ['strip', 65, '右端から 873mm で縦に切る'],
      ['crosscut', 520, '上端から 390mm で横に切る'],
      ['crosscut', 127, '上端から 390mm で横に切る'],
    ])
  })

  it('横切り優先で端切り0 なら端切りの切断はない', () => {
    const usable = { x: 0, y: 0, w: 1820, h: 910 }
    const r = packGuillotine([piece('a', 400, 1000)], usable, 3, 'horizontal')
    const cuts = buildCuts(r.sheets[0], r.frame, BOARD, 0)
    expect(cuts.map((c) => [c.kind, c.direction, c.at])).toEqual([
      ['strip', 'vertical', 820],
      ['crosscut', 'horizontal', 510],
    ])
    expectGuillotine(cuts, r.sheets[0].strips[0].items.map((i) => i.placement), LANDSCAPE, 3)
  })

  it('横切り優先で帯より細い片は、縦に切って長さを切り揃える（右端から）', () => {
    // 帯の中に幅の違う片が並ぶ配置を作るため、kidori 第2.4版までの並べ方（sameWidthFirst: false）で並べる
    const r = packGuillotine([piece('wide', 400, 1000), piece('narrow', 300, 800)], usableRect(BOARD, 5, 'horizontal'), 3, 'horizontal', false)
    const cuts = buildCuts(r.sheets[0], r.frame, BOARD, 5)
    expect(cuts.at(-1)).toMatchObject({ kind: 'rip', direction: 'vertical', at: 1015, label: '右端から 800mm で縦に切る' })
    expectGuillotine(cuts, r.sheets[0].strips[0].items.map((i) => i.placement), LANDSCAPE, 3)
  })

  it('板の端にぴったり届く帯・片には切断を入れない', () => {
    // 幅 905・長さ 1820 の片1枚：端切りだけ
    const usable = { x: 0, y: 0, w: 905, h: 1820 }
    const r = packGuillotine([piece('full', 905, 1820)], usable, 3, 'vertical')
    const cuts = buildCuts(r.sheets[0], r.frame, BOARD, 5)
    expect(cuts.map((c) => c.kind)).toEqual(['trim'])
  })

  it('縦切り優先で端切り0 なら端切りの切断はない', () => {
    const usable = { x: 0, y: 0, w: 910, h: 1820 }
    const r = packGuillotine([piece('a', 400, 1000)], usable, 3, 'vertical')
    const cuts = buildCuts(r.sheets[0], r.frame, BOARD, 0)
    expect(cuts.map((c) => [c.no, c.kind, c.at])).toEqual([
      [1, 'strip', 510],
      [2, 'crosscut', 820],
    ])
    expectGuillotine(cuts, r.sheets[0].strips[0].items.map((i) => i.placement), PORTRAIT, 3)
  })

  it('帯より細い片は、切り分けたあとに幅を切り揃える', () => {
    const usable = { x: 0, y: 0, w: 905, h: 1820 }
    const r = packGuillotine([piece('wide', 400, 1000), piece('narrow', 300, 800)], usable, 3, 'vertical', false)
    const cuts = buildCuts(r.sheets[0], r.frame, BOARD, 5)
    expect(cuts.map((c) => [c.kind, c.direction, c.at, c.label])).toEqual([
      ['trim', 'vertical', 905, '端切り：右の長手を 5mm 落とす（縦に切る）'],
      ['strip', 'vertical', 505, '右端から 400mm で縦に切る'],
      ['crosscut', 'horizontal', 820, '上端から 1000mm で横に切る'],
      ['crosscut', 'horizontal', 17, '上端から 800mm で横に切る'],
      ['rip', 'vertical', 605, '右端から 300mm で縦に切る'],
    ])
    expect(cuts[3].within).toEqual({ x: 505, y: 0, w: 400, h: 817 })
    expect(cuts[4].within).toEqual({ x: 505, y: 17, w: 400, h: 800 })
    expectGuillotine(cuts, r.sheets[0].strips[0].items.map((i) => i.placement), PORTRAIT, 3)
  })

  it('たくさんの片でも、どの切断もギロチンで片がすべて切り出せる', () => {
    const ps: Piece[] = []
    for (let i = 0; i < 150; i++) ps.push(piece(`p${i}`, 100 + ((i * 37) % 400), 150 + ((i * 53) % 900)))
    for (const mode of ['vertical', 'horizontal'] as const) {
      const r = packGuillotine(ps, usableRect(BOARD, 5, mode), 3, mode)
      for (const sh of r.sheets) {
        const whole = mode === 'vertical' ? PORTRAIT : LANDSCAPE
        expectGuillotine(buildCuts(sh, r.frame, BOARD, 5), sh.strips.flatMap((s) => s.items.map((i) => i.placement)), whole, 3)
      }
    }
  })
})

describe('簡易版の見本（仕様書 6章の棚・4×8・全部「回転してよい」）の切る順番', () => {
  const SHIHACHI = { width: 1220, length: 2430 }

  it('縦切り優先の1枚目：端切り → 右端から 410mm（天板の帯）→ 天板を切り分け → 側板の帯 → … 最後の棚板の帯は左端に届くので帯を切り離さない', () => {
    const r = packGuillotine(shelfRotatablePieces(), usableRect(SHIHACHI, 5, 'vertical'), 3, 'vertical')
    const cuts = buildCuts(r.sheets[0], r.frame, SHIHACHI, 5)
    expect(cuts.map((c) => [c.kind, c.at, c.label])).toEqual([
      ['trim', 1215, '端切り：右の長手を 5mm 落とす（縦に切る）'],
      ['strip', 805, '右端から 410mm で縦に切る'],
      ['crosscut', 620, '上端から 1810mm で横に切る'],
      ['strip', 392, '右端から 410mm で縦に切る'],
      ['crosscut', 1720, '上端から 710mm で横に切る'],
      ['crosscut', 1007, '上端から 710mm で横に切る'],
      ['crosscut', 660, '上端から 1770mm で横に切る'],
    ])
  })

  it('両方の切り方で、切断がギロチンで片がすべて切り出せる', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
      const r = packGuillotine(shelfRotatablePieces(), usableRect(SHIHACHI, 5, mode), 3, mode)
      const whole = mode === 'vertical' ? { x: 0, y: 0, w: 1220, h: 2430 } : { x: 0, y: 0, w: 2430, h: 1220 }
      for (const sh of r.sheets) {
        expectGuillotine(buildCuts(sh, r.frame, SHIHACHI, 5), sh.strips.flatMap((s) => s.items.map((i) => i.placement)), whole, 3)
      }
    }
  })
})
