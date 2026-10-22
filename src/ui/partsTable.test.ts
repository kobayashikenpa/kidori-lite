import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import { newPart } from '../store/jobs'
import { inputRow, isBlankPart, nextCell, quantityFromText, quantityText, tableDimCell, tableRowCount } from './partsTable'

describe('部材の表の行（仕様書 15.1）', () => {
  it('10行に満たないときは10行、そうでなければ部材の数 ＋ 空の行1つ', () => {
    expect(tableRowCount(0)).toBe(10)
    expect(tableRowCount(4)).toBe(10)
    expect(tableRowCount(9)).toBe(10)
    expect(tableRowCount(10)).toBe(11)
    expect(tableRowCount(25)).toBe(26)
  })

  it('何も入っていない部材（名前・W・H・枚数が空）だけが空とみなされる', () => {
    expect(isBlankPart(newPart('a', { quantity: null }))).toBe(true)
    expect(isBlankPart(newPart('a', { quantity: null, rotatable: true }))).toBe(true)
    expect(isBlankPart(newPart('a', { quantity: 0 }))).toBe(false)
    expect(isBlankPart(newPart('a', { quantity: null, name: '天板' }))).toBe(false)
    expect(isBlankPart(newPart('a', { quantity: null, expr: { W: '', H: '700' } }))).toBe(false)
  })

  it('途中の空の行を押すと、いちばん上の空の行になる', () => {
    expect(inputRow(2, 4)).toBe(2)
    expect(inputRow(4, 4)).toBe(4)
    expect(inputRow(8, 4)).toBe(4)
  })

  it('「次へ」は 名前 → W → H → 枚数 → 次の行の名前', () => {
    expect(nextCell({ row: 0, field: 'name' }, 4)).toEqual({ row: 0, field: 'W' })
    expect(nextCell({ row: 0, field: 'W' }, 4)).toEqual({ row: 0, field: 'H' })
    expect(nextCell({ row: 0, field: 'H' }, 4)).toEqual({ row: 0, field: 'qty' })
    expect(nextCell({ row: 0, field: 'qty' }, 4)).toEqual({ row: 1, field: 'name' })
    // 最後の部材の次は空の行
    expect(nextCell({ row: 3, field: 'qty' }, 4)).toEqual({ row: 4, field: 'name' })
    // 空の行のまま次へ：同じ空の行の名前
    expect(nextCell({ row: 4, field: 'qty' }, 4)).toEqual({ row: 4, field: 'name' })
  })

  it('枚数の文字と枚数（空は null、0 は寸法だけ）', () => {
    expect(quantityText(null)).toBe('')
    expect(quantityText(0)).toBe('0')
    expect(quantityFromText('')).toBeNull()
    expect(quantityFromText('0')).toBe(0)
    expect(quantityFromText('12')).toBe(12)
  })
})

describe('部材の表の W・H の欄（見本 6章）', () => {
  const job = shelfJob()
  const adjusts = shelfAdjusts()
  const dims = computeDimensions(job, adjusts)
  const cell = (name: string, axis: 'W' | 'H') => {
    const p = job.parts.find((x) => x.name === name)!
    return tableDimCell(p, dims.parts.find((d) => d.partId === p.id), axis, adjusts)
  }

  it('数値はその数値、式は計算した寸法（仕上がり）', () => {
    expect(cell('全体', 'W')).toEqual({ kind: 'number', value: 400 })
    expect(cell('棚板', 'W')).toMatchObject({ kind: 'formula', value: 379 })
    expect(cell('棚板', 'H')).toMatchObject({ kind: 'formula', value: 1760 })
  })

  it('空の欄は空（エラーにしない）', () => {
    const p = newPart('x', { quantity: null, expr: { W: '', H: '700' } })
    expect(tableDimCell(p, undefined, 'W', adjusts)).toEqual({ kind: 'empty' })
  })
})
