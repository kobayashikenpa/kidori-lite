// 式をボタンだけで編集するための操作（式の入力 FormulaInput から使う。計算はしない）。
// kidori の ui/formulaEdit.ts をもとに、材料の厚み {t:…} を外し、逃げ {n:…} を調整寸法にしたもの。
// カーソルは「単位の番号」（0〜単位の数。k は k 番目の単位の前）で持つ。
// 部材の参照（全体.W）・調整寸法 {n:…} は1つの単位なので、1回の ◀ ▶・1字消す で塊ごと動く・消える
import { formulaUnits, type Unit, type UnitKind } from '../engine/formula/units'

export interface Edit {
  text: string
  /** 編集後のカーソル（単位の番号） */
  cursor: number
}

/** 数字・小数点・演算子・括弧のボタンで入れる文字 */
export type PadKey = '+' | '-' | '*' | '/' | '(' | ')' | '.' | `${number}`

type Side = Pick<Unit, 'kind' | 'text'> | undefined

/** 2つの単位の間に空白をはさむか。数字どうしはくっつけ、( の後ろと ) の前は空けない */
function needsSpace(a: Side, b: Side): boolean {
  if (!a || !b) return false
  if (a.kind === 'digit' && b.kind === 'digit') return false
  if (a.kind === 'paren' && (a.text === '(' || a.text === '（')) return false
  if (b.kind === 'paren' && (b.text === ')' || b.text === '）')) return false
  return true
}

const endsWithSpace = (s: string) => /\s$/.test(s)
const startsWithSpace = (s: string) => /^\s/.test(s)

/** 単位の数（カーソルの右端） */
export function unitCount(text: string): number {
  return formulaUnits(text).length
}

function clamp(cursor: number, n: number): number {
  return Math.max(0, Math.min(n, Math.floor(cursor)))
}

/** カーソルを1つ左へ（塊は1回で越える） */
export function moveLeft(text: string, cursor: number): number {
  return clamp(cursor - 1, unitCount(text))
}

/** カーソルを1つ右へ（塊は1回で越える） */
export function moveRight(text: string, cursor: number): number {
  return clamp(cursor + 1, unitCount(text))
}

/**
 * カーソルの位置に1つの単位（数字1字・演算子・括弧・全体.W・{n:…}）を入れる。
 * 前後の単位とくっついて別の意味にならないよう、必要なら空白をはさむ（空白は計算に影響しない）
 */
export function insertAt(text: string, cursor: number, piece: string): Edit {
  const units = formulaUnits(text)
  const k = clamp(cursor, units.length)
  // 入れる位置は前の単位のすぐ後ろ（前の単位との間の空白より前）。
  // こうしないと、先頭に「5」を入れたあと「0」を押したとき「5 0」と空白をはさんで離れてしまう（仕様書 18.5）
  const pos = k > 0 ? units[k - 1].end : k < units.length ? units[k].start : text.length
  const left = text.slice(0, pos)
  // 後ろの単位との間の空白は入れ直す（要るときだけ1つ）
  const right = text.slice(pos).trimStart()
  const kind: UnitKind = formulaUnits(piece)[0]?.kind ?? 'bad'
  const me = { kind, text: piece }
  const pre = !endsWithSpace(left) && needsSpace(units[k - 1], me) ? ' ' : ''
  const post = needsSpace(me, units[k]) ? ' ' : ''
  const head = left + pre + piece
  const next = head + post + right
  // 入れた単位の後ろにカーソルを置く
  const after = formulaUnits(next).filter((u) => u.end <= head.length).length
  return { text: next, cursor: after }
}

/**
 * カーソルの前の単位を1つ消す（部材の参照・調整寸法は塊ごと）。その前の空白もいっしょに消す。
 * 消したあとで前後の単位がくっついて別の意味にならないよう、必要なら空白を1つ残す
 */
export function deleteBefore(text: string, cursor: number): Edit {
  const units = formulaUnits(text)
  const k = clamp(cursor, units.length)
  if (k === 0) return { text, cursor: 0 }
  const target = units[k - 1]
  const prev = units[k - 2]
  const from = prev ? prev.end : 0
  const left = text.slice(0, from)
  let right = text.slice(target.end)
  if (left === '') right = right.trimStart()
  const gap = !startsWithSpace(right) && needsSpace(prev, units[k]) ? ' ' : ''
  return { text: left + gap + right, cursor: k - 1 }
}

/** 全部消す */
export function clearAll(): Edit {
  return { text: '', cursor: 0 }
}

/** 画面に出した単位の箱（px） */
export interface UnitBox {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * 式を押した所から、カーソル（単位の番号）を決める（仕様書 18.7）。boxes は単位の順の箱。
 * 押した高さにいちばん近い行の中で、押した単位の左半分なら前・右半分なら後ろ（部材の寸法・調整寸法の塊も、近いほうの端）。
 * 行の左の外なら行の始め、右の外なら行の終わり
 */
export function caretFromTap(boxes: readonly UnitBox[], x: number, y: number): number {
  if (boxes.length === 0) return 0
  // 押した高さに近い行（押した高さとの上下の離れがいちばん小さい箱の並び）
  const dist = (b: UnitBox) => (y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0)
  const best = Math.min(...boxes.map(dist))
  const line = boxes.map((b, i) => ({ b, i })).filter(({ b }) => dist(b) === best)
  for (const { b, i } of line) {
    if (x < b.right) return x < (b.left + b.right) / 2 ? i : i + 1
  }
  return line[line.length - 1].i + 1
}
