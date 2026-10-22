// 保存データの状態と、その変え方（reducer）。React に依存しないのでテストしやすい。
// kidori の store/reducer.ts を参考に作り直したもの。
// 操作の中で id・時刻を作るので、reduce は「id の作り方と今の時刻（env）」を引数で受ける純粋関数にする。
// 画面からは JobStore の dispatch で1回だけ当てる（React が reducer を2回呼んでも id がずれないように、結果の状態を置き換える）
import { applyPaste, copyParts, duplicatePart } from '../engine/clipboard/copy'
import { setPartCheck, setPieceCheck, type SheetTarget } from '../engine/progress/checks'
import type { AppData, Job, Part, Settings, Sheet } from '../engine/types'
import {
  addAdjust,
  addPart,
  copyJob,
  insertPart,
  deleteJob,
  makeJob,
  newPart,
  removeAdjusts,
  removePart,
  removeParts,
  renameJob,
  setAllRotatable,
  setSheet,
  updateAdjust,
  updatePart,
  updateSettings,
  type AdjustDraft,
  type AdjustsResult,
  type OpResult,
} from './jobs'
import type { LoadResult } from './storage'

export interface StoreState {
  data: AppData
  /** 開いている仕事。null なら開いていない */
  currentJobId: string | null
  /** 読み込みに失敗したときの知らせ（画面の上に出す） */
  loadError: string | null
  /** 保存してよいか（壊れたデータを守るため、保存を止めることがある） */
  canSave: boolean
}

/** 操作の中で使う id の作り方と今の時刻 */
export interface Env {
  newId: (prefix: string) => string
  now: Date
}

/** 部材の操作の対象の仕事（省略で開いている仕事） */
interface OnJob {
  jobId?: string
}

export type StoreAction =
  /** 新しい仕事を作る（名前が空なら「仕事 10/21」の形）。open（省略で true）なら開く */
  | { type: 'createJob'; name?: string; open?: boolean }
  /** 仕事を開く（null で閉じる） */
  | { type: 'openJob'; id: string | null }
  | { type: 'renameJob'; jobId: string; name: string }
  /** 仕事をコピーする（設定を引き継ぐ）。開かない */
  | { type: 'copyJob'; jobId: string }
  /** 仕事を消す。開いていた仕事なら、何も開いていない状態にする */
  | { type: 'deleteJob'; jobId: string }
  | ({ type: 'updateSettings'; patch: Partial<Omit<Settings, 'sheet'>> } & OnJob)
  /** 板のサイズを変える（選んだサイズを仕事に保存する） */
  | ({ type: 'setSheet'; sheet: Sheet } & OnJob)
  /** 部材を最後に足す（id は作る） */
  | ({ type: 'addPart'; part: Partial<Omit<Part, 'id'>> } & OnJob)
  | ({ type: 'updatePart'; partId: string; patch: Partial<Omit<Part, 'id'>> } & OnJob)
  | ({ type: 'removePart'; partId: string } & OnJob)
  /** 部材を index の位置（その部材の上）に入れる（id は作る。番号のメニューの「上に行を入れる」） */
  | ({ type: 'insertPart'; index: number; part: Partial<Omit<Part, 'id'>> } & OnJob)
  /** 選んだ部材をまとめて消す（「選んで削除」） */
  | ({ type: 'removeParts'; partIds: string[] } & OnJob)
  /** 全部の部材を回転してよい（true）／回転しない（false）にする */
  | ({ type: 'setAllRotatable'; rotatable: boolean } & OnJob)
  /** 部材の複製（元のすぐ後ろ。名前は「棚板のコピー」） */
  | ({ type: 'duplicatePart'; partId: string } & OnJob)
  /** 選んだ部材をコピーする（アプリが覚える。最後の1回分だけ） */
  | ({ type: 'copyParts'; partIds: string[] } & OnJob)
  /** コピーした部材のうち足せるものを、今の部材の後ろに足す */
  | ({ type: 'pasteParts' } & OnJob)
  /** 切り出しチェック（その1枚の、ある部材の片をまとめて付け外し） */
  | ({ type: 'setPartCheck'; target: SheetTarget; partId: string; done: boolean } & OnJob)
  /** 切り出しチェック（片1つ） */
  | ({ type: 'setPieceCheck'; target: SheetTarget; pieceId: string; done: boolean } & OnJob)
  /** 調整寸法（アプリ全体）を足す */
  | ({ type: 'addAdjust' } & AdjustDraft)
  | ({ type: 'updateAdjust'; adjustId: string } & AdjustDraft)
  /** 調整寸法を消す（1つでも一括でも） */
  | { type: 'removeAdjusts'; adjustIds: string[] }
  /** 読み込みの知らせを閉じる */
  | { type: 'dismissLoadError' }

/** 操作の結果。id は作ったもの（新しい仕事・部材・複製・調整寸法）の id */
export type ReduceResult = { ok: true; state: StoreState; id?: string } | { ok: false; message: string }

/** 読み込みの結果から最初の状態を作る */
export function initialState(load: LoadResult): StoreState {
  return { data: load.data, currentJobId: load.currentJobId, loadError: load.message ?? null, canSave: load.canSave }
}

/** 開いている仕事（無ければ null） */
export function currentJob(state: StoreState): Job | null {
  return state.data.jobs.find((j) => j.id === state.currentJobId) ?? null
}

const fail = (message: string): ReduceResult => ({ ok: false, message })
const done = (state: StoreState, id?: string): ReduceResult => (id === undefined ? { ok: true, state } : { ok: true, state, id })

