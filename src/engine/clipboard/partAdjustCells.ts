// ［調整］のタブの表のセル操作（第2.1版。仕様書 25.2・25.9）。新しく作ったもの（kidori には無い）。
// 表の形は［仕上がり］と同じ（番号・名前・厚み・W・H・枚数。セルの位置・範囲は cells.ts と同じ CellPos・CellRange）。
// - W・H の欄の中身は部材の調整の式（Part.adjust）。名前・厚み（第2.2版）・枚数の欄は見るだけ
//   （選べてコピーもできるが、貼り付け・クリア・オートフィルで変わるのは W・H だけ）
// - 部材のある行だけ。空の行には貼らず、部材も作らない（貼り付け・オートフィルは部材のある行までで止める。数えない）
// - コピーしたセルには［調整］から写した印（CellClip.source = 'adjust'）を付ける。［仕上がり］でコピーしたもの（印なし）は貼れない。
//   逆に［調整］でコピーしたものは［仕上がり］に貼れない（cells.ts の pasteCells）
// - 部材の名前は変えないので、番号を振ることも、貼れない理由（skipped）も無い（結果の形は pasteCells にそろえて空の配列を返す）
// 仕事は書き換えず、新しい仕事を返す（updatedAt とコピーしたセル AppData.cellClip の保存は store の側で行う）
import { CELL_COLS, CELL_COLS_KEY, type CellClip, type CellCol, type CellPos, type CellRange, type Job } from '../types'
import {
  cellText,
  COPY_SHAPE_MESSAGE,
  FILL_RANGE_MESSAGE,
  selectionCells,
  selectionRange,
  selectionShape,
  type CellSelection,
  type CopyCellsResult,
  type PasteRenamed,
  type PasteSkip,
} from './cells'

/** ［仕上がり］のタブでコピーしたセルを［調整］に貼ろうとしたとき */
export const FINISHED_CLIP_TO_ADJUST_MESSAGE = '［仕上がり］でコピーしたものは［調整］には貼れません'
export { ADJUST_CLIP_TO_FINISHED_MESSAGE } from './cells'

const colIndex = (col: CellCol): number => CELL_COLS.indexOf(col)
const keyOf = (row: number, col: number): string => `${row}:${col}`
/** 調整の式を入れる欄（W・H） */
const isAxisCol = (col: CellCol): col is 'W' | 'H' => col === 'W' || col === 'H'

/** ［調整］のタブのセルの中身：W・H は調整の式、名前・厚み・枚数は今の中身（cellText と同じ）。空の行は '' */
export function partAdjustCellText(job: Pick<Job, 'parts'>, pos: CellPos): string {
  if (!isAxisCol(pos.col)) return cellText(job, pos)
  return job.parts[pos.row]?.adjust[pos.col] ?? ''
}

/** ［調整］のタブでセルをコピーする（1つのセルか四角い範囲だけ）。clip.source は 'adjust' */
export function copyPartAdjustCells(job: Pick<Job, 'parts'>, selected: CellSelection): CopyCellsResult {
  const shape = selectionShape(selected)
  if (shape.kind !== 'range') return { ok: false, message: COPY_SHAPE_MESSAGE }
  const cells: string[][] = []
  for (let i = 0; i < shape.rows; i++) {
    const line: string[] = []
    for (let j = 0; j < shape.cols; j++) line.push(partAdjustCellText(job, { row: shape.top + i, col: CELL_COLS[shape.left + j] }))
    cells.push(line)
  }
  return { ok: true, clip: { rows: shape.rows, cols: shape.cols, cells, source: 'adjust', columns: CELL_COLS_KEY } }
}

/** ［調整］のタブでセルを切り取る：コピーと同じ中身に、元（仕事の id と範囲）を clip.cut に付ける。仕事はまだ変えない */
export function cutPartAdjustCells(job: Pick<Job, 'id' | 'parts'>, selected: CellSelection): CopyCellsResult {
  const r = copyPartAdjustCells(job, selected)
  const range = selectionRange(selected)
  if (!r.ok || !range) return r
  return { ok: true, clip: { ...r.clip, cut: { jobId: job.id, range } } }
}

