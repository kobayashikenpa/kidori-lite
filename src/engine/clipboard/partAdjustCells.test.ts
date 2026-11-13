// ［調整］のタブの W・H の欄のコピー・切り取り・貼り付け・クリア・オートフィル（第2.1版。仕様書 25.2・25.9）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { MELAMINE_ID, shelfAdjusts } from '../fixtures/shelf'
import type { CellClip, CellRange, Job, Part } from '../types'
import { copyCells, pasteCells } from './cells'
import {
  ADJUST_CLIP_TO_FINISHED_MESSAGE,
  clearPartAdjustCells,
  clearPartAdjustCutSource,
  copyPartAdjustCells,
  cutPartAdjustCells,
  FINISHED_CLIP_TO_ADJUST_MESSAGE,
  fillPartAdjustCells,
  partAdjustCellText,
  pastePartAdjustCells,
  type PartAdjustPasteResult,
} from './partAdjustCells'

const M = `−{n:${MELAMINE_ID}}×2`

function part(id: string, name: string, adjustW = '', adjustH = '', quantity: number | null = 1): Part {
  return { id, name, expr: { W: '900', H: '300' }, adjust: { W: adjustW, H: adjustH }, thickness: null, rowColor: null, cellColors: {}, memo: '', quantity, rotatable: false, finishedDone: false }
}

/** 4つの部材（D の W に調整 −メラミン1×2、H に −1） */
function jobOf(id = 'job-a'): Job {
  const job = createJob({ id, name: id, now: '2026-11-11T00:00:00.000Z' })
  job.parts = [part('pa', 'A'), part('pb', 'B'), part('pc', 'C', '', '', null), part('pd', 'D', M, '-1', 2)]
  return job
}

const R = (top: number, left: number, rows: number, cols: number): CellRange => ({ top, left, rows, cols })

function ok(r: PartAdjustPasteResult): Extract<PartAdjustPasteResult, { ok: true }> {
  if (!r.ok) throw new Error(r.message)
  return r
}

/** 部材ごとの [名前, 調整 W, 調整 H, 枚数, 仕上がり W] */
const rowsOf = (j: Job) => j.parts.map((p) => [p.name, p.adjust.W, p.adjust.H, p.quantity, p.expr.W])

describe('partAdjustCellText・copyPartAdjustCells（［調整］でコピー）', () => {
  it('W・H は調整の式、名前・枚数は今の中身（枚数が空なら空の文字）。空の行は空', () => {
    const j = jobOf()
    expect(partAdjustCellText(j, { row: 3, col: 'W' })).toBe(M)
    expect(partAdjustCellText(j, { row: 3, col: 'H' })).toBe('-1')
    expect(partAdjustCellText(j, { row: 3, col: 'name' })).toBe('D')
    expect(partAdjustCellText(j, { row: 3, col: 'qty' })).toBe('2')
    expect(partAdjustCellText(j, { row: 2, col: 'qty' })).toBe('')
    expect(partAdjustCellText(j, { row: 9, col: 'W' })).toBe('')
  })

  it('1つのセル：調整の式のまま。［調整］から写した印（source: adjust）を付ける', () => {
    expect(copyPartAdjustCells(jobOf(), [{ row: 3, col: 'W' }])).toEqual({ ok: true, clip: { rows: 1, cols: 1, cells: [[M]], source: 'adjust', columns: 'name,T,W,H,qty' } })
  })

  it('範囲：名前・厚み・枚数のセルも選んでコピーできる', () => {
    const j = jobOf()
    j.parts[3] = { ...j.parts[3], thickness: 18 }
    const r = copyPartAdjustCells(j, R(3, 0, 1, 5))
    expect(r).toEqual({ ok: true, clip: { rows: 1, cols: 5, cells: [['D', '18', M, '-1', '2']], source: 'adjust', columns: 'name,T,W,H,qty' } })
  })

  it('離れたセルはコピーできない（今と同じ文）', () => {
    expect(copyPartAdjustCells(jobOf(), [{ row: 0, col: 'W' }, { row: 2, col: 'H' }])).toEqual({ ok: false, message: 'コピーは1つのセルか、四角い範囲を選んでください' })
  })

  it('切り取り：元（仕事の id と範囲）を付ける。仕事はまだ変えない', () => {
    const r = cutPartAdjustCells(jobOf(), R(3, 2, 1, 2))
    expect(r).toEqual({ ok: true, clip: { rows: 1, cols: 2, cells: [[M, '-1']], source: 'adjust', cut: { jobId: 'job-a', range: R(3, 2, 1, 2) }, columns: 'name,T,W,H,qty' } })
  })
})

