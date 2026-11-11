// 部材ごとの調整の式（第2.1版。仕様書 25.1・25.2）。新しく作ったもの（kidori には無い）。
// ［調整］のタブの W・H に入れる、仕上がり寸法に足し引きする値。
// - 使えるもの：数字・+ - * / ( )・調整寸法 {n:id}（全角の記号・× ÷ − も今の式と同じく読む）
// - 先頭の「-」で引き、「+」か記号なしで足す（式の値がそのまま足し引きする値。−{n:メラミン}*2 なら −2）
// - 部材の寸法（天板.W）は使えない（「調整には部材の寸法は使えません」）
// - 空（空白だけ）は「調整なし（0）」
// - 「＝」は付けない（付いていても今の式と同じく読み飛ばす）
import type { Adjust } from '../types'
import { evaluate, type EvalResult } from './evaluate'
import { parse, type ParseResult } from './parse'

export { REF_IN_ADJUST_MESSAGE } from './parse'

/** 調整の式が空（空白だけ）か。空は「調整なし（0）」 */
export function isBlankAdjustExpr(expr: string): boolean {
  return expr.trim() === ''
}

/**
 * 調整の式を構文木にする。空は 0。エラーの文は画面に見えている言葉（調整寸法の表示名は adjusts から）。
 * 入れている途中の形（「−」だけ・終わりが記号など）のエラーには incomplete を付ける（仕上がりの式と同じ）
 */
export function parseAdjustExpr(expr: string, adjusts?: readonly Adjust[]): ParseResult {
  if (isBlankAdjustExpr(expr)) return { ok: true, ast: { type: 'number', value: 0 } }
  return parse(expr, adjusts, { kind: 'adjust' })
}

/**
 * 調整の式を計算する：足し引きする値（mm）。adjusts は式で使える調整寸法（engine/adjusts の usableAdjusts）。
 * 一覧に無い id（削除した調整寸法・書きかけの行）は unknownAdjust「削除した調整寸法を使っています」
 */
export function evaluateAdjustExpr(expr: string, adjusts: readonly Adjust[]): EvalResult {
  const p = parseAdjustExpr(expr, adjusts)
  if (!p.ok) return p
  const byId = new Map(adjusts.map((a) => [a.id, a.value]))
  // 部材の寸法は構文解析で断るので、ref は呼ばれない
  return evaluate(p.ast, { ref: () => null, adjust: (id) => byId.get(id) ?? null })
}
