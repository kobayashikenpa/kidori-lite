// 部材の調整（第2.1版。仕様書 25.2・25.5）：store の操作で調整を入れる・その部材についていく
import { describe, expect, it } from 'vitest'
import { usableAdjusts } from '../engine/adjusts'
import { computeDimensions } from '../engine/dimensions'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import type { Job } from '../engine/types'
import { copyJob, insertPart, newPart, updatePart } from './jobs'
import { currentJob, initialState, reduce, type Env, type StoreAction, type StoreState } from './reducer'

const T0 = new Date(2026, 10, 11, 9, 0, 0)
const T1 = new Date(2026, 10, 11, 10, 0, 0)
const M = `-{n:${MELAMINE_ID}}`

function env(now = T0): Env {
  let n = 0
  return { newId: (prefix) => `${prefix}-${++n}`, now }
}

/** 見本の棚（棚板 W の調整 −メラミン1）に、側板 H の調整 −2 を足したもの */
function job(): Job {
  const j = shelfJob()
  j.parts[2] = { ...j.parts[2], adjust: { W: '', H: '-2' } }
  return j
}

function start(): StoreState {
  return initialState({
    status: 'ok',
    data: { version: 1, jobs: [job()], adjusts: shelfAdjusts(), cellClip: null, adjustClip: null },
    currentJobId: 'job-shelf',
    canSave: true,
  })
}

function run(state: StoreState, action: StoreAction, e: Env = env()) {
  const r = reduce(state, action, e)
  if (!r.ok) throw new Error(r.message)
  return r
}

/** 部材の名前 → 調整（W|H） */
const adjustByName = (j: Job) => Object.fromEntries(j.parts.map((p) => [p.name, `${p.adjust.W}|${p.adjust.H}`]))

describe('jobs.ts：部材の調整', () => {
  it('仕事のコピー（copyJob）は調整もコピーする（別のオブジェクト）', () => {
    const src = job()
    const c = copyJob(src, T0, 'job-copy', env().newId)
    expect(c.parts.map((p) => p.adjust)).toEqual(src.parts.map((p) => p.adjust))
    expect(c.parts[3].adjust).not.toBe(src.parts[3].adjust)
    expect(computeDimensions(c, shelfAdjusts()).parts[3].cut).toEqual({ W: 389, H: 1770 })
  })

  it('updatePart：調整だけを変えられる（片方の軸だけでも。もう片方はそのまま）', () => {
    const j = job()
    const r = updatePart(j, 'part-tanaita', { adjust: { H: `-{n:${SHEET_ID}}` } })
    if (!r.ok) throw new Error(r.message)
    expect(r.job.parts[3].adjust).toEqual({ W: M, H: `-{n:${SHEET_ID}}` })
    expect(r.job.parts[3].expr).toEqual(j.parts[3].expr)
    // 元の仕事は変えない
    expect(j.parts[3].adjust).toEqual({ W: M, H: '' })
  })

  it('updatePart：仕上がりの式だけ変えても調整はそのまま。名前を変えても調整は書き換えない', () => {
    const j = job()
    const r = updatePart(j, 'part-tanaita', { expr: { W: '370' } })
    if (!r.ok) throw new Error(r.message)
    expect(r.job.parts[3]).toMatchObject({ expr: { W: '370', H: '天板.H - 20 × 2' }, adjust: { W: M, H: '' } })
    const renamed = updatePart(j, 'part-tenita', { name: '天板A' })
    if (!renamed.ok) throw new Error(renamed.message)
    expect(renamed.job.parts[3].adjust).toEqual({ W: M, H: '' })
  })

  it('insertPart：調整のある部材を入れられる（写しを入れる）', () => {
    const p = newPart('p-new', { name: '地板', expr: { W: '400', H: '600' }, adjust: { W: '-1', H: '' } })
    const r = insertPart(job(), 1, p)
    if (!r.ok) throw new Error(r.message)
    expect(r.job.parts[1].adjust).toEqual({ W: '-1', H: '' })
    expect(r.job.parts[1].adjust).not.toBe(p.adjust)
  })
})