/** 仕事に操作を当てて置き換える。変わったときだけ updatedAt を付ける（同じ仕事が返れば何もしない） */
function onJob(state: StoreState, jobId: string | undefined, env: Env, op: (job: Job) => OpResult, id?: string): ReduceResult {
  const target = jobId ?? state.currentJobId
  if (target === null) return fail('仕事が開かれていません')
  const job = state.data.jobs.find((j) => j.id === target)
  if (!job) return fail('仕事が見つかりません')
  const r = op(job)
  if (!r.ok) return fail(r.message)
  if (r.job === job) return done(state, id)
  const next: Job = { ...r.job, id: job.id, updatedAt: env.now.toISOString() }
  return done({ ...state, data: { ...state.data, jobs: state.data.jobs.map((j) => (j.id === job.id ? next : j)) } }, id)
}

/** 調整寸法の一覧を置き換える（アプリ全体なので、仕事の updatedAt は変えない。暫定） */
function onAdjusts(state: StoreState, r: AdjustsResult, id?: string): ReduceResult {
  if (!r.ok) return fail(r.message)
  return done({ ...state, data: { ...state.data, adjusts: r.adjusts } }, id)
}

export function reduce(state: StoreState, action: StoreAction, env: Env): ReduceResult {
  switch (action.type) {
    case 'createJob': {
      const job = makeJob(action.name ?? '', env.now, env.newId('job'))
      const open = action.open ?? true
      return done(
        { ...state, data: { ...state.data, jobs: [...state.data.jobs, job] }, currentJobId: open ? job.id : state.currentJobId },
        job.id,
      )
    }
    case 'openJob':
      if (action.id !== null && !state.data.jobs.some((j) => j.id === action.id)) return fail('仕事が見つかりません')
      return done({ ...state, currentJobId: action.id })
    case 'renameJob':
      return onJob(state, action.jobId, env, (j) => renameJob(j, action.name))
    case 'copyJob': {
      const src = state.data.jobs.find((j) => j.id === action.jobId)
      if (!src) return fail('仕事が見つかりません')
      const job = copyJob(src, env.now, env.newId('job'), env.newId)
      return done({ ...state, data: { ...state.data, jobs: [...state.data.jobs, job] } }, job.id)
    }
    case 'deleteJob': {
      if (!state.data.jobs.some((j) => j.id === action.jobId)) return fail('仕事が見つかりません')
      const r = deleteJob(state.data.jobs, state.currentJobId, action.jobId)
      return done({ ...state, data: { ...state.data, jobs: r.jobs }, currentJobId: r.currentJobId })
    }
    case 'updateSettings':
      return onJob(state, action.jobId, env, (j) => updateSettings(j, action.patch))
    case 'setSheet':
      return onJob(state, action.jobId, env, (j) => setSheet(j, action.sheet))
    case 'addPart': {
      const id = env.newId('part')
      return onJob(state, action.jobId, env, (j) => addPart(j, newPart(id, action.part)), id)
    }
    case 'updatePart':
      return onJob(state, action.jobId, env, (j) => updatePart(j, action.partId, action.patch))
    case 'removePart':
      return onJob(state, action.jobId, env, (j) => removePart(j, action.partId))
    case 'insertPart': {
      const id = env.newId('part')
      return onJob(state, action.jobId, env, (j) => insertPart(j, action.index, newPart(id, action.part)), id)
    }
    case 'removeParts':
      return onJob(state, action.jobId, env, (j) => removeParts(j, action.partIds))
    case 'setAllRotatable':
      return onJob(state, action.jobId, env, (j) => setAllRotatable(j, action.rotatable))
    case 'duplicatePart': {
      let id: string | undefined
      const r = onJob(state, action.jobId, env, (j) => {
        const d = duplicatePart(j, action.partId, env.newId)
        if (!d.ok) return d
        id = d.partId
        return { ok: true, job: d.job }
      })
      return r.ok ? done(r.state, id) : r
    }
    case 'copyParts': {
      const job = state.data.jobs.find((j) => j.id === (action.jobId ?? state.currentJobId))
      if (!job) return fail('仕事が開かれていません')
      const copied = copyParts(job, action.partIds)
      if (copied.length === 0) return fail('コピーする部材を選んでください')
      return done({ ...state, data: { ...state.data, clipboard: copied } })
    }
    case 'pasteParts': {
      const copied = state.data.clipboard
      if (!copied || copied.length === 0) return fail('コピーした部材がありません')
      return onJob(state, action.jobId, env, (j) => {
        const next = applyPaste(j, copied, env.newId)
        return { ok: true, job: next.parts.length === j.parts.length ? j : next }
      })
    }
    case 'setPartCheck':
      return onJob(state, action.jobId, env, (j) =>
        setPartCheck(j, action.target, action.partId, action.done, env.now, env.newId('frozen')),
      )
    case 'setPieceCheck':
      return onJob(state, action.jobId, env, (j) =>
        setPieceCheck(j, action.target, action.pieceId, action.done, env.now, env.newId('frozen')),
      )
    case 'addAdjust': {
      const id = env.newId('adjust')
      return onAdjusts(state, addAdjust(state.data.adjusts, { name: action.name, value: action.value }, id), id)
    }
    case 'updateAdjust':
      return onAdjusts(state, updateAdjust(state.data.adjusts, action.adjustId, { name: action.name, value: action.value }))
    case 'removeAdjusts':
      return onAdjusts(state, removeAdjusts(state.data.adjusts, action.adjustIds))
    case 'dismissLoadError':
      return done({ ...state, loadError: null })
  }
}
