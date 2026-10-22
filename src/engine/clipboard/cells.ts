// 部材の表のセルのコピーと貼り付け・消す・行を削除（第1.2版。仕様書 16.1）。新しく作ったもの（kidori には無い）。
// - セルの位置は { row: 表の行（0 から。job.parts の位置。部材の数以上は空の行）, col: 名前・W・H・枚数 }
// - コピーは「1つのセル」か「四角い範囲（続いた行 × 続いた列）」だけ。中身は文字のまま（式は書いたまま、枚数は数字の文字）
// - 貼り付けは中身の上書き（名前を貼っても、ほかの式の参照は書き換えない。名前の変更ではない）
// 仕事は書き換えず、新しい仕事を返す（updatedAt とコピーしたセル AppData.cellClip の保存は store の側で行う）
import { normalizeFormulaText, normalizePartName, validatePartName } from '../formula/tokenize'
import { isBlankPart } from '../parts'
import { CELL_COLS, type CellClip, type CellCol, type CellPos, type Job, type Part } from '../types'

export const COPY_SHAPE_MESSAGE = 'コピーは1つのセルか、四角い範囲を選んでください'
export const DUPLICATE_NAME_MESSAGE = '同じ名前は貼れません'
export const NOT_QUANTITY_MESSAGE = '枚数には 0 以上の整数だけ貼れます'

/** 選んだセルの形。1つのセルは 1行×1列の range。left は列の位置（0＝名前 … 3＝枚数） */
export type SelectionShape =
  | { kind: 'none' }
  | { kind: 'range'; top: number; left: number; rows: number; cols: number }
  | { kind: 'scattered' }

const colIndex = (col: CellCol): number => CELL_COLS.indexOf(col)
const keyOf = (row: number, col: number): string => `${row}:${col}`

/** 選んだセルをそろえる：行が 0 以上の整数で列が表の列のものだけ、重なりを外し、上から・左から並べる */
function normalizeSelection(selected: readonly CellPos[]): CellPos[] {
  const seen = new Set<string>()
  const out: CellPos[] = []
  for (const s of selected) {
    const ci = colIndex(s.col)
    if (!Number.isInteger(s.row) || s.row < 0 || ci < 0) continue
    const k = keyOf(s.row, ci)
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ row: s.row, col: s.col })
  }
  return out.sort((a, b) => a.row - b.row || colIndex(a.col) - colIndex(b.col))
}

/** 選んだセルが 何も無い／1つか四角い範囲／それ以外（離れたセル・欠けた四角） のどれか */
export function selectionShape(selected: readonly CellPos[]): SelectionShape {
  const cells = normalizeSelection(selected)
  if (cells.length === 0) return { kind: 'none' }
  const rows = cells.map((s) => s.row)
  const cols = cells.map((s) => colIndex(s.col))
  const top = Math.min(...rows)
  const left = Math.min(...cols)
  const h = Math.max(...rows) - top + 1
  const w = Math.max(...cols) - left + 1
  // 重なりを外したので、数が 行×列 なら四角が全部埋まっている
  return cells.length === h * w ? { kind: 'range', top, left, rows: h, cols: w } : { kind: 'scattered' }
}

/** セルの中身の文字（名前・式は書いたまま。枚数は数字の文字で、空は ''。空の行は ''） */
export function cellText(job: Pick<Job, 'parts'>, pos: CellPos): string {
  const p = job.parts[pos.row] as Part | undefined
  if (!p) return ''
  switch (pos.col) {
    case 'name':
      return p.name
    case 'W':
    case 'H':
      return p.expr[pos.col]
    case 'qty':
      return p.quantity === null ? '' : String(p.quantity)
  }
}

export type CopyCellsResult = { ok: true; clip: CellClip } | { ok: false; message: string }

/** セルをコピーする。1つのセルか四角い範囲だけ（それ以外は「コピーは1つのセルか、四角い範囲を選んでください」） */
export function copyCells(job: Pick<Job, 'parts'>, selected: readonly CellPos[]): CopyCellsResult {
  const shape = selectionShape(selected)
  if (shape.kind !== 'range') return { ok: false, message: COPY_SHAPE_MESSAGE }
  const cells: string[][] = []
  for (let i = 0; i < shape.rows; i++) {
    const line: string[] = []
    for (let j = 0; j < shape.cols; j++) line.push(cellText(job, { row: shape.top + i, col: CELL_COLS[shape.left + j] }))
    cells.push(line)
  }
  return { ok: true, clip: { rows: shape.rows, cols: shape.cols, cells } }
}

