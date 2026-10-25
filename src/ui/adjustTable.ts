// 調整寸法の表（第1.7版。仕様書 21.1・21.3）の画面の決まり。画面から切り離して試せるようにする（計算は engine）
import { isUsableAdjust } from '../engine/adjusts'
import { adjustName } from '../engine/defaults'
import type { AdjustChangeUsages } from '../engine/adjusts'
import type { AdjustCol, AdjustRow } from '../engine/types'
import { TABLE_MIN_ROWS, addRowsMin, tableRowCount } from './partsTable'

export const ADJUST_COL_LABEL: Record<AdjustCol, string> = { name: '名前', value: '寸法' }

/** 表の行の数：行の数 ＋ いつも空の行1つ、ただし minRows（初めは 5 行。「＋ 5行足す」で増える）に満たなければ minRows 行 */
export function adjustRowCount(rowCount: number, minRows: number = TABLE_MIN_ROWS): number {
  return tableRowCount(rowCount, minRows)
}

/** 「＋ 5行足す」を押したあとの、表の行の数の下限 */
export function adjustAddRowsMin(rowCount: number, minRows: number = TABLE_MIN_ROWS): number {
  return addRowsMin(rowCount, minRows)
}

/** 足した空の行は、アプリを開いている間だけ覚える（調整寸法の表はアプリで1つなので、仕事ごとではない。保存しない） */
let sessionMinRows = TABLE_MIN_ROWS

export function sessionAdjustMinRows(): number {
  return sessionMinRows
}

export function setSessionAdjustMinRows(minRows: number): void {
  sessionMinRows = minRows
}

/**
 * 押した行を、入力できる行にそろえる。行はそのまま、空の行はいちばん上の空の行（行の数の位置）にする
 * （部材の表と同じ。新しい行はいつも最後に足す）
 */
export function adjustInputRow(row: number, rowCount: number): number {
  return Math.max(0, Math.min(row, rowCount))
}

/** 「次へ」の行き先：名前 → 寸法 → 次の行の名前 */
export function nextAdjustCell(cell: { row: number; col: AdjustCol }, rowCount: number): { row: number; col: AdjustCol } {
  return cell.col === 'name' ? { row: cell.row, col: 'value' } : { row: adjustInputRow(cell.row + 1, rowCount), col: 'name' }
}

/** 行の呼び方（メニューの見出しなど）：表示名、書きかけなら名前か寸法、空なら「3行目（空）」 */
export function adjustRowLabel(row: AdjustRow | undefined, index: number): string {
  if (!row) return `${index + 1}行目（空）`
  if (isUsableAdjust(row)) return adjustName(row)
  return row.name.trim() !== '' ? row.name : `${index + 1}行目`
}

/**
 * 変える・消すときの確認の文（仕様書 21.3）。確認がいらない（changed が空）なら null。
 * 「「メラミン1」を、この仕事のほかに 2件の仕事で使っています（本棚・台）。変えると、その仕事の寸法も変わります」。
 * 全部が消える・書きかけになるときは「消すと、その仕事の式はエラーになります」
 */
export function adjustConfirmText(
  usage: AdjustChangeUsages,
  after: readonly AdjustRow[],
  currentJobId: string | null,
): string | null {
  if (usage.changed.length === 0) return null
  const names = usage.changed.map((a) => `「${adjustName(a)}」`).join('・')
  const jobs: string[] = []
  for (const u of usage.usages) if (u.jobId !== currentJobId && !jobs.includes(u.jobName)) jobs.push(u.jobName)
  const byId = new Map(after.map((r) => [r.id, r]))
  const removed = usage.changed.every((a) => {
    const r = byId.get(a.id)
    return !r || !isUsableAdjust(r)
  })
  const tail = removed ? '消すと、その仕事の式はエラーになります' : '変えると、その仕事の寸法も変わります'
  return `${names}を、この仕事のほかに ${usage.otherJobCount}件の仕事で使っています（${jobs.join('・')}）。${tail}`
}
