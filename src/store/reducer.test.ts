import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { MELAMINE_ID, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import { formulaText } from '../engine/formula/display'
import { adjustUsages } from '../engine/formula/usages'
import { packJob } from '../engine/packing'
import { importTransfer } from '../engine/transfer/importFile'
import { readTransferFile } from '../engine/transfer/read'
import { buildJobFile } from '../engine/transfer/share'
import { currentJob, initialState, reduce, type Env, type StoreAction, type StoreState } from './reducer'

const T0 = new Date(2026, 9, 21, 9, 0, 0)
const T1 = new Date(2026, 9, 21, 10, 0, 0)

function env(now = T0): Env {
  let n = 0
  return { newId: (prefix) => `${prefix}-${++n}`, now }
}

function start(): StoreState {
  return initialState({
    status: 'ok',
    data: { version: 1, jobs: [shelfJob()], adjusts: shelfAdjusts(), cellClip: null },
    currentJobId: 'job-shelf',
    canSave: true,
  })
}

function run(state: StoreState, action: StoreAction, e: Env = env()) {
  const r = reduce(state, action, e)
  if (!r.ok) throw new Error(r.message)
  return r
}

describe('仕事の操作', () => {
  it('作る：名前の初期値は「10/21 仕事」、開く、作った id を返す', () => {
    const r = run(start(), { type: 'createJob' })
    const job = currentJob(r.state)
    expect(job?.name).toBe('10/21 仕事')
    expect(r.id).toBe(job?.id)
    expect(r.state.data.jobs).toHaveLength(2)
  })

  it('開く・閉じる。無い仕事は開けない', () => {
    let s = run(start(), { type: 'openJob', id: null }).state
    expect(currentJob(s)).toBeNull()
    s = run(s, { type: 'openJob', id: 'job-shelf' }).state
    expect(currentJob(s)?.id).toBe('job-shelf')
    expect(reduce(s, { type: 'openJob', id: 'nope' }, env()).ok).toBe(false)
  })

  it('名前を変えると updatedAt が付く', () => {
    const s = run(start(), { type: 'renameJob', jobId: 'job-shelf', name: '本棚' }, env(T1)).state
    expect(s.data.jobs[0]).toMatchObject({ name: '本棚', updatedAt: T1.toISOString() })
  })

  it('コピー：設定を引き継ぎ、開いている仕事は変えない', () => {
    let s = run(start(), { type: 'updateSettings', patch: { allowance: 5 } }).state
    const r = run(s, { type: 'copyJob', jobId: 'job-shelf' })
    s = r.state
    expect(s.data.jobs).toHaveLength(2)
    const c = s.data.jobs[1]
    expect(c.id).toBe(r.id)
    expect(c.name).toBe('棚のコピー')
    expect(c.settings.allowance).toBe(5)
    expect(s.currentJobId).toBe('job-shelf')
  })

  it('削除：開いていた仕事なら閉じる', () => {
    const s = run(start(), { type: 'deleteJob', jobId: 'job-shelf' }).state
    expect(s.data.jobs).toEqual([])
    expect(s.currentJobId).toBeNull()
  })

  it('見本を足す：「見本 棚」を一覧の最後に足し、開いている仕事は変えない（仕様書 16.7）', () => {
    const r = run(start(), { type: 'addSample' })
    expect(r.state.currentJobId).toBe('job-shelf')
    expect(r.state.data.jobs).toHaveLength(2)
    const sample = r.state.data.jobs[1]
    expect(r.id).toBe(sample.id)
    expect(sample.name).toBe('見本 棚')
    // メラミン1 はもうあるので、調整寸法は変わらない
    expect(r.state.data.adjusts).toEqual(shelfAdjusts())
    expect(sample.parts[2].expr.W).toBe(`天板.W - 20 - {n:${MELAMINE_ID}}`)
    const p = packJob(sample, computeDimensions(sample, r.state.data.adjusts))
    expect(p.sheets).toHaveLength(2)
    expect(Math.round(p.yieldRate * 1000) / 10).toBe(57.2)
  })

  it('メラミン1 を消したあとで見本を足すと、メラミン1 が一覧に戻り、式はエラーにならない', () => {
    const s = run(start(), { type: 'removeAdjusts', adjustIds: [MELAMINE_ID] }).state
    const r = run(s, { type: 'addSample' })
    const mel = r.state.data.adjusts.find((a) => a.name === 'メラミン' && a.value === 1)
    expect(mel).toBeDefined()
    const sample = r.state.data.jobs[1]
    expect(sample.parts[2].expr.W).toBe(`天板.W - 20 - {n:${mel?.id}}`)
    expect(computeDimensions(sample, r.state.data.adjusts).errors).toEqual([])
  })

  it('何回押しても1つずつ足す', () => {
    const s = run(start(), { type: 'addSample' }).state
    const r = run(s, { type: 'addSample' }, { newId: (p) => `${p}-x${Math.random()}`, now: T0 })
    expect(r.state.data.jobs.map((j) => j.name)).toEqual(['棚', '見本 棚', '見本 棚'])
    expect(r.state.data.adjusts).toHaveLength(2)
  })
})

describe('部材の操作（開いている仕事）', () => {
  it('足す・変える・消す。変えるたびに updatedAt', () => {
    let r = run(start(), { type: 'addPart', part: { name: '地板', expr: { W: '全体.W', H: '300' } } }, env(T1))
    let job = currentJob(r.state)!
    expect(job.parts.at(-1)).toMatchObject({ id: r.id, name: '地板', quantity: 1, rotatable: false })
    expect(job.updatedAt).toBe(T1.toISOString())
    r = run(r.state, { type: 'updatePart', partId: r.id!, patch: { quantity: 2 } })
    job = currentJob(r.state)!
    expect(job.parts.at(-1)?.quantity).toBe(2)
    r = run(r.state, { type: 'removePart', partId: job.parts.at(-1)!.id })
    expect(currentJob(r.state)!.parts).toHaveLength(4)
  })

  it('同じ名前は断る（状態は変えない）', () => {
    const s = start()
    const r = reduce(s, { type: 'addPart', part: { name: '天板' } }, env())
    expect(r).toEqual({ ok: false, message: '「天板」という部材はすでにあります' })
  })

  it('名前を変えると式もつけ替わる', () => {
    const s = run(start(), { type: 'updatePart', partId: 'part-tenita', patch: { name: '天板A' } }).state
    expect(currentJob(s)!.parts[3].expr.H).toBe('天板A.H - 20 × 2')
  })

  it('複製は元の後ろに「棚板のコピー」', () => {
    const r = run(start(), { type: 'duplicatePart', partId: 'part-tanaita' })
    const job = currentJob(r.state)!
    expect(job.parts.at(-1)).toMatchObject({ id: r.id, name: '棚板のコピー' })
  })

  it('上に行を入れる・行を削除・全部回転', () => {
    let r = run(start(), { type: 'insertPart', index: 2, part: { name: '', quantity: null } })
    let job = currentJob(r.state)!
    expect(job.parts[2]).toMatchObject({ id: r.id, name: '', quantity: null })
    r = run(r.state, { type: 'deleteRows', cells: [{ row: 2, col: 'W' }, { row: 0, col: 'qty' }] })
    job = currentJob(r.state)!
    expect(job.parts.map((p) => p.name)).toEqual(['天板', '側板', '棚板'])
    expect(reduce(r.state, { type: 'deleteRows', cells: [{ row: 8, col: 'W' }] }, env())).toEqual({ ok: false, message: '削除する行を選んでください' })
    r = run(r.state, { type: 'setAllRotatable', rotatable: true })
    expect(currentJob(r.state)!.parts.every((p) => p.rotatable)).toBe(true)
  })

  it('仕事を開いていなければ断る', () => {
    const s = run(start(), { type: 'openJob', id: null }).state
    expect(reduce(s, { type: 'addPart', part: { name: 'a' } }, env())).toEqual({ ok: false, message: '仕事が開かれていません' })
  })

  it('設定と板のサイズを変える', () => {
    let s = run(start(), { type: 'updateSettings', patch: { kerf: 4, cutMode: 'horizontal' } }).state
    s = run(s, { type: 'setSheet', sheet: { sizeKind: 'saburoku', width: 0, length: 0 } }).state
    expect(currentJob(s)!.settings).toMatchObject({ kerf: 4, cutMode: 'horizontal', sheet: { width: 910, length: 1820 } })
    expect(reduce(s, { type: 'updateSettings', patch: { kerf: -1 } }, env()).ok).toBe(false)
  })
})

describe('セルのコピーと貼り付け（第1.2版）', () => {
  it('セルをコピーするとアプリが覚え（仕事は変えない）、ほかの仕事の選んだセルに貼れる。行が足りなければ部材が増える', () => {
    const s0 = start()
    let r = run(s0, { type: 'copyCells', cells: [{ row: 1, col: 'name' }, { row: 1, col: 'W' }, { row: 2, col: 'name' }, { row: 2, col: 'W' }] })
    expect(r.state.data.cellClip).toEqual({ rows: 2, cols: 2, cells: [['天板', '全体.W'], ['側板', '全体.W']] })
    expect(r.state.data.jobs).toBe(s0.data.jobs)
    r = run(r.state, { type: 'createJob', name: '別' })
    r = run(r.state, { type: 'addPart', part: { name: '天板', expr: { W: '1', H: '1' }, quantity: 1 } })
    r = run(r.state, { type: 'pasteCells', cells: [{ row: 0, col: 'name' }] }, env(T1))
    expect(currentJob(r.state)!.parts.map((p) => [p.name, p.expr.W])).toEqual([
      ['天板', '全体.W'],
      ['側板', '全体.W'],
    ])
    expect(r.paste).toEqual({ pasted: 4, skipped: [], renamed: [] })
    expect(currentJob(r.state)!.updatedAt).toBe(T1.toISOString())
  })

  it('貼れなかったセルが結果に返る', () => {
    let s = run(start(), { type: 'copyCells', cells: [{ row: 1, col: 'W' }] }).state
    const r = run(s, { type: 'pasteCells', cells: [{ row: 0, col: 'qty' }, { row: 2, col: 'H' }] })
    s = r.state
    expect(r.paste?.pasted).toBe(1)
    expect(r.paste?.skipped.map((x) => [x.cell, x.reason])).toEqual([[{ row: 0, col: 'qty' }, 'notQuantity']])
    expect(currentJob(s)!.parts[2].expr.H).toBe('全体.W')
  })

  it('離れたセルはコピーできない。コピーが無ければ貼れない', () => {
    expect(reduce(start(), { type: 'copyCells', cells: [{ row: 0, col: 'W' }, { row: 2, col: 'W' }] }, env())).toEqual({
      ok: false,
      message: 'コピーは1つのセルか、四角い範囲を選んでください',
    })
    expect(reduce(start(), { type: 'pasteCells', cells: [{ row: 0, col: 'W' }] }, env())).toEqual({ ok: false, message: 'コピーしたセルがありません' })
  })

  it('消す：中身を空に。全部空になった部材は消える', () => {
    const r = run(start(), { type: 'clearCells', cells: [{ row: 0, col: 'name' }, { row: 0, col: 'W' }, { row: 0, col: 'H' }, { row: 0, col: 'qty' }, { row: 1, col: 'H' }] })
    expect(currentJob(r.state)!.parts.map((p) => [p.name, p.expr.H])).toEqual([
      ['天板', ''],
      ['側板', '700'],
      ['棚板', '天板.H - 20 × 2'],
    ])
  })
})


describe('切り取り・オートフィル・四角の範囲（第1.3版）', () => {
  const W = (s: StoreState) => currentJob(s)!.parts.map((p) => p.expr.W)

  it('切り取って貼ると元が空になり、クリップはふつうのコピーに変わる（2回目の貼り付けで元を消さない）', () => {
    let r = run(start(), { type: 'cutCells', range: { top: 1, left: 1, rows: 1, cols: 1 } })
    expect(r.state.data.cellClip).toEqual({ rows: 1, cols: 1, cells: [['全体.W']], cut: { jobId: 'job-shelf', range: { top: 1, left: 1, rows: 1, cols: 1 } } })
    expect(W(r.state)[1]).toBe('全体.W') // 切り取っただけでは変えない
    r = run(r.state, { type: 'pasteCells', range: { top: 0, left: 1, rows: 1, cols: 1 } }, env(T1))
    expect(W(r.state).slice(0, 2)).toEqual(['全体.W', ''])
    expect(r.paste).toEqual({ pasted: 1, skipped: [], renamed: [] })
    expect(r.state.data.cellClip).toEqual({ rows: 1, cols: 1, cells: [['全体.W']] })
    // 2回目：元（天板の W）に入れ直しても、もう消さない
    r = run(r.state, { type: 'updatePart', partId: 'part-tenita', patch: { expr: { W: '全体.W', H: '全体.H' } } })
    r = run(r.state, { type: 'pasteCells', cells: [{ row: 3, col: 'W' }] })
    expect(W(r.state)).toEqual(['全体.W', '全体.W', '全体.W', '全体.W'])
  })

  it('貼る前にほかをコピーすると、元は消さない', () => {
    let s = run(start(), { type: 'cutCells', range: { top: 2, left: 2, rows: 1, cols: 1 } }).state
    s = run(s, { type: 'copyCells', range: { top: 0, left: 1, rows: 1, cols: 1 } }).state
    s = run(s, { type: 'pasteCells', range: { top: 3, left: 2, rows: 1, cols: 1 } }).state
    expect(currentJob(s)!.parts.map((p) => p.expr.H)).toEqual(['1800', '全体.H', '700', '400'])
  })

  it('ほかの仕事に貼っても、元の仕事のセルを空にする（元の仕事の updatedAt も付く）', () => {
    let s = run(start(), { type: 'cutCells', range: { top: 3, left: 0, rows: 1, cols: 4 } }).state
    s = run(s, { type: 'createJob', name: '別' }).state
    const r = run(s, { type: 'pasteCells', range: { top: 0, left: 0, rows: 1, cols: 1 } }, env(T1))
    expect(currentJob(r.state)!.parts.map((p) => p.name)).toEqual(['棚板'])
    const src = r.state.data.jobs.find((j) => j.id === 'job-shelf')!
    expect(src.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板'])
    expect(src.updatedAt).toBe(T1.toISOString())
    expect(r.state.data.cellClip?.cut).toBeUndefined()
  })

  it('切り取った元の仕事が消えていても、貼れる（元は何もしない）', () => {
    let s = run(start(), { type: 'cutCells', range: { top: 1, left: 1, rows: 1, cols: 1 } }).state
    s = run(s, { type: 'createJob', name: '別' }).state
    s = run(s, { type: 'deleteJob', jobId: 'job-shelf' }).state
    const r = run(s, { type: 'pasteCells', range: { top: 0, left: 1, rows: 1, cols: 1 } })
    expect(W(r.state)).toEqual(['全体.W'])
    expect(r.state.data.cellClip?.cut).toBeUndefined()
  })

  it('オートフィル：2行の範囲を下に5行引くと くり返して入る。名前は番号を振って入る（仕様書 18.3）', () => {
    const r = run(start(), { type: 'fillCells', from: { top: 0, left: 0, rows: 2, cols: 2 }, to: { top: 0, left: 0, rows: 7, cols: 2 } }, env(T1))
    expect(currentJob(r.state)!.parts.map((p) => [p.name, p.expr.W])).toEqual([
      ['全体', '400'],
      ['天板', '全体.W'],
      ['全体1', '400'],
      ['天板1', '全体.W'],
      ['全体2', '400'],
      ['天板2', '全体.W'],
      ['全体3', '400'],
    ])
    expect(r.paste?.pasted).toBe(10)
    expect(r.paste?.skipped).toEqual([])
    expect(currentJob(r.state)!.updatedAt).toBe(T1.toISOString())
  })

  it('クリア・行を削除も四角の範囲で呼べる', () => {
    let s = run(start(), { type: 'clearCells', range: { top: 0, left: 3, rows: 4, cols: 1 } }).state
    expect(currentJob(s)!.parts.map((p) => p.quantity)).toEqual([null, null, null, null])
    s = run(s, { type: 'deleteRows', range: { top: 1, left: 0, rows: 2, cols: 4 } }).state
    expect(currentJob(s)!.parts.map((p) => p.name)).toEqual(['全体', '棚板'])
  })
})
describe('切り出しチェック', () => {
  it('1つ目のチェックでその1枚を固定する', () => {
    const s = start()
    const job = currentJob(s)!
    const res = packJob(job, computeDimensions(job, s.data.adjusts))
    const layout = res.sheets[0]
    const r = run(s, { type: 'setPartCheck', target: { kind: 'computed', mode: res.mode, layout }, partId: 'part-gawaita', done: true }, env(T1))
    const after = currentJob(r.state)!
    expect(after.frozenSheets).toHaveLength(1)
    expect(after.frozenSheets[0].checked.length).toBe(layout.placements.filter((p) => p.partId === 'part-gawaita').length)
    expect(after.updatedAt).toBe(T1.toISOString())
  })
})

describe('調整寸法（アプリ全体）', () => {
  it('足す・変える・消す', () => {
    let r = run(start(), { type: 'addAdjust', name: '逃げ', value: 1 })
    expect(r.state.data.adjusts.at(-1)).toEqual({ id: r.id, name: '逃げ', value: 1 })
    r = run(r.state, { type: 'updateAdjust', adjustId: r.id!, name: 'ほぞ', value: 15 })
    expect(r.state.data.adjusts.at(-1)).toMatchObject({ name: 'ほぞ', value: 15 })
    r = run(r.state, { type: 'removeAdjusts', adjustIds: [r.state.data.adjusts.at(-1)!.id] })
    expect(r.state.data.adjusts.map((a) => a.name)).toEqual(['メラミン', 'シート'])
  })

  it('表示名が重なるものは足せない', () => {
    expect(reduce(start(), { type: 'addAdjust', name: 'シート', value: 0.5 }, env())).toEqual({
      ok: false,
      message: '「シート0.5」はもうあります',
    })
  })

  it('寸法を変えると、使っている式の表示と値がついてくる', () => {
    const s = run(start(), { type: 'updateAdjust', adjustId: MELAMINE_ID, name: 'メラミン', value: 2 }).state
    const job = currentJob(s)!
    expect(formulaText(job.parts[3].expr.W, s.data.adjusts)).toBe('天板.W − 20 − メラミン2')
    const tana = computeDimensions(job, s.data.adjusts).parts[3]
    expect(tana.finished?.W).toBe(378)
    expect(adjustUsages(s.data, MELAMINE_ID).map((u) => u.partName)).toEqual(['棚板'])
  })

  it('使っている調整寸法を消すと、その式はエラーになる', () => {
    const s = run(start(), { type: 'removeAdjusts', adjustIds: [MELAMINE_ID] }).state
    const tana = computeDimensions(currentJob(s)!, s.data.adjusts).parts[3]
    expect(tana.finished).toBeNull()
    expect(tana.errors.some((e) => e.kind === 'unknownAdjust')).toBe(true)
  })
})

describe('読み込みの知らせ', () => {
  it('閉じられる', () => {
    const s = initialState({
      status: 'error',
      data: { version: 1, jobs: [], adjusts: [], cellClip: null },
      currentJobId: null,
      message: '保存データを読めませんでした',
      canSave: false,
    })
    expect(s.loadError).toBe('保存データを読めませんでした')
    expect(run(s, { type: 'dismissLoadError' }).state.loadError).toBeNull()
  })
})

describe('取り込んだデータに置き換える', () => {
  it('共有のファイルを取り込むと、仕事がコピーとして足され、開いている仕事・今の仕事は変わらない', () => {
    const s0 = start()
    const read = readTransferFile(buildJobFile(currentJob(s0)!, s0.data.adjusts))
    if (!read.ok) throw new Error(read.message)
    const imported = importTransfer(s0.data, read.file, env().newId, T1)
    const s = run(s0, { type: 'replaceData', data: imported.data }).state
    expect(s.data.jobs).toHaveLength(2)
    expect(s.currentJobId).toBe('job-shelf')
    expect(s.data.jobs[0]).toBe(s0.data.jobs[0])
    // メラミン1 は同じ表示名なので増えない
    expect(s.data.adjusts).toHaveLength(s0.data.adjusts.length)
    const copy = s.data.jobs[1]
    expect(copy.name).toBe(`${s0.data.jobs[0].name}のコピー`)
    expect(computeDimensions(copy, s.data.adjusts).parts.map((p) => p.finished)).toEqual(
      computeDimensions(s0.data.jobs[0], s0.data.adjusts).parts.map((p) => p.finished),
    )
  })

  it('開いている仕事が新しいデータに無ければ閉じる', () => {
    const s = run(start(), { type: 'replaceData', data: { version: 1, jobs: [], adjusts: [], cellClip: null } }).state
    expect(s.currentJobId).toBeNull()
  })
})
