// 戻る・進むの履歴（第2.3版。仕様書 27.2・27.3、architecture 16.1・16.2）
import { describe, expect, it } from 'vitest'
import { usableAdjusts } from '../engine/adjusts'
import { computeDimensions } from '../engine/dimensions'
import { SHEET_ID, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import { packJob } from '../engine/packing'
import type { AdjustRow, Job } from '../engine/types'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  dispatchWithHistory,
  redoHistory,
  undoHistory,
  type DispatchOptions,
} from './history'
import { currentJob, initialState, type Env, type StoreAction, type StoreState } from './reducer'

const T0 = new Date(2026, 10, 13, 9, 0, 0)
const T1 = new Date(2026, 10, 13, 10, 0, 0)

/** 1つのテストの中で id が重ならないよう、同じ数え方を使い続ける */
function makeEnv(now = T0): Env {
  let n = 0
  return { newId: (prefix) => `${prefix}-${++n}`, now }
}

function otherJob(): Job {
  const j = shelfJob('job-b', '別の棚')
  return j
}

function start(opts: { jobs?: Job[]; adjusts?: AdjustRow[] } = {}): StoreState {
  return initialState({
    status: 'ok',
    data: { version: 1, jobs: opts.jobs ?? [shelfJob()], adjusts: opts.adjusts ?? shelfAdjusts(), cellClip: null, adjustClip: null },
    currentJobId: 'job-shelf',
    canSave: true,
  })
}

let env = makeEnv()

function act(state: StoreState, action: StoreAction, opts?: DispatchOptions): StoreState {
  const r = dispatchWithHistory(state, action, env, opts)
  if (!r.ok) throw new Error(r.message)
  return r.state
}

function undo(state: StoreState, e: Env = env): StoreState {
  const r = undoHistory(state, e)
  if (!r.ok) throw new Error(r.message)
  return r.state
}

function redo(state: StoreState, e: Env = env): StoreState {
  const r = redoHistory(state, e)
  if (!r.ok) throw new Error(r.message)
  return r.state
}

const shelf = (s: StoreState): Job => s.data.jobs.find((j) => j.id === 'job-shelf')!
const tanaita = (s: StoreState) => shelf(s).parts[3]
/** 棚板の W を式の欄で変えたときと同じ形（PartsTable の editExpr は W・H の両方を渡す） */
const editW = (s: StoreState, text: string): StoreAction => ({
  type: 'updatePart',
  partId: 'part-tanaita',
  patch: { expr: { ...tanaita(s).expr, W: text } },
})
const dimsOf = (s: StoreState) => computeDimensions(shelf(s), usableAdjusts(s.data.adjusts)).parts[3]

function fresh(opts?: Parameters<typeof start>[0]): StoreState {
  env = makeEnv()
  return start(opts)
}

describe('最初の状態', () => {
  it('履歴は空（戻せない・進めない）', () => {
    const s = fresh()
    expect(s.history.past).toEqual([])
    expect(s.history.future).toEqual([])
    expect(s.history.revision).toBe(0)
    expect(canUndo(s.history)).toBe(false)
    expect(canRedo(s.history)).toBe(false)
  })

  it('戻せないとき・進めないときは理由を返す', () => {
    const s = fresh()
    expect(undoHistory(s, env)).toEqual({ ok: false, message: '戻せる操作がありません' })
    expect(redoHistory(s, env)).toEqual({ ok: false, message: '進める操作がありません' })
  })
})