export type PartAdjustPasteResult =
  | {
      ok: true
      job: Job
      /** 調整を入れたセルの数（W・H だけ数える） */
      pasted: number
      /** いつも空（［調整］では貼れない理由が無い。pasteCells と同じ形にそろえる） */
      skipped: PasteSkip[]
      /** いつも空（名前を変えないので番号は振らない） */
      renamed: PasteRenamed[]
      /** 切り取りをほかの仕事に貼ったとき、元の仕事で空にする W・H のセル（clearPartAdjustCutSource に渡す）。それ以外は null */
      cutClear: { jobId: string; cells: CellPos[] } | null
    }
  | { ok: false; message: string }

/** 表の位置に書く調整の式。src はクリップの中の位置（行 × 列の数 ＋ 列。切り取りの元と結ぶ） */
interface Target {
  row: number
  col: 'W' | 'H'
  text: string
  src: number
}

/**
 * 部材のある行の W・H に調整の式を書く。cutFirst は先に空にする同じ仕事の切り取りの元（そのクリップの位置が1つも貼れなかったら戻す）。
 * 1つも書けなければ同じ仕事を返す
 */
function applyTargets(job: Job, targets: readonly Target[], cutFirst: readonly { row: number; col: 'W' | 'H'; src: number }[]) {
  const live = targets.filter((t) => t.row >= 0 && t.row < job.parts.length)
  if (live.length === 0) return { job, pasted: 0, filled: new Set<number>() }
  const parts = job.parts.map((p) => ({ ...p, adjust: { ...p.adjust } }))
  for (const c of cutFirst) parts[c.row].adjust[c.col] = ''
  const filled = new Set<number>()
  for (const t of live) {
    parts[t.row].adjust[t.col] = t.text
    filled.add(t.src)
  }
  // 切り取りの元：貼れた位置は空のまま、貼れなかった位置は元に戻す
  for (const c of cutFirst) if (!filled.has(c.src)) parts[c.row].adjust[c.col] = job.parts[c.row].adjust[c.col]
  return { job: { ...job, parts }, pasted: live.length, filled }
}

/** 切り取りの元の範囲で、クリップの中の位置 src にあたる W・H のセル（名前・枚数・表をはみ出す所は null） */
function cutSourceCell(clip: CellClip, src: number): { row: number; col: 'W' | 'H' } | null {
  if (!clip.cut) return null
  const row = clip.cut.range.top + Math.floor(src / clip.cols)
  const ci = clip.cut.range.left + (src % clip.cols)
  if (row < 0 || ci < 0 || ci >= CELL_COLS.length) return null
  const col = CELL_COLS[ci]
  return isAxisCol(col) ? { row, col } : null
}

/** 元のセルが、切り取ったときのまま（クリップの中身と同じ）か */
function sameAsClip(job: Pick<Job, 'parts'>, clip: CellClip, cell: CellPos): boolean {
  if (!clip.cut) return false
  const i = cell.row - clip.cut.range.top
  const j = colIndex(cell.col) - clip.cut.range.left
  if (i < 0 || i >= clip.rows || j < 0 || j >= clip.cols) return false
  return partAdjustCellText(job, cell) === clip.cells[i][j]
}

/**
 * ［調整］のタブでコピーしたセルを貼る（W・H の調整の式だけ変わる）。
 * - 1つのセルのコピー：選んだセル全部に同じものを貼る（同じ調整をまとめて何行にも貼れる）
 * - 範囲のコピー：選んだセルの一番左上から同じ形で貼る。表の右をはみ出す列は貼らない
 * - 名前・厚み・枚数の欄に当たる所、部材の無い行は貼らない（数えない。部材も作らない）
 * - ［仕上がり］でコピーしたもの（clip.source が 'adjust' でない）は断る
 * - 切り取り（clip.cut）：元の W・H を空にする（名前・枚数は消さない）。貼る先と重なるセル・切り取ったあとに書き換えたセルは空にしない。
 *   同じ仕事なら返す job の中で空にし、違う仕事なら cutClear で返す。クリップをふつうのコピーに変えるのは store の側
 */
