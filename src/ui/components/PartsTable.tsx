// 部材の表（仕様書 15.1・15.2・17.1。［仕上がり］のタブ）：番号・名前・W・H・枚数。表の下にいつも空の行。
// セルを1回押すと選ぶ（太い枠）、選んでいるセルをもう一度押すと入力（第1.3版）。角の丸い取っ手を引くと範囲が広がる。
// 番号を押すと行全体、見出しを押すと列全体を選ぶ。範囲は engine の CellRange（left 0＝名前 … 3＝枚数）で持つ。
// 名前はその場でスマホのキーボード。W・H・枚数はスマホのキーボードを出さず、画面の下のアプリのキーで入れる（式も使える。枚数は数字だけ）。
// 入力はキーを押すたびに保存する。空の行に入れたときに部材を作り、何も入っていない部材は表から外す（保存しない）。
// 寸法の計算は engine（computeDimensions の結果を受け取る）。式の文字の編集は formulaEdit.ts
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { validatePartName } from '../../engine/formula/tokenize'
import { formulaUnits } from '../../engine/formula/units'
import { columnRange, rowRange } from '../../engine/clipboard/cells'
import { hasName, referableParts } from '../../engine/parts'
import { CELL_COLS, type Adjust, type Axis, type CellRange, type DimensionResult, type Job, type Part } from '../../engine/types'
import { currentJob, type ReduceResult, type StoreAction } from '../../store/reducer'
import {
  clampRange,
  fixedCorner,
  isSingleAt,
  keepActive,
  rangeEnd,
  rangeHas,
  singleRange,
  spanRange,
  type GridPoint,
} from '../cellSelect'
import { claimOpen } from '../exclusive'
import { fmt } from '../format'
import type { Edit } from '../formulaEdit'
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
  tableDimCell,
  tableRowCount,
  type TableCell,
  type TableField,
} from '../partsTable'
import { FormulaKeys, FormulaView } from './FormulaKeys'

interface Props {
  job: Job
  dims: DimensionResult
  adjusts: readonly Adjust[]
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

/** 欄の列の位置（0＝名前 … 3＝枚数） */
const colOf = (f: TableField): number => CELL_COLS.indexOf(f)

/** 取っ手を引いて表の上下の端に近づいたら、表を少しずつスクロールする（端からの距離 px と、1こまの最大の動き px） */
const EDGE_ZONE = 48
const EDGE_STEP = 18

const sameRange = (a: CellRange | null, b: CellRange | null) =>
  a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.rows === b.rows && a.cols === b.cols)

/** キーを押しても注目が移らないようにする（スマホのキーボードが出ない・画面が跳ねないように） */
const keep = (e: ReactPointerEvent) => e.preventDefault()

