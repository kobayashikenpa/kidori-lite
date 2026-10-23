// 設定と調整寸法の画面に出す文字（画面から切り離して試せるようにする。計算はしない）
import { adjustName } from '../engine/defaults'
import type { AdjustUsage } from '../engine/formula/usages'
import type { Adjust, BoardSizeKind, CutMode, Sheet } from '../engine/types'
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

/** 調整寸法の名前のボタン（［逃げ］［ほぞ］のほかは自由入力） */
export const ADJUST_PRESETS = ['逃げ', 'ほぞ'] as const

/** 使っている所を仕事ごとにまとめる（仕事の並び順。部材は「棚板（H）」の形）。部材が使っている調整寸法の表示名も付けられる */
export interface UsageGroup {
  jobId: string
  jobName: string
  parts: string[]
}

export function groupUsages(
  usages: readonly (AdjustUsage & { adjustIds?: string[] })[],
  adjusts?: readonly Adjust[],
): UsageGroup[] {
  const out: UsageGroup[] = []
  for (const u of usages) {
    let g = out.find((x) => x.jobId === u.jobId)
    if (!g) {
      g = { jobId: u.jobId, jobName: u.jobName, parts: [] }
      out.push(g)
    }
    let text = `${u.partName}（${u.axes.join('・')}）`
    if (adjusts && u.adjustIds && u.adjustIds.length > 0) {
      const names = u.adjustIds.map((id) => adjusts.find((a) => a.id === id)).filter((a) => a !== undefined)
      if (names.length > 0) text += `［${names.map(adjustName).join('・')}］`
    }
    g.parts.push(text)
  }
  return out
}
