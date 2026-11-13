// 保存データ・共有とバックアップのファイルの中身の形の確かめ（store/storage.ts から移した。第1.1版 E-11）。
// 手で書き換えたデータや途中までのデータで画面が真っ白にならないよう、形が違えば「読めない」とする
import { ADJUST_COLS, CELL_COLS, CELL_COLS_KEY, PART_COLORS, type CellCol, type PartColor, type Adjust, type AdjustClip, type AdjustRow, type CellClip, type CellCut, type CellRange, type FrozenSheet, type Job, type Part, type Settings, type Sheet } from './types'

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const isString = (v: unknown): v is string => typeof v === 'string'
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNonNegative = (v: unknown): v is number => isFiniteNumber(v) && v >= 0
const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0

function isSheet(v: unknown): v is Sheet {
  return (
    isRecord(v) &&
    (v.sizeKind === 'saburoku' || v.sizeKind === 'shihachi' || v.sizeKind === 'custom') &&
    isPositive(v.width) &&
    isPositive(v.length)
  )
}

function isSettings(v: unknown): v is Settings {
  return (
    isRecord(v) &&
    isSheet(v.sheet) &&
    isNonNegative(v.kerf) &&
    isNonNegative(v.trim) &&
    isNonNegative(v.allowance) &&
    (v.cutMode === 'vertical' || v.cutMode === 'horizontal')
  )
}

function isExpr(v: unknown): v is Part['expr'] {
  return isRecord(v) && isString(v.W) && isString(v.H)
}

/** 厚み（第2.2版）：0 より大きい数か、空（null） */
export function isThickness(v: unknown): v is number | null {
  return v === null || isPositive(v)
}

/** 色（第2.2版）：赤・青・黄のどれか */
export function isPartColor(v: unknown): v is PartColor {
  return typeof v === 'string' && (PART_COLORS as readonly string[]).includes(v)
}

/** セルの色（第2.2版）：列（名前・厚み・W・H・枚数）→ 色。知らない列・知らない色があれば false */
function isCellColors(v: unknown): v is Part['cellColors'] {
  return isRecord(v) && Object.entries(v).every(([k, c]) => (CELL_COLS as readonly string[]).includes(k) && isPartColor(c))
}

/**
 * 部材（第2.1版から調整 adjust、第2.2版から厚み thickness・行の色 rowColor・セルの色 cellColors・メモ memo も要る。
 * 無い古い部材は readJob で「なし」を足してから確かめる）
 */
export function isPart(v: unknown): v is Part {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isExpr(v.expr) &&
    isExpr(v.adjust) &&
    isThickness(v.thickness) &&
    (v.rowColor === null || isPartColor(v.rowColor)) &&
    isCellColors(v.cellColors) &&
    isString(v.memo) &&
    // 枚数は 0 以上の整数か、空（null。第1.1版）
    (v.quantity === null || (Number.isInteger(v.quantity) && (v.quantity as number) >= 0)) &&
    typeof v.rotatable === 'boolean' &&
    typeof v.finishedDone === 'boolean'
  )
}

/** 部材の表の四角い範囲（第1.3版）：整数で、行は 0 から・列は表の中、1行×1列以上 */
export function isCellRange(v: unknown): v is CellRange {
  if (!isRecord(v) || ![v.top, v.left, v.rows, v.cols].every((n) => Number.isInteger(n))) return false
  const { top, left, rows, cols } = v as unknown as CellRange
  return top >= 0 && left >= 0 && rows >= 1 && cols >= 1 && left + cols <= CELL_COLS.length
}

/** 切り取りの元（第1.3版）：仕事の id と、クリップと同じ形の範囲 */
function isCellCut(v: unknown, rows: number, cols: number): v is CellCut {
  return isRecord(v) && isString(v.jobId) && isCellRange(v.range) && v.range.rows === rows && v.range.cols === cols
}

/**
 * コピーしたセル（第1.2版）：1〜部材の表の列の数の四角い形で、中身は全部文字。
 * 切り取りの元 cut（第1.3版）は無くてもよい（第1.2版の保存データ）。あるときは形も確かめる。
 * 列の並びの印 columns（第2.2版）が今の CELL_COLS_KEY と同じものだけ（前の版で保存したクリップは列がずれるので読めない＝捨てる。仕様書 26.8）
 */
