// 戻る・進むの履歴（第2.3版。仕様書 27.2・27.3、architecture 16.1・16.2）。React に依存しない純粋な関数。
// 履歴は操作の前と後の中身をまるごと持つ（スナップショット）。部材・設定・固定した1枚・調整寸法の表は変えずに新しいオブジェクトを作る作りなので、
// 変わらない部分は前のオブジェクトを共有し、50回持ってもメモリは小さい。
// reduce は変えずに、その外側（dispatchWithHistory）で記録する。履歴はスマホに保存しない（StoreState.history。saveSaved は書かない）
import { isBlankPart } from '../engine/parts'
import type { AdjustRow, AppData, Job } from '../engine/types'
import { historyLabel, historyNotice } from './historyLabel'
import { reduce, type Env, type ReduceResult, type StoreAction, type StoreState } from './reducer'

/** 仕事の中身のうち、戻すもの（名前・id・作った日・updatedAt は戻さない） */
export type JobBody = Pick<Job, 'parts' | 'settings' | 'frozenSheets'>

/** 1つの仕事の前と後 */
export interface JobChange {
  jobId: string
  before: JobBody
  after: JobBody
}

/** 調整寸法の表（アプリ全体）の前と後 */
export interface AdjustsChange {
  before: AdjustRow[]
  after: AdjustRow[]
}

/** 履歴の1回（「戻る」1回で戻る分） */
export interface HistoryEntry {
  /** 何をしたか（知らせる文に使う。まとめた1回で名前が2つ以上なら「天板 の回転 ほか2件」） */
  label: string
  /** 最初の操作の名前 */
  first: string
  /** まとめた操作の相手（部材の操作は部材の id、ほかは操作の名前。重ならない）。2つ以上なら名前は「最初 ほか◯件」 */
  keys: string[]
  /**
   * この1回を記録したときに消した「進む」（戻したあとの新しい操作）。この1回が後片付けなどで何も変わらなかったことになり
   * 履歴から外れたら、消した「進む」を戻す。戻す・進むで動かしたあとは持たない
   */
  clearedFuture?: HistoryEntry[]
  /** まとめる印（dispatch の opts.group）。無ければ null */
  group: string | null
  /** 変わった仕事ごとの前と後（切り取りの元がほかの仕事なら2つ） */
  jobs: JobChange[]
  /** 調整寸法の表の前と後。変わらなければ null */
  adjusts: AdjustsChange | null
}

export interface History {
  /** 戻せる分（古い順。最大 HISTORY_LIMIT） */
  past: HistoryEntry[]
  /** 戻した分（次に進むものが最後） */
  future: HistoryEntry[]
  /** 最後にしたのが記録（'record'）か戻す・進む（'move'）か。まとめる・後片付けの判断に使う。履歴を消した直後などは null */
  last: 'record' | 'move' | null
  /** 戻す・進むのたびに 1 増える（画面が入力を終え、選んでいる範囲を外す合図）。履歴を消しても戻さない */
  revision: number
}

/** dispatch に渡す「1回の操作のまとまり」の印（U-37 で画面が渡す） */
export interface DispatchOptions {
  /** 同じ印の操作が続いたら1回にまとめる。画面がセルの入力を始めるたびに新しい印を作る */
  group?: string
  /** 直前の1回に含める後片付け（何も入れずに離れた空の行を外す）。直前が戻す・進むなら記録しない */
  follow?: boolean
}

/** 戻す・進むの結果。label は戻した（進めた）1回の名前（「棚板 の W」）、notice は知らせる文（「戻しました：棚板 の W」） */
export type HistoryResult = { ok: true; state: StoreState; label: string; notice: string } | { ok: false; message: string }

/** 戻せる数（仕様書 27.3）。古いものから消える */
export const HISTORY_LIMIT = 50

export const UNDO_EMPTY_MESSAGE = '戻せる操作がありません'
export const REDO_EMPTY_MESSAGE = '進める操作がありません'

/** 空の履歴。revision は引き継ぐ（消しても画面の合図が前の値に戻らないように） */
export function emptyHistory(revision = 0): History {
  return { past: [], future: [], last: null, revision }
}

export const canUndo = (h: History): boolean => h.past.length > 0
export const canRedo = (h: History): boolean => h.future.length > 0

// ---------- 操作の種類 ----------

