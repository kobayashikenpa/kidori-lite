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
    data: { version: 1, jobs: [shelfJob()], adjusts: shelfAdjusts(), clipboard: null },
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
  it('作る：名前の初期値は「仕事 10/21」、開く、作った id を返す', () => {
    const r = run(start(), { type: 'createJob' })
    const job = currentJob(r.state)
    expect(job?.name).toBe('仕事 10/21')
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

  it('上に行を入れる・まとめて消す・全部回転', () => {
    let r = run(start(), { type: 'insertPart', index: 2, part: { name: '', quantity: null } })
    let job = currentJob(r.state)!
    expect(job.parts[2]).toMatchObject({ id: r.id, name: '', quantity: null })
    r = run(r.state, { type: 'removeParts', partIds: [r.id!, 'part-zentai'] })
    job = currentJob(r.state)!
    expect(job.parts.map((p) => p.name)).toEqual(['天板', '側板', '棚板'])
    r = run(r.state, { type: 'setAllRotatable', rotatable: true })
    expect(currentJob(r.state)!.parts.every((p) => p.rotatable)).toBe(true)
  })

  it('仕事を開いていなければ断る', () => {
    const s = run(start(), { type: 'openJob', id: null }).state
    expect(reduce(s, { type: 'addPart', part: { name: 'a' } }, env())).toEqual({ ok: false, message: '仕事が開かれていません' })
  })

  it('設定と板のサイズを変える', () => {
    let s = run(start(), { type: 'updateSettings', patch: { kerf: 4, cutMode: 'auto' } }).state
    s = run(s, { type: 'setSheet', sheet: { sizeKind: 'saburoku', width: 0, length: 0 } }).state
    expect(currentJob(s)!.settings).toMatchObject({ kerf: 4, cutMode: 'auto', sheet: { width: 910, length: 1820 } })
    expect(reduce(s, { type: 'updateSettings', patch: { kerf: -1 } }, env()).ok).toBe(false)
  })
})

describe('コピーと貼り付け', () => {
  it('コピーした部材をほかの仕事に貼ると、足せるものだけ後ろに足す', () => {
    let s = run(start(), { type: 'copyParts', partIds: ['part-zentai', 'part-tenita'] }).state
    expect(s.data.clipboard?.map((c) => c.name)).toEqual(['全体', '天板'])
    s = run(s, { type: 'createJob', name: '別' }).state
    s = run(s, { type: 'addPart', part: { name: '天板', expr: { W: '1', H: '1' } } }).state
    s = run(s, { type: 'pasteParts' }).state
    expect(currentJob(s)!.parts.map((p) => p.name)).toEqual(['天板', '全体'])
  })

  it('何も選ばずにコピーはできない', () => {
    expect(reduce(start(), { type: 'copyParts', partIds: [] }, env()).ok).toBe(false)
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
      data: { version: 1, jobs: [], adjusts: [], clipboard: null },
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
    const s = run(start(), { type: 'replaceData', data: { version: 1, jobs: [], adjusts: [], clipboard: null } }).state
    expect(s.currentJobId).toBeNull()
  })
})
