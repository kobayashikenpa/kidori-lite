// 調整寸法の表のセル操作（第1.7版。仕様書 21.1）。部材の表の cells.ts と同じ考え方・同じ形の結果。新しく作ったもの（kidori には無い）。
// - 表は 名前・寸法 の2列（範囲の left は 0＝名前・1＝寸法）。行は AppData.adjusts の位置（行の数以上は空の行）
// - 書きかけの行（名前だけ・寸法だけ）も表に残す。名前も寸法も空になった行は消す
// - 表示名（名前＋寸法。adjustNameKey）が同じになる行は作らない：名前を書くときは名前の後ろに ②③… を付け、
//   寸法だけを書くときは貼らずに理由を返す
// - 寸法の欄は 0 より大きい数だけ（式・文字は貼らない）
// - 部材の表とのコピー・貼り付けはしない（クリップは AppData.adjustClip に分ける）
// 一覧は書き換えず、新しい一覧を返す（保存は store の側）
import { adjustNameKey } from '../defaults'
import { adjustValueText, duplicateAdjustMessage, isBlankAdjustRow, isUsableAdjust, parseAdjustValue } from '../adjusts'
import { ADJUST_COLS, type AdjustCellPos, type AdjustClip, type AdjustCol, type AdjustRow, type CellRange } from '../types'
import { COPY_SHAPE_MESSAGE, FILL_RANGE_MESSAGE, type SelectionShape } from './cells'

export const NOT_VALUE_MESSAGE = '寸法には 0 より大きい数だけ貼れます'
export const VALUE_INPUT_MESSAGE = '寸法は 0 より大きい数を入れてください'

/** 選んだセル：セルの配列か、四角い範囲 */
export type AdjustSelection = CellRange | readonly AdjustCellPos[]

const colIndex = (col: AdjustCol): number => ADJUST_COLS.indexOf(col)
const keyOf = (row: number, col: number): string => `${row}:${col}`
const isCellArray = (sel: AdjustSelection): sel is readonly AdjustCellPos[] => Array.isArray(sel)

/** 四角い範囲のセル（上から・左から）。表の左右をはみ出す列と、0 より上の行は入れない */
export function adjustRangeCells(range: CellRange): AdjustCellPos[] {
  const out: AdjustCellPos[] = []
  const top = Math.max(0, Math.ceil(range.top))
  const bottom = Math.floor(range.top + range.rows - 1)
  const left = Math.max(0, Math.ceil(range.left))
  const right = Math.min(ADJUST_COLS.length - 1, Math.floor(range.left + range.cols - 1))
  for (let r = top; r <= bottom; r++) for (let j = left; j <= right; j++) out.push({ row: r, col: ADJUST_COLS[j] })
  return out
}

/** 行全体（名前・寸法）の範囲 */
export function adjustRowRange(top: number, rows = 1): CellRange {
  return { top, left: 0, rows, cols: ADJUST_COLS.length }
}

/** 列全体の範囲：上から行のある所まで（行が無ければ1行） */
export function adjustColumnRange(rows: readonly AdjustRow[], left: number, cols = 1): CellRange {
  return { top: 0, left, rows: Math.max(1, rows.length), cols }
}