/**
 * - undo：戻せる操作（部材・木取りの画面、調整寸法の表。27.2）
 * - none：仕事も調整寸法の表も変えない操作（コピー・切り取り・知らせを閉じる）。記録しない
 * - jobs：戻せない操作（仕事の画面。27.2）。開いている仕事の中身か調整寸法の表が変わったら履歴を消す（27.4）
 */
type ActionKind = 'undo' | 'none' | 'jobs'

const KINDS: Record<StoreAction['type'], ActionKind> = {
  // 部材の画面
  addPart: 'undo',
  updatePart: 'undo',
  setPartAdjust: 'undo',
  removePart: 'undo',
  insertPart: 'undo',
  setAllRotatable: 'undo',
  sortParts: 'undo',
  moveParts: 'undo',
  duplicatePart: 'undo',
  pasteCells: 'undo',
  fillCells: 'undo',
  clearCells: 'undo',
  deleteRows: 'undo',
  pastePartAdjustCells: 'undo',
  fillPartAdjustCells: 'undo',
  clearPartAdjustCells: 'undo',
  setCellColor: 'undo',
  setRowColor: 'undo',
  setPartMemo: 'undo',
  // 調整寸法の表（全部の仕事で共通）
  setAdjustCell: 'undo',
  pasteAdjustCells: 'undo',
  fillAdjustCells: 'undo',
  clearAdjustCells: 'undo',
  deleteAdjustRows: 'undo',
  insertAdjustRow: 'undo',
  addAdjust: 'undo',
  updateAdjust: 'undo',
  removeAdjusts: 'undo',
  // 木取りの画面（切り代は部材の画面でも変える）
  setSheet: 'undo',
  updateSettings: 'undo',
  setPartCheck: 'undo',
  setPieceCheck: 'undo',
  // 記録しない
  copyCells: 'none',
  cutCells: 'none',
  copyPartAdjustCells: 'none',
  cutPartAdjustCells: 'none',
  copyAdjustCells: 'none',
  cutAdjustCells: 'none',
  dismissLoadError: 'none',
  // 仕事の画面（戻さない）
  createJob: 'jobs',
  openJob: 'jobs',
  renameJob: 'jobs',
  copyJob: 'jobs',
  deleteJob: 'jobs',
  addSample: 'jobs',
  replaceData: 'jobs',
}

// ---------- 比べる ----------

/** 中身が同じか（保存データの形＝数・文字・真偽・null・配列・オブジェクトだけ）。同じオブジェクトならすぐ true */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => same(v, b[i]))
  }
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra)
  if (ka.length !== Object.keys(rb).length) return false
  return ka.every((k) => Object.prototype.hasOwnProperty.call(rb, k) && same(ra[k], rb[k]))
}

const bodyOf = (job: Job): JobBody => ({ parts: job.parts, settings: job.settings, frozenSheets: job.frozenSheets })

const sameBody = (a: JobBody, b: JobBody): boolean => same(a.parts, b.parts) && same(a.settings, b.settings) && same(a.frozenSheets, b.frozenSheets)

/** 操作の前と後で、中身が変わった仕事（どちらにもある仕事だけ）と調整寸法の表 */
function changesBetween(before: AppData, after: AppData): Pick<HistoryEntry, 'jobs' | 'adjusts'> {
  const prev = new Map(before.jobs.map((j) => [j.id, j]))
  const jobs: JobChange[] = []
  for (const job of after.jobs) {
    const p = prev.get(job.id)
    if (!p || p === job) continue
    const b = bodyOf(p)
    const a = bodyOf(job)
    if (!sameBody(b, a)) jobs.push({ jobId: job.id, before: b, after: a })
  }
  const adjusts = before.adjusts !== after.adjusts && !same(before.adjusts, after.adjusts) ? { before: before.adjusts, after: after.adjusts } : null
  return { jobs, adjusts }
}

/** 知らせる文の名前（相手が2つ以上なら「最初 ほか◯件」） */
function labelOf(first: string, keys: readonly string[]): string {
  return keys.length > 1 ? `${first} ほか${keys.length - 1}件` : first
}

/** まとめる相手：1つの部材の操作は部材の id（同じ部材の名前と W を変えても1件）、ほかは操作の名前 */
function keyOf(action: StoreAction, label: string): string {
  return 'partId' in action && typeof action.partId === 'string' ? `part:${action.partId}` : `label:${label}`
}