/** 貼れなかった理由。duplicateName：同じ名前になる / invalidName：名前に使えない文字 / notQuantity：枚数に 0 以上の整数でないもの */
export type PasteSkipReason = 'duplicateName' | 'invalidName' | 'notQuantity'

export interface PasteSkip {
  /** 貼れなかったセル（表の位置） */
  cell: CellPos
  reason: PasteSkipReason
  /** 画面に出せる日本語 */
  message: string
}

export type PasteCellsResult =
  | {
      ok: true
      job: Job
      /** 貼ったセルの数（「◯つのセルに貼りました」） */
      pasted: number
      /** 貼れなかったセル（表の上から・左から） */
      skipped: PasteSkip[]
    }
  | { ok: false; message: string }

/** 枚数の欄に貼る文字から枚数。空は null（空にする）、0 以上の整数（全角の数字も）はその数、それ以外は undefined（貼らない） */
function quantityOf(text: string): number | null | undefined {
  const t = normalizeFormulaText(text).trim()
  if (t === '') return null
  return /^[0-9]+$/.test(t) ? Number(t) : undefined
}

interface Write {
  /** 表の位置（知らせに使う） */
  cell: CellPos
  /** 書く部材の位置（空の行は部材の後ろに詰めた位置） */
  index: number
  text: string
}

/**
 * コピーしたセルを貼る。
 * - 1つのセルのコピー：選んだセル全部に同じものを貼る
 * - 範囲のコピー：選んだセルの一番左上（いちばん上の行・いちばん左の列）から同じ形で貼る。表の右（枚数）をはみ出す列は貼らない
 * - 空の行に貼ると部材を作る（id は newId('part')、枚数は空から、回転しない）。途中の空の行も、部材の後ろに上から詰めて足す（暫定）
 * - 名前：前後の空白を外して入れる。貼ったあと同じ名前（normalizePartName。名前のある部材どうし）になるセルには貼らない。
 *   元のまま残る名前と重なるものは貼らず、貼るものどうしで重なるときは上の1つだけ貼る。使えない文字の名前も貼らない。
 *   ほかの式の参照は書き換えない
 * - 枚数：0 以上の整数だけ（空は空にする）。W・H：文字のまま式として入れる
 * - 貼って行の全部の欄が空になった部材は消す。1つも貼れなかったときは同じ仕事を返す
 */
