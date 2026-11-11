// 部材の行の操作で、部材の調整（Part.adjust）がその部材についていく（第2.1版。仕様書 25.2・25.9）
import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../dimensions'
import { MELAMINE_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { moveParts, sortParts } from '../order'
import type { CellClip, Job } from '../types'
import { clearCells, deleteRows, fillCells, pasteCells } from './cells'
import { duplicatePart } from './copy'

const M = `-{n:${MELAMINE_ID}}`

/** 見本の棚（棚板 W の調整 −メラミン1）に、側板 H の調整 −2 を足したもの */
function job(): Job {
  const j = shelfJob()
  j.parts[2] = { ...j.parts[2], adjust: { W: '', H: '-2' } }
  return j
}

function ids() {
  let n = 0
  return (p: string) => `${p}-new${++n}`
}

/** 部材の名前 → 調整（W・H） */
const adjustByName = (j: Job) => Object.fromEntries(j.parts.map((p) => [p.name, `${p.adjust.W}|${p.adjust.H}`]))

describe('部材の行の操作で調整がついていく', () => {
  it('複製（duplicatePart）：調整も写す（別のオブジェクト）', () => {
    const r = duplicatePart(job(), 'part-tanaita', ids())
    if (!r.ok) throw new Error(r.message)
    const copy = r.job.parts[4]
    expect(copy.name).toBe('棚板のコピー')
    expect(copy.adjust).toEqual({ W: M, H: '' })
    expect(copy.adjust).not.toBe(r.job.parts[3].adjust)
  })

  it('並べ替え（W の大きい順）・番号を引いて動かす：調整は部材といっしょに動く', () => {
    const j = job()
    const sorted = sortParts(j.parts, computeDimensions(j, shelfAdjusts()), 'H', 'asc')
    expect(sorted.map((p) => p.name)).toEqual(['側板', '棚板', '全体', '天板'])
    expect(adjustByName({ ...j, parts: sorted })).toEqual(adjustByName(j))
    const moved = moveParts(j.parts, 3, 1, 0)
    expect(moved.map((p) => p.name)).toEqual(['棚板', '全体', '天板', '側板'])
    expect(moved[0].adjust).toEqual({ W: M, H: '' })
    expect(moved[3].adjust).toEqual({ W: '', H: '-2' })
  })

  it('行を削除（deleteRows）：消した部材の調整も消え、残る部材の調整はそのまま', () => {
    const r = deleteRows(job(), [{ row: 2, col: 'W' }])
    expect(r.parts.map((p) => p.name)).toEqual(['全体', '天板', '棚板'])
    expect(r.parts[2].adjust).toEqual({ W: M, H: '' })
  })

  it('［仕上がり］でクリア：名前・W・H・枚数を全部消した行は、調整が入っていても外す（仕様書 25.9）', () => {
    const r = clearCells(job(), { top: 3, left: 0, rows: 1, cols: 4 })
    expect(r.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板'])
  })

  it('［仕上がり］でクリア：一部の欄だけ消したときは、調整は残る', () => {
    const r = clearCells(job(), [{ row: 3, col: 'W' }])
    expect(r.parts[3].expr.W).toBe('')
    expect(r.parts[3].adjust).toEqual({ W: M, H: '' })
  })

  it('［仕上がり］で貼り付け・オートフィル：調整は変えない。表の下に足す部材の調整は空', () => {
    const clip: CellClip = { rows: 1, cols: 1, cells: [['400']] }
    const r = pasteCells(job(), clip, [{ row: 3, col: 'W' }, { row: 4, col: 'W' }], ids())
    if (!r.ok) throw new Error(r.message)
    expect(r.job.parts[3]).toMatchObject({ expr: { W: '400' }, adjust: { W: M, H: '' } })
    expect(r.job.parts[4]).toMatchObject({ expr: { W: '400' }, adjust: { W: '', H: '' } })
    const f = fillCells(job(), { top: 3, left: 1, rows: 1, cols: 1 }, { top: 2, left: 1, rows: 3, cols: 1 }, ids())
    if (!f.ok) throw new Error(f.message)
    expect(f.job.parts[2].expr.W).toBe('天板.W - 20')
    expect(f.job.parts[2].adjust).toEqual({ W: '', H: '-2' })
    expect(f.job.parts[4].adjust).toEqual({ W: '', H: '' })
  })

  it('切り取って同じ仕事に貼る：仕上がりの欄だけ動き、調整は元の部材に残る', () => {
    const j = job()
    const clip: CellClip = { rows: 1, cols: 1, cells: [['天板.W - 20']], cut: { jobId: j.id, range: { top: 3, left: 1, rows: 1, cols: 1 } } }
    const r = pasteCells(j, clip, [{ row: 2, col: 'W' }], ids())
    if (!r.ok) throw new Error(r.message)
    expect(r.job.parts[3].expr.W).toBe('')
    expect(r.job.parts[3].adjust).toEqual({ W: M, H: '' })
  })
})