export function pastePartAdjustCells(job: Job, clip: CellClip, selected: CellSelection): PartAdjustPasteResult {
  if (clip.source !== 'adjust') return { ok: false, message: FINISHED_CLIP_TO_ADJUST_MESSAGE }
  const cells = selectionCells(selected)
  if (cells.length === 0) return { ok: false, message: '貼るセルを選んでください' }

  const targets: Target[] = []
  const push = (row: number, ci: number, text: string, src: number) => {
    if (ci >= CELL_COLS.length) return
    const col = CELL_COLS[ci]
    if (isAxisCol(col)) targets.push({ row, col, text, src })
  }
  if (clip.rows === 1 && clip.cols === 1) {
    for (const s of cells) push(s.row, colIndex(s.col), clip.cells[0][0], 0)
  } else {
    const top = Math.min(...cells.map((s) => s.row))
    const left = Math.min(...cells.map((s) => colIndex(s.col)))
    for (let i = 0; i < clip.rows; i++) for (let j = 0; j < clip.cols; j++) push(top + i, left + j, clip.cells[i][j], i * clip.cols + j)
  }

  const cut = clip.cut
  const sameJob = cut !== undefined && cut.jobId === job.id
  const cutFirst: { row: number; col: 'W' | 'H'; src: number }[] = []
  if (sameJob) {
    const targetKeys = new Set(targets.map((t) => keyOf(t.row, colIndex(t.col))))
    for (let src = 0; src < clip.rows * clip.cols; src++) {
      const cell = cutSourceCell(clip, src)
      if (!cell || cell.row >= job.parts.length) continue
      if (targetKeys.has(keyOf(cell.row, colIndex(cell.col)))) continue
      if (!sameAsClip(job, clip, cell)) continue
      cutFirst.push({ ...cell, src })
    }
  }

  const r = applyTargets(job, targets, cutFirst)
  let cutClear: { jobId: string; cells: CellPos[] } | null = null
  if (cut && !sameJob && r.pasted > 0) {
    const srcCells = [...r.filled]
      .sort((a, b) => a - b)
      .map((src) => cutSourceCell(clip, src))
      .filter((c): c is { row: number; col: 'W' | 'H' } => c !== null)
    cutClear = { jobId: cut.jobId, cells: srcCells }
  }
  return { ok: true, job: r.job, pasted: r.pasted, skipped: [], renamed: [], cutClear }
}

/**
 * 切り取りをほかの仕事に貼ったあと、元の仕事の W・H の調整を空にする（pastePartAdjustCells の cutClear.cells を渡す）。
 * 切り取ったあとに書き換えたセルは空にしない
 */
export function clearPartAdjustCutSource(job: Job, clip: CellClip, cells: readonly CellPos[]): Job {
  return clearPartAdjustCells(
    job,
    cells.filter((c) => sameAsClip(job, clip, c)),
  )
}

/**
 * ［調整］のタブのオートフィル：元の範囲 from の W・H の調整を、引いた先の範囲 to の行へ上下にくり返して入れる（cells.ts の fillCells と同じ並び）。
 * 元の行は書かない。名前・枚数の列は変えない。部材の無い行には入れない
 */
export function fillPartAdjustCells(job: Job, from: CellRange, to: CellRange): PartAdjustPasteResult {
  const src = selectionRange(from)
  if (!src) return { ok: false, message: FILL_RANGE_MESSAGE }
  const top = Math.max(0, Math.ceil(to.top))
  const bottom = Math.floor(to.top + to.rows - 1)
  const targets: Target[] = []
  for (let r = top; r <= bottom; r++) {
    if (r >= src.top && r < src.top + src.rows) continue
    const k = (((r - src.top) % src.rows) + src.rows) % src.rows
    for (let j = 0; j < src.cols; j++) {
      const col = CELL_COLS[src.left + j]
      if (!isAxisCol(col)) continue
      targets.push({ row: r, col, text: partAdjustCellText(job, { row: src.top + k, col }), src: k * src.cols + j })
    }
  }
  const a = applyTargets(job, targets, [])
  return { ok: true, job: a.job, pasted: a.pasted, skipped: [], renamed: [], cutClear: null }
}

/**
 * ［調整］のタブのクリア：選んだセルの W・H の調整を空にする（調整なし）。名前・枚数・仕上がりは変えず、部材も消さない。
 * 変わるものが無ければ同じ仕事を返す
 */
export function clearPartAdjustCells(job: Job, selected: CellSelection): Job {
  const cells = selectionCells(selected).filter((s) => s.row < job.parts.length && isAxisCol(s.col) && job.parts[s.row].adjust[s.col as 'W' | 'H'] !== '')
  if (cells.length === 0) return job
  const parts = job.parts.map((p) => ({ ...p, adjust: { ...p.adjust } }))
  for (const s of cells) parts[s.row].adjust[s.col as 'W' | 'H'] = ''
  return { ...job, parts }
}
