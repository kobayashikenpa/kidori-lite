import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { MELAMINE_ID, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import type { CellRange, DimensionError } from '../engine/types'
import { adjustRowBar, barErrors, barField, partBar } from './fxBar'

const at = (top: number, left: number, rows = 1, cols = 1): CellRange => ({ top, left, rows, cols })

describe('式の欄に出す中身（仕様書 25.8）', () => {
  const parts = shelfJob().parts // 0 全体・1 天板・2 側板・3 棚板

  it('W・H・枚数のセルだけ。名前のセル・何も選んでいないときは null', () => {
    expect(barField(at(3, 2))).toBe('W')
    expect(barField(at(3, 3))).toBe('H')
    expect(barField(at(3, 4))).toBe('qty')
    expect(barField(at(3, 0))).toBeNull()
    expect(barField(null)).toBeNull()
    // 範囲は左上のセル（行全体は名前から始まるので空）
    expect(barField(at(0, 0, 2, 5))).toBeNull()
    expect(barField(at(1, 2, 3, 2))).toBe('W')
  })

  it('［仕上がり］は仕上がりの式、数字は数字、枚数は枚数', () => {
    expect(partBar(parts, at(3, 2), 'finished')).toEqual({ kind: 'expr', expr: '天板.W - 20' })
    expect(partBar(parts, at(0, 2), 'finished')).toEqual({ kind: 'expr', expr: '400' })
    expect(partBar(parts, at(3, 4), 'finished')).toEqual({ kind: 'text', text: '3' })
    expect(partBar(parts, at(3, 0), 'finished')).toBeNull()
  })

  it('［調整］は調整の式、［木取り］は仕上がりの式（見るだけ）', () => {
    expect(partBar(parts, at(3, 2), 'adjust')).toEqual({ kind: 'expr', expr: `-{n:${MELAMINE_ID}}` })
    expect(partBar(parts, at(3, 3), 'adjust')).toEqual({ kind: 'expr', expr: '' })
    expect(partBar(parts, at(3, 2), 'cut')).toEqual({ kind: 'expr', expr: '天板.W - 20' })
    expect(partBar(parts, at(0, 4), 'cut')).toEqual({ kind: 'text', text: '0' })
  })

  it('部材の無い空の行は空の中身（そこに入れられるので欄は出す）', () => {
    expect(partBar(parts, at(4, 2), 'finished')).toEqual({ kind: 'expr', expr: '' })
    expect(partBar(parts, at(4, 4), 'finished')).toEqual({ kind: 'text', text: '' })
  })

  it('「＝」で始まる古い式は「＝」を外して出す', () => {
    const old = shelfJob().parts
    old[3] = { ...old[3], expr: { W: '＝天板.W - 20', H: '' } }
    expect(partBar(old, at(3, 2), 'finished')).toEqual({ kind: 'expr', expr: '天板.W - 20' })
  })

  it('調整寸法の表は寸法のセルだけ（その数字）', () => {
    const rows = [...shelfAdjusts(), { id: 'x', name: '逃げ', value: null }]
    expect(adjustRowBar(rows, at(1, 1))).toEqual({ kind: 'text', text: '0.5' })
    expect(adjustRowBar(rows, at(2, 1))).toEqual({ kind: 'text', text: '' })
    expect(adjustRowBar(rows, at(0, 0))).toBeNull()
    expect(adjustRowBar(rows, null)).toBeNull()
  })
})

describe('式の欄のすぐ下に出すエラー', () => {
  const err = (field: DimensionError['field'], kind: DimensionError['kind'], message: string, axis: 'W' | 'H' = 'W'): DimensionError => ({
    partId: 'p',
    axis,
    field,
    kind,
    message,
  })
  const errors = [err('finished', 'unknownRef', '「無い」という部材はありません'), err('adjust', 'nonPositive', '調整後が 0 以下'), err('finished', 'cycle', 'H', 'H')]

  it('［仕上がり］は仕上がりの欄のエラーだけ、［調整］［木取り］はその軸のエラー全部', () => {
    expect(barErrors(errors, 'W', 'finished', false)).toEqual(['「無い」という部材はありません'])
    expect(barErrors(errors, 'W', 'adjust', false)).toEqual(['「無い」という部材はありません', '調整後が 0 以下'])
    expect(barErrors(errors, 'W', 'cut', false)).toHaveLength(2)
  })

  it('入力中は打っている途中に出やすいエラー（0 以下・書き方）を出さない', () => {
    expect(barErrors(errors, 'W', 'adjust', true)).toEqual(['「無い」という部材はありません'])
  })

  it('見本の棚にはエラーが無い', () => {
    const dims = computeDimensions(shelfJob(), shelfAdjusts())
    expect(barErrors(dims.errors, 'W', 'adjust', false)).toEqual([])
  })
})