describe('まとまり（opts.group）', () => {
  it('同じ印で棚板の W の式を3回変えても、1回の「戻る」で元の式 天板.W - 20（仕上がり W 380・木取り W 389）に戻り、「進む」で3回目の式に戻る', () => {
    let s = fresh()
    s = act(s, editW(s, '天板.W - 2'), { group: 'g1' })
    s = act(s, editW(s, '天板.W - 25'), { group: 'g1' })
    s = act(s, editW(s, '天板.W - 30'), { group: 'g1' })
    expect(s.history.past).toHaveLength(1)
    expect(dimsOf(s).finished?.W).toBe(370)

    s = undo(s)
    expect(tanaita(s).expr.W).toBe('天板.W - 20')
    expect(dimsOf(s).finished?.W).toBe(380)
    expect(dimsOf(s).cut?.W).toBe(389)
    expect(canUndo(s.history)).toBe(false)
    expect(canRedo(s.history)).toBe(true)

    s = redo(s)
    expect(tanaita(s).expr.W).toBe('天板.W - 30')
    expect(dimsOf(s).finished?.W).toBe(370)
    expect(canUndo(s.history)).toBe(true)
    expect(canRedo(s.history)).toBe(false)
  })

  it('印の違う2つの操作は2回で戻る。印が無い操作は1つずつ', () => {
    let s = fresh()
    s = act(s, editW(s, '300'), { group: 'g1' })
    s = act(s, { type: 'updatePart', partId: 'part-tanaita', patch: { quantity: 5 } }, { group: 'g2' })
    s = act(s, { type: 'updatePart', partId: 'part-gawaita', patch: { quantity: 4 } })
    s = act(s, { type: 'updatePart', partId: 'part-gawaita', patch: { quantity: 6 } })
    expect(s.history.past).toHaveLength(4)
    s = undo(s)
    expect(shelf(s).parts[2].quantity).toBe(4)
    s = undo(s)
    expect(shelf(s).parts[2].quantity).toBe(2)
    s = undo(s)
    expect(tanaita(s).quantity).toBe(3)
    expect(tanaita(s).expr.W).toBe('300')
    s = undo(s)
    expect(tanaita(s).expr.W).toBe('天板.W - 20')
  })

  it('戻したあとに同じ印で操作しても、前の1回にはまとめない（新しい1回）', () => {
    let s = fresh()
    s = act(s, editW(s, '300'), { group: 'g1' })
    s = undo(s)
    s = act(s, editW(s, '310'), { group: 'g1' })
    expect(s.history.past).toHaveLength(1)
    s = undo(s)
    expect(tanaita(s).expr.W).toBe('天板.W - 20')
  })

  it('同じ印の中で元の値に戻したら、その1回は履歴から外す', () => {
    let s = fresh()
    s = act(s, { type: 'updatePart', partId: 'part-gawaita', patch: { quantity: 4 } })
    s = act(s, editW(s, '300'), { group: 'g1' })
    s = act(s, editW(s, '天板.W - 20'), { group: 'g1' })
    expect(s.history.past).toHaveLength(1)
    s = undo(s)
    expect(shelf(s).parts[2].quantity).toBe(2)
  })
})

describe('進む・先の扱い', () => {
  it('戻したあとに新しい操作をすると、進めない', () => {
    let s = fresh()
    s = act(s, editW(s, '300'))
    s = act(s, editW(s, '310'))
    s = undo(s)
    expect(canRedo(s.history)).toBe(true)
    s = act(s, { type: 'updatePart', partId: 'part-tanaita', patch: { quantity: 5 } })
    expect(canRedo(s.history)).toBe(false)
    expect(redoHistory(s, env)).toEqual({ ok: false, message: '進める操作がありません' })
    s = undo(s)
    expect(tanaita(s).expr.W).toBe('300')
  })

  it('何も変わらない操作（同じ切り代を入れ直す）は記録せず、先も消さない', () => {
    let s = fresh()
    s = act(s, { type: 'updateSettings', patch: { allowance: 5 } })
    s = undo(s)
    s = act(s, { type: 'updateSettings', patch: { allowance: 10 } })
    expect(s.history.past).toHaveLength(0)
    expect(canRedo(s.history)).toBe(true)
    s = redo(s)
    expect(shelf(s).settings.allowance).toBe(5)
  })

  it(`戻せるのは ${HISTORY_LIMIT} 回まで：51回操作すると最初の1回は戻せない`, () => {
    let s = fresh()
    for (let q = 1; q <= 51; q++) s = act(s, { type: 'updatePart', partId: 'part-tanaita', patch: { quantity: q + 10 } })
    expect(HISTORY_LIMIT).toBe(50)
    expect(s.history.past).toHaveLength(50)
    for (let i = 0; i < 50; i++) s = undo(s)
    // 最初の1回（3 → 11）は戻せないので 11 のまま
    expect(tanaita(s).quantity).toBe(11)
    expect(undoHistory(s, env)).toEqual({ ok: false, message: '戻せる操作がありません' })
    expect(s.history.future).toHaveLength(50)
  })
})

