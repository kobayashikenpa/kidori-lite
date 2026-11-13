// セルのコピーと貼り付け・消す・行を削除（第1.2版。仕様書 16.1）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { shelfAdjusts, shelfJob } from '../fixtures/shelf'
import type { CellClip, CellCol, CellPos, Job, Part } from '../types'
import {
  cellText,
  clearCells,
  copyCells,
  COPY_SHAPE_MESSAGE,
  deleteRows,
  pasteCells,
  rowRange,
  selectedPartIds,
  selectionShape,
  type PasteCellsResult,
} from './cells'

/** 決まった id を順に出す */
function ids(): (prefix: string) => string {
  let n = 0
  return (prefix) => `${prefix}-new${++n}`
}

const c = (row: number, col: CellCol): CellPos => ({ row, col })

function part(id: string, name: string, W = '100', H = '200', quantity: number | null = 1): Part {
  return { id, name, expr: { W, H }, adjust: { W: '', H: '' }, thickness: null, quantity, rotatable: false, finishedDone: false }
}

function jobOf(...parts: Part[]): Job {
  const job = createJob({ id: 'job-x', name: 'x', now: '2026-10-22T00:00:00.000Z' })
  job.parts = parts
  return job
}

const clipOf = (cells: string[][]): CellClip => ({ rows: cells.length, cols: cells[0].length, cells })

function okPaste(r: PasteCellsResult): Extract<PasteCellsResult, { ok: true }> {
  if (!r.ok) throw new Error(r.message)
  return r
}

/** 部材の表を [名前, W, H, 枚数] の行で見る */
const table = (job: Job) => job.parts.map((p) => [p.name, p.expr.W, p.expr.H, p.quantity])

describe('selectionShape（1つ／四角い範囲／それ以外）', () => {
  it('何も選んでいない', () => {
    expect(selectionShape([])).toEqual({ kind: 'none' })
  })

  it('1つのセルは 1行×1列の範囲', () => {
    expect(selectionShape([c(2, 'H')])).toEqual({ kind: 'range', top: 2, left: 3, rows: 1, cols: 1 })
  })

  it('続いた行 × 続いた列（押した順によらない。同じセルを2回入れても1つ）', () => {
    const sel = [c(4, 'H'), c(3, 'W'), c(4, 'W'), c(3, 'H'), c(3, 'H')]
    expect(selectionShape(sel)).toEqual({ kind: 'range', top: 3, left: 2, rows: 2, cols: 2 })
  })

  it('1行に横いっぱい（名前〜枚数の5列）も範囲。厚みを飛ばすと範囲でない', () => {
    expect(selectionShape([c(0, 'name'), c(0, 'T'), c(0, 'W'), c(0, 'H'), c(0, 'qty')])).toEqual({ kind: 'range', top: 0, left: 0, rows: 1, cols: 5 })
    expect(selectionShape([c(0, 'name'), c(0, 'W'), c(0, 'H'), c(0, 'qty')]).kind).toBe('scattered')
  })

  it('離れたセル・欠けた四角・飛んだ列や行は範囲でない', () => {
    expect(selectionShape([c(0, 'W'), c(2, 'W')]).kind).toBe('scattered')
    expect(selectionShape([c(0, 'name'), c(0, 'H')]).kind).toBe('scattered')
    expect(selectionShape([c(0, 'W'), c(0, 'H'), c(1, 'W')]).kind).toBe('scattered')
  })
})