describe('pastePartAdjustCells（［調整］に貼る）', () => {
  const one: CellClip = { rows: 1, cols: 1, cells: [[M]], source: 'adjust' }

  it('調整 −メラミン1×2 を1つコピーして3行に貼ると3行とも入る（仕上がり・名前・枚数は変わらない）', () => {
    const r = ok(pastePartAdjustCells(jobOf(), one, R(0, 2, 3, 1)))
    expect(r.pasted).toBe(3)
    expect(rowsOf(r.job)).toEqual([
      ['A', M, '', 1, '900'],
      ['B', M, '', 1, '900'],
      ['C', M, '', null, '900'],
      ['D', M, '-1', 2, '900'],
    ])
    // 調整後：900 − 2 ＝ 898
    expect(computeDimensions(r.job, shelfAdjusts()).parts.slice(0, 3).map((d) => d.adjustedByAxis.W)).toEqual([898, 898, 898])
    expect(r.skipped).toEqual([])
    expect(r.cutClear).toBeNull()
  })

  it('範囲（W・H の2列）は、選んだ一番左上から同じ形で貼る', () => {
    const clip: CellClip = { rows: 1, cols: 2, cells: [['-2', '+3']], source: 'adjust' }
    const r = ok(pastePartAdjustCells(jobOf(), clip, [{ row: 1, col: 'W' }]))
    expect(rowsOf(r.job)[1]).toEqual(['B', '-2', '+3', 1, '900'])
    expect(r.pasted).toBe(2)
  })

  it('名前・厚み・枚数のセルは変わらない（数えない）。名前〜枚数の行全体に1つのセルを貼ると W・H だけ', () => {
    const r = ok(pastePartAdjustCells(jobOf(), one, R(0, 0, 1, 5)))
    expect(rowsOf(r.job)[0]).toEqual(['A', M, M, 1, '900'])
    expect(r.job.parts[0].thickness).toBeNull()
    expect(r.pasted).toBe(2)
    const clip: CellClip = { rows: 1, cols: 5, cells: [['X', '12', '-2', '-3', '9']], source: 'adjust' }
    const whole = ok(pastePartAdjustCells(jobOf(), clip, [{ row: 0, col: 'name' }]))
    expect(rowsOf(whole.job)[0]).toEqual(['A', '-2', '-3', 1, '900'])
  })

  it('部材の無い行には貼らない（部材を作らない。部材のある行までで止める）', () => {
    const r = ok(pastePartAdjustCells(jobOf(), one, R(2, 2, 5, 1)))
    expect(r.job.parts).toHaveLength(4)
    expect(r.pasted).toBe(2)
    const none = pastePartAdjustCells(jobOf(), one, [{ row: 6, col: 'W' }])
    expect(none.ok && none.job).toEqual(jobOf())
    expect(none.ok && none.pasted).toBe(0)
  })

  it('［仕上がり］でコピーしたものは［調整］に貼れない', () => {
    const fin = copyCells(jobOf(), [{ row: 0, col: 'W' }])
    if (!fin.ok) throw new Error(fin.message)
    expect(pastePartAdjustCells(jobOf(), fin.clip, [{ row: 1, col: 'W' }])).toEqual({ ok: false, message: FINISHED_CLIP_TO_ADJUST_MESSAGE })
    expect(FINISHED_CLIP_TO_ADJUST_MESSAGE).toBe('［仕上がり］でコピーしたものは［調整］には貼れません')
  })

  it('［調整］でコピーしたものは［仕上がり］に貼れない（逆も）', () => {
    const adj = copyPartAdjustCells(jobOf(), [{ row: 3, col: 'W' }])
    if (!adj.ok) throw new Error(adj.message)
    expect(pasteCells(jobOf(), adj.clip, [{ row: 0, col: 'W' }], () => 'x')).toEqual({ ok: false, message: ADJUST_CLIP_TO_FINISHED_MESSAGE })
    expect(ADJUST_CLIP_TO_FINISHED_MESSAGE).toBe('［調整］でコピーしたものは［仕上がり］には貼れません')
  })

  it('選んだセルが無ければ断る', () => {
    expect(pastePartAdjustCells(jobOf(), one, [])).toEqual({ ok: false, message: '貼るセルを選んでください' })
  })

  it('元の仕事は書き換えない', () => {
    const j = jobOf()
    const before = JSON.parse(JSON.stringify(j))
    pastePartAdjustCells(j, one, R(0, 2, 3, 2))
    expect(j).toEqual(before)
  })
})

