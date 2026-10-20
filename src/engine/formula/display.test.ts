import { describe, expect, it } from 'vitest'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts } from '../fixtures/shelf'
import { formulaLabels, formulaText, unitLabel } from './display'
import { formulaUnits } from './units'

describe('unitLabel・formulaLabels（単位の表示名）', () => {
  it(`全体.W - {n:${MELAMINE_ID}} * 12 → 全体.W・−・メラミン1・×・1・2（mm は付けない）`, () => {
    const adjusts = shelfAdjusts()
    const expr = `全体.W - {n:${MELAMINE_ID}} * 12`
    expect(formulaUnits(expr).map((u) => unitLabel(u, adjusts))).toEqual(['全体.W', '−', 'メラミン1', '×', '1', '2'])
  })

  it('シート0.5、÷ と + と括弧', () => {
    expect(formulaLabels(`(600 + {n:${SHEET_ID}}) / 2`, shelfAdjusts())).toEqual(['(', '6', '0', '0', '+', 'シート0.5', ')', '÷', '2'])
  })

  it('消した調整寸法は（削除した調整寸法）', () => {
    expect(formulaLabels('{n:gone} + 1', shelfAdjusts())).toEqual(['（削除した調整寸法）', '+', '1'])
  })

  it('調整寸法の寸法を変えると表示名もついてくる', () => {
    const adjusts = shelfAdjusts()
    adjusts[0].value = 2
    expect(formulaLabels(`天板.H - {n:${MELAMINE_ID}}`, adjusts)).toEqual(['天板.H', '−', 'メラミン2'])
  })

  it('調整寸法の名前を変えると表示もついてくる（ほぞ15 → ホゾ15）', () => {
    const adjusts = [...shelfAdjusts(), { id: 'adjust-hozo', name: 'ほぞ', value: 15 }]
    expect(formulaLabels('棚板.H + {n:adjust-hozo}', adjusts)).toEqual(['棚板.H', '+', 'ほぞ15'])
    adjusts[2].name = 'ホゾ'
    expect(formulaLabels('{n:adjust-hozo}', adjusts)).toEqual(['ホゾ15'])
  })

  it('全角で書いた部材の参照・数字は半角にそろえて見せる', () => {
    expect(formulaLabels('全体．Ｗ－１', shelfAdjusts())).toEqual(['全体.W', '−', '1'])
  })

  it('読めないかたまりはそのまま見せる', () => {
    expect(formulaLabels('abc', shelfAdjusts())).toEqual(['abc'])
  })
})

describe('formulaText（式を1行の文字にして見せる）', () => {
  it(`天板.H - 20 - {n:${MELAMINE_ID}} → 天板.H − 20 − メラミン1`, () => {
    expect(formulaText(`天板.H - 20 - {n:${MELAMINE_ID}}`, shelfAdjusts())).toBe('天板.H − 20 − メラミン1')
  })

  it('数字は続けて、記号の前後に空白、括弧の内側には空白を入れない', () => {
    expect(formulaText('(天板.W-20*2)/2', shelfAdjusts())).toBe('(天板.W − 20 × 2) ÷ 2')
  })

  it('先頭や ( の直後の − は符号なので空白を入れない', () => {
    expect(formulaText('-5+(-2)', shelfAdjusts())).toBe('−5 + (−2)')
  })

  it('数値だけならそのまま', () => {
    expect(formulaText('900', shelfAdjusts())).toBe('900')
    expect(formulaText('１２．５', shelfAdjusts())).toBe('12.5')
  })

  it('空の式は空', () => {
    expect(formulaText('  ', shelfAdjusts())).toBe('')
  })
})
