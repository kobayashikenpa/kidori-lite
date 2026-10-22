// セルを選ぶ状態（第1.2版。仕様書 16.1）の画面の手伝い：選んだセルの持ち方と、下のバーに出す文。
// 計算（コピー・貼り付け・消す・行を削除）は engine/clipboard/cells.ts と store の reducer が行う
import type { PasteSkip } from '../engine/clipboard/cells'
import type { CellClip, CellCol, CellPos } from '../engine/types'

/** セルの鍵（"行:列"） */
export const cellKey = (pos: CellPos): string => `${pos.row}:${pos.col}`

/** 押したセルを選ぶ／外す（新しい一覧を返す。押した順に並ぶ） */
export function toggleCell(cells: readonly CellPos[], pos: CellPos): CellPos[] {
  const k = cellKey(pos)
  return cells.some((c) => cellKey(c) === k) ? cells.filter((c) => cellKey(c) !== k) : [...cells, pos]
}

/** 「3つ選んでいます」（何も無ければ「セルを押して選んでください」） */
export function selectedText(count: number): string {
  return count === 0 ? 'セルを押して選んでください' : `${count}つ選んでいます`
}

const CLIP_TEXT_MAX = 10

/** 今コピーしているもの：「コピー中：1つ（400）」「コピー中：2行×2列」。無ければ null */
export function clipText(clip: CellClip | null): string | null {
  if (!clip) return null
  if (clip.rows === 1 && clip.cols === 1) {
    const t = clip.cells[0]?.[0] ?? ''
    const shown = t === '' ? '空' : [...t].length > CLIP_TEXT_MAX ? `${[...t].slice(0, CLIP_TEXT_MAX).join('')}…` : t
    return `コピー中：1つ（${shown}）`
  }
  return `コピー中：${clip.rows}行×${clip.cols}列`
}

/** 貼り付けの知らせ：「3つのセルに貼りました（貼れなかったもの 1つ：同じ名前は貼れません）」 */
export function pasteText(pasted: number, skipped: readonly PasteSkip[]): string {
  if (pasted === 0 && skipped.length === 0) return '貼れるセルがありませんでした'
  const head = pasted === 0 ? '貼れませんでした' : `${pasted}つのセルに貼りました`
  if (skipped.length === 0) return head
  const reasons = [...new Set(skipped.map((s) => s.message))].join('・')
  return `${head}（貼れなかったもの ${skipped.length}つ：${reasons}）`
}

/** 選んでいるセルの中に、部材の行（表の行が部材の数より小さい）があるか */
export function hasPartCell(cells: readonly CellPos[], partCount: number): boolean {
  return cells.some((c) => c.row < partCount)
}

export const CELL_COL_LABEL: Record<CellCol, string> = { name: '名前', W: 'W', H: 'H', qty: '枚数' }