describe('reducer：調整を入れる（setPartAdjust）', () => {
  it('部材の W・H の調整を入れる。調整後・木取り寸法が変わり、updatedAt が付く', () => {
    const r = run(start(), { type: 'setPartAdjust', partId: 'part-gawaita', axis: 'W', text: `−{n:${MELAMINE_ID}}×2` }, env(T1))
    const j = currentJob(r.state)!
    expect(j.parts[2].adjust).toEqual({ W: `−{n:${MELAMINE_ID}}×2`, H: '-2' })
    expect(j.updatedAt).toBe(T1.toISOString())
    const d = computeDimensions(j, usableAdjusts(r.state.data.adjusts)).parts[2]
    expect(d.adjusted).toEqual({ W: 398, H: 698 })
    expect(d.cut).toEqual({ W: 408, H: 708 })
  })

  it('空にすると調整なし。同じ値なら何も変えない（updatedAt も付けない）', () => {
    const cleared = run(start(), { type: 'setPartAdjust', partId: 'part-tanaita', axis: 'W', text: '' }).state
    expect(currentJob(cleared)!.parts[3].adjust.W).toBe('')
    const s = start()
    const same = run(s, { type: 'setPartAdjust', partId: 'part-tanaita', axis: 'W', text: M }, env(T1))
    expect(same.state).toBe(s)
  })

  it('無い部材には入れられない', () => {
    expect(reduce(start(), { type: 'setPartAdjust', partId: 'nothing', axis: 'W', text: '-1' }, env())).toEqual({ ok: false, message: '部材が見つかりません' })
  })

  it('updatePart の patch でも調整を変えられる（片方の軸だけ）', () => {
    const r = run(start(), { type: 'updatePart', partId: 'part-tanaita', patch: { adjust: { H: '-3' } } })
    expect(currentJob(r.state)!.parts[3].adjust).toEqual({ W: M, H: '-3' })
  })
})

