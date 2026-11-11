// 部材ごとの調整の式（第2.1版。仕様書 25.2）：仕上がり寸法に足し引きする値
import { describe, expect, it } from 'vitest'
import { usableAdjusts } from '../adjusts'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts } from '../fixtures/shelf'
import type { AdjustRow } from '../types'
import { evaluateAdjustExpr, isBlankAdjustExpr, parseAdjustExpr, REF_IN_ADJUST_MESSAGE } from './adjustExpr'

const adjusts = shelfAdjusts()
const calc = (expr: string) => evaluateAdjustExpr(expr, adjusts)

describe('evaluateAdjustExpr：調整の値', () => {
  it('−メラミン1×2 は −2（先頭の − で引く）', () => {
    expect(calc(`-{n:${MELAMINE_ID}}*2`)).toEqual({ ok: true, value: -2 })
    // 画面の書き方（全角の − と ×）でも同じ
    expect(calc(`−{n:${MELAMINE_ID}}×2`)).toEqual({ ok: true, value: -2 })
  })

  it('＋2・+2・2 はどれも +2（先頭の ＋ か記号なしで足す）', () => {
    expect(calc('＋2')).toEqual({ ok: true, value: 2 })
    expect(calc('+2')).toEqual({ ok: true, value: 2 })
    expect(calc('2')).toEqual({ ok: true, value: 2 })
  })

  it('−シート0.5 − メラミン1 は −1.5', () => {
    expect(calc(`−{n:${SHEET_ID}} − {n:${MELAMINE_ID}}`)).toEqual({ ok: true, value: -1.5 })
  })

  it('空・空白だけは 0（調整なし）', () => {
    expect(calc('')).toEqual({ ok: true, value: 0 })
    expect(calc('   ')).toEqual({ ok: true, value: 0 })
  })

  it('−2、＋メラミン1、(−2)×2、全角の数字も計算できる', () => {
    expect(calc('−2')).toEqual({ ok: true, value: -2 })
    expect(calc(`＋{n:${MELAMINE_ID}}`)).toEqual({ ok: true, value: 1 })
    expect(calc('(−2)×2')).toEqual({ ok: true, value: -4 })
    expect(calc('－１．５')).toEqual({ ok: true, value: -1.5 })
  })

  it('部材の寸法（天板.W）を入れるとエラー「調整には部材の寸法は使えません」', () => {
    const r = calc('天板.W')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ kind: 'syntax', message: REF_IN_ADJUST_MESSAGE })
    expect(REF_IN_ADJUST_MESSAGE).toBe('調整には部材の寸法は使えません')
    expect(calc('−2 − 天板.W').ok).toBe(false)
  })

  it('削除した調整寸法の id はエラー（削除した調整寸法を使っています）', () => {
    expect(calc('−{n:adjust-gone}')).toEqual({ ok: false, error: { kind: 'unknownAdjust', message: '削除した調整寸法を使っています' } })
  })

  it('書きかけの行（寸法が空）の id も、削除した調整寸法と同じエラー', () => {
    const rows: AdjustRow[] = [...shelfAdjusts(), { id: 'adjust-draft', name: '逃げ', value: null }]
    const r = evaluateAdjustExpr('−{n:adjust-draft}', usableAdjusts(rows))
    expect(r).toEqual({ ok: false, error: { kind: 'unknownAdjust', message: '削除した調整寸法を使っています' } })
  })

  it('「−」だけ・「＋」だけ・終わりが記号は、入れている途中の印', () => {
    for (const e of ['−', '-', '＋', `−{n:${MELAMINE_ID}}×`]) {
      const r = calc(e)
      expect(r.ok, e).toBe(false)
      if (!r.ok) expect(r.error, e).toMatchObject({ kind: 'syntax', incomplete: true })
    }
    const minus = calc('−')
    // 調整では部材の寸法は使えないので、案内は「数値か調整寸法」
    expect(!minus.ok && minus.error.message).toBe('式が「−」で終わっています（後ろに数値か調整寸法を入れてください）')
  })

  it('0 で割るとエラー', () => {
    expect(calc('2 ÷ 0')).toEqual({ ok: false, error: { kind: 'divideByZero', message: '0 で割っています' } })
  })

  it('記号の抜けは画面の言葉で（「2」と「メラミン1」の間に…）', () => {
    const r = calc(`2 {n:${MELAMINE_ID}}`)
    expect(!r.ok && r.error.message).toBe('「2」と「メラミン1」の間に ＋ − × ÷ のどれかを入れてください')
  })

  it('＋ は先頭だけ読む（途中の「×＋」はエラー）', () => {
    expect(calc('2 × ＋3').ok).toBe(false)
    expect(calc('＋＋2').ok).toBe(false)
  })
})

describe('parseAdjustExpr・isBlankAdjustExpr', () => {
  it('空は 0 の構文木', () => {
    expect(parseAdjustExpr('')).toEqual({ ok: true, ast: { type: 'number', value: 0 } })
  })

  it('isBlankAdjustExpr：空・空白だけが「調整なし」', () => {
    expect(isBlankAdjustExpr('')).toBe(true)
    expect(isBlankAdjustExpr('  ')).toBe(true)
    expect(isBlankAdjustExpr('0')).toBe(false)
    expect(isBlankAdjustExpr('−')).toBe(false)
  })
})