export function isCellClip(v: unknown): v is CellClip {
  if (!isRecord(v) || !Number.isInteger(v.rows) || !Number.isInteger(v.cols)) return false
  if (v.columns !== CELL_COLS_KEY) return false
  const rows = v.rows as number
  const cols = v.cols as number
  if (rows < 1 || cols < 1 || cols > CELL_COLS.length) return false
  if (v.cut !== undefined && !isCellCut(v.cut, rows, cols)) return false
  // どのタブから写したか（第2.1版）：無い（［仕上がり］）か 'adjust'（［調整］）
  if (v.source !== undefined && v.source !== 'adjust') return false
  return (
    Array.isArray(v.cells) &&
    v.cells.length === rows &&
    v.cells.every((r) => Array.isArray(r) && r.length === cols && r.every(isString))
  )
}

/**
 * 保存データのコピーしたセルを読む。形が違えば null。切り取りの元だけ形が違うときは、元を外してふつうのコピーとして読む（暫定）
 */
export function readCellClip(v: unknown): CellClip | null {
  if (isCellClip(v)) return v
  if (!isRecord(v) || v.cut === undefined) return null
  const { cut: _cut, ...rest } = v
  return isCellClip(rest) ? rest : null
}

/** 固定した1枚は計算の写しなので、画面が使う所（id・板・1枚の片・チェック）だけ確かめる */
function isFrozenSheet(v: unknown): v is FrozenSheet {
  if (!isRecord(v) || !isString(v.id) || !isSheet(v.sheet) || !isString(v.frozenAt)) return false
  if (v.mode !== 'vertical' && v.mode !== 'horizontal') return false
  if (!isNonNegative(v.kerf) || !isNonNegative(v.trim)) return false
  if (!Array.isArray(v.checked) || !v.checked.every(isString)) return false
  if (v.completedAt !== undefined && !isString(v.completedAt)) return false
  const l = v.layout
  return isRecord(l) && Array.isArray(l.placements) && Array.isArray(l.trims) && Array.isArray(l.cuts) && Array.isArray(l.scraps) && isRecord(l.usable)
}

export function isJob(v: unknown): v is Job {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isSettings(v.settings) &&
    Array.isArray(v.parts) &&
    v.parts.every(isPart) &&
    Array.isArray(v.frozenSheets) &&
    v.frozenSheets.every(isFrozenSheet) &&
    isString(v.createdAt) &&
    isString(v.updatedAt)
  )
}

/**
 * 保存データ・取り込むファイルの仕事を読む（第1.4版）。形が違えば null。
 * - 第1.3版までの切り方「おまかせ」（'auto'）は縦切り優先（'vertical'）にして読む（仕様書 18.2）
 * - 第2.0版までの部材（調整 adjust が無い）は、調整なし（W・H とも空）にして読む（第2.1版。仕様書 25.5）。
 *   調整があって形が違う（文字でない・軸が無い）部材は読めない
 * - 第2.1版までの部材（厚み thickness が無い）は、厚みなし（null）にして読む（第2.2版。仕様書 26.7）。
 *   厚みがあって 0 以下・数でない部材は読めない
 * - 第2.1版までの部材（色・メモが無い）は、色なし・メモなしにして読む（第2.2版。仕様書 26.7）。
 *   色・メモは飾りなので、知らない色（あとの版で色が増えたとき など）・形の違うものも仕事ごと読めなくはせず、その色・メモを外して読む
 */
export function readJob(v: unknown): Job | null {
  if (!isRecord(v)) return null
  let job: Record<string, unknown> = v
  if (isRecord(v.settings) && v.settings.cutMode === 'auto') job = { ...job, settings: { ...v.settings, cutMode: 'vertical' } }
  if (Array.isArray(v.parts) && v.parts.some(needsPartDefaults)) {
    job = { ...job, parts: v.parts.map(withPartDefaults) }
  }
  return isJob(job) ? job : null
}

/** 前の版の部材で、あとの版で足した欄が無いか。色・メモの形が違うか（外して読む） */
function needsPartDefaults(p: unknown): boolean {
  return (
    isRecord(p) &&
    (p.adjust === undefined ||
      p.thickness === undefined ||
      !(p.rowColor === null || isPartColor(p.rowColor)) ||
      !isCellColors(p.cellColors) ||
      !isString(p.memo))
  )
}

