// kidori の ui/formulaEdit.test.ts をもとに、D を外し、逃げを調整寸法にしたもの
import { describe, expect, it } from 'vitest'
import { formulaUnits } from '../engine/formula/units'
import {
  caretFromTap,
  clearAll,
  deleteBefore,
  insertAt,
  moveLeft,
  moveRight,
  canInsertRef,
  refCellsOf,
  refColorsOf,
  refPiece,
  REF_COLOR_COUNT,
  unitCount,
  type Edit,
  type PadKey,
} from './formulaEdit'

type Press = PadKey | { ref: string } | 'BS' | '◀' | '▶'

/** 空の式からボタンを順に押したときの結果 */
function press(...keys: Press[]): Edit {
  let e: Edit = { text: '', cursor: 0 }
  for (const k of keys) e = pressOn(e, k)
  return e
}

function pressOn(e: Edit, k: Press): Edit {
  if (k === 'BS') return deleteBefore(e.text, e.cursor)
  if (k === '◀') return { ...e, cursor: moveLeft(e.text, e.cursor) }
  if (k === '▶') return { ...e, cursor: moveRight(e.text, e.cursor) }
  if (typeof k === 'object') return insertAt(e.text, e.cursor, k.ref)
  return insertAt(e.text, e.cursor, k)
}

describe('ボタンだけで式を作る', () => {
  it('天地板 W＝全体.W - 側板.W * 2', () => {
    expect(press({ ref: '全体.W' }, '-', { ref: '側板.W' }, '*', '2')).toEqual({ text: '全体.W - 側板.W * 2', cursor: 5 })
  })
  it('棚板 W＝天地板.W - メラミン1（{n:…} は1つの単位）', () => {
    const e = press({ ref: '天地板.W' }, '-', { ref: '{n:adjust-melamine}' })
    expect(e).toEqual({ text: '天地板.W - {n:adjust-melamine}', cursor: 3 })
  })
  it('棚板 H＝全体.H - 20', () => {
    expect(press({ ref: '全体.H' }, '-', '2', '0').text).toBe('全体.H - 20')
  })
  it('括弧と小数', () => {
    expect(press('(', '9', '0', '0', '-', '1', '8', ')', '/', '2', '.', '5').text).toBe('(900 - 18) / 2.5')
  })
  it('先頭の - は前に空白を入れない', () => {
    expect(press('-', '5').text).toBe('- 5')
  })
  it('数字のすぐ後ろに参照を入れても、くっつかない', () => {
    expect(press('2', { ref: '全体.W' }).text).toBe('2 全体.W')
    expect(press({ ref: '全体.W' }, '2').text).toBe('全体.W 2')
  })
})

describe('カーソルの左右移動', () => {
  it('全体.W - 側板.W * 2 の末尾から ◀ 3回で 側板.W の前（塊は1回で越える）、そこで1字消すと - が消える', () => {
    const start = press({ ref: '全体.W' }, '-', { ref: '側板.W' }, '*', '2')
    let e = pressOn(start, '◀')
    e = pressOn(e, '◀')
    expect(e.cursor).toBe(3) // 側板.W の後ろ
    e = pressOn(e, '◀')
    expect(e.cursor).toBe(2) // 側板.W の前
    const units = formulaUnits(e.text)
    expect(units[e.cursor].text).toBe('側板.W')
    const del = pressOn(e, 'BS')
    expect(del).toEqual({ text: '全体.W 側板.W * 2', cursor: 1 })
  })
  it('12 の間にカーソルを置いて 3 を押すと 132', () => {
    const e = press('1', '2', '◀', '3')
    expect(e).toEqual({ text: '132', cursor: 2 })
  })
  it('端より先には動かない', () => {
    expect(moveLeft('12', 0)).toBe(0)
    expect(moveRight('12', 2)).toBe(2)
    expect(moveRight('全体.W - 1', 1)).toBe(2)
  })
  it('先頭に入れる', () => {
    expect(insertAt('- 20', 0, '全体.H')).toEqual({ text: '全体.H - 20', cursor: 1 })
  })
})

describe('1字消す・全部消す', () => {
  it('数字は1字ずつ', () => {
    expect(press('1', '2', 'BS')).toEqual({ text: '1', cursor: 1 })
  })
  it('参照・調整寸法は塊ごと、前の空白もいっしょに消す', () => {
    expect(press({ ref: '全体.W' }, '-', { ref: '側板.W' }, 'BS')).toEqual({ text: '全体.W -', cursor: 2 })
    expect(press({ ref: '天地板.W' }, '-', { ref: '{n:adjust-melamine}' }, 'BS').text).toBe('天地板.W -')
  })
  it('消したあとで前後がくっつかない', () => {
    expect(deleteBefore('全体.W -2', 2)).toEqual({ text: '全体.W 2', cursor: 1 })
    expect(unitCount('全体.W 2')).toBe(2)
  })
  it('先頭を消すと、残りの前の空白も消える', () => {
    expect(deleteBefore('1 - 2', 1)).toEqual({ text: '- 2', cursor: 0 })
  })
  it('カーソルが先頭なら何もしない', () => {
    expect(deleteBefore('12', 0)).toEqual({ text: '12', cursor: 0 })
    expect(deleteBefore('', 0)).toEqual({ text: '', cursor: 0 })
  })
  it('全部消す', () => {
    expect(clearAll()).toEqual({ text: '', cursor: 0 })
  })
})