export function pasteCells(job: Job, clip: CellClip, selected: readonly CellPos[], newId: (prefix: string) => string): PasteCellsResult {
  const cells = normalizeSelection(selected)
  if (cells.length === 0) return { ok: false, message: '貼るセルを選んでください' }

  // 表の位置ごとに貼る文字
  const targets: { row: number; col: number; text: string }[] = []
  if (clip.rows === 1 && clip.cols === 1) {
    for (const s of cells) targets.push({ row: s.row, col: colIndex(s.col), text: clip.cells[0][0] })
  } else {
    const top = Math.min(...cells.map((s) => s.row))
    const left = Math.min(...cells.map((s) => colIndex(s.col)))
    for (let i = 0; i < clip.rows; i++) {
      for (let j = 0; j < clip.cols; j++) {
        if (left + j >= CELL_COLS.length) continue
        targets.push({ row: top + i, col: left + j, text: clip.cells[i][j] })
      }
    }
  }

  // 空の行（部材の数以上）は、上から部材の後ろに詰めて足す
  const count = job.parts.length
  const newRows = [...new Set(targets.filter((t) => t.row >= count).map((t) => t.row))].sort((a, b) => a - b)
  const indexOfRow = new Map(newRows.map((r, k) => [r, count + k]))
  const parts: Part[] = job.parts.map((p) => ({ ...p, expr: { ...p.expr } }))
  for (let k = 0; k < newRows.length; k++) {
    parts.push({ id: newId('part'), name: '', expr: { W: '', H: '' }, quantity: null, rotatable: false, finishedDone: false })
  }
  const writes: Write[] = targets.map((t) => ({
    cell: { row: t.row, col: CELL_COLS[t.col] },
    index: t.row < count ? t.row : indexOfRow.get(t.row)!,
    text: t.text,
  }))

  const skipped: PasteSkip[] = []
  const touched = new Set<number>()
  let pasted = 0

  // W・H・枚数
  for (const w of writes) {
    const p = parts[w.index]
    if (w.cell.col === 'W' || w.cell.col === 'H') {
      p.expr[w.cell.col] = w.text
    } else if (w.cell.col === 'qty') {
      const q = quantityOf(w.text)
      if (q === undefined) {
        skipped.push({ cell: w.cell, reason: 'notQuantity', message: NOT_QUANTITY_MESSAGE })
        continue
      }
      p.quantity = q
    } else {
      continue
    }
    touched.add(w.index)
    pasted++
  }

  // 名前：使えない文字を外し、貼ったあとの重なりが無くなるまで貼るものを減らす
  const accepted = new Map<number, { write: Write; name: string }>()
  for (const w of writes) {
    if (w.cell.col !== 'name') continue
    const name = w.text.trim()
    const invalid = validatePartName(name)
    if (invalid) {
      skipped.push({ cell: w.cell, reason: 'invalidName', message: invalid })
      continue
    }
    accepted.set(w.index, { write: w, name })
  }
  const rejected = new Set<number>()
  for (;;) {
    const groups = new Map<string, number[]>()
    parts.forEach((p, i) => {
      const a = accepted.get(i)
      const name = a && !rejected.has(i) ? a.name : p.name
      if (name.trim() === '') return
      const key = normalizePartName(name)
      groups.set(key, [...(groups.get(key) ?? []), i])
    })
    let changed = false
    for (const members of groups.values()) {
      if (members.length < 2) continue
      const pasting = members.filter((i) => accepted.has(i) && !rejected.has(i))
      if (pasting.length === 0) continue // もとから重なっている名前はそのまま
      // 元のまま残る名前があればそれを残し、貼るものだけなら上（書く順）の1つを残す
      const keep = pasting.length === members.length ? pasting.slice().sort((a, b) => order(a) - order(b))[0] : -1
      for (const i of pasting) {
        if (i === keep) continue
        rejected.add(i)
        changed = true
      }
    }
    if (!changed) break
  }
  function order(i: number): number {
    return writes.indexOf(accepted.get(i)!.write)
  }
  for (const [i, a] of accepted) {
    if (rejected.has(i)) {
      skipped.push({ cell: a.write.cell, reason: 'duplicateName', message: DUPLICATE_NAME_MESSAGE })
      continue
    }
    parts[i].name = a.name
    touched.add(i)
    pasted++
  }

  skipped.sort((a, b) => a.cell.row - b.cell.row || colIndex(a.cell.col) - colIndex(b.cell.col))
  if (pasted === 0) return { ok: true, job, pasted, skipped }
  const kept = parts.filter((p, i) => !(touched.has(i) || i >= count) || !isBlankPart(p))
  return { ok: true, job: { ...job, parts: kept }, pasted, skipped }
}

/** 選んだセルのある行の部材の id（部材の並び。空の行は入れない） */
export function selectedPartIds(job: Pick<Job, 'parts'>, selected: readonly CellPos[]): string[] {
  const rows = new Set(normalizeSelection(selected).map((s) => s.row))
  return job.parts.filter((_, i) => rows.has(i)).map((p) => p.id)
}

/**
 * 選んだセルの中身を消す（名前・W・H は空、枚数は空）。名前を消してもほかの式は書き換えない。
 * 行の全部の欄が空になった部材は消す。空の行のセルは何もしない（部材の行が1つも無ければ同じ仕事を返す）
 */
export function clearCells(job: Job, selected: readonly CellPos[]): Job {
  const cells = normalizeSelection(selected).filter((s) => s.row < job.parts.length)
  if (cells.length === 0) return job
  const parts: Part[] = job.parts.map((p) => ({ ...p, expr: { ...p.expr } }))
  const touched = new Set<number>()
  for (const s of cells) {
    const p = parts[s.row]
    if (s.col === 'name') p.name = ''
    else if (s.col === 'qty') p.quantity = null
    else p.expr[s.col] = ''
    touched.add(s.row)
  }
  return { ...job, parts: parts.filter((p, i) => !touched.has(i) || !isBlankPart(p)) }
}

/**
 * 選んだセルのある行の部材をまとめて消す（空の行だけなら同じ仕事を返す）。
 * 式で使われているかの確認は、selectedPartIds の部材を dimensions/resolve の partsReferencing で調べる（画面では ui/partsTable の referencingOthers）
 */
export function deleteRows(job: Job, selected: readonly CellPos[]): Job {
  const ids = new Set(selectedPartIds(job, selected))
  if (ids.size === 0) return job
  return { ...job, parts: job.parts.filter((p) => !ids.has(p.id)) }
}