/** セルの色の、知っている列・知っている色だけ（形が違えば色なし） */
function knownCellColors(v: unknown): Part['cellColors'] {
  if (!isRecord(v)) return {}
  const out: Partial<Record<CellCol, PartColor>> = {}
  for (const col of CELL_COLS) if (isPartColor(v[col])) out[col] = v[col]
  return out
}

/**
 * 前の版の部材に、あとの版で足した欄の「なし」を足す（調整 W・H とも空・厚み null・色なし・メモなし）。
 * ある欄はそのまま。色・メモの形が違えば、知らない色・列を外す（メモは文字でなければなし）
 */
function withPartDefaults(p: unknown): unknown {
  if (!needsPartDefaults(p)) return p
  const r = p as Record<string, unknown>
  return {
    ...r,
    ...(r.adjust === undefined ? { adjust: { W: '', H: '' } } : {}),
    ...(r.thickness === undefined ? { thickness: null } : {}),
    rowColor: isPartColor(r.rowColor) ? r.rowColor : null,
    cellColors: knownCellColors(r.cellColors),
    memo: isString(r.memo) ? r.memo : '',
  }
}

/** 仕事の並びを読む（readJob）。1つでも読めなければ null */
export function readJobs(v: unknown): Job[] | null {
  if (!Array.isArray(v)) return null
  const out: Job[] = []
  for (const x of v) {
    const j = readJob(x)
    if (!j) return null
    out.push(j)
  }
  return out
}

export function isAdjust(v: unknown): v is Adjust {
  return isRecord(v) && isString(v.id) && isString(v.name) && isPositive(v.value)
}

/**
 * 調整寸法の表の行（第1.7版）：名前は文字（空も可）、寸法は 0 より大きい数か空（null）。
 * 第1.6版までの調整寸法（Adjust）もそのまま読める
 */
export function isAdjustRow(v: unknown): v is AdjustRow {
  return isRecord(v) && isString(v.id) && isString(v.name) && (v.value === null || isPositive(v.value))
}

/**
 * 保存データの調整寸法の表を読む（第1.7版）。形が違う行が1つでもあれば null（仕事と同じく、読めないとする）。
 * 同じ id の行が2つあれば null。名前も寸法も空の行は外す
 */
export function readAdjustRows(v: unknown): AdjustRow[] | null {
  if (!Array.isArray(v) || !v.every(isAdjustRow)) return null
  if (new Set(v.map((r) => r.id)).size !== v.length) return null
  return v.filter((r) => r.name.trim() !== '' || r.value !== null)
}

/** 調整寸法の表の四角い範囲：整数で、行は 0 から・列は表（名前・寸法）の中、1行×1列以上 */
function isAdjustRange(v: unknown): v is CellRange {
  if (!isRecord(v) || ![v.top, v.left, v.rows, v.cols].every((n) => Number.isInteger(n))) return false
  const { top, left, rows, cols } = v as unknown as CellRange
  return top >= 0 && left >= 0 && rows >= 1 && cols >= 1 && left + cols <= ADJUST_COLS.length
}

/** 調整寸法の表でコピーしたセル（第1.7版）：1〜2列の四角い形で、中身は全部文字。cut は無くてもよい */
export function isAdjustClip(v: unknown): v is AdjustClip {
  if (!isRecord(v) || !Number.isInteger(v.rows) || !Number.isInteger(v.cols)) return false
  const rows = v.rows as number
  const cols = v.cols as number
  if (rows < 1 || cols < 1 || cols > ADJUST_COLS.length) return false
  if (v.cut !== undefined && !(isAdjustRange(v.cut) && v.cut.rows === rows && v.cut.cols === cols)) return false
  return (
    Array.isArray(v.cells) &&
    v.cells.length === rows &&
    v.cells.every((r) => Array.isArray(r) && r.length === cols && r.every(isString))
  )
}

/** 保存データの調整寸法の表のクリップを読む。無い（第1.6版まで）・形が違えば null。切り取りの元だけ違えば外して読む（暫定） */
export function readAdjustClip(v: unknown): AdjustClip | null {
  if (isAdjustClip(v)) return v
  if (!isRecord(v) || v.cut === undefined) return null
  const { cut: _cut, ...rest } = v
  return isAdjustClip(rest) ? rest : null
}