describe('戻す・進むで変わるもの', () => {
  it('戻すたび・進むたびに revision が 1 増え、仕事の updatedAt は今の時刻になる。名前は変えない', () => {
    let s = fresh()
    s = act(s, editW(s, '300'))
    s = act(s, { type: 'renameJob', jobId: 'job-shelf', name: '本棚' })
    expect(s.history.past).toHaveLength(1)
    s = undo(s, makeEnv(T1))
    expect(s.history.revision).toBe(1)
    expect(shelf(s).updatedAt).toBe(T1.toISOString())
    expect(shelf(s).name).toBe('本棚')
    expect(tanaita(s).expr.W).toBe('天板.W - 20')
    s = redo(s)
    expect(s.history.revision).toBe(2)
    expect(shelf(s).name).toBe('本棚')
    expect(tanaita(s).expr.W).toBe('300')
  })

  it('copyCells・cutCells は記録されず、戻しても cellClip は変わらない', () => {
    let s = fresh()
    s = act(s, editW(s, '300'))
    s = act(s, { type: 'copyCells', range: { top: 1, left: 2, rows: 1, cols: 1 } })
    expect(s.history.past).toHaveLength(1)
    s = act(s, { type: 'cutCells', range: { top: 2, left: 2, rows: 1, cols: 1 } })
    expect(s.history.past).toHaveLength(1)
    const clip = s.data.cellClip
    expect(clip?.cut).toBeDefined()
    s = undo(s)
    expect(s.data.cellClip).toBe(clip)
    expect(tanaita(s).expr.W).toBe('天板.W - 20')
  })

  it('ほかの仕事を切り取って開いている仕事に貼り、戻すと両方の仕事が元に戻る（コピーしたセルはふつうのコピーのまま）', () => {
    let s = fresh({ jobs: [shelfJob(), otherJob()] })
    const before = s.data.jobs.map((j) => j.parts)
    s = act(s, { type: 'cutCells', jobId: 'job-b', range: { top: 1, left: 2, rows: 1, cols: 1 } })
    s = act(s, { type: 'pasteCells', range: { top: 3, left: 2, rows: 1, cols: 1 } })
    expect(tanaita(s).expr.W).toBe('全体.W')
    expect(s.data.jobs[1].parts[1].expr.W).toBe('')
    expect(s.history.past).toHaveLength(1)
    expect(s.history.past[0].jobs.map((j) => j.jobId).sort()).toEqual(['job-b', 'job-shelf'])

    s = undo(s)
    expect(s.data.jobs.map((j) => j.parts)).toEqual(before)
    expect(s.data.cellClip?.cut).toBeUndefined()

    s = redo(s)
    expect(tanaita(s).expr.W).toBe('全体.W')
    expect(s.data.jobs[1].parts[1].expr.W).toBe('')
  })

  it('記録した仕事のうち消えた仕事は飛ばして戻す', () => {
    let s = fresh({ jobs: [shelfJob(), otherJob()] })
    s = act(s, { type: 'cutCells', jobId: 'job-b', range: { top: 1, left: 2, rows: 1, cols: 1 } })
    s = act(s, { type: 'pasteCells', range: { top: 3, left: 2, rows: 1, cols: 1 } })
    s = act(s, { type: 'deleteJob', jobId: 'job-b' })
    expect(s.history.past).toHaveLength(1)
    s = undo(s)
    expect(s.data.jobs.map((j) => j.id)).toEqual(['job-shelf'])
    expect(tanaita(s).expr.W).toBe('天板.W - 20')
  })

  it('計算した1枚に切り出しチェックを付けて戻すと、固定した1枚が無くなる', () => {
    let s = fresh()
    const job = currentJob(s)!
    const res = packJob(job, computeDimensions(job, usableAdjusts(s.data.adjusts)))
    s = act(s, { type: 'setPartCheck', target: { kind: 'computed', mode: res.mode, layout: res.sheets[0] }, partId: 'part-gawaita', done: true })
    expect(shelf(s).frozenSheets).toHaveLength(1)
    s = undo(s)
    expect(shelf(s).frozenSheets).toEqual([])
    s = redo(s)
    expect(shelf(s).frozenSheets).toHaveLength(1)
  })

  it('木取りの設定（4×8 → 3×6・刃厚）も戻せる', () => {
    let s = fresh()
    const sheet = shelf(s).settings.sheet
    s = act(s, { type: 'setSheet', sheet: { sizeKind: 'saburoku', width: 0, length: 0 } })
    s = act(s, { type: 'updateSettings', patch: { kerf: 4 } })
    s = undo(s)
    expect(shelf(s).settings.kerf).toBe(3)
    s = undo(s)
    expect(shelf(s).settings.sheet).toEqual(sheet)
  })

  it('調整寸法の表の寸法を変えて戻すと、表が元に戻る（棚板の木取り W も 389 に戻る）', () => {
    let s = fresh()
    const rows = s.data.adjusts
    s = act(s, { type: 'setAdjustCell', pos: { row: 0, col: 'value' }, text: '2' })
    expect(dimsOf(s).cut?.W).toBe(388)
    expect(s.history.past[0].adjusts).not.toBeNull()
    expect(s.history.past[0].jobs).toEqual([])
    s = undo(s)
    expect(s.data.adjusts).toEqual(rows)
    expect(dimsOf(s).cut?.W).toBe(389)
    s = redo(s)
    expect(s.data.adjusts[0].value).toBe(2)
  })
})

