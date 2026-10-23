import { describe, expect, it } from 'vitest'
import type { PasteSkip } from '../engine/clipboard/cells'
import { clampRange, clipText, fixedCorner, hasPartCell, isSingleAt, keepActive, pasteText, rangeHas, singleRange, spanRange } from './cellSelect'

describe('選んでいる範囲（仕様書 17.1）', () => {
  it('2つのセルを角にした四角（どちらが左上でもよい）', () => {
    expect(spanRange({ row: 1, col: 1 }, { row: 2, col: 2 })).toEqual({ top: 1, left: 1, rows: 2, cols: 2 })
    expect(spanRange({ row: 2, col: 2 }, { row: 1, col: 1 })).toEqual({ top: 1, left: 1, rows: 2, cols: 2 })
    expect(spanRange({ row: 3, col: 0 }, { row: 3, col: 0 })).toEqual(singleRange({ row: 3, col: 0 }))
  })

  it('範囲の中か・1つのセルだけか', () => {
    const r = { top: 1, left: 1, rows: 2, cols: 2 }
    expect(rangeHas(r, { row: 2, col: 2 })).toBe(true)
    expect(rangeHas(r, { row: 3, col: 2 })).toBe(false)
    expect(rangeHas(r, { row: 1, col: 0 })).toBe(false)
    expect(isSingleAt(singleRange({ row: 1, col: 2 }), { row: 1, col: 2 })).toBe(true)
    expect(isSingleAt(r, { row: 1, col: 1 })).toBe(false)
    expect(isSingleAt(null, { row: 1, col: 1 })).toBe(false)
  })

  it('取っ手を引くときは反対の角が動かない', () => {
    const r = { top: 1, left: 1, rows: 2, cols: 2 }
    expect(fixedCorner(r, 'end')).toEqual({ row: 1, col: 1 })
    expect(fixedCorner(r, 'start')).toEqual({ row: 2, col: 2 })
    // 右下の取っ手を左上へ越えて引いても四角になる
    expect(spanRange(fixedCorner(r, 'end'), { row: 0, col: 0 })).toEqual({ top: 0, left: 0, rows: 2, cols: 2 })
  })

  it('起点は範囲の中ならそのまま、外に出たら動かない角', () => {
    const fixed = { row: 2, col: 2 }
    expect(keepActive({ row: 1, col: 1 }, { top: 1, left: 1, rows: 2, cols: 2 }, fixed)).toEqual({ row: 1, col: 1 })
    expect(keepActive({ row: 1, col: 1 }, { top: 2, left: 2, rows: 1, cols: 2 }, fixed)).toEqual(fixed)
  })

  it('表の行が減ったら範囲を収める', () => {
    expect(clampRange({ top: 8, left: 0, rows: 4, cols: 4 }, 10)).toEqual({ top: 8, left: 0, rows: 2, cols: 4 })
    expect(clampRange({ top: 10, left: 0, rows: 1, cols: 1 }, 10)).toBeNull()
  })
})

describe('セルの手伝い', () => {
  it('部材の行を選んでいるか', () => {
    expect(hasPartCell([{ row: 5, col: 'W' }], 3)).toBe(false)
    expect(hasPartCell([{ row: 5, col: 'W' }, { row: 2, col: 'H' }], 3)).toBe(true)
  })
})

describe('今コピーしているもの', () => {
  it('1つのセルは中身を短く、範囲は 行×列', () => {
    expect(clipText(null)).toBeNull()
    expect(clipText({ rows: 1, cols: 1, cells: [['400']] })).toBe('コピー中：1つ（400）')
    expect(clipText({ rows: 1, cols: 1, cells: [['']] })).toBe('コピー中：1つ（空）')
    expect(clipText({ rows: 1, cols: 1, cells: [['天板.W - メラミン1 * 2']] })).toBe('コピー中：1つ（天板.W - メラミ…）')
    expect(clipText({ rows: 2, cols: 2, cells: [['1', '2'], ['3', '4']] })).toBe('コピー中：2行×2列')
  })
})

describe('貼り付けの知らせ', () => {
  const skip = (message: string): PasteSkip => ({ cell: { row: 0, col: 'name' }, reason: 'duplicateName', message })
  it('貼った数と、貼れなかった数・理由（同じ理由は1つにまとめる）', () => {
    expect(pasteText(3, [])).toBe('3つのセルに貼りました')
    expect(pasteText(1, [skip('同じ名前は貼れません'), skip('同じ名前は貼れません')])).toBe(
      '1つのセルに貼りました（貼れなかったもの 2つ：同じ名前は貼れません）',
    )
    expect(pasteText(0, [])).toBe('貼れるセルがありませんでした')
    expect(pasteText(0, [skip('同じ名前は貼れません')])).toBe('貼れませんでした（貼れなかったもの 1つ：同じ名前は貼れません）')
  })
})
