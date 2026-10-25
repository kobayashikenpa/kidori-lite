// 板と切り方の設定に出す文字（画面から切り離して試せるようにする。計算はしない）
import type { BoardSizeKind, CutMode, Sheet } from '../engine/types'
import { fmt } from './format'

export const SHEET_KINDS: { value: BoardSizeKind; label: string }[] = [
  { value: 'saburoku', label: '3×6' },
  { value: 'shihachi', label: '4×8' },
  { value: 'custom', label: '自由入力' },
]

export const CUT_MODES: { value: CutMode; label: string }[] = [
  { value: 'vertical', label: '縦切り優先' },
  { value: 'horizontal', label: '横切り優先' },
]

export function cutModeLabel(mode: CutMode): string {
  return CUT_MODES.find((m) => m.value === mode)?.label ?? mode
}

/** 板の大きさ（例：1220×2430）。妻手×長手 */
export function sheetSizeText(sheet: Sheet): string {
  return `${fmt(sheet.width)}×${fmt(sheet.length)}`
}

/** 板の呼び名（例：4×8、自由入力 1000×2000） */
export function sheetLabel(sheet: Sheet): string {
  if (sheet.sizeKind === 'custom') return `自由入力 ${sheetSizeText(sheet)}`
  return SHEET_KINDS.find((k) => k.value === sheet.sizeKind)?.label ?? sheetSizeText(sheet)
}
