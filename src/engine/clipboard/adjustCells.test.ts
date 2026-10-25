// 調整寸法の表のセル操作（第1.7版。仕様書 21.1）
import { describe, expect, it } from 'vitest'
import type { AdjustClip, AdjustRow, CellRange } from '../types'
import {
  adjustCellText,
  adjustColumnRange,
  adjustRowRange,
  clearAdjustCells,
  copyAdjustCells,
  cutAdjustCells,
  deleteAdjustRows,
  dropBlankAdjustRows,
  fillAdjustCells,
  insertAdjustRow,
  numberedAdjustName,
  pasteAdjustCells,
  selectedAdjustIds,
  setAdjustCell,
  type AdjustPasteResult,
} from './adjustCells'

function ids(): (prefix: string) => string {
  let n = 0
  return (prefix) => `${prefix}-new${++n}`
}

const row = (id: string, name: string, value: number | null): AdjustRow => ({ id, name, value })
const R = (top: number, left: number, rows: number, cols: number): CellRange => ({ top, left, rows, cols })
const table = (rows: readonly AdjustRow[]) => rows.map((r) => [r.name, r.value])

function ok(r: AdjustPasteResult): Extract<AdjustPasteResult, { ok: true }> {
  if (!r.ok) throw new Error(r.message)
  return r
}

function clipOk(r: ReturnType<typeof copyAdjustCells>): AdjustClip {
  if (!r.ok) throw new Error(r.message)
  return r.clip
}

/** 初めの表：メラミン1・シート0.5 */
const base = (): AdjustRow[] => [row('a1', 'メラミン', 1), row('a2', 'シート', 0.5)]

describe('範囲・セルの中身', () => {
  it('行全体は名前〜寸法、列全体は行のある所まで（行が無ければ1行）', () => {
    expect(adjustRowRange(2)).toEqual(R(2, 0, 1, 2))
    expect(adjustColumnRange(base(), 1)).toEqual(R(0, 1, 2, 1))
    expect(adjustColumnRange([], 0)).toEqual(R(0, 0, 1, 1))
  })

  it('寸法は丸めない数字の文字、空・空の行は空の文字', () => {
    const rows = [row('a', 'ほぞ', null), row('b', '', 0.25)]
    expect(adjustCellText(rows, { row: 0, col: 'name' })).toBe('ほぞ')
    expect(adjustCellText(rows, { row: 0, col: 'value' })).toBe('')
    expect(adjustCellText(rows, { row: 1, col: 'value' })).toBe('0.25')
    expect(adjustCellText(rows, { row: 5, col: 'name' })).toBe('')
  })
})

describe('コピー・切り取り', () => {
  it('1つのセル・四角い範囲をコピーする（寸法は数字の文字）', () => {
    expect(clipOk(copyAdjustCells(base(), R(0, 1, 1, 1)))).toEqual({ rows: 1, cols: 1, cells: [['1']] })
    expect(clipOk(copyAdjustCells(base(), R(0, 0, 2, 2)))).toEqual({
      rows: 2,
      cols: 2,
      cells: [
        ['メラミン', '1'],
        ['シート', '0.5'],
      ],
    })
  })

  it('離れたセルはコピーできない', () => {
    const r = copyAdjustCells(base(), [
      { row: 0, col: 'name' },
      { row: 1, col: 'value' },
    ])
    expect(r).toEqual({ ok: false, message: 'コピーは1つのセルか、四角い範囲を選んでください' })
  })

  it('切り取りは元の範囲を cut に付ける（表は変えない）', () => {
    expect(clipOk(cutAdjustCells(base(), R(1, 0, 1, 2))).cut).toEqual(R(1, 0, 1, 2))
  })
})