describe('copyCells（式は式のまま）', () => {
  it('1つのセル：式は書いたまま（部材名も名前のまま）', () => {
    const r = copyCells(shelfJob(), [c(3, 'W')])
    expect(r).toEqual({ ok: true, clip: { rows: 1, cols: 1, cells: [['天板.W - 20']], columns: 'name,T,W,H,qty' } })
  })

  it('範囲：名前・厚み・式・枚数を形つきで。厚み・枚数が空・空の行は空の文字', () => {
    const job = shelfJob()
    job.parts[2].quantity = null
    job.parts[3].thickness = 18
    const r = copyCells(job, rowRange(2, 3))
    expect(r.ok && r.clip).toEqual({
      rows: 3,
      cols: 5,
      cells: [
        ['側板', '', '全体.W', '700', ''],
        ['棚板', '18', '天板.W - 20', '天板.H - 20 × 2', '3'],
        ['', '', '', '', ''],
      ],
      columns: 'name,T,W,H,qty',
    })
  })

  it('枚数 0（寸法だけ）は「0」', () => {
    expect(cellText(shelfJob(), c(0, 'qty'))).toBe('0')
  })

  it('離れたセル・何も選んでいないときはコピーできない', () => {
    expect(copyCells(shelfJob(), [c(0, 'W'), c(2, 'W')])).toEqual({ ok: false, message: COPY_SHAPE_MESSAGE })
    expect(copyCells(shelfJob(), [])).toEqual({ ok: false, message: COPY_SHAPE_MESSAGE })
  })

  it('写し：コピーしたあと部材を変えてもコピーは変わらない', () => {
    const job = shelfJob()
    const r = copyCells(job, [c(1, 'W')])
    job.parts[1].expr.W = '1'
    expect(r.ok && r.clip.cells).toEqual([['全体.W']])
  })
})