function normalizeSelection(selected: AdjustSelection): AdjustCellPos[] {
  if (!isCellArray(selected)) return adjustRangeCells(selected)
  const seen = new Set<string>()
  const out: AdjustCellPos[] = []
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

/** 選んだセルが 何も無い／1つか四角い範囲／それ以外 のどれか（cells.ts の selectionShape と同じ） */
export function adjustSelectionShape(selected: AdjustSelection): SelectionShape {
  const cells = normalizeSelection(selected)
  if (cells.length === 0) return { kind: 'none' }
  const rows = cells.map((s) => s.row)
  const cols = cells.map((s) => colIndex(s.col))
  const top = Math.min(...rows)
  const left = Math.min(...cols)
  const h = Math.max(...rows) - top + 1
  const w = Math.max(...cols) - left + 1
  return cells.length === h * w ? { kind: 'range', top, left, rows: h, cols: w } : { kind: 'scattered' }
}

/** 選んだセルが四角い範囲（1つのセルも）ならその範囲（表の中に収めた形）、それ以外は null */
export function adjustSelectionRange(selected: AdjustSelection): CellRange | null {
  const s = adjustSelectionShape(selected)
  return s.kind === 'range' ? { top: s.top, left: s.left, rows: s.rows, cols: s.cols } : null
}

/** セルの中身の文字（名前はそのまま、寸法は丸めない数字の文字。空・空の行は ''） */
export function adjustCellText(rows: readonly AdjustRow[], pos: AdjustCellPos): string {
  const r = rows[pos.row] as AdjustRow | undefined
  if (!r) return ''
  return pos.col === 'name' ? r.name : adjustValueText(r.value)
}

export type CopyAdjustCellsResult = { ok: true; clip: AdjustClip } | { ok: false; message: string }

/** セルをコピーする。1つのセルか四角い範囲だけ */
export function copyAdjustCells(rows: readonly AdjustRow[], selected: AdjustSelection): CopyAdjustCellsResult {
  const shape = adjustSelectionShape(selected)
  if (shape.kind !== 'range') return { ok: false, message: COPY_SHAPE_MESSAGE }
  const cells: string[][] = []
  for (let i = 0; i < shape.rows; i++) {
    const line: string[] = []
    for (let j = 0; j < shape.cols; j++) line.push(adjustCellText(rows, { row: shape.top + i, col: ADJUST_COLS[shape.left + j] }))
    cells.push(line)
  }
  return { ok: true, clip: { rows: shape.rows, cols: shape.cols, cells } }
}

/** セルを切り取る。中身はコピーと同じで、元の範囲を clip.cut に付ける（貼ったときに元を空にする） */
export function cutAdjustCells(rows: readonly AdjustRow[], selected: AdjustSelection): CopyAdjustCellsResult {
  const r = copyAdjustCells(rows, selected)
  const range = adjustSelectionRange(selected)
  if (!r.ok || !range) return r
  return { ok: true, clip: { ...r.clip, cut: range } }
}

/** 貼れなかった理由。notValue：寸法に 0 より大きい数でないもの / duplicate：表示名が同じになる（寸法だけを書くとき・番号が尽きたとき） */
export type AdjustPasteSkipReason = 'notValue' | 'duplicate'

export interface AdjustPasteSkip {
  cell: AdjustCellPos
  reason: AdjustPasteSkipReason
  /** 画面に出せる日本語 */
  message: string
}

/** 表示名が重なるので名前に番号を振って貼ったセル。from は貼ろうとした名前、to は振ったあとの名前 */
export interface AdjustRenamed {
  cell: AdjustCellPos
  from: string
  to: string
}

export type AdjustPasteResult =
  | {
      ok: true
      /** 貼ったあとの一覧（1つも貼れなければ同じ配列） */
      adjusts: AdjustRow[]
      /** 貼ったセルの数 */
      pasted: number
      /** 貼れなかったセル（表の上から・左から） */
      skipped: AdjustPasteSkip[]
      /** 名前に番号を振って貼ったセル（表の上から） */
      renamed: AdjustRenamed[]
    }
  | { ok: false; message: string }

// ---------- 番号の振り方 ----------

/** 丸つき数字 ①〜㊿（2〜50 を使う） */
function circled(n: number): string | null {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1)
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21)
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36)
  return null
}
const TRAILING_CIRCLED = /[①-⑳㉑-㉟㊱-㊿]$/u

/**
 * 表示名が重ならない名前：名前の後ろに ②③… を付ける（丸つき数字なので、後ろに続く寸法の数字とくっついて読めない：メラミン②1）。
 * ② から、used（表示名のキー）と重ならない一番小さい番号。名前の終わりが丸つき数字なら外してから振る（メラミン② → メラミン③）。
 * ㊿ まで使って重なれば null（暫定）
 */
function numberedName(name: string, value: number, used: ReadonlySet<string>): string | null {
  const base = name.replace(TRAILING_CIRCLED, '')
  for (let n = 2; ; n++) {
    const mark = circled(n)
    if (mark === null) return null
    const candidate = `${base}${mark}`
    if (!used.has(adjustNameKey({ name: candidate, value }))) return candidate
  }
}

/** 一覧の式で使える行と表示名が重ならない名前（numberedName。画面の案内・テスト用） */
export function numberedAdjustName(name: string, value: number, rows: readonly AdjustRow[]): string | null {
  return numberedName(name.trim(), value, new Set(rows.filter(isUsableAdjust).map(adjustNameKey)))
}

// ---------- 書き込み（貼り付け・オートフィル） ----------

/** 表の位置に書く文字。col は列の位置、src はクリップの中の位置（行 × 列の数 ＋ 列） */
interface Target {
  row: number
  col: number
  text: string
  src: number
}