describe('貼り付け：寸法の欄', () => {
  it('1つのセルを、選んだセル全部に貼る（書きかけの行がそろう）', () => {
    const rows = [...base(), row('a3', 'ほぞ', null), row('a4', '逃げ', null)]
    const r = ok(pasteAdjustCells(rows, { rows: 1, cols: 1, cells: [['15']] }, R(2, 1, 2, 1), ids()))
    expect(table(r.adjusts).slice(2)).toEqual([
      ['ほぞ', 15],
      ['逃げ', 15],
    ])
    expect(r.pasted).toBe(2)
    expect(r.adjusts[2].id).toBe('a3')
  })

  it('0・式・文字は貼らない。空は寸法を空にする（書きかけの行になる）', () => {
    const rows = [row('a', 'x', 1), row('b', 'y', 2), row('c', 'z', 3), row('d', 'w', 4)]
    const clip: AdjustClip = { rows: 4, cols: 1, cells: [['0'], ['天板.W'], ['ほぞ'], ['']] }
    const r = ok(pasteAdjustCells(rows, clip, R(0, 1, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual([
      ['x', 1],
      ['y', 2],
      ['z', 3],
      ['w', null],
    ])
    expect(r.pasted).toBe(1)
    expect(r.skipped.map((s) => [s.cell.row, s.reason, s.message])).toEqual([
      [0, 'notValue', '寸法には 0 より大きい数だけ貼れます'],
      [1, 'notValue', '寸法には 0 より大きい数だけ貼れます'],
      [2, 'notValue', '寸法には 0 より大きい数だけ貼れます'],
    ])
  })

  it('寸法だけを貼って表示名が重なるときは貼らない（理由を返す）', () => {
    const rows = [...base(), row('a3', 'メラミン', null)]
    const r = ok(pasteAdjustCells(rows, { rows: 1, cols: 1, cells: [['1']] }, R(2, 1, 1, 1), ids()))
    expect(r.pasted).toBe(0)
    expect(r.adjusts).toBe(rows)
    expect(r.skipped).toEqual([{ cell: { row: 2, col: 'value' }, reason: 'duplicate', message: '「メラミン1」はもうあります' }])
  })

  it('寸法の入れ替え（x1・x2 → x2・x1）は貼れる', () => {
    const rows = [row('a', 'x', 1), row('b', 'x', 2)]
    const r = ok(pasteAdjustCells(rows, { rows: 2, cols: 1, cells: [['2'], ['1']] }, R(0, 1, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual([
      ['x', 2],
      ['x', 1],
    ])
    expect(r.skipped).toEqual([])
  })

  it('右にはみ出す列は貼らない（貼れなかった数にも入れない）', () => {
    const rows = [row('a', 'ほぞ', null)]
    const clip: AdjustClip = { rows: 1, cols: 2, cells: [['12', 'あまり']] }
    const r = ok(pasteAdjustCells(rows, clip, R(0, 1, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual([['ほぞ', 12]])
    expect(r.pasted).toBe(1)
    expect(r.skipped).toEqual([])
  })
})

describe('貼り付け：名前の欄と番号（表示名が重なるとき）', () => {
  it('行（メラミン1）を空の行に貼ると、名前の後ろに ② を付ける（表示名 メラミン②1）', () => {
    const rows = base()
    const clip = clipOk(copyAdjustCells(rows, R(0, 0, 1, 2)))
    const r = ok(pasteAdjustCells(rows, clip, R(2, 0, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual([
      ['メラミン', 1],
      ['シート', 0.5],
      ['メラミン②', 1],
    ])
    expect(r.adjusts[2].id).toBe('adjust-new1')
    expect(r.renamed).toEqual([{ cell: { row: 2, col: 'name' }, from: 'メラミン', to: 'メラミン②' }])
  })

  it('3つの行に貼ると ②③④（元のメラミン1 はそのまま）', () => {
    const rows = base()
    const clip = clipOk(copyAdjustCells(rows, R(0, 0, 1, 2)))
    const r = ok(pasteAdjustCells(rows, clip, R(2, 0, 3, 2), ids()))
    // 1行×2列のコピーを 3行×2列 の範囲に貼る：1つのセルのコピーではないので左上から1回だけ（部材の表と同じ）
    expect(r.adjusts.slice(2).map((a) => a.name)).toEqual(['メラミン②'])
    const three: AdjustClip = { rows: 3, cols: 2, cells: [['メラミン', '1'], ['メラミン', '1'], ['メラミン', '1']] }
    const r3 = ok(pasteAdjustCells(rows, three, R(2, 0, 1, 1), ids()))
    expect(r3.adjusts.slice(2).map((a) => a.name)).toEqual(['メラミン②', 'メラミン③', 'メラミン④'])
  })

  it('元が無いところに同じ行を2つ貼ると、上の1つはそのまま、下は ②', () => {
    const clip: AdjustClip = { rows: 2, cols: 2, cells: [['ほぞ', '15'], ['ほぞ', '15']] }
    const r = ok(pasteAdjustCells(base(), clip, R(2, 0, 1, 1), ids()))
    expect(r.adjusts.slice(2).map((a) => a.name)).toEqual(['ほぞ', 'ほぞ②'])
  })

  it('名前だけを、寸法が同じ行に貼ると番号を振る', () => {
    const rows = [...base(), row('a3', '', 1)]
    const r = ok(pasteAdjustCells(rows, { rows: 1, cols: 1, cells: [['メラミン']] }, R(2, 0, 1, 1), ids()))
    expect(table(r.adjusts)[2]).toEqual(['メラミン②', 1])
  })

  it('名前だけを、寸法の無い行・空の行に貼ると書きかけの行（番号は振らない）', () => {
    const rows = base()
    const r = ok(pasteAdjustCells(rows, { rows: 1, cols: 1, cells: [['メラミン']] }, R(2, 0, 2, 1), ids()))
    expect(table(r.adjusts).slice(2)).toEqual([
      ['メラミン', null],
      ['メラミン', null],
    ])
    expect(r.renamed).toEqual([])
  })

  it('② の付いた名前をコピーすると、② を外した名前に空いている番号を振る', () => {
    const rows = [...base(), row('a3', 'メラミン②', 1)]
    const clip = clipOk(copyAdjustCells(rows, R(2, 0, 1, 2)))
    const r = ok(pasteAdjustCells(rows, clip, R(3, 0, 1, 1), ids()))
    expect(r.adjusts[3].name).toBe('メラミン③')
  })

  it('名前の終わりの数字は外さない（逃げ1 寸法5 → 逃げ1②）', () => {
    const rows = [row('a', '逃げ1', 5)]
    const clip = clipOk(copyAdjustCells(rows, R(0, 0, 1, 2)))
    expect(ok(pasteAdjustCells(rows, clip, R(1, 0, 1, 1), ids())).adjusts[1].name).toBe('逃げ1②')
  })

  it('同じ表示名の行に同じものを貼っても名前は変わらない', () => {
    const rows = base()
    const clip = clipOk(copyAdjustCells(rows, R(0, 0, 1, 2)))
    const r = ok(pasteAdjustCells(rows, clip, R(0, 0, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual(table(rows))
    expect(r.renamed).toEqual([])
  })

  it('名前の前後の空白は外す', () => {
    const r = ok(pasteAdjustCells(base(), { rows: 1, cols: 2, cells: [[' ほぞ ', '12']] }, R(2, 0, 1, 1), ids()))
    expect(table(r.adjusts)[2]).toEqual(['ほぞ', 12])
  })
})

describe('貼り付け：行の足し方・空の行', () => {
  it('表の下の離れた空の行に貼っても、今の行のすぐ下に詰めて入る', () => {
    const r = ok(pasteAdjustCells(base(), { rows: 1, cols: 2, cells: [['ほぞ', '12']] }, R(6, 0, 1, 1), ids()))
    expect(r.adjusts).toHaveLength(3)
    expect(table(r.adjusts)[2]).toEqual(['ほぞ', 12])
  })

  it('空だけを貼った行は作らず、全部空になった行は消す', () => {
    const rows = [...base(), row('a3', 'ほぞ', null)]
    const r = ok(pasteAdjustCells(rows, { rows: 1, cols: 1, cells: [['']] }, R(2, 0, 2, 1), ids()))
    expect(r.adjusts.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('貼るセルが無ければ断る', () => {
    expect(pasteAdjustCells(base(), { rows: 1, cols: 1, cells: [['1']] }, [], ids()).ok).toBe(false)
  })
})

describe('切り取りの貼り付け', () => {
  it('行を空の行へ動かす：元は消え、番号は振らず、id も引き継ぐ（式がついてくる）', () => {
    const rows = base()
    const clip = clipOk(cutAdjustCells(rows, R(0, 0, 1, 2)))
    const r = ok(pasteAdjustCells(rows, clip, R(2, 0, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual([
      ['シート', 0.5],
      ['メラミン', 1],
    ])
    expect(r.adjusts.map((a) => a.id)).toEqual(['a2', 'a1'])
    expect(r.renamed).toEqual([])
  })

  it('寸法だけを動かすと、元の行は書きかけ（名前だけ）で残る', () => {
    const rows = [...base(), row('a3', 'ほぞ', null)]
    const clip = clipOk(cutAdjustCells(rows, R(0, 1, 1, 1)))
    const r = ok(pasteAdjustCells(rows, clip, R(2, 1, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual([
      ['メラミン', null],
      ['シート', 0.5],
      ['ほぞ', 1],
    ])
  })

  it('元を空にしてから表示名の重なりを比べる', () => {
    const rows = [...base(), row('a3', 'シート', null)]
    // 寸法 0.5 を「シート」（寸法なし）に動かす → シート0.5 は元の行が消えるので重ならず貼れる
    const clip = clipOk(cutAdjustCells(rows, R(1, 1, 1, 1)))
    const r = ok(pasteAdjustCells(rows, clip, R(2, 1, 1, 1), ids()))
    expect(table(r.adjusts)).toEqual([
      ['メラミン', 1],
      ['シート', null],
      ['シート', 0.5],
    ])
    // 寸法 1 を 名前「メラミン」・寸法なし の行に動かす → 元が書きかけになってから比べるので貼れる
    const rows2 = [...base(), row('a3', 'メラミン', null)]
    const clip2 = clipOk(cutAdjustCells(rows2, R(0, 1, 1, 1)))
    const r2 = ok(pasteAdjustCells(rows2, clip2, R(2, 1, 1, 1), ids()))
    expect(table(r2.adjusts)).toEqual([
      ['メラミン', null],
      ['シート', 0.5],
      ['メラミン', 1],
    ])
  })

  it('寸法の欄に貼れない（名前の文字）ときは元を残す', () => {
    const rows = base()
    const clip = clipOk(cutAdjustCells(rows, R(0, 0, 1, 1)))
    const r = ok(pasteAdjustCells(rows, clip, R(1, 1, 1, 1), ids()))
    expect(r.pasted).toBe(0)
    expect(r.adjusts).toBe(rows)
  })

  it('切り取ったあとに書き換えたセルは消さない', () => {
    const rows = base()
    const clip = clipOk(cutAdjustCells(rows, R(0, 1, 1, 1)))
    const changed = [row('a1', 'メラミン', 2), rows[1]]
    const r = ok(pasteAdjustCells(changed, clip, R(2, 0, 1, 1), ids()))
    expect(table(r.adjusts)[0]).toEqual(['メラミン', 2])
  })
})

describe('オートフィル', () => {
  it('行を下へ引くと、名前に番号を振ってくり返す', () => {
    const r = ok(fillAdjustCells([row('a1', 'メラミン', 1)], R(0, 0, 1, 2), R(0, 0, 3, 2), ids()))
    expect(table(r.adjusts)).toEqual([
      ['メラミン', 1],
      ['メラミン②', 1],
      ['メラミン③', 1],
    ])
    expect(r.renamed).toEqual([
      { cell: { row: 1, col: 'name' }, from: 'メラミン', to: 'メラミン②' },
      { cell: { row: 2, col: 'name' }, from: 'メラミン', to: 'メラミン③' },
    ])
  })

  it('下の行を上書きするときも、残る行と重なれば番号を振る（id はその行のまま）', () => {
    const r = ok(fillAdjustCells(base(), R(0, 0, 1, 2), R(1, 0, 1, 2), ids()))
    expect(table(r.adjusts)).toEqual([
      ['メラミン', 1],
      ['メラミン②', 1],
    ])
    expect(r.adjusts[1].id).toBe('a2')
  })

  it('寸法の列だけを、書きかけの行へ引く', () => {
    const rows = [row('a', 'ほぞ', 15), row('b', '逃げ', null), row('c', '大入れ', null)]
    const r = ok(fillAdjustCells(rows, R(0, 1, 1, 1), R(1, 1, 2, 1), ids()))
    expect(table(r.adjusts)).toEqual([
      ['ほぞ', 15],
      ['逃げ', 15],
      ['大入れ', 15],
    ])
  })

  it('上へ引いてもくり返しがつながる', () => {
    const rows = [row('a', 'x', null), row('b', 'y', null), row('c', '', 1), row('d', '', 2)]
    const r = ok(fillAdjustCells(rows, R(2, 1, 2, 1), R(0, 1, 2, 1), ids()))
    expect(table(r.adjusts).map((t) => t[1])).toEqual([1, 2, 1, 2])
  })

  it('範囲でない元は断る', () => {
    const r = fillAdjustCells(base(), R(0, 0, 0, 1), R(0, 0, 3, 1), ids())
    expect(r).toEqual({ ok: false, message: '引く元の範囲を選んでください' })
  })
})

describe('クリア・行を削除・行を上に挿入', () => {
  it('寸法をクリアすると書きかけの行（id はそのまま）、両方クリアすると行が消える', () => {
    expect(clearAdjustCells(base(), R(0, 1, 1, 1))).toEqual([row('a1', 'メラミン', null), row('a2', 'シート', 0.5)])
    expect(clearAdjustCells(base(), adjustRowRange(0))).toEqual([row('a2', 'シート', 0.5)])
  })

  it('空の行だけをクリアしても同じ表', () => {
    const rows = base()
    expect(clearAdjustCells(rows, R(5, 0, 1, 2))).toBe(rows)
  })

  it('選んだセルのある行をまとめて消す', () => {
    const rows = [...base(), row('a3', 'ほぞ', null)]
    expect(selectedAdjustIds(rows, R(1, 1, 3, 1))).toEqual(['a2', 'a3'])
    expect(deleteAdjustRows(rows, R(1, 1, 3, 1)).map((a) => a.id)).toEqual(['a1'])
    expect(deleteAdjustRows(rows, R(4, 0, 1, 1))).toBe(rows)
  })

  it('行を上に挿入：その位置に空の行を入れる（表の下なら最後に）', () => {
    const r = insertAdjustRow(base(), 1, 'adjust-x')
    expect(r.map((a) => a.id)).toEqual(['a1', 'adjust-x', 'a2'])
    expect(r[1]).toEqual(row('adjust-x', '', null))
    expect(insertAdjustRow(base(), 9, 'adjust-x').map((a) => a.id)).toEqual(['a1', 'a2', 'adjust-x'])
  })

  it('空の行を外す（入力中の行は残す）', () => {
    const rows = [row('a', '', null), row('b', 'x', 1), row('c', ' ', null)]
    expect(dropBlankAdjustRows(rows).map((a) => a.id)).toEqual(['b'])
    expect(dropBlankAdjustRows(rows, 'c').map((a) => a.id)).toEqual(['b', 'c'])
    const full = base()
    expect(dropBlankAdjustRows(full)).toBe(full)
  })
})

describe('セルに入力する（setAdjustCell）', () => {
  it('表の下の空の行に名前を入れると行を足す（書きかけの行）', () => {
    const r = setAdjustCell(base(), { row: 4, col: 'name' }, ' ほぞ ', ids())
    if (!r.ok) throw new Error(r.message)
    expect(r.adjusts[2]).toEqual(row('adjust-new1', 'ほぞ', null))
    expect(r.id).toBe('adjust-new1')
  })

  it('寸法を入れると式で使える行になる。id はそのまま', () => {
    const rows = [...base(), row('a3', 'ほぞ', null)]
    const r = setAdjustCell(rows, { row: 2, col: 'value' }, '１２', ids())
    if (!r.ok) throw new Error(r.message)
    expect(r.adjusts[2]).toEqual(row('a3', 'ほぞ', 12))
    expect(r.id).toBe('a3')
  })

  it('0・式は入れられない。空は寸法を空にする', () => {
    expect(setAdjustCell(base(), { row: 0, col: 'value' }, '0', ids())).toEqual({
      ok: false,
      message: '寸法は 0 より大きい数を入れてください',
    })
    const r = setAdjustCell(base(), { row: 0, col: 'value' }, '', ids())
    expect(r.ok && r.adjusts[0]).toEqual(row('a1', 'メラミン', null))
  })

  it('表示名が同じになるときは断る（理由を出す）', () => {
    const rows = [...base(), row('a3', 'メラミン', null)]
    expect(setAdjustCell(rows, { row: 2, col: 'value' }, '1', ids())).toEqual({ ok: false, message: '「メラミン1」はもうあります' })
    expect(setAdjustCell(rows, { row: 1, col: 'name' }, 'メラミン', ids()).ok).toBe(true)
    expect(setAdjustCell([row('a', '逃げ', 15), row('b', '', 5)], { row: 1, col: 'name' }, '逃げ1', ids())).toEqual({
      ok: false,
      message: '「逃げ15」はもうあります',
    })
  })

  it('空の行に空を入れても何もしない', () => {
    const rows = base()
    const r = setAdjustCell(rows, { row: 3, col: 'name' }, '  ', ids())
    expect(r.ok && r.adjusts).toBe(rows)
  })
})

describe('numberedAdjustName（番号の振り方）', () => {
  it('② から、表示名が重ならない一番小さい番号', () => {
    const rows = [row('a', 'メラミン', 1), row('b', 'メラミン②', 1)]
    expect(numberedAdjustName('メラミン', 1, rows)).toBe('メラミン③')
    expect(numberedAdjustName('メラミン', 2, rows)).toBe('メラミン②')
  })
})