describe('reducer：行の操作で調整がその部材についていく（削除では消える）', () => {
  it('上に挿入した行の下へずれても、調整は元の部材のまま', () => {
    const r = run(start(), { type: 'insertPart', index: 1, part: {} })
    const j = currentJob(r.state)!
    expect(j.parts[1].adjust).toEqual({ W: '', H: '' })
    expect(j.parts[3]).toMatchObject({ name: '側板', adjust: { W: '', H: '-2' } })
    expect(j.parts[4]).toMatchObject({ name: '棚板', adjust: { W: M, H: '' } })
  })

  it('番号を引いて動かす（moveParts）', () => {
    const before = adjustByName(job())
    const j = currentJob(run(start(), { type: 'moveParts', from: 2, count: 2, to: 0 }).state)!
    expect(j.parts.map((p) => p.name)).toEqual(['側板', '棚板', '全体', '天板'])
    expect(adjustByName(j)).toEqual(before)
  })

  it('W の大きい順に並べ替える（sortParts。比べるのは仕上がり）', () => {
    const before = adjustByName(job())
    const j = currentJob(run(start(), { type: 'sortParts', key: 'H', order: 'asc' }).state)!
    expect(j.parts.map((p) => p.name)).toEqual(['側板', '棚板', '全体', '天板'])
    expect(adjustByName(j)).toEqual(before)
  })

  it('複製する（duplicatePart）：調整も写す', () => {
    const r = run(start(), { type: 'duplicatePart', partId: 'part-tanaita' })
    const j = currentJob(r.state)!
    expect(j.parts[4]).toMatchObject({ id: r.id, name: '棚板のコピー', adjust: { W: M, H: '' } })
  })

  it('削除する（removePart・deleteRows）：その部材の調整も消え、ほかの部材の調整は残る', () => {
    const a = currentJob(run(start(), { type: 'removePart', partId: 'part-gawaita' }).state)!
    expect(adjustByName(a)).toEqual({ 全体: '|', 天板: '|', 棚板: `${M}|` })
    const b = currentJob(run(start(), { type: 'deleteRows', range: { top: 3, left: 0, rows: 1, cols: 4 } }).state)!
    expect(adjustByName(b)).toEqual({ 全体: '|', 天板: '|', 側板: '|-2' })
  })

  it('仕事をコピーする（copyJob）：調整もコピーする', () => {
    const r = run(start(), { type: 'copyJob', jobId: 'job-shelf' })
    const copy = r.state.data.jobs.find((x) => x.id === r.id)!
    expect(adjustByName(copy)).toEqual(adjustByName(job()))
  })

  it('［仕上がり］で名前・W・H・枚数を全部クリアした行は、調整が入っていても外す（仕様書 25.9）', () => {
    const j = currentJob(run(start(), { type: 'clearCells', range: { top: 3, left: 0, rows: 1, cols: 4 } }).state)!
    expect(j.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板'])
  })
})

describe('reducer：［調整］の欄のセル操作（E-23）', () => {
  /** 2つ目の仕事（別の棚） */
  function two(): StoreState {
    const s = start()
    const b = job()
    b.id = 'job-b'
    b.name = '別の棚'
    b.parts = b.parts.map((p) => ({ ...p, adjust: { W: '', H: '' } }))
    return { ...s, data: { ...s.data, jobs: [...s.data.jobs, b] } }
  }

  it('コピー → 3行に貼る：3行とも入る。結果の paste に貼った数', () => {
    let s = run(start(), { type: 'copyPartAdjustCells', cells: [{ row: 3, col: 'W' }] }).state
    expect(s.data.cellClip).toEqual({ rows: 1, cols: 1, cells: [[M]], source: 'adjust' })
    const r = run(s, { type: 'pastePartAdjustCells', range: { top: 0, left: 1, rows: 3, cols: 1 } }, env(T1))
    s = r.state
    expect(r.paste).toEqual({ pasted: 3, skipped: [], renamed: [] })
    const j = currentJob(s)!
    expect(j.parts.map((p) => p.adjust.W)).toEqual([M, M, M, M])
    expect(j.updatedAt).toBe(T1.toISOString())
  })

  it('［仕上がり］でコピーしたものは［調整］に貼れない（逆も）', () => {
    const fin = run(start(), { type: 'copyCells', cells: [{ row: 0, col: 'W' }] }).state
    expect(reduce(fin, { type: 'pastePartAdjustCells', cells: [{ row: 1, col: 'W' }] }, env())).toEqual({ ok: false, message: '［仕上がり］でコピーしたものは［調整］には貼れません' })
    const adj = run(start(), { type: 'copyPartAdjustCells', cells: [{ row: 3, col: 'W' }] }).state
    expect(reduce(adj, { type: 'pasteCells', cells: [{ row: 1, col: 'W' }] }, env())).toEqual({ ok: false, message: '［調整］でコピーしたものは［仕上がり］には貼れません' })
  })

  it('コピーが無ければ断る', () => {
    expect(reduce(start(), { type: 'pastePartAdjustCells', cells: [{ row: 0, col: 'W' }] }, env())).toEqual({ ok: false, message: 'コピーしたセルがありません' })
  })

  it('切り取り → 同じ仕事に貼る：元が空になり、クリップはふつうのコピーになる', () => {
    let s = run(start(), { type: 'cutPartAdjustCells', range: { top: 3, left: 1, rows: 1, cols: 1 } }).state
    expect(s.data.cellClip?.cut).toEqual({ jobId: 'job-shelf', range: { top: 3, left: 1, rows: 1, cols: 1 } })
    // 切り取っただけでは変えない
    expect(currentJob(s)!.parts[3].adjust.W).toBe(M)
    s = run(s, { type: 'pastePartAdjustCells', cells: [{ row: 0, col: 'W' }] }).state
    expect(currentJob(s)!.parts.map((p) => p.adjust.W)).toEqual([M, '', '', ''])
    expect(s.data.cellClip).toEqual({ rows: 1, cols: 1, cells: [[M]], source: 'adjust' })
  })

  it('切り取り → ほかの仕事に貼る：元の仕事の調整も空になる', () => {
    let s = run(two(), { type: 'cutPartAdjustCells', range: { top: 2, left: 1, rows: 2, cols: 2 } }).state
    s = run(s, { type: 'pastePartAdjustCells', jobId: 'job-b', cells: [{ row: 0, col: 'W' }] }, env(T1)).state
    const a = s.data.jobs.find((x) => x.id === 'job-shelf')!
    const b = s.data.jobs.find((x) => x.id === 'job-b')!
    expect(b.parts.slice(0, 2).map((p) => p.adjust)).toEqual([
      { W: '', H: '-2' },
      { W: M, H: '' },
    ])
    expect(a.parts.map((p) => p.adjust)).toEqual(a.parts.map(() => ({ W: '', H: '' })))
    expect(a.updatedAt).toBe(T1.toISOString())
    expect(s.data.cellClip?.cut).toBeUndefined()
  })

  it('オートフィル：下の行へくり返す（部材のある行まで）', () => {
    const r = run(start(), { type: 'fillPartAdjustCells', from: { top: 3, left: 1, rows: 1, cols: 1 }, to: { top: 0, left: 1, rows: 6, cols: 1 } })
    expect(r.paste).toEqual({ pasted: 3, skipped: [], renamed: [] })
    expect(currentJob(r.state)!.parts.map((p) => p.adjust.W)).toEqual([M, M, M, M])
    expect(currentJob(r.state)!.parts).toHaveLength(4)
  })

  it('クリア：W・H の調整を空にする。名前・枚数は変わらない。何も変わらなければ updatedAt を付けない', () => {
    const r = run(start(), { type: 'clearPartAdjustCells', range: { top: 2, left: 0, rows: 2, cols: 4 } })
    const j = currentJob(r.state)!
    expect(j.parts.map((p) => [p.name, p.adjust.W, p.adjust.H, p.quantity])).toEqual([
      ['全体', '', '', 0],
      ['天板', '', '', 1],
      ['側板', '', '', 2],
      ['棚板', '', '', 3],
    ])
    const s = start()
    expect(run(s, { type: 'clearPartAdjustCells', cells: [{ row: 0, col: 'W' }] }).state).toBe(s)
  })
})
