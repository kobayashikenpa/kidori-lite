// 保存データの状態と、その変え方（reducer）。React に依存しないのでテストしやすい。
// kidori の store/reducer.ts を参考に作り直したもの。
// 操作の中で id・時刻を作るので、reduce は「id の作り方と今の時刻（env）」を引数で受ける純粋関数にする。
// 画面からは JobStore の dispatch で1回だけ当てる（React が reducer を2回呼んでも id がずれないように、結果の状態を置き換える）
import {
  clearCells,
  clearCutSource,
  copyCells,
  cutCells,
  deleteRows,
  fillCells,
  pasteCells,
  type CellSelection,
  type PasteSkip,
} from '../engine/clipboard/cells'
import { duplicatePart } from '../engine/clipboard/copy'
import { setPartCheck, setPieceCheck, type SheetTarget } from '../engine/progress/checks'
import type { AppData, CellPos, CellRange, Job, Part, Settings, Sheet } from '../engine/types'
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
import { sampleJob } from './sample'
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

/** 選んだセル：セルの配列（第1.2版）か、四角い範囲（第1.3版。行全体・列全体も engine の rowRange・columnRange で四角にする） */
export type SelectionArg = { cells: CellPos[] } | { range: CellRange }

const selectionOf = (a: SelectionArg): CellSelection => ('range' in a ? a.range : a.cells)

export type StoreAction =
  /** 新しい仕事を作る（名前が空なら「仕事 10/21」の形）。open（省略で true）なら開く */
  | { type: 'createJob'; name?: string; open?: boolean }
  /** 仕事を開く（null で閉じる） */
  | { type: 'openJob'; id: string | null }
  | { type: 'renameJob'; jobId: string; name: string }
  /** 仕事をコピーする（設定を引き継ぐ）。開かない */
  | { type: 'copyJob'; jobId: string }
  /**
   * 見本（6章の棚「見本 棚」）を仕事の一覧に足す（仕様書 16.7）。開いている仕事は変えない。
   * 調整寸法にメラミン1 が無ければ足す
   */
  | { type: 'addSample' }
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
  /** 全部の部材を回転してよい（true）／回転しない（false）にする */
  | ({ type: 'setAllRotatable'; rotatable: boolean } & OnJob)
  /** 部材の複製（元のすぐ後ろ。名前は「棚板のコピー」） */
  | ({ type: 'duplicatePart'; partId: string } & OnJob)
  /**
   * 選んだセルをコピーする（1つのセルか四角い範囲だけ。アプリが覚える＝AppData.cellClip。最後の1回分だけ）。
   * 仕事は変えない（updatedAt も付けない）
   */
  | ({ type: 'copyCells' } & SelectionArg & OnJob)
  /**
   * 選んだセルを切り取る（第1.3版。仕様書 17.3）。コピーと同じく覚え、元（仕事の id と範囲）を cellClip.cut に付ける。
   * 仕事はまだ変えない（貼ったときに元を空にする。貼る前にほかをコピーすると元は残る）
   */
  | ({ type: 'cutCells' } & SelectionArg & OnJob)
  /**
   * コピーしたセルを、選んだセルに貼る（engine の pasteCells）。結果の paste に貼った数・貼れなかったセル。
   * 切り取りなら元のセルを空にし（元がほかの仕事でも）、1つでも貼れたら cellClip をふつうのコピーに変える
   */
  | ({ type: 'pasteCells' } & SelectionArg & OnJob)
  /**
   * オートフィル（第1.3版。仕様書 17.4）：from の範囲の値を、to の範囲（引いたあとの範囲。元を除いた所だけでもよい）へ上下にくり返して入れる。
   * 結果の paste は貼り付けと同じ形（名前の列は reason 'fillName'「同じ名前は入れられません」）
   */
  | ({ type: 'fillCells'; from: CellRange; to: CellRange } & OnJob)
  /** 選んだセルの中身を消す（行の全部の欄が空になった部材は消える） */
  | ({ type: 'clearCells' } & SelectionArg & OnJob)
  /** 選んだセルのある行の部材をまとめて消す（式で使われているかの確認は画面の側で先に行う） */
  | ({ type: 'deleteRows' } & SelectionArg & OnJob)
  /** 切り出しチェック（その1枚の、ある部材の片をまとめて付け外し） */
  | ({ type: 'setPartCheck'; target: SheetTarget; partId: string; done: boolean } & OnJob)
  /** 切り出しチェック（片1つ） */
  | ({ type: 'setPieceCheck'; target: SheetTarget; pieceId: string; done: boolean } & OnJob)
  /** 調整寸法（アプリ全体）を足す */
  | ({ type: 'addAdjust' } & AdjustDraft)
  | ({ type: 'updateAdjust'; adjustId: string } & AdjustDraft)
  /** 調整寸法を消す（1つでも一括でも） */
  | { type: 'removeAdjusts'; adjustIds: string[] }
  /**
   * 保存データを丸ごと置き換える（ファイルから取り込んだあとの data を入れる。engine/transfer の importTransfer）。
   * 開いている仕事は変えない（新しいデータに無ければ閉じる）。updatedAt は付けない
   */
  | { type: 'replaceData'; data: AppData }
  /** 読み込みの知らせを閉じる */
  | { type: 'dismissLoadError' }