describe('切り取り（［調整］）', () => {
  it('同じ仕事に貼ると、元の W・H が空になる', () => {
    const j = jobOf()
    const cut = cutPartAdjustCells(j, R(3, 2, 1, 2))
    if (!cut.ok) throw new Error(cut.message)
    const r = ok(pastePartAdjustCells(j, cut.clip, [{ row: 0, col: 'W' }]))
    expect(rowsOf(r.job)).toEqual([
      ['A', M, '-1', 1, '900'],
      ['B', '', '', 1, '900'],
      ['C', '', '', null, '900'],
      ['D', '', '', 2, '900'],
    ])
    expect(r.cutClear).toBeNull()
  })

  it('名前・厚み・枚数のセルを含めて切り取っても、名前・厚み・枚数は消さない（変わるのは W・H だけ）', () => {
    const j = jobOf()
    j.parts[3] = { ...j.parts[3], thickness: 18 }
    const cut = cutPartAdjustCells(j, R(3, 0, 1, 5))
    if (!cut.ok) throw new Error(cut.message)
    const r = ok(pastePartAdjustCells(j, cut.clip, [{ row: 0, col: 'name' }]))
    expect(rowsOf(r.job)[0]).toEqual(['A', M, '-1', 1, '900'])
    expect(rowsOf(r.job)[3]).toEqual(['D', '', '', 2, '900'])
    expect(r.job.parts.map((p) => p.thickness)).toEqual([null, null, null, 18])
  })

  it('貼る先と重なる元のセルは空にしない（同じ所に貼り直す）', () => {
    const j = jobOf()
    const cut = cutPartAdjustCells(j, R(3, 2, 1, 1))
    if (!cut.ok) throw new Error(cut.message)
    const r = ok(pastePartAdjustCells(j, cut.clip, R(2, 2, 2, 1)))
    expect(rowsOf(r.job).map((x) => x[1])).toEqual(['', '', M, M])
  })

  it('切り取ったあとに書き換えた元のセルは空にしない', () => {
    const j = jobOf()
    const cut = cutPartAdjustCells(j, R(3, 2, 1, 1))
    if (!cut.ok) throw new Error(cut.message)
    const edited = { ...j, parts: j.parts.map((p) => (p.id === 'pd' ? { ...p, adjust: { ...p.adjust, W: '-5' } } : p)) }
    const r = ok(pastePartAdjustCells(edited, cut.clip, [{ row: 0, col: 'W' }]))
    expect(rowsOf(r.job)[3][1]).toBe('-5')
  })

  it('ほかの仕事に貼ると cutClear を返し、clearPartAdjustCutSource で元の W・H を空にする', () => {
    const a = jobOf('job-a')
    const b = jobOf('job-b')
    const cut = cutPartAdjustCells(a, R(3, 0, 1, 4))
    if (!cut.ok) throw new Error(cut.message)
    const r = ok(pastePartAdjustCells(b, cut.clip, [{ row: 0, col: 'name' }]))
    expect(rowsOf(r.job)[0]).toEqual(['A', M, '-1', 1, '900'])
    expect(r.cutClear).toEqual({ jobId: 'job-a', cells: [{ row: 3, col: 'W' }, { row: 3, col: 'H' }] })
    const cleared = clearPartAdjustCutSource(a, cut.clip, r.cutClear!.cells)
    expect(rowsOf(cleared)[3]).toEqual(['D', '', '', 2, '900'])
  })
})