describe('pasteCells：1つのセルをコピーしたとき', () => {
  it('1つのセルを3つのセルに貼ると、3つとも同じ', () => {
    const job = jobOf(part('a', 'A', '100', '200'), part('b', 'B', '300', '400'), part('c', 'C', '500', '600'))
    const r = okPaste(pasteCells(job, clipOf([['379']]), [c(0, 'W'), c(1, 'H'), c(2, 'W')], ids()))
    expect(table(r.job)).toEqual([
      ['A', '379', '200', 1],
      ['B', '300', '379', 1],
      ['C', '379', '600', 1],
    ])
    expect(r.pasted).toBe(3)
    expect(r.skipped).toEqual([])
  })

  it('式は文字のまま貼る（ほかの仕事に貼っても式のまま。参照できなければ計算のエラー）', () => {
    const src = shelfJob()
    const clip = okCopy(copyCells(src, [c(3, 'W')]))
    const other = jobOf(part('a', 'A', '100', '200'))
    const r = okPaste(pasteCells(other, clip, [c(0, 'W')], ids()))
    expect(r.job.parts[0].expr.W).toBe('天板.W - 20')
    const d = computeDimensions(r.job, shelfAdjusts())
    expect(d.parts[0].finished).toBeNull()
  })

  it('同じ仕事の中で式を貼ると、その場で計算できる（棚板の W を側板の W に）', () => {
    const job = shelfJob()
    const clip = okCopy(copyCells(job, [c(3, 'W')]))
    const r = okPaste(pasteCells(job, clip, [c(2, 'W')], ids()))
    const d = computeDimensions(r.job, shelfAdjusts())
    expect(d.parts[2].finished).toEqual({ W: 380, H: 700 })
  })

  it('仕様書 26.6：「棚板」をコピーしてほかの行の名前に貼ると「棚板」のまま入る（番号を振らない）', () => {
    const job = jobOf(part('a', '棚板'), part('b', 'B'), part('c', 'C'))
    const clip = okCopy(copyCells(job, [c(0, 'name')]))
    const r = okPaste(pasteCells(job, clip, [c(1, 'name'), c(2, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板', '棚板', '棚板'])
    expect(r.pasted).toBe(2)
    expect(r.skipped).toEqual([])
    expect(r.renamed).toEqual([])
  })

  it('全角・半角だけ違う名前も、書いたまま貼る（「棚板１」は「棚板１」のまま）', () => {
    const job = jobOf(part('a', '棚板1'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['棚板１']]), [c(1, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板1', '棚板１'])
  })

  it('前後の空白は外して貼る。空の名前はいくつでも貼れる', () => {
    const job = jobOf(part('a', '棚板'), part('b', 'B'), part('c', 'C'))
    expect(okPaste(pasteCells(job, clipOf([[' 天板 ']]), [c(1, 'name')], ids())).job.parts[1].name).toBe('天板')
    const r2 = okPaste(pasteCells(job, clipOf([['']]), [c(1, 'name'), c(2, 'name')], ids()))
    expect(r2.job.parts.map((p) => p.name)).toEqual(['棚板', '', ''])
    expect(r2.pasted).toBe(2)
  })

  it('名前を貼っても、ほかの式の参照は書き換えない（名前の変更ではない）', () => {
    const job = shelfJob()
    const r = okPaste(pasteCells(job, clipOf([['天板2']]), [c(1, 'name')], ids()))
    expect(r.job.parts[1].name).toBe('天板2')
    expect(r.job.parts[3].expr.W).toBe('天板.W - 20')
  })

  it('名前に使えない文字（式の記号）は貼らない', () => {
    const job = shelfJob()
    const r = okPaste(pasteCells(job, clipOf([['全体.W']]), [c(1, 'name')], ids()))
    expect(r.pasted).toBe(0)
    expect(r.skipped[0]).toMatchObject({ cell: c(1, 'name'), reason: 'invalidName' })
    expect(r.job.parts[1].name).toBe('天板')
  })

  it('枚数の欄：0 以上の整数（全角も）は貼る、空は空にする。式・文字・小数・マイナスは貼らない', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'), part('c', 'C'))
    expect(okPaste(pasteCells(job, clipOf([['３']]), [c(0, 'qty')], ids())).job.parts[0].quantity).toBe(3)
    expect(okPaste(pasteCells(job, clipOf([['0']]), [c(0, 'qty')], ids())).job.parts[0].quantity).toBe(0)
    expect(okPaste(pasteCells(job, clipOf([['']]), [c(0, 'qty')], ids())).job.parts[0].quantity).toBeNull()
    for (const bad of ['全体.W', '1+1', '1.5', '-1', '棚板']) {
      const r = okPaste(pasteCells(job, clipOf([[bad]]), [c(0, 'qty'), c(1, 'qty')], ids()))
      expect(r.pasted).toBe(0)
      expect(r.skipped).toEqual([
        { cell: c(0, 'qty'), reason: 'notQuantity', message: '枚数には 0 以上の整数だけ貼れます' },
        { cell: c(1, 'qty'), reason: 'notQuantity', message: '枚数には 0 以上の整数だけ貼れます' },
      ])
      expect(r.job).toBe(job)
    }
  })

  it('W・H に名前の文字を貼ると、式として入る（読めなければ計算のエラー）', () => {
    const job = shelfJob()
    const r = okPaste(pasteCells(job, clipOf([['棚板']]), [c(2, 'H')], ids()))
    expect(r.job.parts[2].expr.H).toBe('棚板')
    expect(computeDimensions(r.job, shelfAdjusts()).parts[2].finished).toBeNull()
  })

  it('空の行に貼ると部材を作る（枚数は空から。途中の空の行でも、部材の後ろに詰めて足す）', () => {
    const job = jobOf(part('a', 'A'))
    const r = okPaste(pasteCells(job, clipOf([['500']]), [c(3, 'W'), c(5, 'W')], ids()))
    expect(r.job.parts.map((p) => [p.id, p.name, p.expr.W, p.expr.H, p.quantity])).toEqual([
      ['a', 'A', '100', '200', 1],
      ['part-new1', '', '500', '', null],
      ['part-new2', '', '500', '', null],
    ])
    expect(r.pasted).toBe(2)
  })

  it('空の行に空を貼っても部材は作らない', () => {
    const job = jobOf(part('a', 'A'))
    const r = okPaste(pasteCells(job, clipOf([['']]), [c(1, 'W'), c(1, 'H')], ids()))
    expect(r.job.parts).toHaveLength(1)
  })

  it('何も選んでいなければ断る', () => {
    expect(pasteCells(shelfJob(), clipOf([['1']]), [], ids())).toEqual({ ok: false, message: '貼るセルを選んでください' })
  })
})

describe('pasteCells：範囲をコピーしたとき', () => {
  it('2行×2列の範囲を貼ると、選んだセルの左上から同じ形', () => {
    const job = jobOf(part('a', 'A', '1', '2'), part('b', 'B', '3', '4'), part('c', 'C', '5', '6'), part('d', 'D', '7', '8'))
    const clip = okCopy(copyCells(job, [c(0, 'W'), c(0, 'H'), c(1, 'W'), c(1, 'H')]))
    const r = okPaste(pasteCells(job, clip, [c(2, 'W')], ids()))
    expect(table(r.job)).toEqual([
      ['A', '1', '2', 1],
      ['B', '3', '4', 1],
      ['C', '1', '2', 1],
      ['D', '3', '4', 1],
    ])
    expect(r.pasted).toBe(4)
  })

  it('いくつか選んでいても、一番左上のセルから貼る（選んだセルの数・形は使わない）', () => {
    const job = jobOf(part('a', 'A', '1', '2'), part('b', 'B', '3', '4'), part('c', 'C', '5', '6'))
    const r = okPaste(pasteCells(job, clipOf([['9', '9']]), [c(2, 'H'), c(1, 'W'), c(2, 'W')], ids()))
    expect(table(r.job)).toEqual([
      ['A', '1', '2', 1],
      ['B', '9', '9', 1],
      ['C', '5', '6', 1],
    ])
  })

  it('行が部材の数を越えたら、部材を足す', () => {
    const job = shelfJob()
    const clip = okCopy(copyCells(job, [c(2, 'W'), c(2, 'H'), c(2, 'qty'), c(3, 'W'), c(3, 'H'), c(3, 'qty')]))
    const r = okPaste(pasteCells(job, clip, [c(3, 'W')], ids()))
    expect(r.job.parts).toHaveLength(5)
    expect(table(r.job).slice(3)).toEqual([
      ['棚板', '全体.W', '700', 2],
      ['', '天板.W - 20', '天板.H - 20 × 2', 3],
    ])
    expect(r.job.parts[4]).toMatchObject({ id: 'part-new1', rotatable: false, finishedDone: false, thickness: null })
  })

  it('列が表の右（枚数）をはみ出す分は貼らない（数にも入れない）', () => {
    const job = jobOf(part('a', 'A', '1', '2'))
    const r = okPaste(pasteCells(job, clipOf([['7', '8', '9']]), [c(0, 'H')], ids()))
    expect(table(r.job)).toEqual([['A', '1', '7', 8]])
    expect(r.pasted).toBe(2)
    expect(r.skipped).toEqual([])
  })

  it('名前・厚み・W・H・枚数の行まるごとを、ほかの仕事の空の行に貼れる', () => {
    const src = shelfJob()
    const clip = okCopy(copyCells(src, rowRange(0, 2)))
    const other = jobOf()
    const r = okPaste(pasteCells(other, clip, [c(0, 'name')], ids()))
    expect(table(r.job)).toEqual([
      ['全体', '400', '1800', 0],
      ['天板', '全体.W', '全体.H', 1],
    ])
    expect(computeDimensions(r.job, shelfAdjusts()).parts[1].finished).toEqual({ W: 400, H: 1800 })
  })

  it('同じ名前もそのまま貼り、枚数に式は貼られず貼れなかったセルが返る（ほかのセルは貼る）', () => {
    const job = shelfJob()
    // 棚板の行（名前・厚み・W・H・枚数）の形で、名前は今ある「天板」、枚数は式
    const clip = clipOf([['天板', '', '300', '400', '全体.W']])
    const r = okPaste(pasteCells(job, clip, [c(2, 'name')], ids()))
    expect(table(r.job)[2]).toEqual(['天板', '300', '400', 2])
    expect(r.pasted).toBe(4)
    expect(r.skipped).toEqual([{ cell: c(2, 'qty'), reason: 'notQuantity', message: '枚数には 0 以上の整数だけ貼れます' }])
  })

  it('貼るものどうしで同じ名前（全角・半角の違いも）になっても、そのまま貼る', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['X'], ['Ｘ']]), [c(0, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['X', 'Ｘ'])
    expect(r.skipped).toEqual([])
  })

  it('名前を入れ替える貼り方（A・B の行に B・A）は、貼ったあとに重ならないので貼れる', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['B'], ['A']]), [c(0, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['B', 'A'])
    expect(r.skipped).toEqual([])
  })

  it('貼れない名前（記号入り）は貼らず、その行は元の名前が残る（ほかの行はそのまま貼る）', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['B'], ['棚+板']]), [c(0, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['B', 'B'])
    expect(r.skipped.map((s) => [s.cell, s.reason])).toEqual([[c(1, 'name'), 'invalidName']])
  })

  it('名前に使えない（記号入り）名前は、今までどおり貼らない', () => {
    const job = jobOf(part('a', '棚(板'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['棚(板']]), [c(1, 'name')], ids()))
    expect(r.job).toBe(job)
    expect(r.skipped.map((s) => s.reason)).toEqual(['invalidName'])
  })

  it('貼って行の全部の欄が空になった部材は消す', () => {
    const job = jobOf(part('a', 'A'), part('b', '', '1', '', null))
    const r = okPaste(pasteCells(job, clipOf([['']]), [c(1, 'W')], ids()))
    expect(r.job.parts.map((p) => p.id)).toEqual(['a'])
  })

  it('部材 150 行に名前・数字をまとめて貼っても、すぐ終わる', () => {
    const job = jobOf(...Array.from({ length: 150 }, (_, i) => part(`p${i}`, `部材${i}`)))
    const sel = Array.from({ length: 150 }, (_, i) => [c(i, 'name'), c(i, 'W')]).flat()
    const t = performance.now()
    const r = okPaste(pasteCells(job, clipOf([['棚板']]), sel, ids()))
    expect(performance.now() - t).toBeLessThan(1000)
    expect(r.pasted).toBe(300)
    expect(r.skipped).toHaveLength(0)
    expect(r.job.parts.slice(0, 3).map((p) => p.name)).toEqual(['棚板', '棚板', '棚板'])
    expect(r.job.parts[149].name).toBe('棚板')
  })

  it('元の仕事は書き換えない', () => {
    const job = shelfJob()
    const before = JSON.stringify(job)
    pasteCells(job, clipOf([['1', '2'], ['3', '4']]), [c(3, 'W')], ids())
    expect(JSON.stringify(job)).toBe(before)
  })
})