describe('後片付け（opts.follow）', () => {
  it('行を上に挿入して、何も入れずに外す（follow）と、何も記録されない', () => {
    let s = fresh()
    s = act(s, { type: 'updatePart', partId: 'part-gawaita', patch: { quantity: 4 } })
    const r = dispatchWithHistory(s, { type: 'insertPart', index: 1, part: {} }, env)
    if (!r.ok) throw new Error(r.message)
    s = r.state
    expect(s.history.past).toHaveLength(2)
    s = act(s, { type: 'removePart', partId: r.id! }, { follow: true })
    expect(s.history.past).toHaveLength(1)
    s = undo(s)
    expect(shelf(s).parts[2].quantity).toBe(2)
  })

  it('最初の操作が挿入でも、外せば履歴は空', () => {
    let s = fresh()
    const r = dispatchWithHistory(s, { type: 'insertPart', index: 0, part: {} }, env)
    if (!r.ok) throw new Error(r.message)
    s = act(r.state, { type: 'removePart', partId: r.id! }, { follow: true })
    expect(s.history.past).toEqual([])
    expect(shelf(s).parts).toHaveLength(4)
  })

  it('調整寸法の表に空の行を挿入して外す（removeAdjusts を follow）と、その1回は残らない', () => {
    let s = fresh()
    s = act(s, { type: 'setAdjustCell', pos: { row: 1, col: 'value' }, text: '0.3' })
    const r = dispatchWithHistory(s, { type: 'insertAdjustRow', index: 0 }, env)
    if (!r.ok) throw new Error(r.message)
    s = act(r.state, { type: 'removeAdjusts', adjustIds: [r.id!] }, { follow: true })
    expect(s.history.past).toHaveLength(1)
    s = undo(s)
    expect(s.data.adjusts).toEqual(shelfAdjusts())
  })

  it('follow は直前の1回に含める（戻すと両方戻る。名前は直前の1回のまま）', () => {
    let s = fresh()
    s = act(s, { type: 'updatePart', partId: 'part-tanaita', patch: { quantity: 5 } })
    s = act(s, { type: 'removePart', partId: 'part-gawaita' }, { follow: true })
    expect(s.history.past).toHaveLength(1)
    s = undo(s)
    expect(shelf(s).parts.map((p) => p.quantity)).toEqual([0, 1, 2, 3])
  })

  it('直前が戻す・進むのときは記録せず、先（進む）も消さない', () => {
    let s = fresh()
    const r = dispatchWithHistory(s, { type: 'insertPart', index: 0, part: {} }, env)
    if (!r.ok) throw new Error(r.message)
    s = act(r.state, editW(r.state, '300'))
    s = undo(s)
    s = act(s, { type: 'removePart', partId: r.id! }, { follow: true })
    expect(s.history.past).toHaveLength(1)
    expect(s.history.future).toHaveLength(1)
  })
})