/** 前と後が同じになった仕事・調整寸法の表を外す。何も残らなければ null */
function prune(entry: HistoryEntry): HistoryEntry | null {
  const jobs = entry.jobs.filter((j) => !sameBody(j.before, j.after))
  const adjusts = entry.adjusts && !same(entry.adjusts.before, entry.adjusts.after) ? entry.adjusts : null
  if (jobs.length === 0 && adjusts === null) return null
  return { ...entry, jobs, adjusts }
}

/**
 * 直前の1回に続けて含める（前は最初のまま、後を新しくする。新しく変わった仕事・調整寸法の表は足す）。
 * label を渡すと（同じ印のまとまり）、まとめた操作の名前に足す。後片付け（follow）は名前を足さない
 */
function merge(prev: HistoryEntry, cur: Pick<HistoryEntry, 'jobs' | 'adjusts'>, key?: string): HistoryEntry {
  const jobs = prev.jobs.map((j) => {
    const c = cur.jobs.find((x) => x.jobId === j.jobId)
    return c ? { ...j, after: c.after } : j
  })
  for (const c of cur.jobs) if (!prev.jobs.some((j) => j.jobId === c.jobId)) jobs.push(c)
  let adjusts = prev.adjusts
  if (cur.adjusts) adjusts = prev.adjusts ? { before: prev.adjusts.before, after: cur.adjusts.after } : cur.adjusts
  const keys = key !== undefined && !prev.keys.includes(key) ? [...prev.keys, key] : prev.keys
  return { ...prev, jobs, adjusts, keys, label: labelOf(prev.first, keys) }
}

// ---------- 記録 ----------

/**
 * 直前の1回を置き換える。前と後が同じになったら履歴から外す（そのあとは何にもまとめない）。
 * 外れた1回が記録したときに消した「進む」があれば戻す（戻したあとに行を挿入して何も入れずに外した、など）
 */
function replaceTop(h: History, merged: HistoryEntry): History {
  const rest = h.past.slice(0, -1)
  const entry = prune(merged)
  if (!entry) return { ...h, past: rest, future: merged.clearedFuture ?? h.future, last: null }
  return { ...h, past: [...rest, entry], last: 'record' }
}

function record(h: History, change: Pick<HistoryEntry, 'jobs' | 'adjusts'>, label: string, key: string, opts: DispatchOptions | undefined): History {
  const top = h.past.at(-1)
  if (opts?.follow) {
    // 後片付け：直前が記録なら含める。戻す・進むの直後（や何も無いとき）は記録せず、先も消さない
    if (h.last !== 'record' || !top) return h
    return replaceTop(h, merge(top, change))
  }
  const group = opts?.group ?? null
  if (group !== null && h.last === 'record' && top && top.group === group) return replaceTop(h, merge(top, change, key))
  const entry = prune({ label, first: label, keys: [key], group, ...change, ...(h.future.length > 0 ? { clearedFuture: h.future } : {}) })
  if (!entry) return h
  return { ...h, past: [...h.past, entry].slice(-HISTORY_LIMIT), future: [], last: 'record' }
}

/**
 * 操作を当てて、戻せる操作なら履歴に記録する（architecture 16.2）。結果は reduce と同じ形（state.history が新しくなる）。
 * - 失敗した操作・何も変わらなかった操作は何もしない
 * - 開いている仕事が変わったら（ほかの仕事を開く・閉じる・新しい仕事を作って開く・開いている仕事の削除）履歴を空にする。同じ仕事を開き直しても消さない
 * - 戻せる操作で、仕事の中身（parts・settings・frozenSheets）か調整寸法の表が変わったときだけ記録する（opts.group でまとめる・opts.follow で直前に含める）
 * - 戻せない操作（仕事の画面）で、開いている仕事の中身か調整寸法の表が変わったら履歴を空にする。replaceData はいつも空にする
 */
