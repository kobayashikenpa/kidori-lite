// 仕上がりの式の調整寸法を数字に置き換える（第2.1版。仕様書 25.4・25.9）。純粋関数（元のデータは書き換えない）。新しく作ったもの。
// 第2.1版から［仕上がり］の W・H の式では調整寸法を使えない（調整は部材ごとの［調整］の欄で入れる）。
// 第2.0版までの仕事（保存データ・共有とバックアップのファイル）の仕上がりの式に入っている {n:id} を、
// その調整寸法の今の寸法の数字に置き換える（天板.W - 20 - {n:メラミン} → 天板.W - 20 - 1）。寸法の結果は変わらない。
// - 一覧に無い id（削除した調整寸法・書きかけの行）はそのまま残す（エラーのまま）
// - 調整の欄（Part.adjust）の {n:id} は置き換えない
// - 置き換えるものが無ければ同じオブジェクトを返す（保存しなおさない・useMemo が変わらない）
// 参考：kidori-simple の src/engine/migrate/numbers.ts（読むだけ。あちらは式ぜんぶを数字にする別の決まり）
import { usableAdjusts } from '../adjusts'
import { isBraceText, normalizeFormulaText, parseBraceText, splitChunks } from '../formula/tokenize'
import { exactText } from '../round'
import type { Adjust, AppData, CellClip, Job } from '../types'

/** 置き換えた数字の前後にくっつけない文字か（無い・空白・式の記号）。くっつくなら空白をはさむ（「{n:x}5」を「15」にしない） */
function isBoundary(ch: string | undefined): boolean {
  if (ch === undefined || /\s/.test(ch)) return true
  return ['+', '-', '*', '/', '(', ')'].includes(normalizeFormulaText(ch))
}

/** 調整寸法のかたまりの始まり（{ ・全角の ｛）か。次のかたまりは自分で前に空白をはさむので、後ろには足さない */
const isOpenBrace = (ch: string | undefined): boolean => ch !== undefined && normalizeFormulaText(ch) === '{'

/**
 * 式の中の調整寸法 {n:id}（全角の ｛ｎ：…｝ も）を、adjusts の寸法の数字（丸めない。exactText）に置き換える。
 * adjusts に無い id はそのまま。前後に数字・文字がくっついていれば空白をはさむ。置き換えるものが無ければ同じ文字を返す
 */
export function inlineAdjustsInExpr(expr: string, adjusts: readonly Adjust[]): string {
  const byId = new Map(adjusts.map((a) => [a.id, a.value]))
  let out = ''
  let last = 0
  for (const item of splitChunks(expr)) {
    if ('type' in item || !isBraceText(item.text)) continue
    const b = parseBraceText(item.text)
    const value = b ? byId.get(b.id) : undefined
    if (value === undefined) continue
    out += expr.slice(last, item.start)
    const before = isBoundary(out[out.length - 1]) ? '' : ' '
    const after = isBoundary(expr[item.end]) || isOpenBrace(expr[item.end]) ? '' : ' '
    out += before + exactText(value) + after
    last = item.end
  }
  return last === 0 ? expr : out + expr.slice(last)
}

/** 仕事の部材の仕上がりの式（Part.expr）の調整寸法を数字に置き換える。調整の欄は変えない。変わらなければ同じ仕事 */
export function inlineJobAdjusts(job: Job, adjusts: readonly Adjust[]): Job {
  let changed = false
  const parts = job.parts.map((p) => {
    const W = inlineAdjustsInExpr(p.expr.W, adjusts)
    const H = inlineAdjustsInExpr(p.expr.H, adjusts)
    if (W === p.expr.W && H === p.expr.H) return p
    changed = true
    return { ...p, expr: { W, H } }
  })
  return changed ? { ...job, parts } : job
}

/**
 * 保存してあるコピーしたセル（［仕上がり］の表のもの）の調整寸法を数字に置き換える（仕様書 25.9）。
 * どの列から写したかは持っていないが、名前には { } を使えず枚数は数字だけなので、{n:id} があるのは W・H のセルだけ。変わらなければ同じもの
 */
export function inlineCellClipAdjusts(clip: CellClip, adjusts: readonly Adjust[]): CellClip {
  let changed = false
  const cells = clip.cells.map((row) =>
    row.map((text) => {
      const t = inlineAdjustsInExpr(text, adjusts)
      if (t !== text) changed = true
      return t
    }),
  )
  return changed ? { ...clip, cells } : clip
}

/**
 * 保存データ全体（第2.0版までのものも）：全部の仕事の仕上がりの式と、コピーしたセルの調整寸法を、
 * 調整寸法の表の今の寸法（式で使える行だけ。書きかけの行の id は残す）で数字に置き換える。変わらなければ同じデータ
 */
export function inlineAppDataAdjusts(data: AppData): AppData {
  const adjusts = usableAdjusts(data.adjusts)
  let changed = false
  const jobs = data.jobs.map((j) => {
    const next = inlineJobAdjusts(j, adjusts)
    if (next !== j) changed = true
    return next
  })
  const cellClip = data.cellClip ? inlineCellClipAdjusts(data.cellClip, adjusts) : null
  if (cellClip !== data.cellClip) changed = true
  return changed ? { ...data, jobs, cellClip } : data
}
