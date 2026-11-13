// 部材の色とメモ（第2.2版。仕様書 26.3・26.8）。新しく作ったもの（kidori には無い）。
// - 色は 赤・青・黄 の3つと「なし」。セルの色（列ごと）と行の色は別々に持ち、両方あるときはセルの色を出す（cellColor）
// - 付け方：セルを長押し →「色」はセルの色（setCellColor）、番号を長押し →「色」は行の色（setRowColor）。「なし」は null
// - メモは部材ごとに1つ（setPartMemo）。空（空白・改行だけも）にして保存するとメモを消す
// - 部材の無い空の行には付けない（部材を作らない）。色・メモは木取りの計算には影響しない
// 仕事は書き換えず、新しい仕事を返す（変わらなければ同じ仕事。updatedAt は store の側で付ける）
import { selectionCells, type CellSelection } from './clipboard/cells'
import type { CellCol, Job, Part, PartColor } from './types'

/** そのセルに見せる色：セルの色があればセルの色、無ければ行の色、どちらも無ければ null（仕様書 26.3） */
export function cellColor(part: Pick<Part, 'rowColor' | 'cellColors'>, col: CellCol): PartColor | null {
  return part.cellColors[col] ?? part.rowColor
}

/** メモがあるか（空白・改行だけはメモなし） */
export function hasMemo(part: Pick<Part, 'memo'>): boolean {
  return part.memo.trim() !== ''
}

/**
 * 選んだセル（範囲でも、離れたセルでも）にセルの色を付ける。color が null なら消す（「なし」）。
 * 部材の無い空の行は何もしない（部材を作らない）。変わるものが無ければ同じ仕事を返す
 */
export function setCellColor(job: Job, selected: CellSelection, color: PartColor | null): Job {
  const byRow = new Map<number, CellCol[]>()
  for (const s of selectionCells(selected)) {
    if (s.row >= job.parts.length) continue
    byRow.set(s.row, [...(byRow.get(s.row) ?? []), s.col])
  }
  let changed = false
  const parts = job.parts.map((p, i) => {
    const cols = byRow.get(i)
    if (!cols) return p
    const next: Partial<Record<CellCol, PartColor>> = { ...p.cellColors }
    for (const col of cols) {
      if (color === null) delete next[col]
      else next[col] = color
    }
    if (sameColors(next, p.cellColors)) return p
    changed = true
    return { ...p, cellColors: next }
  })
  return changed ? { ...job, parts } : job
}

/**
 * 選んだセルのある行（部材）に行の色を付ける。color が null なら行の色だけ消す（セルの色は残す。仕様書 26.8）。
 * 部材の無い空の行は何もしない。変わるものが無ければ同じ仕事を返す
 */
export function setRowColor(job: Job, selected: CellSelection, color: PartColor | null): Job {
  const rows = new Set(selectionCells(selected).map((s) => s.row))
  let changed = false
  const parts = job.parts.map((p, i) => {
    if (!rows.has(i) || p.rowColor === color) return p
    changed = true
    return { ...p, rowColor: color }
  })
  return changed ? { ...job, parts } : job
}

export type MemoResult = { ok: true; job: Job } | { ok: false; message: string }

/**
 * 部材のメモを入れる。空白・改行だけのメモは空（メモを消す）。それ以外は打ったまま（改行も。長さの上限なし）。
 * 同じメモなら同じ仕事を返す。部材が無ければ断る
 */
export function setPartMemo(job: Job, partId: string, text: string): MemoResult {
  const cur = job.parts.find((p) => p.id === partId)
  if (!cur) return { ok: false, message: '部材が見つかりません' }
  const memo = text.trim() === '' ? '' : text
  if (cur.memo === memo) return { ok: true, job }
  return { ok: true, job: { ...job, parts: job.parts.map((p) => (p.id === partId ? { ...p, memo } : p)) } }
}

function sameColors(a: Partial<Record<CellCol, PartColor>>, b: Partial<Record<CellCol, PartColor>>): boolean {
  const ka = Object.keys(a) as CellCol[]
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}