describe('仕様書 6章の例をボタンだけで作る', () => {
  it('棚板 W＝天板.W − 20 − メラミン1、H＝天板.H − 20 × 2', () => {
    expect(press({ ref: '天板.W' }, '-', '2', '0', '-', { ref: '{n:adjust-melamine}' }).text).toBe('天板.W - 20 - {n:adjust-melamine}')
    expect(press({ ref: '天板.H' }, '-', '2', '0', '*', '2').text).toBe('天板.H - 20 * 2')
  })
})

describe('先頭や途中にカーソルを動かして入れる（仕様書 18.5）', () => {
  it('オーナーの例：「全体.W − 厚み20」の先頭に 5・0・＋ → 「50 + 全体.W − 厚み20」（05 にならない・間に空白が入らない）', () => {
    let e: Edit = press({ ref: '全体.W' }, '-', { ref: '{n:adjust-a}' })
    e = { ...e, cursor: 0 }
    e = pressOn(e, '5')
    expect(e).toEqual({ text: '5 全体.W - {n:adjust-a}', cursor: 1 })
    e = pressOn(e, '0')
    expect(e).toEqual({ text: '50 全体.W - {n:adjust-a}', cursor: 2 })
    e = pressOn(e, '+')
    expect(e).toEqual({ text: '50 + 全体.W - {n:adjust-a}', cursor: 3 })
  })
  it('途中の数字のあとに数字を足すと、前の数字に続く（「20 − 5」の 2 のあとに 1 → 「210 − 5」）', () => {
    const e = pressOn({ text: '20 - 5', cursor: 1 }, '1')
    expect(e).toEqual({ text: '210 - 5', cursor: 2 })
  })
  it('数字の前に記号を入れると、間に空白をはさむ（「全体.W 20」の 20 の前に − → 「全体.W - 20」）', () => {
    expect(pressOn({ text: '全体.W 20', cursor: 1 }, '-')).toEqual({ text: '全体.W - 20', cursor: 2 })
  })
})

describe('式を押してカーソルを動かす（仕様書 18.7）', () => {
  // 1行に 3つの単位：[0,10] [12,60]（塊） [62,70]
  const boxes = [
    { left: 0, right: 10, top: 0, bottom: 20 },
    { left: 12, right: 60, top: 0, bottom: 20 },
    { left: 62, right: 70, top: 0, bottom: 20 },
  ]
  it('単位の左半分を押すと前、右半分を押すと後ろ（塊の中は近いほうの端）', () => {
    expect(caretFromTap(boxes, 3, 10)).toBe(0)
    expect(caretFromTap(boxes, 8, 10)).toBe(1)
    expect(caretFromTap(boxes, 20, 10)).toBe(1)
    expect(caretFromTap(boxes, 50, 10)).toBe(2)
    expect(caretFromTap(boxes, 69, 10)).toBe(3)
  })
  it('単位の間・左の外・右の外', () => {
    expect(caretFromTap(boxes, 11, 10)).toBe(1)
    expect(caretFromTap(boxes, -5, 10)).toBe(0)
    expect(caretFromTap(boxes, 200, 10)).toBe(3)
  })
  it('折り返して2行になったら、押した高さに近い行の中で決める', () => {
    const two = [
      { left: 0, right: 50, top: 0, bottom: 20 },
      { left: 0, right: 30, top: 22, bottom: 42 },
      { left: 32, right: 40, top: 22, bottom: 42 },
    ]
    expect(caretFromTap(two, 45, 10)).toBe(1)
    expect(caretFromTap(two, 5, 30)).toBe(1)
    expect(caretFromTap(two, 100, 30)).toBe(3)
    expect(caretFromTap(two, 100, 5)).toBe(1)
  })
  it('単位が無ければ 0', () => {
    expect(caretFromTap([], 10, 10)).toBe(0)
  })
})