describe('clearCells（消す）', () => {
  it('選んだセルの中身を空にする（枚数は空。名前を消しても式は書き換えない）', () => {
    const job = shelfJob()
    const next = clearCells(job, [c(1, 'name'), c(2, 'W'), c(3, 'qty')])
    expect(table(next)).toEqual([
      ['全体', '400', '1800', 0],
      ['', '全体.W', '全体.H', 1],
      ['側板', '', '700', 2],
      ['棚板', '天板.W - 20', '天板.H - 20 × 2', null],
    ])
  })

  it('行の全部の欄が空になった部材は消す。空の行のセルは何もしない', () => {
    const job = shelfJob()
    const next = clearCells(job, [c(0, 'name'), c(0, 'W'), c(0, 'H'), c(0, 'qty'), c(7, 'W')])
    expect(next.parts.map((p) => p.name)).toEqual(['天板', '側板', '棚板'])
  })

  it('空の行だけ選んだときは同じ仕事を返す', () => {
    const job = shelfJob()
    expect(clearCells(job, [c(4, 'W')])).toBe(job)
  })
})

describe('deleteRows（行を削除）・selectedPartIds', () => {
  it('選んだセルのある行の部材をまとめて消す（同じ行のセルが多くても1回）', () => {
    const job = shelfJob()
    const sel = [c(0, 'W'), c(0, 'H'), c(2, 'qty'), c(9, 'name')]
    expect(selectedPartIds(job, sel)).toEqual(['part-zentai', 'part-gawaita'])
    expect(deleteRows(job, sel).parts.map((p) => p.name)).toEqual(['天板', '棚板'])
  })

  it('空の行だけなら同じ仕事を返す', () => {
    const job = shelfJob()
    expect(deleteRows(job, [c(4, 'W')])).toBe(job)
  })
})

