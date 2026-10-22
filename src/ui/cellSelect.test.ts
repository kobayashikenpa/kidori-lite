import { describe, expect, it } from 'vitest'
import type { PasteSkip } from '../engine/clipboard/cells'
import { clipText, hasPartCell, pasteText, selectedText, toggleCell } from './cellSelect'

describe('セルを選ぶ（仕様書 16.1）', () => {
  it('押すたびに選ぶ／外す。離れたセルも選べる', () => {
    let cells = toggleCell([], { row: 0, col: 'W' })
    cells = toggleCell(cells, { row: 3, col: 'qty' })
    expect(cells).toEqual([
      { row: 0, col: 'W' },
      { row: 3, col: 'qty' },
    ])
    cells = toggleCell(cells, { row: 0, col: 'W' })
    expect(cells).toEqual([{ row: 3, col: 'qty' }])
  })

  it('選んだ数の文', () => {
    expect(selectedText(0)).toBe('セルを押して選んでください')
    expect(selectedText(3)).toBe('3つ選んでいます')
  })

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
