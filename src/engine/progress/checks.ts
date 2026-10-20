// 片のチェックの付け外し（仕様書 8）。仕事を書き換えずに、新しい仕事を返す（updatedAt は保存の側で付ける）。
// kidori の store/jobs.ts の setPieceCheck・setPartCheck をもとに、材料・重ね切りを外し、計算として engine に置いたもの
// - 1つ目のチェックで、その1枚を固定する（固定のボタンは無い）
// - その1枚のすべての片にチェックすると切り終わり（completedAt）。1つでも外すと消す
// - チェックを全部外すと固定も外す（1枚を消す。片は計算に戻る）
import type { FrozenSheet, Job, SheetLayout } from '../types'
import { freezeSheet } from './frozen'

/** チェックする1枚：計算した1枚（packJob の sheets のどれか）か、固定した1枚 */
export type SheetTarget =
  | { kind: 'computed'; mode: 'vertical' | 'horizontal'; layout: SheetLayout }
  | { kind: 'frozen'; sheetId: string }

export type CheckResult = { ok: true; job: Job } | { ok: false; message: string }

const ok = (job: Job): CheckResult => ({ ok: true, job })
const fail = (message: string): CheckResult => ({ ok: false, message })

/**
 * 片1つの付け外し。
 * - 計算した1枚に付ける：その1枚を写して固定し（checked はその片だけ・固定した1枚の id は引数 id。無ければ断る）、固定した1枚の最後に足す。外すは何もしない
 * - 固定した1枚：checked に足す／外す。同じ状態なら何もしない（同じ job を返す）
 * - 写しに無い片・無い1枚は断る
 */
export function setPieceCheck(job: Job, target: SheetTarget, pieceId: string, done: boolean, now: Date, id?: string): CheckResult {
  if (target.kind === 'computed') {
    if (!target.layout.placements.some((p) => p.pieceId === pieceId)) return fail('部材が見つかりません')
    if (!done) return ok(job)
    if (id === undefined) return fail('固定する1枚の id がありません')
    const sheet = freezeSheet(job, target.mode, target.layout, id, now)
    sheet.checked = [pieceId]
    if (sheet.layout.placements.length === 1) sheet.completedAt = now.toISOString()
    return ok({ ...job, frozenSheets: [...job.frozenSheets, sheet] })
  }

  const sheet = job.frozenSheets.find((f) => f.id === target.sheetId)
  if (!sheet) return fail('固定した1枚が見つかりません')
  if (!sheet.layout.placements.some((p) => p.pieceId === pieceId)) return fail('部材が見つかりません')
  const has = sheet.checked.includes(pieceId)
  if (done === has) return ok(job)
  const checked = done ? [...sheet.checked, pieceId] : sheet.checked.filter((x) => x !== pieceId)
  if (checked.length === 0) return ok({ ...job, frozenSheets: job.frozenSheets.filter((f) => f.id !== sheet.id) })
  const { completedAt: _completedAt, ...rest } = sheet
  const all = sheet.layout.placements.every((p) => checked.includes(p.pieceId))
  const next: FrozenSheet = all ? { ...rest, checked, completedAt: sheet.completedAt ?? now.toISOString() } : { ...rest, checked }
  return ok({ ...job, frozenSheets: job.frozenSheets.map((f) => (f.id === sheet.id ? next : f)) })
}

/**
 * その1枚の、ある部材の片をまとめて付け外しする（チェックの一覧の1行「□ 側板 ×2枚」を押したとき）。
 * 中身は setPieceCheck を片ごとに繰り返す（固定・切り終わり・固定の外れの決まりはそのまま）。
 * - 付ける：まだ付いていない片だけ。計算した1枚は1つ目の片で id の1枚として固定し、2つ目からはその固定した1枚に付ける
 * - 外す：付いている片をすべて外す。計算した1枚で外すは何もしない
 * - その1枚にこの部材の片が無ければ断る。途中で断られたら、元の job のまま断る
 */
export function setPartCheck(job: Job, target: SheetTarget, partId: string, done: boolean, now: Date, id?: string): CheckResult {
  let layout: SheetLayout
  let checked: readonly string[] = []
  if (target.kind === 'computed') {
    layout = target.layout
  } else {
    const sheet = job.frozenSheets.find((f) => f.id === target.sheetId)
    if (!sheet) return fail('固定した1枚が見つかりません')
    layout = sheet.layout
    checked = sheet.checked
  }
  const pieceIds = layout.placements.filter((p) => p.partId === partId).map((p) => p.pieceId)
  if (pieceIds.length === 0) return fail('部材が見つかりません')
  const todo = pieceIds.filter((pid) => checked.includes(pid) !== done)
  let cur = job
  let t = target
  for (const pid of todo) {
    const r = setPieceCheck(cur, t, pid, done, now, id)
    if (!r.ok) return r
    cur = r.job
    if (t.kind === 'computed' && done && id !== undefined) t = { kind: 'frozen', sheetId: id }
  }
  return ok(cur)
}