interface Write {
  cell: AdjustCellPos
  /** 書く行の位置（空の行は今の行の後ろに詰めた位置） */
  index: number
  text: string
  src: number
}

interface CutCell {
  row: number
  col: AdjustCol
  src: number
}

const keyOfRow = (r: AdjustRow): string | null => (isUsableAdjust(r) ? adjustNameKey(r) : null)

function setCellEmpty(r: AdjustRow, col: AdjustCol): void {
  if (col === 'name') r.name = ''
  else r.value = null
}

function copyCell(to: AdjustRow, from: AdjustRow, col: AdjustCol): void {
  if (col === 'name') to.name = from.name
  else to.value = from.value
}

interface Applied {
  adjusts: AdjustRow[]
  pasted: number
  skipped: AdjustPasteSkip[]
  renamed: AdjustRenamed[]
}

/**
 * 表の位置に文字を書く（貼り付けとオートフィルで同じ）。
 * 1. 空の行（行の数以上）は、上から今の行の後ろに詰めて行を作る（id は newId('adjust')）
 * 2. cutFirst（切り取りの元）を先に空にする（表示名の重なりは空にしたあとで比べる）
 * 3. 寸法：0 より大きい数・空だけ書く。名前を書かない行で表示名が重なれば、その寸法は書かずに元に戻す（duplicate）
 * 4. 名前：前後の空白を外す。書く先が今と同じ表示名ならそのまま。重ならなければそのまま（上から順に。同じものを2つ貼れば上はそのまま）、
 *    重なれば名前の後ろに ②③… を付ける
 * 5. 1つも貼れなければ同じ一覧。切り取りの元は、貼れた位置は空のまま・貼れなかった位置は元に戻す
 * 6. cutMove：行全体（名前・寸法）を切り取って、空の行へ両方を貼ったときは、元の行の id を貼った先へ引き継ぐ（式がついてくる。暫定）
 * 7. 書いて名前も寸法も空になった行は消す
 */