/** 貼り付けの結果（「◯つのセルに貼りました（貼れなかったもの ◯つ）」） */
export interface PasteSummary {
  pasted: number
  skipped: PasteSkip[]
}

/** 操作の結果。id は作ったもの（新しい仕事・部材・複製・調整寸法）の id。paste は貼り付け（pasteCells）・オートフィル（fillCells）のときだけ */
export type ReduceResult = { ok: true; state: StoreState; id?: string; paste?: PasteSummary } | { ok: false; message: string }

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
    case 'addSample': {
      const r = sampleJob(state.data.adjusts, env.now, env.newId)
      return done({ ...state, data: { ...state.data, jobs: [...state.data.jobs, r.job], adjusts: r.adjusts } }, r.job.id)
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
    case 'copyCells':
    case 'cutCells': {
      const job = state.data.jobs.find((j) => j.id === (action.jobId ?? state.currentJobId))
      if (!job) return fail('仕事が開かれていません')
      const sel = selectionOf(action)
      const r = action.type === 'cutCells' ? cutCells(job, sel) : copyCells(job, sel)
      if (!r.ok) return fail(r.message)
      return done({ ...state, data: { ...state.data, cellClip: r.clip } })
    }
    case 'pasteCells': {
      const clip = state.data.cellClip
      if (!clip) return fail('コピーしたセルがありません')
      let paste: PasteSummary | undefined
      let cutClear: { jobId: string; cells: CellPos[] } | null = null
      const r = onJob(state, action.jobId, env, (j) => {
        const p = pasteCells(j, clip, selectionOf(action), env.newId)
        if (!p.ok) return p
        paste = { pasted: p.pasted, skipped: p.skipped }
        cutClear = p.cutClear
        return { ok: true, job: p.job }
      })
      if (!r.ok || !paste) return r
      const summary: PasteSummary = paste
      if (!clip.cut || summary.pasted === 0) return { ...r, paste: summary }
      // 切り取り：元がほかの仕事なら、その仕事の元のセルを空にする。クリップはふつうのコピーに変える（2回目は元を消さない）
      let next = r.state
      const clear = cutClear as { jobId: string; cells: CellPos[] } | null
      if (clear) {
        const after = onJob(next, clear.jobId, env, (j) => ({ ok: true, job: clearCutSource(j, clip, clear.cells) }))
        if (after.ok) next = after.state // 元の仕事が消えていれば何もしない
      }
      const { cut: _cut, ...copy } = clip
      return { ok: true, state: { ...next, data: { ...next.data, cellClip: copy } }, paste: summary }
    }
    case 'fillCells': {
      let paste: PasteSummary | undefined
      const r = onJob(state, action.jobId, env, (j) => {
        const p = fillCells(j, action.from, action.to, env.newId)
        if (!p.ok) return p
        paste = { pasted: p.pasted, skipped: p.skipped }
        return { ok: true, job: p.job }
      })
      return r.ok && paste ? { ...r, paste } : r
    }
    case 'clearCells':
      return onJob(state, action.jobId, env, (j) => ({ ok: true, job: clearCells(j, selectionOf(action)) }))
    case 'deleteRows':
      return onJob(state, action.jobId, env, (j) => {
        const next = deleteRows(j, selectionOf(action))
        return next === j ? { ok: false, message: '削除する行を選んでください' } : { ok: true, job: next }
      })
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
    case 'replaceData': {
      const keep = state.currentJobId !== null && action.data.jobs.some((j) => j.id === state.currentJobId)
      return done({ ...state, data: action.data, currentJobId: keep ? state.currentJobId : null })
    }
    case 'dismissLoadError':
      return done({ ...state, loadError: null })
  }
}
