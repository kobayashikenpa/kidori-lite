// 部材の表（仕様書 15.1・15.2・17.1。［仕上がり］のタブ）：番号・名前・W・H・枚数。表の下にいつも空の行。
// セルを1回押すと選ぶ（太い枠）、選んでいるセルをもう一度押すと入力（第1.3版）。角の丸い取っ手を引くと範囲が広がる。
// 番号を押すと行全体、見出しを押すと列全体を選ぶ。範囲は engine の CellRange（left 0＝名前 … 3＝枚数）で持つ。
// セル（範囲）を長押しするとメニュー（CellMenu。仕様書 17.2）。右下の四角い取っ手を上下に引くとオートフィル（仕様書 17.4）。
// 表の上に、今コピーしているもの と 操作のあとの知らせ を短く出す。
// 名前はその場でスマホのキーボード。W・H・枚数はスマホのキーボードを出さず、画面の下のアプリのキーで入れる（式も使える。枚数は数字だけ）。
// 入力はキーを押すたびに保存する。空の行に入れたときに部材を作り、何も入っていない部材は表から外す（保存しない）。
// 寸法の計算は engine（computeDimensions の結果を受け取る）。式の文字の編集は formulaEdit.ts
// 「＝」で始めた入力中は、ほかの部材の W・H のセルを押すと、その寸法（天板.W）をカーソルの位置に入れる（仕様書 20.2。エクセルと同じ）。
// 表の下に調整寸法の表（AdjustTable。仕様書 21.1）を置き、「＝」の入力中にその行を押すと調整寸法を入れる（仕様書 21.2）。
// 選ぶ・取っ手・長押しの指の動きは useGrid（調整寸法の表と同じ仕組み）
import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type Ref } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { normalizePartName, splitLeadingEquals, validatePartName } from '../../engine/formula/tokenize'
import { formulaUnits } from '../../engine/formula/units'
import { adjustIdsInExpr } from '../../engine/formula/usages'
import { isUsableAdjust } from '../../engine/adjusts'
import { columnRange, rowRange } from '../../engine/clipboard/cells'
import { hasName } from '../../engine/parts'
import { CELL_COLS, type Adjust, type AdjustRow, type Axis, type CellClip, type CellRange, type DimensionResult, type Job, type Part } from '../../engine/types'
import { currentJob, type ReduceResult, type StoreAction } from '../../store/reducer'
import { clampRange, clipText, fillExtension, fillHint, fillText, isSingleAt, rangeEnd, rangeHas, rangeText, singleRange } from '../cellSelect'
import { claimOpen } from '../exclusive'
import { fmt } from '../format'
import { insertAt, opensAsFormula, refCellsOf, refColorsOf, type Edit } from '../formulaEdit'
import { closeKeyboard } from '../keyboard'
import { pressKey } from '../numpad'
import {
  addRowsMin,
  inputRow,
  isBlankPart,
  nextCell,
  quantityFromText,
  quantityText,
  sessionTableMinRows,
  setSessionTableMinRows,
  errorsWhileEditing,
  tableDimCell,
  tableRowCount,
  type TableCell,
  type TableField,
} from '../partsTable'
import { rangeKey, usePadHeight, useRevealRow, useGrid, useGridBoxes, type PressAt } from '../useGrid'
import { AdjustTable } from './AdjustTable'
import { CellMenu } from './CellMenu'
import { FormulaKeys, FormulaView } from './FormulaKeys'
import { GridOverlay } from './GridOverlay'

interface Props {
  job: Job
  dims: DimensionResult
  adjusts: readonly Adjust[]
  /** 今コピー（切り取り）しているセル（アプリ全体で1つ） */
  clip: CellClip | null
  dispatch: (action: StoreAction) => ReduceResult
  onError: (message: string | null) => void
  ref?: Ref<PartsTableHandle>
}

/** 表の外から使う操作 */
export interface PartsTableHandle {
  /** その部材の名前の欄を選び、スマホのキーボードを出す（押した操作の中で呼ぶ）。job は操作のあとの仕事 */
  editName: (job: Job, partId: string) => void
}

/** 選んでいる欄（部材の id と欄）。partId が null なら いちばん上の空の行 */
interface Sel {
  partId: string | null
  field: TableField
}

/** 選んでいる欄の行の番号（部材が無くなっていれば null） */
function cellOf(s: Sel | null, parts: readonly Part[]): TableCell | null {
  if (!s) return null
  if (s.partId === null) return { row: parts.length, field: s.field }
  const row = parts.findIndex((p) => p.id === s.partId)
  return row < 0 ? null : { row, field: s.field }
}

const FIELD_LABEL: Record<TableField, string> = { name: '名前', W: 'W', H: 'H', qty: '枚数' }

/** W・H が板のどちらの辺か（仕様書 18.4。回転しない部材は W を妻手・H を長手に合わせて置く） */
const AXIS_SIDE: Record<Axis, string> = { W: '妻手', H: '長手' }