function applyTargets(
  rows: readonly AdjustRow[],
  targets: readonly Target[],
  newId: (prefix: string) => string,
  cutFirst: readonly CutCell[],
  cutMove: { top: number; rows: number } | null,
): Applied {
  const count = rows.length
  const newRows = [...new Set(targets.filter((t) => t.row >= count).map((t) => t.row))].sort((a, b) => a - b)
  const indexOfRow = new Map(newRows.map((r, k) => [r, count + k]))
  const work: AdjustRow[] = rows.map((r) => ({ ...r }))
  for (let k = 0; k < newRows.length; k++) work.push({ id: newId('adjust'), name: '', value: null })
  const writes: Write[] = targets.map((t) => ({
    cell: { row: t.row, col: ADJUST_COLS[t.col] },
    index: t.row < count ? t.row : indexOfRow.get(t.row)!,
    text: t.text,
    src: t.src,
  }))
  for (const c of cutFirst) setCellEmpty(work[c.row], c.col)

  const skipped: AdjustPasteSkip[] = []
  const filled = new Set<number>()
  const touched = new Set<number>()
  let pasted = 0

  // 寸法
  const valueWrites: { write: Write; prev: number | null; value: number | null }[] = []
  for (const w of writes) {
    if (w.cell.col !== 'value') continue
    const v = parseAdjustValue(w.text)
    if (v === undefined) {
      skipped.push({ cell: w.cell, reason: 'notValue', message: NOT_VALUE_MESSAGE })
      continue
    }
    valueWrites.push({ write: w, prev: work[w.index].value, value: v })
    work[w.index].value = v
  }
  const nameWrites = writes.filter((w) => w.cell.col === 'name')
  const nameWritten = new Set(nameWrites.map((w) => w.index))

  // 名前を書かない行で表示名が重なる寸法は書かない。重なりが無くなるまでくり返す
  // （元に戻した行は元の表示名＝ほかの元の行とは重ならないので、いつか止まる）
  const valueOnly = new Map(valueWrites.filter((v) => !nameWritten.has(v.write.index)).map((v) => [v.write.index, v]))
  const reverted = new Set<number>()
  for (let changed = true; changed; ) {
    changed = false
    const groups = new Map<string, number[]>()
    work.forEach((r, i) => {
      if (nameWritten.has(i)) return
      const k = keyOfRow(r)
      if (k !== null) groups.set(k, [...(groups.get(k) ?? []), i])
    })
    for (const members of groups.values()) {
      if (members.length < 2) continue
      const accepted = members.filter((i) => valueOnly.has(i) && !reverted.has(i))
      const hasFixed = accepted.length < members.length
      for (const i of hasFixed ? accepted : accepted.slice(1)) {
        const v = valueOnly.get(i)!
        skipped.push({
          cell: v.write.cell,
          reason: 'duplicate',
          message: duplicateAdjustMessage({ name: work[i].name, value: v.value as number }),
        })
        work[i].value = v.prev
        reverted.add(i)
        changed = true
      }
    }
  }
  for (const v of valueWrites) {
    if (reverted.has(v.write.index)) continue
    filled.add(v.write.src)
    touched.add(v.write.index)
    pasted++
  }

  // 名前
  const used = new Set<string>()
  work.forEach((r, i) => {
    if (nameWritten.has(i)) return
    const k = keyOfRow(r)
    if (k !== null) used.add(k)
  })
  const renamed: AdjustRenamed[] = []
  const accept = (w: Write, name: string) => {
    work[w.index].name = name
    filled.add(w.src)
    touched.add(w.index)
    pasted++
  }
  const ordered = [...nameWrites].sort((a, b) => a.cell.row - b.cell.row)
  const pending: { write: Write; name: string; key: string }[] = []
  // 書きかけになる行はそのまま。今と同じ表示名なら今の名前のまま（先に取っておく）
  for (const w of ordered) {
    const name = w.text.trim()
    const r = work[w.index]
    const next: AdjustRow = { id: r.id, name, value: r.value }
    const key = keyOfRow(next)
    if (key === null) {
      accept(w, name)
      continue
    }
    if (keyOfRow(r) === key && !used.has(key)) {
      used.add(key)
      accept(w, r.name)
      continue
    }
    pending.push({ write: w, name, key })
  }
  for (const p of pending) {
    if (!used.has(p.key)) {
      used.add(p.key)
      accept(p.write, p.name)
      continue
    }
    const value = work[p.write.index].value as number
    const to = numberedName(p.name, value, used)
    if (to === null) {
      skipped.push({ cell: p.write.cell, reason: 'duplicate', message: duplicateAdjustMessage({ name: p.name, value }) })
      continue
    }
    used.add(adjustNameKey({ name: to, value }))
    accept(p.write, to)
    renamed.push({ cell: p.write.cell, from: p.name, to })
  }

  skipped.sort((a, b) => a.cell.row - b.cell.row || colIndex(a.cell.col) - colIndex(b.cell.col))
  renamed.sort((a, b) => a.cell.row - b.cell.row)
  if (pasted === 0) return { adjusts: rows as AdjustRow[], pasted, skipped, renamed }

  // 切り取りの元：貼れた位置は空のまま、貼れなかった位置は元に戻す
  for (const c of cutFirst) {
    if (filled.has(c.src)) touched.add(c.row)
    else copyCell(work[c.row], rows[c.row], c.col)
  }

  // 行全体を空の行へ動かしたときは、元の行の id を引き継ぐ
  if (cutMove) {
    for (let i = 0; i < cutMove.rows; i++) {
      const from = cutMove.top + i
      const a = writes.find((w) => w.src === i * 2)
      const b = writes.find((w) => w.src === i * 2 + 1)
      if (!a || !b || a.index !== b.index || a.index === from || from >= count) continue
      if (!filled.has(a.src) || !filled.has(b.src) || !isBlankAdjustRow(work[from])) continue
      const to = a.index
      if (to < count && !isBlankAdjustRow(rows[to])) continue
      const id = work[to].id
      work[to].id = rows[from].id
      work[from].id = id
    }
  }

  const kept = work.filter((r, i) => !(touched.has(i) || i >= count) || !isBlankAdjustRow(r))
  // 元に戻した切り取りの元などで、表示名が重なってしまったときは何もしない（念のため）
  const keys = kept.map(keyOfRow).filter((k): k is string => k !== null)
  if (new Set(keys).size !== keys.length) return { adjusts: rows as AdjustRow[], pasted: 0, skipped, renamed: [] }
  return { adjusts: kept, pasted, skipped, renamed }
}

/** 切り取りの元の範囲で、クリップの中の位置 src にあたるセル（表をはみ出せば null） */
function cutSourceCell(clip: AdjustClip, src: number): AdjustCellPos | null {
  if (!clip.cut) return null
  const i = Math.floor(src / clip.cols)
  const j = src % clip.cols
  const row = clip.cut.top + i
  const ci = clip.cut.left + j
  if (row < 0 || ci < 0 || ci >= ADJUST_COLS.length) return null
  return { row, col: ADJUST_COLS[ci] }
}

