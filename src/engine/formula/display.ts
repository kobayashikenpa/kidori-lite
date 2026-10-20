// 式の単位を画面の表示名にする（調整寸法は メラミン1・ほぞ15 など。mm は付けない）
// kidori の formula/display.ts をもとに、材料の厚みを外し、調整寸法をアプリ全体の一覧から引くようにしたもの
import { adjustName } from '../defaults'
import type { Adjust } from '../types'
import { normalizeFormulaText, parseBraceText, parseRefText } from './tokenize'
import { formulaUnits, type Unit } from './units'

const OP_LABELS: Readonly<Record<string, string>> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

/**
 * 単位の表示名。* → ×、/ → ÷、- → −、{n:…} → メラミン1・ほぞ15（名前＋寸法）。
 * 調整寸法が見つからなければ（削除した調整寸法）。読めないかたまりはそのまま
 */
export function unitLabel(unit: Unit, adjusts: readonly Adjust[]): string {
  const n = normalizeFormulaText(unit.text)
  switch (unit.kind) {
    case 'digit':
    case 'paren':
      return n
    case 'op':
      return OP_LABELS[n] ?? n
    case 'partRef': {
      const r = parseRefText(unit.text)
      return r ? `${r.part}.${r.axis}` : n
    }
    case 'adjust': {
      const id = parseBraceText(unit.text)?.id
      const adjust = adjusts.find((x) => x.id === id)
      return adjust ? adjustName(adjust) : '（削除した調整寸法）'
    }
    case 'bad':
      return unit.text
  }
}

/** 式のすべての単位の表示名 */
export function formulaLabels(expr: string, adjusts: readonly Adjust[]): string[] {
  return formulaUnits(expr).map((u) => unitLabel(u, adjusts))
}

/**
 * 式を1行の文字にして見せる（部材の一覧の「天板.W − 20 ｜ 880」の式の側。例：天板.H − 20 − メラミン1）。
 * 数字は続けて書き、+ − × ÷ の前後に空白を入れる。先頭・( の直後・記号の直後の − は符号なので空白を入れない。
 * 括弧の内側には空白を入れない
 */
/** formulaText で見る単位の種類：binary（二項の記号）・sign（符号）・open（( ）・digit・other */
type TextKind = 'binary' | 'sign' | 'open' | 'digit' | 'other'

export function formulaText(expr: string, adjusts: readonly Adjust[]): string {
  let out = ''
  let prev: TextKind | null = null
  for (const u of formulaUnits(expr)) {
    const label = unitLabel(u, adjusts)
    const isOpen = u.kind === 'paren' && label === '('
    const isClose = u.kind === 'paren' && label === ')'
    const kind: TextKind =
      u.kind === 'op'
        ? prev === null || prev === 'open' || prev === 'binary' || prev === 'sign'
          ? 'sign'
          : 'binary'
        : isOpen
          ? 'open'
          : u.kind === 'digit'
            ? 'digit'
            : 'other'
    let space: boolean
    if (prev === null || prev === 'open' || prev === 'sign' || isClose) space = false
    else if (kind === 'binary' || prev === 'binary') space = true
    else space = !(kind === 'digit' && prev === 'digit')
    out += (space ? ' ' : '') + label
    prev = kind
  }
  return out
}