describe('fillPartAdjustCells（オートフィル）', () => {
  it('下の行へくり返す。部材の無い行には入れない', () => {
    const j = jobOf()
    j.parts[0] = { ...j.parts[0], adjust: { W: '-1', H: '' } }
    j.parts[1] = { ...j.parts[1], adjust: { W: '-2', H: '' } }
    const r = ok(fillPartAdjustCells(j, R(0, 2, 2, 1), R(0, 2, 7, 1)))
    expect(rowsOf(r.job).map((x) => x[1])).toEqual(['-1', '-2', '-1', '-2'])
    expect(r.job.parts).toHaveLength(4)
    expect(r.pasted).toBe(2)
  })

  it('上へ引いてもくり返す（元の下の端の行が、元のすぐ上に入る）', () => {
    const r = ok(fillPartAdjustCells(jobOf(), R(3, 2, 1, 2), R(1, 2, 3, 2)))
    expect(rowsOf(r.job)).toEqual([
      ['A', '', '', 1, '900'],
      ['B', M, '-1', 1, '900'],
      ['C', M, '-1', null, '900'],
      ['D', M, '-1', 2, '900'],
    ])
  })

  it('名前・厚み・枚数の列を含めて引いても、名前・厚み・枚数は変わらない', () => {
    const j = jobOf()
    j.parts[3] = { ...j.parts[3], thickness: 18 }
    const r = ok(fillPartAdjustCells(j, R(3, 0, 1, 5), R(0, 0, 4, 5)))
    expect(r.job.parts.map((p) => p.thickness)).toEqual([null, null, null, 18])
    expect(rowsOf(r.job).map((x) => [x[0], x[1], x[3]])).toEqual([
      ['A', M, 1],
      ['B', M, 1],
      ['C', M, null],
      ['D', M, 2],
    ])
  })

  it('範囲でない元は断る', () => {
    expect(fillPartAdjustCells(jobOf(), R(0, 2, 0, 1), R(0, 2, 3, 1))).toEqual({ ok: false, message: '引く元の範囲を選んでください' })
  })
})

describe('clearPartAdjustCells（クリア）', () => {
  it('W・H の調整を空にする。名前・厚み・枚数・仕上がりは変えない', () => {
    const j = jobOf()
    j.parts[3] = { ...j.parts[3], thickness: 18 }
    const r = clearPartAdjustCells(j, R(3, 0, 1, 5))
    expect(rowsOf(r)[3]).toEqual(['D', '', '', 2, '900'])
    expect(r.parts[3].thickness).toBe(18)
  })

  it('部材は消さない（仕上がりの欄が空の部材でも）。空の行・変わらないときは同じ仕事', () => {
    const j = jobOf()
    j.parts[2] = { ...j.parts[2], name: '', expr: { W: '', H: '' }, adjust: { W: '-1', H: '' }, quantity: null }
    const r = clearPartAdjustCells(j, [{ row: 2, col: 'W' }])
    expect(r.parts).toHaveLength(4)
    expect(r.parts[2].adjust).toEqual({ W: '', H: '' })
    const same = jobOf()
    expect(clearPartAdjustCells(same, [{ row: 9, col: 'W' }])).toBe(same)
    expect(clearPartAdjustCells(same, [{ row: 0, col: 'W' }])).toBe(same)
  })
})

describe('［調整］のタブの厚みの列（第2.2版。仕様書 26.1：［調整］では厚みは見るだけ）', () => {
  const thickJob = () => {
    const j = jobOf()
    j.parts[3] = { ...j.parts[3], thickness: 18 }
    return j
  }

  it('厚みのセルの中身は厚みの数字（コピーもできる）', () => {
    expect(partAdjustCellText(thickJob(), { row: 3, col: 'T' })).toBe('18')
    expect(partAdjustCellText(thickJob(), { row: 0, col: 'T' })).toBe('')
    const r = copyPartAdjustCells(thickJob(), [{ row: 3, col: 'T' }])
    expect(r.ok && r.clip.cells).toEqual([['18']])
  })

  it('貼り付けで厚みは変わらない（数えない）', () => {
    const clip: CellClip = { rows: 1, cols: 1, cells: [['12']], source: 'adjust' }
    const r = ok(pastePartAdjustCells(thickJob(), clip, [{ row: 3, col: 'T' }, { row: 0, col: 'T' }]))
    expect(r.pasted).toBe(0)
    expect(r.job.parts.map((p) => p.thickness)).toEqual([null, null, null, 18])
  })

  it('クリア・オートフィルでも厚みは変わらない', () => {
    const j = thickJob()
    expect(clearPartAdjustCells(j, [{ row: 3, col: 'T' }])).toBe(j)
    const f = ok(fillPartAdjustCells(j, R(3, 1, 1, 1), R(0, 1, 4, 1)))
    expect(f.pasted).toBe(0)
    expect(f.job.parts.map((p) => p.thickness)).toEqual([null, null, null, 18])
  })
})