/** 元のセルが、切り取ったときのまま（クリップの中身と同じ）か */
function sameAsClip(rows: readonly AdjustRow[], clip: AdjustClip, cell: AdjustCellPos): boolean {
  if (!clip.cut) return false
  const i = cell.row - clip.cut.top
  const j = colIndex(cell.col) - clip.cut.left
  if (i < 0 || i >= clip.rows || j < 0 || j >= clip.cols) return false
  return adjustCellText(rows, cell) === clip.cells[i][j]
}

/**
 * コピーしたセルを貼る（部材の表の pasteCells と同じ考え方）。
 * - 1つのセルのコピー：選んだセル全部に同じもの。範囲のコピー：選んだセルの左上から同じ形（寸法の右にはみ出す列は貼らない）
 * - 空の行に貼ると行を作る（今の行の後ろに詰める）
 * - 名前・寸法の決まりは applyTargets（表示名が重なる名前には ②③…、寸法だけで重なれば貼らない、寸法は 0 より大きい数だけ）
 * - 切り取り（clip.cut）：元のセルを空にする。貼る先と重なるセル・貼れなかった位置・切り取ったあとに書き換えたセルは空にしない。
 *   クリップをふつうのコピーに変えるのは store の側
 */
export function pasteAdjustCells(
  rows: readonly AdjustRow[],
  clip: AdjustClip,
  selected: AdjustSelection,
  newId: (prefix: string) => string,
): AdjustPasteResult {
  const cells = normalizeSelection(selected)
  if (cells.length === 0) return { ok: false, message: '貼るセルを選んでください' }
  const targets: Target[] = []
  if (clip.rows === 1 && clip.cols === 1) {
    for (const s of cells) targets.push({ row: s.row, col: colIndex(s.col), text: clip.cells[0][0], src: 0 })
  } else {
    const top = Math.min(...cells.map((s) => s.row))
    const left = Math.min(...cells.map((s) => colIndex(s.col)))
    for (let i = 0; i < clip.rows; i++) {
      for (let j = 0; j < clip.cols; j++) {
        if (left + j >= ADJUST_COLS.length) continue
        targets.push({ row: top + i, col: left + j, text: clip.cells[i][j], src: i * clip.cols + j })
      }
    }
  }

  const cutFirst: CutCell[] = []
  if (clip.cut) {
    const targetKeys = new Set(targets.map((t) => keyOf(t.row, t.col)))
    for (let src = 0; src < clip.rows * clip.cols; src++) {
      const cell = cutSourceCell(clip, src)
      if (!cell || cell.row >= rows.length) continue
      if (targetKeys.has(keyOf(cell.row, colIndex(cell.col)))) continue
      if (!sameAsClip(rows, clip, cell)) continue
      cutFirst.push({ row: cell.row, col: cell.col, src })
    }
  }
  const cutMove =
    clip.cut && clip.cut.left === 0 && clip.cols === ADJUST_COLS.length ? { top: clip.cut.top, rows: clip.rows } : null
  const r = applyTargets(rows, targets, newId, cutFirst, cutMove)
  return { ok: true, ...r }
}

/**
 * オートフィル（仕様書 17.4・21.1）：元の範囲 from の値を、引いた先 to の行へ上下にくり返して入れる（数は増やさない）。
 * to は元を含めても除いてもよい。元の行は書かない。名前には貼り付けと同じく番号を振る
 */
export function fillAdjustCells(
  rows: readonly AdjustRow[],
  from: CellRange,
  to: CellRange,
  newId: (prefix: string) => string,
): AdjustPasteResult {
  const src = adjustSelectionRange(from)
  if (!src) return { ok: false, message: FILL_RANGE_MESSAGE }
  const top = Math.max(0, Math.ceil(to.top))
  const bottom = Math.floor(to.top + to.rows - 1)
  const targets: Target[] = []
  for (let r = top; r <= bottom; r++) {
    if (r >= src.top && r < src.top + src.rows) continue
    const k = (((r - src.top) % src.rows) + src.rows) % src.rows
    for (let j = 0; j < src.cols; j++) {
      const col = src.left + j
      targets.push({ row: r, col, text: adjustCellText(rows, { row: src.top + k, col: ADJUST_COLS[col] }), src: k * src.cols + j })
    }
  }
  const a = applyTargets(rows, targets, newId, [], null)
  return { ok: true, ...a }
}