/** 欄の列の位置（0＝名前 … 3＝枚数） */
const colOf = (f: TableField): number => CELL_COLS.indexOf(f)

export function PartsTable({ job, dims, adjusts, clip, dispatch, onError, ref }: Props) {
  const parts = job.parts
  // 「＋ 5行足す」で増やした行の数の下限（アプリを開いている間だけ、仕事ごとに覚える。保存しない）
  const [minRows, setMinRows] = useState(() => sessionTableMinRows(job.id))
  const [minRowsJob, setMinRowsJob] = useState(job.id)
  // 長押しのメニューを開いているか・操作のあとの知らせ（表の上に短く出す）
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  if (minRowsJob !== job.id) {
    setMinRowsJob(job.id)
    setMinRows(sessionTableMinRows(job.id))
    setMenuOpen(false)
    setNotice(null)
  }
  const rowCount = tableRowCount(parts.length, minRows)
  const addRows = () => {
    const next = addRowsMin(parts.length, minRows)
    setSessionTableMinRows(job.id, next)
    setMinRows(next)
  }
  // 選んでいる欄。部材の id で持つ（行の番号は、部材を外すとずれるため）。partId が null なら いちばん上の空の行
  const [selS, setSelS] = useState<Sel | null>(null)
  const sel = cellOf(selS, parts)
  const selKey = sel ? `${sel.row}:${sel.field}` : ''
  // W・H の式のカーソル（単位の番号）
  const [cursor, setCursor] = useState(0)
  // 「＝」で始めた入力か（仕様書 20.2。「＝」は式の文字に入れず、ここで持つ）
  const [equals, setEqualsS] = useState(false)
  const equalsRef = useRef(false)
  const setEquals = (on: boolean) => {
    equalsRef.current = on
    setEqualsS(on)
  }
  // 「＝」で始めた入力中にセルを押して入れられなかった理由（キーの上の行に出す）
  const [refMsg, setRefMsg] = useState<string | null>(null)
  // 名前の欄の書きかけ（確定するまで保存しない。名前の変更は式の参照のつけ替えを伴うため）
  const [nameDraft, setNameDraft] = useState('')
  const nameDraftRef = useRef('')
  const setDraft = (t: string) => {
    nameDraftRef.current = t
    setNameDraft(t)
  }
  // 名前を保存できなかった理由（行の下に出す）
  const [nameMsg, setNameMsg] = useState<string | null>(null)
  const nameErrorRef = useRef<string | null>(null)

  // 同じ操作の中で続けて使えるよう、最新の仕事と選んでいる欄を手元にも持つ
  const jobRef = useRef(job)
  const selSRef = useRef(selS)
  useEffect(() => {
    jobRef.current = job
    selSRef.current = selS
  })
  const tableRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<HTMLDivElement>(null)
  const adjustWrapRef = useRef<HTMLDivElement>(null)
  const nameInputs = useRef(new Map<number, HTMLInputElement>())
  const rowEls = useRef(new Map<number, HTMLDivElement>())
  const headEls = useRef<(HTMLButtonElement | null)[]>([])

  // 選んでいる範囲・取っ手・長押し（useGrid。調整寸法の表と同じ仕組み）
  const grid = useGrid({
    tableRef,
    rowEls,
    headEls,
    rowCount,
    colCount: CELL_COLS.length,
    onPressCell: (row, col) => pressCell(row, CELL_COLS[col]),
    onPressRow: (row) => pressRow(row),
    onLongPress: (at) => openMenu(at),
    noLongPress: () => formulaPicking(),
    onFill: (from, to) => fillDone(from, to),
    onFillStart: () => onError(null),
    // 調整寸法の表で選んだら、こちらの入力は終える
    onRelease: () => {
      if (curCell()) selectRef.current(null)
    },
    // 仕事を切り替えたら、選んでいる範囲を外す
    resetKey: job.id,
  })
  const { range, active, rangeRef, activeRef, selectRange, dragging, fillTo } = grid

  const setSel = (s: Sel | null) => {
    selSRef.current = s
    setSelS(s)
  }
  const curCell = () => cellOf(selSRef.current, jobRef.current.parts)

  const run = (action: StoreAction): ReduceResult => {
    const r = dispatch(action)
    if (r.ok) jobRef.current = currentJob(r.state) ?? jobRef.current
    else onError(r.message)
    return r
  }

  /** 空の行に入れたとき：部材を作り、選んでいる欄をその部材にする */
  const addFromEmpty = (part: Partial<Omit<Part, 'id'>>): boolean => {
    const r = run({ type: 'addPart', part: { name: '', expr: { W: '', H: '' }, quantity: null, ...part } })
    if (!r.ok || !r.id) return false
    const cur = selSRef.current
    if (cur && cur.partId === null) setSel({ partId: r.id, field: cur.field })
    return true
  }

  // ---------- 名前 ----------

  /** 名前を確定して保存する。保存できたら true（空の行なら部材を作る。空の名前のままなら何もしない） */
  const commitName = (row: number, draft: string): boolean => {
    const name = draft.trim()
    const part = jobRef.current.parts[row]
    if (!part) {
      if (name === '') return true
      const r = dispatch({ type: 'addPart', part: { name, expr: { W: '', H: '' }, quantity: null } })
      if (!r.ok) return nameFailed(r.message)
      jobRef.current = currentJob(r.state) ?? jobRef.current
      const cur = selSRef.current
      if (cur && cur.partId === null && r.id) setSel({ partId: r.id, field: cur.field })
    } else if (name !== part.name) {
      const r = dispatch({ type: 'updatePart', partId: part.id, patch: { name } })
      if (!r.ok) return nameFailed(r.message)
      jobRef.current = currentJob(r.state) ?? jobRef.current
    }
    setNameMsg(null)
    return true
  }
  const nameFailed = (message: string): false => {
    nameErrorRef.current = message
    setNameMsg(message)
    return false
  }

  const selectCell = (cell: TableCell | null) => {
    const prev = curCell()
    if (prev && cell && prev.row === cell.row && prev.field === cell.field) return
    setNameMsg(null)
    setRefMsg(null)
    onError(null)
    // 名前の欄から離れるときは、書きかけの名前を確定する（保存できなければ元に戻して理由を出す）
    if (prev?.field === 'name' && !commitName(prev.row, nameDraftRef.current)) {
      onError(`${nameErrorRef.current ?? '名前を保存できませんでした'}。名前は元に戻しました`)
    }
    if (!cell) {
      setSel(null)
      return
    }
    const ps = jobRef.current.parts
    const row = inputRow(cell.row, ps.length)
    const part = ps[row]
    setSel({ partId: part?.id ?? null, field: cell.field })
    // 入力しているセルを選ぶ（「次へ」で進むと、選ぶ枠も一緒に動く）
    selectRange(singleRange({ row, col: colOf(cell.field) }))
    if (cell.field === 'name') {
      setDraft(part?.name ?? '')
      return
    }
    // アプリのキーを出すときは、スマホのキーボードをしまう
    closeKeyboard()
    if (cell.field === 'qty') {
      setEquals(false)
      return
    }
    // 部材の寸法・調整寸法を使っている式は「＝」で始まった形で開く（仕様書 20.2）
    const raw = part?.expr[cell.field] ?? ''
    setEquals(opensAsFormula(raw))
    setCursor(formulaUnits(splitLeadingEquals(raw).rest).length)
  }
  const selectRef = useRef(selectCell)

  /** その部材の名前の入力を始める（押した操作の中で呼ぶ）。nextJob は操作のあとの仕事 */
  const editName = (nextJob: Job, partId: string) => {
    jobRef.current = nextJob
    const row = nextJob.parts.findIndex((p) => p.id === partId)
    if (row < 0) return
    // 先に表を描き直して名前の欄を作り、押した操作の中で注目を移す（スマホのキーボードが出るように）
    flushSync(() => {
      setSel({ partId, field: 'name' })
      selectRange(singleRange({ row, col: 0 }))
      setDraft(nextJob.parts[row].name)
      setNameMsg(null)
    })
    nameInputs.current.get(row)?.focus()
  }
  useImperativeHandle(ref, () => ({ editName }))

  /** 長押しのメニューの「行を上に挿入」：index の位置に空の行を入れて、その名前の入力を始める */
  const insertAbove = (index: number) => {
    const r = run({ type: 'insertPart', index, part: { name: '', expr: { W: '', H: '' }, quantity: null } })
    if (!r.ok || !r.id) return
    const next = currentJob(r.state)
    if (next) editName(next, r.id)
  }
  useEffect(() => {
    selectRef.current = selectCell
  })


  // 何も入っていない部材は表から外す（保存しない）。選んでいる部材は、入力の途中なので外さない
  const selPartId = selS?.partId ?? null
  useEffect(() => {
    for (const p of parts) if (isBlankPart(p) && p.id !== selPartId) dispatch({ type: 'removePart', partId: p.id })
  }, [parts, selPartId, dispatch])

  const padOpen = sel !== null && sel.field !== 'name'
  const anySel = sel !== null

  /** 「＝」で始めた W・H の入力中か（このときは長押しのメニューを出さない。セルを押すのは寸法を入れる操作なので） */
  const formulaPicking = () => {
    const c = curCell()
    return equalsRef.current && c !== null && (c.field === 'W' || c.field === 'H')
  }
  const formulaPickingRef = useRef(formulaPicking)
  useEffect(() => {
    formulaPickingRef.current = formulaPicking
  })

  // 欄を選んでいる間：表とキーの外を押したら閉じる。ほかの数字キーとは同時に開かない
  useEffect(() => {
    if (!anySel) return
    const onDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (tableRef.current?.contains(t) || padRef.current?.contains(t)) return
      // 「＝」で入力している間に調整寸法の表を押したら、入力は続ける（押した調整寸法を式に入れる。仕様書 21.2）
      if (formulaPickingRef.current() && adjustWrapRef.current?.contains(t)) return
      selectRef.current(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectRef.current(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anySel])
  useEffect(() => {
    if (!padOpen) return
    return claimOpen('pad', () => selectRef.current(null))
  }, [padOpen])

  // キーの高さ（表の下に同じだけ余白を足す）と、入力している行が見えるようにスクロールする
  const padH = usePadHeight(padRef, padOpen ? sel.field : null)
  useRevealRow(rowEls, padRef, selKey, padH)

  const onNameKey = (row: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換を確定する Enter は除く
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    if (!commitName(row, nameDraftRef.current)) return
    // キーボードの「次へ（改行）」：同じ行の W へ（アプリのキーを出す）
    selectCell({ row, field: 'W' })
    e.currentTarget.blur()
  }

  const onNameBlur = (row: number) => {
    const cur = curCell()
    if (!cur || cur.row !== row || cur.field !== 'name') return
    if (!commitName(row, nameDraftRef.current)) {
      // 保存できない名前は元に戻す（理由は出したまま）
      setDraft(jobRef.current.parts[row]?.name ?? '')
      setNameMsg((m) => (m ? `${m}。名前は元に戻しました` : m))
    }
  }

  // ---------- W・H・枚数 ----------

  const editExpr = (row: number, axis: Axis, e: Edit) => {
    setCursor(e.cursor)
    setRefMsg(null)
    const part = jobRef.current.parts[row]
    if (!part) {
      if (e.text.trim() !== '') addFromEmpty({ expr: { W: '', H: '', [axis]: e.text } })
      return
    }
    if (e.text !== part.expr[axis]) run({ type: 'updatePart', partId: part.id, patch: { expr: { ...part.expr, [axis]: e.text } } })
  }

  const pressQty = (row: number, key: string) => {
    const part = jobRef.current.parts[row]
    const q = quantityFromText(pressKey(quantityText(part?.quantity ?? null), key, false, true))
    if (!part) {
      if (q !== null) addFromEmpty({ quantity: q })
      return
    }
    if (q !== part.quantity) run({ type: 'updatePart', partId: part.id, patch: { quantity: q } })
  }

  /** 「次へ」：名前 → W → H → 枚数 → 次の行の名前（入力のまま）。名前に移るときはスマホのキーボードを出す */
  const goNext = () => {
    const cur = curCell()
    if (!cur) return
    startInput(nextCell(cur, jobRef.current.parts.length))
  }

  // ---------- 選ぶ・入力 ----------

  /** そのセルの入力を始める。名前は欄を作ってから、押した操作の中で注目を移す（スマホのキーボードが出るように） */
  const startInput = (cell: TableCell) => {
    if (cell.field !== 'name') {
      selectCell(cell)
      return
    }
    flushSync(() => selectCell(cell))
    nameInputs.current.get(inputRow(cell.row, jobRef.current.parts.length))?.focus()
  }

  /**
   * 「＝」で始めた入力中に、ほかのセルを押したとき（仕様書 20.2）：W・H なら その寸法（部材名.W）をカーソルの位置に入れる。
   * 入力しているセルはそのまま。名前の無い部材は入れずに知らせる。名前・枚数のセルは何もしない
   */
  const putRef = (editing: TableCell, row: number, field: TableField) => {
    if (field !== 'W' && field !== 'H') return
    if (editing.field !== 'W' && editing.field !== 'H') return
    const ps = jobRef.current.parts
    const target = ps[row]
    if (!target || !hasName(target)) {
      setRefMsg('名前の無い部材は式で使えません。先に名前を入れてください')
      return
    }
    const axis = editing.field
    const value = splitLeadingEquals(ps[editing.row]?.expr[axis] ?? '').rest
    editExpr(editing.row, axis, insertAt(value, cursor, `${target.name}.${field}`))
  }

  /** セルを押したとき：1回目は選ぶ、選んでいるセルをもう一度押すと入力（仕様書 17.1） */
  const pressCell = (row: number, field: TableField) => {
    const p = { row, col: colOf(field) }
    const editing = curCell()
    if (editing) {
      if (editing.row === row && editing.field === field) return
      // 「＝」で始めた W・H の入力中は、押したセルの寸法を式に入れる（入力は続ける）
      if (equalsRef.current && (editing.field === 'W' || editing.field === 'H')) {
        putRef(editing, row, field)
        return
      }
      // 入力中にほかのセルを押したら、入力を終えて そのセルを選ぶ
      selectCell(null)
      selectRange(singleRange(p))
      return
    }
    onError(null)
    setNotice(null)
    if (isSingleAt(rangeRef.current, p)) startInput({ row, field })
    else selectRange(singleRange(p))
  }

  /** 番号を押すと行全体、見出しを押すと列全体（入力中なら入力を終える） */
  const pressRow = (row: number) => {
    if (curCell()) selectCell(null)
    onError(null)
    setNotice(null)
    selectRange(rowRange(row))
  }
  const pressColumn = (col: number) => {
    if (curCell()) selectCell(null)
    onError(null)
    setNotice(null)
    selectRange(columnRange(jobRef.current, col))
  }

  // ---------- オートフィル・長押しのメニュー（仕様書 17.2・17.4。指の動きは useGrid） ----------

  /** オートフィルの取っ手を離したとき：引いた所まで同じ値をくり返して入れる */
  const fillDone = (from: CellRange, to: CellRange) => {
    const r = run({ type: 'fillCells', from, to })
    if (!r.ok) return
    setNotice(r.paste ? fillText(r.paste.pasted, r.paste.skipped, r.paste.renamed.length) : null)
    // 入れたあとは、引いた先まで選ぶ（エクセルと同じ。起点はそのまま）
    const a = activeRef.current
    selectRange(to, a && rangeHas(to, a) ? a : { row: to.top, col: to.left })
  }

  /** 長押しした所でメニューを開く。選んでいない所なら、そのセル（番号なら行全体）を選んでから */
  const openMenu = (at: PressAt) => {
    if (menuOpen) return
    if (curCell()) selectCell(null)
    const r = rangeRef.current
    if (at.col === null) {
      const whole = r !== null && r.left === 0 && r.cols === CELL_COLS.length && at.row >= r.top && at.row < r.top + r.rows
      if (!whole) selectRange(rowRange(at.row))
    } else {
      const p = { row: at.row, col: at.col }
      if (!r || !rangeHas(r, p)) selectRange(singleRange(p))
    }
    onError(null)
    setNotice(null)
    setMenuOpen(true)
    navigator.vibrate?.(10)
  }

  /**
   * 「＝」で始めた入力中に、調整寸法の表の行を押したとき（仕様書 21.2）：その調整寸法をカーソルの位置に入れる。
   * 書きかけの行（名前だけ・寸法だけ）は入れずに知らせる
   */
  const putAdjust = (row: AdjustRow) => {
    const editing = curCell()
    if (!editing || (editing.field !== 'W' && editing.field !== 'H')) return
    if (!isUsableAdjust(row)) {
      setRefMsg('名前と寸法をそろえると式で使えます')
      return
    }
    const axis = editing.field
    const value = splitLeadingEquals(jobRef.current.parts[editing.row]?.expr[axis] ?? '').rest
    editExpr(editing.row, axis, insertAt(value, cursor, `{n:${row.id}}`))
  }

  // ---------- 表示 ----------

  const dimsOf = (partId: string) => dims.parts.find((d) => d.partId === partId)
  const selPart = sel ? parts[sel.row] : undefined
  const selLabel = sel ? (selPart && hasName(selPart) ? selPart.name : `#${sel.row + 1}`) : ''
  const liveNameError =
    sel?.field === 'name'
      ? validatePartName(
          nameDraft.trim(),
          parts.filter((_, j) => j !== sel.row).map((p) => p.name),
        )
      : null
  const rowMsg = sel?.field === 'name' ? (nameMsg ?? liveNameError) : null

  const padAxis: Axis | null = sel && (sel.field === 'W' || sel.field === 'H') ? sel.field : null
  // 入力中の式に入っている部材（色の枠の番号。鍵はそろえた部材名）。入力していないときは空
  const editingExpr = padAxis && selPart ? splitLeadingEquals(selPart.expr[padAxis]).rest : ''
  const refColors = refColorsOf(editingExpr)
  const refCells = refCellsOf(editingExpr)
  // 式に入っている調整寸法（調整寸法の表の行に色の枠）
  const refAdjustIds = new Set(adjustIdsInExpr(editingExpr))
  /** 式に入っている部材のセルの色の枠（仕様書 20.2。エクセルと同じく部材ごとに色を変える） */
  const refFrame = (part: Part | undefined, axis: Axis): string => {
    if (!part || !hasName(part) || refColors.size === 0) return ''
    const key = normalizePartName(part.name)
    const c = refColors.get(key)
    return c !== undefined && refCells.has(`${key}.${axis}`) ? ` refc refc-${c}` : ''
  }
  /** 部材の1つの軸の寸法のエラー */
  const axisErrors = (partId: string, axis: Axis) => dimsOf(partId)?.errors.filter((x) => x.axis === axis) ?? []

  // 表に出す範囲（行が減って下にはみ出したら収める）
  const shown = range ? clampRange(range, rowCount) : null
  const shownEnd = shown ? rangeEnd(shown) : null

  // 取っ手と点線の印（オートフィルで新しく入れる所＝引いている間、切り取った元＝同じ仕事のとき）の位置
  const fillExt = dragging === 'fill' && fillTo && shown ? fillExtension(shown, fillTo) : null
  const cutKey = rangeKey(clip?.cut && clip.cut.jobId === job.id ? clampRange(clip.cut.range, rowCount) : null)
  const clipNow = clipText(clip)
  const { handleAt, fillBox, cutBox } = useGridBoxes(tableRef, rowEls, headEls, shown, rangeKey(fillExt), cutKey)

  const rows = Array.from({ length: rowCount }, (_, i) => i)
  const showHandles = shown !== null && shownEnd !== null && !anySel

  // 長押しのメニューの見出し：1つのセルは「天板 の W」、範囲は「3行×2列（2〜4行目）」
  const menuTitle = (() => {
    if (!shown) return ''
    if (shown.rows === 1 && shown.cols === 1) {
      const p = parts[shown.top]
      const name = p && hasName(p) ? p.name : p ? `#${shown.top + 1}` : `${shown.top + 1}行目（空）`
      return `${name} の ${FIELD_LABEL[CELL_COLS[shown.left]]}`
    }
    return rangeText(shown)
  })()

  return (
    <>
      {(notice || clipNow) && (
        <div className="pt-status" role="status" aria-live="polite">
          {notice && <p className="pt-notice">{notice}</p>}
          {clipNow && <p className="pt-clip">{clipNow}</p>}
        </div>
      )}
      <div
        className={`pt pt-edit${dragging ? ' dragging' : ''}`}
        ref={tableRef}
        role="table"
        aria-label="部材の表（仕上がり寸法）：押して選ぶ、もう一度押して入力、長押しでメニュー"
        {...grid.tableHandlers}
      >
        <div className="pt-row pt-head" role="row">
          <span role="columnheader" className="pt-hno">
            番号
          </span>
          {CELL_COLS.map((f, c) => (
            <span key={f} role="columnheader" className="pt-hwrap">
              <button
                type="button"
                ref={(el) => {
                  headEls.current[c] = el
                }}
                className={`pt-hcell${c === 0 ? ' left' : ''}${shown && c >= shown.left && c < shown.left + shown.cols ? ' hl' : ''}`}
                aria-label={`${f === 'W' || f === 'H' ? `${f}（${AXIS_SIDE[f]}）` : FIELD_LABEL[f]} の列を選ぶ`}
                onClick={() => pressColumn(c)}
              >
                {f === 'W' || f === 'H' ? (
                  // W は板の妻手・H は板の長手（仕様書 18.4）。375px に収まるよう下の段は小さく
                  <span className="pt-h2">
                    <span>{f}</span>
                    <span className="pt-h2-sub">{AXIS_SIDE[f]}</span>
                  </span>
                ) : (
                  FIELD_LABEL[f]
                )}
              </button>
            </span>
          ))}
        </div>
        {rows.map((i) => {
          const part = parts[i]
          const key = part ? part.id : `empty-${i}`
          const isSel = (f: TableField) => sel !== null && sel.row === i && sel.field === f
          const rowSel = sel !== null && sel.row === i
          const rowIn = shown !== null && i >= shown.top && i < shown.top + shown.rows
          const label = part && hasName(part) ? part.name : `#${i + 1}`
          const rowClass = [
            'pt-row',
            part ? 'part' : 'empty',
            part && part.quantity === null ? 'noqty' : '',
            part?.finishedDone ? 'done' : '',
            rowSel ? 'sel' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const cellPress = (f: TableField) => () => pressCell(i, f)
          // 選んでいる範囲の印：範囲の中は薄い色、外まわりに太い枠、起点（アクティブセル）は色なし
          const rangeCls = (f: TableField): string => {
            if (!shown || !shownEnd) return ''
            const p = { row: i, col: colOf(f) }
            if (!rangeHas(shown, p)) return ''
            const act = active !== null && active.row === i && active.col === p.col
            return [
              ' rs',
              p.row === shown.top ? ' et' : '',
              p.row === shownEnd.row ? ' eb' : '',
              p.col === shown.left ? ' el' : '',
              p.col === shownEnd.col ? ' er' : '',
              act ? ' act' : '',
            ].join('')
          }
          const inRange = (f: TableField) => shown !== null && rangeHas(shown, { row: i, col: colOf(f) })

          const numCell = (
            <button
              type="button"
              className={`pt-cell pt-no${part ? '' : ' muted'}${rowIn ? ' hl' : ''}`}
              data-row={i}
              aria-label={`${part ? label : `${i + 1}行目`} の行を選ぶ`}
              onClick={() => pressRow(i)}
            >
              <span className="num">{part && !hasName(part) ? `#${i + 1}` : i + 1}</span>
              {part?.rotatable && (
                <span className="pt-rot" aria-label="回転してよい">
                  ↺
                </span>
              )}
            </button>
          )

          // 名前の欄：入力しているときだけその場で入力できる欄（スマホのキーボード）。ふだんは押して選ぶボタン
          const nameCell = isSel('name') ? (
            <input
              ref={(el) => {
                if (el) nameInputs.current.set(i, el)
                else if (nameInputs.current.get(i) === el) nameInputs.current.delete(i)
              }}
              className={`pt-cell pt-name pt-input on${rowMsg ? ' bad' : ''}`}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="next"
              aria-label={`${i + 1}行目の名前`}
              value={nameDraft}
              onChange={(e) => {
                setDraft(e.target.value)
                setNameMsg(null)
              }}
              onKeyDown={(e) => onNameKey(i, e)}
              onBlur={() => onNameBlur(i)}
            />
          ) : (
            <button
              type="button"
              className={`pt-cell pt-name${rangeCls('name')}`}
              data-row={i}
              data-col={0}
              aria-label={`${i + 1}行目の名前：${part && hasName(part) ? part.name : '空'}`}
              aria-selected={inRange('name')}
              onClick={cellPress('name')}
            >
              {part && hasName(part) ? part.name : ''}
            </button>
          )

          const dimCellEl = (axis: Axis) => {
            const raw = part ? tableDimCell(part, dimsOf(part.id), axis, adjusts) : ({ kind: 'empty' } as const)
            // 入力中のセルは、式の書き方のエラーなど（errorsWhileEditing で出さないもの）だけなら赤い「エラー」にしない（仕様書 18.5）。
            // 入力を終えたら今までどおり「エラー」
            const c =
              raw.kind === 'error' && padOpen && isSel(axis) && part && errorsWhileEditing(axisErrors(part.id, axis)).length === 0
                ? ({ kind: 'empty' } as const)
                : raw
            const text =
              c.kind === 'empty' ? '' : c.kind === 'error' ? 'エラー' : c.kind === 'formula' ? `${fmt(c.value)} 式` : fmt(c.value)
            return (
              <button
                type="button"
                className={`pt-cell pt-dim${c.kind === 'error' ? ' bad' : ''}${isSel(axis) ? ' on' : ''}${rangeCls(axis)}${refFrame(part, axis)}`}
                data-row={i}
                data-col={colOf(axis)}
                aria-label={`${label} の ${axis}：${text || '空'}`}
                aria-selected={inRange(axis)}
                onClick={cellPress(axis)}
              >
                {c.kind === 'error' ? (
                  'エラー'
                ) : c.kind === 'empty' ? null : (
                  <>
                    <span className="num">{fmt(c.value)}</span>
                    {c.kind === 'formula' && (
                      <span className="pt-f" aria-hidden="true">
                        ƒ
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          }

          return (
            <div
              key={key}
              className="pt-item"
              role="rowgroup"
              ref={(el) => {
                if (el) rowEls.current.set(i, el)
                else if (rowEls.current.get(i) === el) rowEls.current.delete(i)
              }}
            >
              <div className={rowClass} role="row">
                {numCell}
                {nameCell}
                {dimCellEl('W')}
                {dimCellEl('H')}
                <button
                  type="button"
                  className={`pt-cell pt-qty num${isSel('qty') ? ' on' : ''}${rangeCls('qty')}`}
                  data-row={i}
                  data-col={3}
                  aria-label={`${label} の枚数：${part?.quantity ?? '空'}`}
                  aria-selected={inRange('qty')}
                  onClick={cellPress('qty')}
                >
                  {part?.quantity ?? ''}
                </button>
              </div>
              {rowSel && rowMsg && (
                <p className="pt-msg" role="alert">
                  {rowMsg}
                </p>
              )}
            </div>
          )
        })}
        <GridOverlay
          handleAt={showHandles ? handleAt : null}
          onHandleDown={grid.onHandleDown}
          fillBox={fillBox}
          fillLabel={shown && fillTo ? fillHint(shown, fillTo) : null}
          cutBox={cutBox}
        />
      </div>
      <button type="button" className="btn add-rows" onClick={addRows}>
        ＋ 5行足す
      </button>
      {/* 調整寸法の表（仕様書 21.1）。「＝」で入力している間は、行を押すとその調整寸法を式に入れる（仕様書 21.2） */}
      <div ref={adjustWrapRef}>
        <AdjustTable picking={padAxis !== null && equals ? putAdjust : null} refIds={refAdjustIds} onError={onError} />
      </div>
      {/* キーを出している間も、表を指でなぞって調整寸法の表までスクロールできるよう、キーの高さの余白を下に取る */}
      {padOpen && <div className="pt-spacer" style={{ height: padH }} aria-hidden="true" />}
      {menuOpen && shown && (
        <CellMenu
          job={job}
          range={shown}
          title={menuTitle}
          clip={clip}
          dispatch={dispatch}
          onClose={() => setMenuOpen(false)}
          onNotice={setNotice}
          onError={onError}
          onInsertAbove={insertAbove}
          onRowsDeleted={() => selectRange(singleRange({ row: shown.top, col: shown.left }))}
        />
      )}
      {padOpen &&
        sel &&
        createPortal(
          <div className="numpad pt-pad" ref={padRef} role="group" aria-label={`${selLabel} の ${FIELD_LABEL[sel.field]} のキー`}>
            <div className="numpad-in">
              {sel.field === 'qty' ? (
                <QtyKeys
                  key={`${sel.row}-qty`}
                  label={selLabel}
                  quantity={selPart?.quantity ?? null}
                  onKey={(k) => pressQty(sel.row, k)}
                  onNext={goNext}
                  onClose={() => selectCell(null)}
                />
              ) : (
                padAxis && (
                <ExprKeys
                  key={`${sel.row}-${padAxis}`}
                  label={selLabel}
                  axis={padAxis}
                  value={editingExpr}
                  cursor={cursor}
                  onEdit={(e) => editExpr(sel.row, padAxis, e)}
                  equals={equals}
                  onEquals={(on) => {
                    setRefMsg(null)
                    setEquals(on)
                  }}
                  refColors={refColors}
                  refMsg={refMsg}
                  finished={selPart ? dimsOf(selPart.id)?.finishedByAxis[padAxis] : undefined}
                  errors={selPart ? [...new Set(errorsWhileEditing(axisErrors(selPart.id, padAxis)).map((x) => x.message))] : []}
                  adjusts={adjusts}
                  onNext={goNext}
                  onClose={() => selectCell(null)}
                />
                )
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

interface ExprKeysProps {
  label: string
  axis: Axis
  value: string
  cursor: number
  onEdit: (e: Edit) => void
  equals: boolean
  onEquals: (on: boolean) => void
  refColors: ReadonlyMap<string, number>
  /** セルを押して寸法を入れられなかった理由 */
  refMsg: string | null
  finished: number | undefined
  errors: string[]
  adjusts: readonly Adjust[]
  onNext: () => void
  onClose: () => void
}

/** W・H のキー：上の1行に式の全文と計算した寸法（エラーなら赤で理由）、その下に式のボタン */
function ExprKeys({
  label,
  axis,
  value,
  cursor,
  onEdit,
  equals,
  onEquals,
  refColors,
  refMsg,
  finished,
  errors,
  adjusts,
  onNext,
  onClose,
}: ExprKeysProps) {
  const empty = value.trim() === ''
  const shownErrors = refMsg ? [refMsg] : empty ? [] : errors
  return (
    <>
      <div className="pt-show" aria-live="polite">
        <span className="pt-show-name">
          <span className="pt-show-label">{label}</span>
          <b>
            {axis}（{AXIS_SIDE[axis]}）
          </b>
        </span>
        <span className="pt-show-expr">
          {empty && !equals ? (
            <span className="pt-show-hint">数字か、＝ で式を入れる</span>
          ) : (
            // 式を押すと、押した所にカーソルが移る（仕様書 18.7）。「＝」で始めた入力は「＝」を付けて出す（仕様書 20.2）
            <FormulaView
              value={value}
              adjusts={adjusts}
              caret={cursor}
              equals={equals}
              refColors={refColors}
              onCaret={(c) => onEdit({ text: value, cursor: c })}
            />
          )}
          {equals && empty && <span className="pt-show-hint pick">部材の W・H か調整寸法の行を押すと入ります</span>}
        </span>
        {shownErrors.length > 0 ? (
          <span className="pt-show-err">{shownErrors.join('。')}</span>
        ) : (
          finished !== undefined && !empty && <span className="pt-show-val num">＝ {fmt(finished)}</span>
        )}
      </div>
      <FormulaKeys
        value={value}
        cursor={cursor}
        onEdit={onEdit}
        equals={equals}
        onEquals={onEquals}
        ariaLabel={`${axis} の式のボタン`}
        onNext={onNext}
        onClose={onClose}
      />
    </>
  )
}

interface QtyKeysProps {
  label: string
  quantity: number | null
  onKey: (key: string) => void
  onNext: () => void
  onClose: () => void
}

/**
 * 枚数のキー（仕様書 16.2）：W・H のキーと同じ並び・同じ高さ。数字・1字消す・全部消す・閉じる・次へ は同じ位置で、
 * 使わないキー（＝・記号・( )・◀▶・小数点）は薄く出して押せない（仕様書 20.1）
 */
function QtyKeys({ label, quantity, onKey, onNext, onClose }: QtyKeysProps) {
  return (
    <>
      <div className="pt-show" aria-live="polite">
        <span className="pt-show-name">
          <span className="pt-show-label">{label}</span>
          <b>枚数</b>
        </span>
        <span className="pt-show-expr num">{quantity ?? ''}</span>
        <span className="pt-show-val small">
          {quantity === null ? '空（木取りに入れません）' : quantity === 0 ? '寸法だけ（切らない）' : `${quantity}枚`}
        </span>
      </div>
      <FormulaKeys
        value=""
        cursor={0}
        onEdit={() => {}}
        numeric={{ onKey }}
        ariaLabel="枚数のボタン"
        onNext={onNext}
        onClose={onClose}
      />
    </>
  )
}
