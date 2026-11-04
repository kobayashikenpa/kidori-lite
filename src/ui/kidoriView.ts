// 木取りの画面に出す文字（計算はしない。engine の結果を並べる形にするだけ）
import { finalCutFromRight } from '../engine/packing/finalCut'
import type { HistoryEntry, Rect, SheetLayout, SheetOrientation } from '../engine/types'
import { fmt, formatDateTime } from './format'
import { sheetLabel } from './settings'

/** 歩留まり（0〜1）を「81.2%」の形にする */
export function pct(rate: number): string {
  return `${fmt(rate * 100)}%`
}

/**
 * 端材の大きさを W×H（W＝板の妻手方向、H＝板の長手方向。部材の W・H と同じ向き）で出す。
 * 配置図の座標は、縦長（portrait）なら x＝妻手、横長（landscape）なら x＝長手なので、横長は入れ替える
 */
export function scrapLabel(r: Pick<Rect, 'w' | 'h'>, orientation: SheetOrientation): string {
  const [W, H] = orientation === 'landscape' ? [r.h, r.w] : [r.w, r.h]
  return `${fmt(W)}×${fmt(H)}`
}

/** 部材の色の数（index.css の --pc0〜--pc11。仕様書 25.2。13 種類目からはくり返す） */
export const PIECE_COLORS = 12

/** 部材の色のクラス名（pc0〜pc11）。番号は部材の表の並び（何行目か） */
export function pieceColorClass(index: number): string {
  const i = Number.isInteger(index) && index > 0 ? index : 0
  return `pc${i % PIECE_COLORS}`
}

/**
 * 板ごとの見出しの「最終縦カット 右から 786mm」（仕様書 25.3）。横切り優先（横長の図）は「最終横カット」。
 * 値は engine の finalCutFromRight。左に余りが無い・部材が無いときは出さない（null）
 */
export function finalCutLabel(layout: Pick<SheetLayout, 'placements' | 'usable' | 'trims' | 'orientation'>): string | null {
  const v = finalCutFromRight(layout)
  if (v === null) return null
  return `${layout.orientation === 'landscape' ? '最終横カット' : '最終縦カット'} 右から ${fmt(v)}mm`
}

/** 履歴の1行の見出し（メモ。空なら「メモなし」。仕様書 25.1） */
export function historyTitle(entry: Pick<HistoryEntry, 'memo'>): string {
  return entry.memo.trim() === '' ? 'メモなし' : entry.memo
}

/** 履歴の1行の下に出す文字（例：「2026/11/4 09:00・4×8 2枚・歩留まり 81.2%・部材 4件」） */
export function historyMeta(entry: Pick<HistoryEntry, 'savedAt' | 'settings' | 'sheetCount' | 'yieldRate' | 'parts'>): string {
  const rate = entry.sheetCount > 0 ? pct(entry.yieldRate) : '―'
  return `${formatDateTime(entry.savedAt)}・${sheetLabel(entry.settings.sheet)} ${entry.sheetCount}枚・歩留まり ${rate}・部材 ${entry.parts.length}件`
}
