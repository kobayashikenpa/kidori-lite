// 画面に出す文字の形（計算はしない）
import { round1 } from '../engine/round'

/** 最後に変えた日（例：2026/10/21 14:05）。読めない日時なら空 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

/** 寸法を小数第1位までの文字にする（例：379、0.5） */
export function fmt(n: number): string {
  return String(round1(n))
}

/** 入力欄の文字を数にする。全角の数字も受け付ける。空なら null、読めなければ NaN（kidori の parseNum と同じ） */
export function parseNum(text: string): number | null {
  const t = text.normalize('NFKC').trim()
  if (t === '') return null
  return /^\d+(\.\d+)?$/.test(t) || /^\d+\.$/.test(t) ? Number(t) : Number.NaN
}