function okCopy(r: ReturnType<typeof copyCells>): CellClip {
  if (!r.ok) throw new Error(r.message)
  return r.clip
}

describe('厚みの列（第2.2版。仕様書 26.1・26.8）', () => {
  /** 見本の棚の、棚板の厚みを 18 にしたもの */
  const thick = () => {
    const job = shelfJob()
    job.parts[3] = { ...job.parts[3], thickness: 18 }
    return job
  }
  const thicknesses = (job: Job) => job.parts.map((p) => p.thickness)

  it('列は 名前・厚み・W・H・枚数。厚みのセルの中身は数字の文字（空は \'\'・小数もそのまま）', () => {
    const job = thick()
    job.parts[1] = { ...job.parts[1], thickness: 2.5 }
    expect([cellText(job, c(3, 'T')), cellText(job, c(1, 'T')), cellText(job, c(0, 'T')), cellText(job, c(9, 'T'))]).toEqual(['18', '2.5', '', ''])
    expect(selectionShape([c(0, 'T')])).toEqual({ kind: 'range', top: 0, left: 1, rows: 1, cols: 1 })
  })

  it('厚み 18 のセルをコピーして3行に貼ると3行とも 18', () => {
    const job = thick()
    const clip = okCopy(copyCells(job, [c(3, 'T')]))
    expect(clip.cells).toEqual([['18']])
    const r = okPaste(pasteCells(job, clip, [c(0, 'T'), c(1, 'T'), c(2, 'T')], ids()))
    expect(thicknesses(r.job)).toEqual([18, 18, 18, 18])
    expect(r.pasted).toBe(3)
    expect(r.skipped).toEqual([])
  })

  it('abc・0・−1・式は貼られず理由が返る（「厚みには 0 より大きい数だけ貼れます」）。ほかのセルは貼る', () => {
    const job = thick()
    for (const text of ['abc', '0', '-1', '0.0', '18mm', '天板.T', '9 * 2']) {
      const r = okPaste(pasteCells(job, clipOf([[text]]), [c(3, 'T')], ids()))
      expect(r.job, text).toBe(job)
      expect(r.skipped, text).toEqual([{ cell: c(3, 'T'), reason: 'notThickness', message: '厚みには 0 より大きい数だけ貼れます' }])
    }
    const r = okPaste(pasteCells(job, clipOf([['abc', '300']]), [c(2, 'T')], ids()))
    expect(r.job.parts[2]).toMatchObject({ thickness: null, expr: { W: '300' } })
    expect(r.pasted).toBe(1)
  })

  it('全角の数字・小数点も貼れる。空を貼ると厚みが空になる', () => {
    const job = thick()
    expect(okPaste(pasteCells(job, clipOf([['１８．５']]), [c(0, 'T')], ids())).job.parts[0].thickness).toBe(18.5)
    expect(okPaste(pasteCells(job, clipOf([[' 2.5 ']]), [c(0, 'T')], ids())).job.parts[0].thickness).toBe(2.5)
    expect(okPaste(pasteCells(job, clipOf([['']]), [c(3, 'T')], ids())).job.parts[3].thickness).toBeNull()
  })

  it('名前〜枚数の5列をまとめてコピーして別の行（空の行）に貼れる', () => {
    const src = thick()
    const clip = okCopy(copyCells(src, rowRange(3)))
    expect(clip.cells).toEqual([['棚板', '18', '天板.W - 20', '天板.H - 20 × 2', '3']])
    const r = okPaste(pasteCells(jobOf(), clip, [c(0, 'name')], ids()))
    expect(r.job.parts[0]).toMatchObject({ name: '棚板', thickness: 18, expr: { W: '天板.W - 20', H: '天板.H - 20 × 2' }, quantity: 3 })
    expect(r.pasted).toBe(5)
  })

  it('厚みだけを空の行に貼ると、厚みだけの部材ができて残る（名前・W・H・枚数は空）', () => {
    const r = okPaste(pasteCells(shelfJob(), clipOf([['12']]), [c(4, 'T')], ids()))
    expect(r.job.parts).toHaveLength(5)
    expect(r.job.parts[4]).toMatchObject({ name: '', thickness: 12, expr: { W: '', H: '' }, quantity: null })
  })

  it('クリアで厚みが空になる。厚みだけの行をクリアすると部材は外れる', () => {
    const job = thick()
    expect(thicknesses(clearCells(job, [c(3, 'T')]))).toEqual([null, null, null, null])
    const only = { ...job, parts: [...job.parts, part('p5', '', '', '', null)] }
    only.parts[4] = { ...only.parts[4], thickness: 9 }
    expect(clearCells(only, [c(4, 'T')]).parts).toHaveLength(4)
  })

  it('行全体（5列）を消すと部材が外れる。4列（厚みを残す）なら残る', () => {
    const job = thick()
    expect(clearCells(job, rowRange(3)).parts).toHaveLength(3)
    const kept = clearCells(job, [c(3, 'name'), c(3, 'W'), c(3, 'H'), c(3, 'qty')])
    expect(kept.parts[3]).toMatchObject({ name: '', thickness: 18, quantity: null })
  })

  it('コピーしたセルには列の並びの印（columns）が付く', () => {
    expect(okCopy(copyCells(shelfJob(), [c(0, 'T')])).columns).toBe('name,T,W,H,qty')
  })
})