/** 選んだセルのある行の id（表の並び。空の行は入れない） */
export function selectedAdjustIds(rows: readonly AdjustRow[], selected: AdjustSelection): string[] {
  const picked = new Set(normalizeSelection(selected).map((s) => s.row))
  return rows.filter((_, i) => picked.has(i)).map((r) => r.id)
}

/**
 * 選んだセルの中身を空にする（寸法を空にすると書きかけの行。id はそのまま）。
 * 名前も寸法も空になった行は消す。空の行だけなら同じ一覧
 */
export function clearAdjustCells(rows: readonly AdjustRow[], selected: AdjustSelection): AdjustRow[] {
  const cells = normalizeSelection(selected).filter((s) => s.row < rows.length)
  if (cells.length === 0) return rows as AdjustRow[]
  const work = rows.map((r) => ({ ...r }))
  const touched = new Set<number>()
  for (const s of cells) {
    setCellEmpty(work[s.row], s.col)
    touched.add(s.row)
  }
  return work.filter((r, i) => !touched.has(i) || !isBlankAdjustRow(r))
}

/** 選んだセルのある行をまとめて消す（空の行だけなら同じ一覧）。使っている仕事の確認は画面で先に（adjustChangeUsages） */
export function deleteAdjustRows(rows: readonly AdjustRow[], selected: AdjustSelection): AdjustRow[] {
  const ids = new Set(selectedAdjustIds(rows, selected))
  if (ids.size === 0) return rows as AdjustRow[]
  return rows.filter((r) => !ids.has(r.id))
}

/** 行を上に挿入：index の位置（今その位置にある行の上）に空の行を入れる。表の下なら最後に */
export function insertAdjustRow(rows: readonly AdjustRow[], index: number, id: string): AdjustRow[] {
  const i = Number.isInteger(index) && index >= 0 && index <= rows.length ? index : rows.length
  return [...rows.slice(0, i), { id, name: '', value: null }, ...rows.slice(i)]
}

/** 名前も寸法も空の行を外す（keepId の行は入力の途中なので残す）。外すものが無ければ同じ一覧 */
export function dropBlankAdjustRows(rows: readonly AdjustRow[], keepId?: string | null): AdjustRow[] {
  const kept = rows.filter((r) => r.id === keepId || !isBlankAdjustRow(r))
  return kept.length === rows.length ? (rows as AdjustRow[]) : kept
}

export type SetAdjustCellResult = { ok: true; adjusts: AdjustRow[]; id?: string } | { ok: false; message: string }

/**
 * セルに入力する（名前はスマホのキーボード、寸法はアプリのキー）。
 * - 名前は前後の空白を外す。寸法は 0 より大きい数か空（空なら書きかけの行）。それ以外は「寸法は 0 より大きい数を入れてください」
 * - 表の下の空の行に入れると、今の行の後ろに行を足す（id は newId('adjust')）。空を入れても行は作らない
 * - 表示名が同じになるときは断る（「メラミン1」はもうあります）
 * - 名前も寸法も空になっても行は消さない（入力の途中。外すのは dropBlankAdjustRows）
 * id は入れた行の id（行を作らなかったときは無し）
 */
export function setAdjustCell(
  rows: readonly AdjustRow[],
  pos: AdjustCellPos,
  text: string,
  newId: (prefix: string) => string,
): SetAdjustCellResult {
  let name: string | undefined
  let value: number | null | undefined
  if (pos.col === 'name') name = text.trim()
  else {
    value = parseAdjustValue(text)
    if (value === undefined) return { ok: false, message: VALUE_INPUT_MESSAGE }
  }
  const current = rows[pos.row] as AdjustRow | undefined
  if (!current && (name === '' || value === null)) return { ok: true, adjusts: rows as AdjustRow[] }
  const base: AdjustRow = current ?? { id: newId('adjust'), name: '', value: null }
  const next: AdjustRow = { id: base.id, name: name ?? base.name, value: value === undefined ? base.value : value }
  const key = keyOfRow(next)
  const same = key === null ? undefined : rows.find((r) => r.id !== next.id && keyOfRow(r) === key)
  if (same && isUsableAdjust(same)) return { ok: false, message: duplicateAdjustMessage(same) }
  const adjusts = current ? rows.map((r, i) => (i === pos.row ? next : r)) : [...rows, next]
  return { ok: true, adjusts, id: next.id }
}