export function PartsTable({ job, dims, adjusts, dispatch, onError, ref }: Props) {
  const parts = job.parts
  // 「＋ 5行足す」で増やした行の数の下限（アプリを開いている間だけ、仕事ごとに覚える。保存しない）
  const [minRows, setMinRows] = useState(() => sessionTableMinRows(job.id))
  const [minRowsJob, setMinRowsJob] = useState(job.id)
  // 選んでいる範囲と、その起点（アクティブセル）。入力していないときも選んだまま（仕様書 17.1）
  const [range, setRangeS] = useState<CellRange | null>(null)
  const [active, setActiveS] = useState<GridPoint | null>(null)
  if (minRowsJob !== job.id) {
    setMinRowsJob(job.id)
    setMinRows(sessionTableMinRows(job.id))
    setRangeS(null)
    setActiveS(null)
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
  const [padH, setPadH] = useState(0)

  // 同じ操作の中で続けて使えるよう、最新の仕事と選んでいる欄を手元にも持つ
  const jobRef = useRef(job)
  const selSRef = useRef(selS)
  useEffect(() => {
    jobRef.current = job
    selSRef.current = selS
  })
  const rangeRef = useRef(range)
  const activeRef = useRef(active)
  useEffect(() => {
    rangeRef.current = range
    activeRef.current = active
  })
  const tableRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<HTMLDivElement>(null)
  const nameInputs = useRef(new Map<number, HTMLInputElement>())
  const rowEls = useRef(new Map<number, HTMLDivElement>())
  const headEls = useRef<(HTMLButtonElement | null)[]>([])

  /** 範囲を選ぶ（起点は指定が無ければ左上） */
  const selectRange = (r: CellRange, a: GridPoint = { row: r.top, col: r.left }) => {
    if (!sameRange(rangeRef.current, r)) {
      rangeRef.current = r
      setRangeS(r)
    }
    const cur = activeRef.current
    if (!cur || cur.row !== a.row || cur.col !== a.col) {
      activeRef.current = a
      setActiveS(a)
    }
  }

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
    if (cell.field !== 'qty') setCursor(formulaUnits(part?.expr[cell.field] ?? '').length)
  }
  const selectRef = useRef(selectCell)

  useImperativeHandle(ref, () => ({
    editName(nextJob, partId) {
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
    },
  }))
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

  // 欄を選んでいる間：表とキーの外を押したら閉じる。ほかの数字キーとは同時に開かない
  useEffect(() => {
    if (!anySel) return
    const onDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (tableRef.current?.contains(t) || padRef.current?.contains(t)) return
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

  // キーの高さ（表の下に同じだけ余白を足して、いちばん下の行もキーの上に出せるようにする）
  const padField = padOpen ? sel.field : null
  useEffect(() => {
    const el = padRef.current
    if (!padField || !el) return
    const measure = () => setPadH(el.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [padField])

  // 選んでいる行が、上の見出しとキー（名前のときはスマホのキーボード）の間に見えるようにスクロールする
  useEffect(() => {
    if (!selKey) return
    const row = Number(selKey.split(':')[0])
    const reveal = () => {
      const rowEl = rowEls.current.get(row)
      if (!rowEl) return
      const vv = window.visualViewport
      const viewTop = vv ? vv.offsetTop : 0
      const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
      const head = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0
      const top = Math.max(viewTop, head)
      const bottom = padRef.current ? Math.min(viewBottom, padRef.current.getBoundingClientRect().top) : viewBottom
      const r = rowEl.getBoundingClientRect()
      const margin = 8
      let delta = 0
      if (r.bottom > bottom - margin) delta = r.bottom - (bottom - margin)
      if (r.top - delta < top + margin) delta = r.top - (top + margin)
      if (Math.abs(delta) < 1) return
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      window.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' })
    }
    const frame = requestAnimationFrame(reveal)
    // 名前の欄：スマホのキーボードが出て見えている範囲が変わったら、もう一度合わせる
    const vv = window.visualViewport
    vv?.addEventListener('resize', reveal)
    return () => {
      cancelAnimationFrame(frame)
      vv?.removeEventListener('resize', reveal)
    }
  }, [selKey, padH])

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

  /** セルを押したとき：1回目は選ぶ、選んでいるセルをもう一度押すと入力（仕様書 17.1） */
  const pressCell = (row: number, field: TableField) => {
    const p = { row, col: colOf(field) }
    const editing = curCell()
    if (editing) {
      if (editing.row === row && editing.field === field) return
      // 入力中にほかのセルを押したら、入力を終えて そのセルを選ぶ
      selectCell(null)
      selectRange(singleRange(p))
      return
    }
    onError(null)
    if (isSingleAt(rangeRef.current, p)) startInput({ row, field })
    else selectRange(singleRange(p))
  }

  /** 番号を押すと行全体、見出しを押すと列全体（入力中なら入力を終える） */
  const pressRow = (row: number) => {
    if (curCell()) selectCell(null)
    onError(null)
    selectRange(rowRange(row))
  }
  const pressColumn = (col: number) => {
    if (curCell()) selectCell(null)
    onError(null)
    selectRange(columnRange(jobRef.current, col))
  }

  // ---------- 取っ手（範囲を広げる・縮める） ----------

  const dragRef = useRef<{
    id: number
    fixed: GridPoint
    x: number
    y: number
    raf: number
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const rowCountRef = useRef(rowCount)
  useEffect(() => {
    rowCountRef.current = rowCount
  })

  /** 画面の位置にある表のセル（表の外なら、いちばん近い行・列） */
  const pointAt = (x: number, y: number): GridPoint => {
    let row = 0
    for (let i = 0; i < rowCountRef.current; i++) {
      const el = rowEls.current.get(i)?.firstElementChild
      if (!el) continue
      row = i
      if (el.getBoundingClientRect().bottom > y) break
    }
    let col = 0
    for (let c = 1; c < CELL_COLS.length; c++) {
      const el = headEls.current[c]
      if (el && x >= el.getBoundingClientRect().left) col = c
    }
    return { row, col }
  }

  const dragTo = () => {
    const d = dragRef.current
    const a = activeRef.current
    if (!d) return
    const r = spanRange(d.fixed, pointAt(d.x, d.y))
    selectRange(r, a ? keepActive(a, r, d.fixed) : d.fixed)
  }

  /** 引いている間：指が表の上下の端（上の見出し・下のタブの近く）にあれば、少しずつスクロールする */
  const edgeScroll = () => {
    const d = dragRef.current
    if (!d) return
    const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + EDGE_ZONE
    const bottom = (document.querySelector('.tabbar')?.getBoundingClientRect().top ?? window.innerHeight) - EDGE_ZONE
    let dy = 0
    if (d.y < top) dy = -Math.min(EDGE_STEP, Math.ceil((top - d.y) / 3))
    else if (d.y > bottom) dy = Math.min(EDGE_STEP, Math.ceil((d.y - bottom) / 3))
    if (dy !== 0) {
      window.scrollBy(0, dy)
      dragTo()
    }
    d.raf = requestAnimationFrame(edgeScroll)
  }

  /** 引き終わり（指を離した・取り消された） */
  const endDrag = () => {
    const d = dragRef.current
    if (!d) return
    cancelAnimationFrame(d.raf)
    window.removeEventListener('pointermove', d.move)
    window.removeEventListener('pointerup', d.up)
    window.removeEventListener('pointercancel', d.up)
    dragRef.current = null
    setDragging(false)
  }

  // 取っ手は範囲が変わると別の行に描き直されるので、指の動きは画面全体（window）で追う
  const onHandleDown = (which: 'start' | 'end') => (e: ReactPointerEvent<HTMLSpanElement>) => {
    const r = rangeRef.current
    if (!r) return
    e.preventDefault()
    e.stopPropagation()
    endDrag()
    const id = e.pointerId
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || ev.pointerId !== id) return
      d.x = ev.clientX
      d.y = ev.clientY
      dragTo()
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId === id) endDrag()
    }
    dragRef.current = { id, fixed: fixedCorner(r, which), x: e.clientX, y: e.clientY, raf: requestAnimationFrame(edgeScroll), move, up }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    setDragging(true)
  }
  const endDragRef = useRef(endDrag)
  useEffect(() => {
    endDragRef.current = endDrag
  })
  useEffect(() => () => endDragRef.current(), [])

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

  const firstEmpty = parts.length
  // 表に出す範囲（行が減って下にはみ出したら収める）
  const shown = range ? clampRange(range, rowCount) : null
  const shownEnd = shown ? rangeEnd(shown) : null

  // 取っ手の位置（表の左上からの px）：範囲の左上の角と右下の角。行の要素と見出しの列の要素から測る。
  // 取っ手は表に1つずつ置き、引いている間に描き直されても同じ要素のままにする（iPhone で指の動きが途切れないように）
  type Corners = { top: number; bottom: number; left: number; right: number }
  const [handleAt, setHandleAt] = useState<Corners | null>(null)
  const handleTop = shown?.top ?? -1
  const handleBottom = shownEnd?.row ?? -1
  const handleLeft = shown?.left ?? -1
  const handleRight = shownEnd?.col ?? -1
  useLayoutEffect(() => {
    const measure = () => {
      const topEl = rowEls.current.get(handleTop)?.firstElementChild
      const botEl = rowEls.current.get(handleBottom)?.firstElementChild
      const leftEl = headEls.current[handleLeft]
      const rightEl = headEls.current[handleRight]
      const table = tableRef.current
      let next: Corners | null = null
      if (topEl && botEl && leftEl && rightEl && table) {
        const t = table.getBoundingClientRect()
        next = {
          top: topEl.getBoundingClientRect().top - t.top,
          bottom: botEl.getBoundingClientRect().bottom - t.top,
          left: leftEl.getBoundingClientRect().left - t.left,
          right: rightEl.getBoundingClientRect().right - t.left,
        }
      }
      setHandleAt((cur) =>
        cur && next && cur.top === next.top && cur.bottom === next.bottom && cur.left === next.left && cur.right === next.right ? cur : next,
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined' || !tableRef.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(tableRef.current)
    return () => ro.disconnect()
  }, [handleTop, handleBottom, handleLeft, handleRight, rowCount, parts, rowMsg])

  const rows = Array.from({ length: rowCount }, (_, i) => i)
  const showHandles = shown !== null && shownEnd !== null && !anySel

  return (
    <>
      <div
        className={`pt pt-edit${dragging ? ' dragging' : ''}`}
        ref={tableRef}
        role="table"
        aria-label="部材の表（仕上がり寸法）：押して選ぶ、もう一度押して入力"
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
                aria-label={`${FIELD_LABEL[f]} の列を選ぶ`}
                onClick={() => pressColumn(c)}
              >
                {FIELD_LABEL[f]}
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
              placeholder="名前"
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
              aria-label={`${i + 1}行目の名前：${part && hasName(part) ? part.name : '空'}`}
              aria-selected={inRange('name')}
              onClick={cellPress('name')}
            >
              {part && hasName(part) ? part.name : i === firstEmpty ? <span className="pt-ph">名前</span> : ''}
            </button>
          )

          const dimCellEl = (axis: Axis) => {
            const c = part ? tableDimCell(part, dimsOf(part.id), axis, adjusts) : ({ kind: 'empty' } as const)
            const text =
              c.kind === 'empty' ? '' : c.kind === 'error' ? 'エラー' : c.kind === 'formula' ? `${fmt(c.value)} 式` : fmt(c.value)
            return (
              <button
                type="button"
                className={`pt-cell pt-dim${c.kind === 'error' ? ' bad' : ''}${isSel(axis) ? ' on' : ''}${rangeCls(axis)}`}
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
        {showHandles && handleAt && (
          <>
            <span
              key="start"
              className="pt-handle start"
              style={{ left: handleAt.left - 22, top: handleAt.top - 22 }}
              aria-hidden="true"
              onPointerDown={onHandleDown('start')}
            >
              <span className="pt-dot" />
            </span>
            <span
              key="end"
              className="pt-handle end"
              style={{ left: handleAt.right - 30, top: handleAt.bottom - 22 }}
              aria-hidden="true"
              onPointerDown={onHandleDown('end')}
            >
              <span className="pt-dot" />
            </span>
          </>
        )}
      </div>
      <button type="button" className="btn add-rows" onClick={addRows}>
        ＋ 5行足す
      </button>
      {padOpen && <div className="pt-spacer" style={{ height: padH }} aria-hidden="true" />}
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
                  adjusts={adjusts}
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
                  value={selPart?.expr[padAxis] ?? ''}
                  cursor={cursor}
                  onEdit={(e) => editExpr(sel.row, padAxis, e)}
                  finished={selPart ? dimsOf(selPart.id)?.finishedByAxis[padAxis] : undefined}
                  errors={selPart ? [...new Set(dimsOf(selPart.id)?.errors.filter((x) => x.axis === padAxis).map((x) => x.message))] : []}
                  adjusts={adjusts}
                  parts={referableParts(parts.filter((p) => p.id !== selPart?.id))}
                  finishedOf={(id) => dimsOf(id)?.finishedByAxis ?? {}}
                  onAddAdjust={(draft) => {
                    const r = run({ type: 'addAdjust', ...draft })
                    return r.ok && r.id ? { ok: true, id: r.id } : { ok: false, message: r.ok ? '追加できませんでした' : r.message }
                  }}
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
  finished: number | undefined
  errors: string[]
  adjusts: readonly Adjust[]
  parts: Parameters<typeof FormulaKeys>[0]['parts']
  finishedOf: (partId: string) => Partial<Record<Axis, number>>
  onAddAdjust: NonNullable<Parameters<typeof FormulaKeys>[0]['onAddAdjust']>
  onNext: () => void
  onClose: () => void
}

/** 「閉じる」「次へ」（W・H・枚数で同じ位置） */
function PadActions({ onNext, onClose }: { onNext: () => void; onClose: () => void }) {
  return (
    <>
      <button type="button" className="pad-key" onPointerDown={keep} onClick={onClose}>
        閉じる
      </button>
      <button type="button" className="pad-key done span2" onPointerDown={keep} onClick={onNext}>
        次へ
      </button>
    </>
  )
}

/** W・H のキー：上の1行に式の全文と計算した寸法（エラーなら赤で理由）、その下に式のボタン */
function ExprKeys({
  label,
  axis,
  value,
  cursor,
  onEdit,
  finished,
  errors,
  adjusts,
  parts,
  finishedOf,
  onAddAdjust,
  onNext,
  onClose,
}: ExprKeysProps) {
  const empty = value.trim() === ''
  const shownErrors = empty ? [] : errors
  return (
    <>
      <div className="pt-show" aria-live="polite">
        <span className="pt-show-name">
          {label} <b>{axis}</b>
        </span>
        <span className="pt-show-expr">
          {empty ? <span className="pt-show-hint">数字か式を入れる</span> : <FormulaView value={value} adjusts={adjusts} caret={cursor} />}
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
        adjusts={adjusts}
        parts={parts}
        finishedOf={finishedOf}
        ariaLabel={`${axis} の式のボタン`}
        onAddAdjust={onAddAdjust}
        actions={<PadActions onNext={onNext} onClose={onClose} />}
      />
    </>
  )
}

interface QtyKeysProps {
  label: string
  quantity: number | null
  adjusts: readonly Adjust[]
  onKey: (key: string) => void
  onNext: () => void
  onClose: () => void
}

/**
 * 枚数のキー（仕様書 16.2）：W・H のキーと同じ並び・同じ高さ。数字・1字消す・全部消す・閉じる・次へ は同じ位置で、
 * 使わないキー（部材｜調整寸法のタブ・記号・◀▶・小数点）は薄く出して押せない
 */
function QtyKeys({ label, quantity, adjusts, onKey, onNext, onClose }: QtyKeysProps) {
  return (
    <>
      <div className="pt-show" aria-live="polite">
        <span className="pt-show-name">
          {label} <b>枚数</b>
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
        adjusts={adjusts}
        parts={[]}
        finishedOf={() => ({})}
        quantity={{ onKey }}
        ariaLabel="枚数のボタン"
        actions={<PadActions onNext={onNext} onClose={onClose} />}
      />
    </>
  )
}