describe('「＝」なしで式を打つ：セルを押して寸法を入れるか（仕様書 25.7）', () => {
  const end = (t: string) => unitCount(t)
  it('欄が空（空白だけ）なら入れる', () => {
    expect(canInsertRef('', 0)).toBe(true)
    expect(canInsertRef('  ', 0)).toBe(true)
  })

  it('カーソルのすぐ前が ＋ − × ÷ ( なら入れる（全角・× ÷ − も）', () => {
    for (const t of ['天板.W -', '400 +', '2 *', '1800 /', '(', '－', '天板.W ×', '1800 ÷', '天板.W −', '（']) {
      expect(canInsertRef(t, end(t)), t).toBe(true)
    }
    // 先頭の「−」（符号）の後ろも入れる（［調整］の −メラミン1 など）
    expect(canInsertRef('-', 1)).toBe(true)
  })

  it('数字・寸法・) のすぐ後は入れない（入力を終えて押したセルを選ぶ）', () => {
    for (const t of ['天板.W - 20', '400', '天板.W', '(1800 - 40)', '{n:adjust-1}']) {
      expect(canInsertRef(t, end(t)), t).toBe(false)
    }
  })

  it('カーソルの位置で決める（式の途中の記号の後ろなら入れる・先頭で後ろに何かあるなら入れない）', () => {
    // 「天板.W - 20」の「-」の後ろ（単位の番号 2）
    expect(canInsertRef('天板.W - 20', 2)).toBe(true)
    expect(canInsertRef('天板.W - 20', 1)).toBe(false)
    expect(canInsertRef('天板.W - 20', 0)).toBe(false)
  })

  it('「＝」で始まる古い式は「＝」を外した形で見る', () => {
    expect(canInsertRef('=天板.W -', 2)).toBe(true)
    expect(canInsertRef('＝400', 3)).toBe(false)
    expect(canInsertRef('=', 0)).toBe(true)
  })

  it('セルを押して入れた寸法は、カーソルの位置に入る（天板.W のあとに − 2 0）', () => {
    const e1 = insertAt('', 0, '天板.W')
    const e2 = pressOn(pressOn(pressOn(e1, '-'), '2'), '0')
    expect(e2.text).toBe('天板.W - 20')
  })
})

describe('refColorsOf（式に入っている部材の色の枠の番号）', () => {
  it('出てきた順に 0, 1, 2…。同じ部材は同じ番号（W・H とも）', () => {
    const m = refColorsOf('天板.W - 側板.H * 2 + 天板.H')
    expect([...m.entries()]).toEqual([
      ['天板', 0],
      ['側板', 1],
    ])
  })

  it('全角で書いた名前もそろえて同じ部材にする', () => {
    expect([...refColorsOf('ＡＢ.W + AB.H').entries()]).toEqual([['AB', 0]])
  })

  it('色の数より多いときは、はじめの色に戻る', () => {
    const expr = Array.from({ length: REF_COLOR_COUNT + 1 }, (_, i) => `P${i}.W`).join(' + ')
    expect(refColorsOf(expr).get(`P${REF_COLOR_COUNT}`)).toBe(0)
  })

  it('参照の無い式は空', () => {
    expect(refColorsOf('1800 - {n:adjust-1}').size).toBe(0)
  })
})

describe('refCellsOf（色の枠を付けるセル）', () => {
  it('式に入っている 部材名.W・部材名.H だけ（全角はそろえる）', () => {
    expect([...refCellsOf('天板.W - 側板．Ｈ * 2 + 天板.W')]).toEqual(['天板.W', '側板.H'])
  })
})

describe('厚みのセルを押して 天板.T を入れる（第2.2版。仕様書 26.1）', () => {
  it('W・H・厚みの列は「部材名.列」、名前・枚数の列は入れない', () => {
    expect(refPiece('天板', 'T')).toBe('天板.T')
    expect(refPiece('天板', 'W')).toBe('天板.W')
    expect(refPiece('天板', 'H')).toBe('天板.H')
    expect(refPiece('天板', 'name')).toBeNull()
    expect(refPiece('天板', 'qty')).toBeNull()
  })

  it('全体.H − の後で天板の厚みを押し、× 2 で 全体.H - 天板.T * 2', () => {
    const e1 = insertAt('', 0, '全体.H')
    const e2 = pressOn(e1, '-')
    expect(canInsertRef(e2.text, e2.cursor)).toBe(true)
    const e3 = insertAt(e2.text, e2.cursor, refPiece('天板', 'T')!)
    const e4 = pressOn(pressOn(e3, '*'), '2')
    expect(e4.text).toBe('全体.H - 天板.T * 2')
    // 天板.T のすぐ後では入れない（入力を終えて押したセルを選ぶ）
    expect(canInsertRef(e3.text, e3.cursor)).toBe(false)
  })

  it('天板.T も色の枠の部材に数え、厚みのセルに枠を付ける', () => {
    expect([...refColorsOf('全体.H - 天板.T * 2').entries()]).toEqual([
      ['全体', 0],
      ['天板', 1],
    ])
    expect([...refCellsOf('全体.H - 天板．Ｔ * 2')]).toEqual(['全体.H', '天板.T'])
  })

  it('天板.T は1つの塊として消える', () => {
    expect(deleteBefore('全体.H - 天板.T', unitCount('全体.H - 天板.T'))).toEqual({ text: '全体.H -', cursor: 2 })
  })
})