describe('履歴を消すとき（仕様書 27.3・27.4）', () => {
  function withEntry(s: StoreState): StoreState {
    return act(s, editW(s, '300'))
  }

  it('ほかの仕事を開くと履歴が空になる。同じ仕事を開き直しても消えない', () => {
    let s = withEntry(fresh({ jobs: [shelfJob(), otherJob()] }))
    s = act(s, { type: 'openJob', id: 'job-shelf' })
    expect(s.history.past).toHaveLength(1)
    s = act(s, { type: 'openJob', id: 'job-b' })
    expect(s.history.past).toEqual([])
    expect(s.history.future).toEqual([])
  })

  it('仕事を閉じる・新しい仕事を作って開く・開いている仕事を消すと空になる', () => {
    expect(act(withEntry(fresh()), { type: 'openJob', id: null }).history.past).toEqual([])
    expect(act(withEntry(fresh()), { type: 'createJob', name: '新' }).history.past).toEqual([])
    expect(act(withEntry(fresh()), { type: 'deleteJob', jobId: 'job-shelf' }).history.past).toEqual([])
  })

  it('開かずに作る・名前を変える・ほかの仕事をコピー・ほかの仕事を消すでは残る', () => {
    let s = withEntry(fresh({ jobs: [shelfJob(), otherJob()] }))
    s = act(s, { type: 'createJob', name: '新', open: false })
    s = act(s, { type: 'renameJob', jobId: 'job-shelf', name: '本棚' })
    s = act(s, { type: 'copyJob', jobId: 'job-b' })
    s = act(s, { type: 'copyJob', jobId: 'job-shelf' })
    s = act(s, { type: 'deleteJob', jobId: 'job-b' })
    expect(s.history.past).toHaveLength(1)
  })

  it('replaceData（取り込み・バックアップから戻す）で空になる', () => {
    let s = withEntry(fresh())
    s = undo(withEntry(s))
    expect(s.history.future).toHaveLength(1)
    s = act(s, { type: 'replaceData', data: { ...s.data, jobs: [shelfJob()] } })
    expect(s.history.past).toEqual([])
    expect(s.history.future).toEqual([])
  })

  it('見本の追加：調整寸法の表が変わらなければ残り、メラミン1 を足したら空になる', () => {
    let s = withEntry(fresh())
    s = act(s, { type: 'addSample' })
    expect(s.history.past).toHaveLength(1)

    s = withEntry(fresh({ adjusts: [{ id: SHEET_ID, name: 'シート', value: 0.5 }] }))
    s = act(s, { type: 'addSample' })
    expect(s.data.adjusts.length).toBe(2)
    expect(s.history.past).toEqual([])
  })

  it('消しても revision は戻さない（画面の合図が前の値に戻らないように）', () => {
    let s = withEntry(fresh({ jobs: [shelfJob(), otherJob()] }))
    s = undo(s)
    s = act(s, { type: 'openJob', id: 'job-b' })
    expect(s.history.revision).toBe(1)
  })
})
