// 式の構文解析のエラー：入れている途中の印（仕様書 18.5）と、画面に見えている言葉のエラーの文（仕様書 18.6）。第1.4版
import { describe, expect, it } from 'vitest'
import type { Adjust } from '../types'
import { EMPTY_FORMULA_MESSAGE, isIncompleteFormula, parse, type FormulaError } from './parse'

const adjusts: Adjust[] = [
  { id: 'メラミン', name: 'メラミン', value: 1 },
  { id: 'adjust-sheet', name: 'シート', value: 0.5 },
]

function errorOf(expr: string, list: readonly Adjust[] | undefined = adjusts): FormulaError {
  const r = parse(expr, list)
  if (r.ok) throw new Error(`読めてしまった：${expr}`)
  return r.error
}

describe('入れている途中の印（incomplete）', () => {
  it.each([
    ['全体.W -', '式が「−」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['全体.W −', '式が「−」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['全体.W +', '式が「+」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['全体.W *', '式が「×」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['全体.W ÷', '式が「÷」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['(', '式が「(」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['全体.W - (', '式が「(」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['-', '式が「−」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['全体.W - -', '式が「−」で終わっています（後ろに数値か部材の寸法を入れてください）'],
    ['(全体.W - 20', '閉じかっこ「)」が足りません'],
    ['((1 + 2) * 3', '閉じかっこ「)」が足りません'],
    ['全体.W - 1.', '「1.」の小数点の後ろに数字を入れてください'],
    ['', EMPTY_FORMULA_MESSAGE],
    ['   ', EMPTY_FORMULA_MESSAGE],
  ])('「%s」は途中の印が付く：%s', (expr, message) => {
    const e = errorOf(expr)
    expect(e.kind).toBe('syntax')
    expect(e.incomplete).toBe(true)
    expect(e.message).toBe(message)
    expect(isIncompleteFormula(expr)).toBe(true)
  })

  it.each([
    ['全体.W {n:メラミン}'],
    ['全体.W 0'],
    ['( )'],
    ['全体.W - )'],
    ['1 + 2)'],
    ['* 2'],
    ['1 + * 2'],
    ['1. + 2'],
    ['全体'],
    ['天板.D'],
  ])('「%s」は途中ではないエラー（入力中も出す）', (expr) => {
    const e = errorOf(expr)
    expect(e.incomplete).toBeUndefined()
    expect(isIncompleteFormula(expr)).toBe(false)
  })

  it('読める式は途中ではない', () => {
    expect(isIncompleteFormula('全体.W - 20')).toBe(false)
    expect(isIncompleteFormula('(全体.W - 20) / 2')).toBe(false)
  })

  it('途中の形より前に別のエラーがあれば、そのエラー（途中の印なし）', () => {
    const e = errorOf('全体.W 0 -')
    expect(e.incomplete).toBeUndefined()
    expect(e.message).toBe('「全体.W」と「0」の間に ＋ − × ÷ のどれかを入れてください')
  })
})

describe('エラーの文は画面に見えている言葉で（仕様書 18.6）', () => {
  it('記号が抜けている：調整寸法は表示名で「「全体.W」と「メラミン1」の間に ＋ − × ÷ のどれかを入れてください」', () => {
    const e = errorOf('全体.W {n:メラミン}')
    expect(e.message).toBe('「全体.W」と「メラミン1」の間に ＋ − × ÷ のどれかを入れてください')
    expect(e.message).not.toContain('{n:')
  })

  it('記号が抜けている（数字のときも同じ形）：「「全体.W」と「0」の間に …」', () => {
    expect(errorOf('全体.W 0').message).toBe('「全体.W」と「0」の間に ＋ − × ÷ のどれかを入れてください')
  })

  it('全角で書いた数字・参照も、そろえた形で出す', () => {
    expect(errorOf('全体．Ｗ　１０').message).toBe('「全体.W」と「10」の間に ＋ − × ÷ のどれかを入れてください')
  })

  it('調整寸法が先・かっこのあと・かっこの中でも同じ形', () => {
    expect(errorOf('{n:adjust-sheet} 全体.W').message).toBe('「シート0.5」と「全体.W」の間に ＋ − × ÷ のどれかを入れてください')
    expect(errorOf('(全体.W - 20) 2').message).toBe('「)」と「2」の間に ＋ − × ÷ のどれかを入れてください')
    expect(errorOf('(全体.W 2)').message).toBe('「全体.W」と「2」の間に ＋ − × ÷ のどれかを入れてください')
    expect(errorOf('2 (3)').message).toBe('「2」と「(」の間に ＋ − × ÷ のどれかを入れてください')
  })

  it('削除した調整寸法は「（削除した調整寸法）」、調整寸法の一覧を渡さなければ「調整寸法」', () => {
    expect(errorOf('全体.W {n:gone}').message).toBe('「全体.W」と「（削除した調整寸法）」の間に ＋ − × ÷ のどれかを入れてください')
    expect((parse('全体.W {n:メラミン}') as { error: FormulaError }).error.message).toBe('「全体.W」と「調整寸法」の間に ＋ − × ÷ のどれかを入れてください')
  })

  it('記号の位置がおかしい：× ÷ − で書く', () => {
    expect(errorOf('* 2').message).toBe('式の始めに「×」は置けません')
    expect(errorOf('1 + * 2').message).toBe('「+」のすぐ後ろに「×」は置けません')
    expect(errorOf('1 - / 2').message).toBe('「−」のすぐ後ろに「÷」は置けません')
    expect(errorOf('全体.W - )').message).toBe('「−」のすぐ後ろに「)」は置けません')
  })

  it('かっこ', () => {
    expect(errorOf('( )').message).toBe('かっこ「( )」の中が空です')
    expect(errorOf('1 + 2)').message).toBe('閉じかっこ「)」が多すぎます（対になる「(」がありません）')
  })

  it('エラーの位置は、問題の字句（記号が抜けているときは後ろの値）', () => {
    const e = errorOf('全体.W 0')
    expect([e.start, e.end]).toEqual([5, 6])
    const t = errorOf('全体.W -')
    expect([t.start, t.end]).toEqual([6, 6])
  })

  it('部材名だけ（.W・.H なし）は書き方を示す', () => {
    expect(errorOf('全体 - 20').message).toBe('「全体」が読めません（部材の寸法は「全体.W」「全体.H」のように書きます）')
  })

  it('どのエラーの文にも、中の書き方（{n: と * / -）を出さない', () => {
    for (const expr of ['全体.W {n:メラミン}', '全体.W 0', '1 * * 2', '1 / / 2', '全体.W -', '{n:メラミン} -', '(1 - 2', '1 - - * 2']) {
      const m = errorOf(expr).message
      expect(m).not.toMatch(/\{n:|[*/-]/)
    }
  })
})