export function dispatchWithHistory(state: StoreState, action: StoreAction, env: Env, opts?: DispatchOptions): ReduceResult {
  const r = reduce(state, action, env)
  if (!r.ok || r.state === state) return r
  const h = state.history
  const withHistory = (history: History): ReduceResult => (history === r.state.history ? r : { ...r, state: { ...r.state, history } })

  if (r.state.currentJobId !== state.currentJobId) return withHistory(emptyHistory(h.revision))
  const kind = KINDS[action.type]
  if (kind === 'none') return r
  if (action.type === 'replaceData') return withHistory(emptyHistory(h.revision))

  const change = changesBetween(state.data, r.state.data)
  if (change.jobs.length === 0 && change.adjusts === null) return r
  if (kind === 'jobs') {
    const touched = change.adjusts !== null || change.jobs.some((j) => j.jobId === state.currentJobId)
    return touched ? withHistory(emptyHistory(h.revision)) : r
  }
  const label = historyLabel(action, state)
  return withHistory(record(h, change, label, keyOf(action, label), opts))
}

// ---------- 戻す・進む ----------

/**
 * 何も入っていない行（部材・調整寸法の表）を外す。画面は入力していない空の行を後片付けで外すので、戻す・進むで当てる中身にも残さない
 * （残すと、戻したあとの後片付けが履歴の外で行を外し、見た目の変わらない「戻る」ができてしまう）
 */
const tidyBody = (b: JobBody): JobBody => {
  const parts = b.parts.filter((p) => !isBlankPart(p))
  return parts.length === b.parts.length ? b : { ...b, parts }
}
const tidyAdjusts = (rows: AdjustRow[]): AdjustRow[] => {
  const kept = rows.filter((r) => r.name.trim() !== '' || r.value !== null)
  return kept.length === rows.length ? rows : kept
}

/** 戻す・進むで動かした1回は、消した「進む」を持たない */
const bare = (entry: HistoryEntry): HistoryEntry => {
  if (!entry.clearedFuture) return entry
  const rest = { ...entry }
  delete rest.clearedFuture
  return rest
}

/** 1回の前（後）の中身を当てる（空の行は外す）。当てる所が何も無ければ（記録した仕事が全部消えた）null */
function applyEntry(data: AppData, entry: HistoryEntry, side: 'before' | 'after', now: Date): AppData | null {
  let touched = false
  const stamp = now.toISOString()
  const jobs = data.jobs.map((job) => {
    const c = entry.jobs.find((x) => x.jobId === job.id)
    if (!c) return job
    touched = true
    const b = tidyBody(c[side])
    // 名前・id・作った日は今のまま。updatedAt は今の時刻（戻すのも変更）
    return { ...job, parts: b.parts, settings: b.settings, frozenSheets: b.frozenSheets, updatedAt: stamp }
  })
  let adjusts = data.adjusts
  if (entry.adjusts) {
    adjusts = tidyAdjusts(entry.adjusts[side])
    touched = true
  }
  return touched ? { ...data, jobs, adjusts } : null
}

/**
 * 戻す・進む。空の行を外すと見た目が何も変わらない1回（行の挿入だけ、など）は、向こう側へ動かして次の1回を当てる。
 * 何も変わる1回が無ければ、何もしない（理由を返す）
 */
function move(state: StoreState, env: Env, kind: 'undo' | 'redo'): HistoryResult {
  const h = state.history
  const from = kind === 'undo' ? [...h.past] : [...h.future]
  const to = kind === 'undo' ? [...h.future] : [...h.past]
  while (from.length > 0) {
    const entry = bare(from.pop()!)
    const data = applyEntry(state.data, entry, kind === 'undo' ? 'before' : 'after', env.now)
    if (!data) continue // 記録した仕事が全部消えていれば、その1回は捨てて次へ
    to.push(entry)
    const change = changesBetween(state.data, data)
    if (change.jobs.length === 0 && change.adjusts === null) continue // 見た目が変わらない1回は飛ばす
    const history: History =
      kind === 'undo'
        ? { past: from, future: to, last: 'move', revision: h.revision + 1 }
        : { past: to, future: from, last: 'move', revision: h.revision + 1 }
    return { ok: true, state: { ...state, data, history }, label: entry.label, notice: historyNotice(kind, entry.label) }
  }
  return { ok: false, message: kind === 'undo' ? UNDO_EMPTY_MESSAGE : REDO_EMPTY_MESSAGE }
}

/** 戻す：最後の1回の前の中身に置き換える（コピーしたセルは変えない） */
export function undoHistory(state: StoreState, env: Env): HistoryResult {
  return move(state, env, 'undo')
}

/** 進む：最後に戻した1回の後の中身に置き換える */
export function redoHistory(state: StoreState, env: Env): HistoryResult {
  return move(state, env, 'redo')
}
