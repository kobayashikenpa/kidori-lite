// 部材の表の［調整］のタブ（第2.1版。仕様書 25.2・25.3・25.7）：［仕上がり］と同じ表の形（番号・名前・W・H・枚数）。
// W・H の欄は「調整の値 ｜ 調整後の寸法」（例：−メラミン1 ｜ 379）。調整が空の欄は仕上がり寸法を薄く、エラーは赤で「エラー」。
// 部材のある行だけ（空の行・「＋ 5行足す」は出さない。仕様書 25.9）。
// 操作は［仕上がり］と同じ：1回押して選ぶ・もう一度押して入力（W・H だけ。アプリのキー）・取っ手で範囲・番号で行・見出しで列・
// 長押しのメニュー（切り取り・コピー・貼り付け・クリアだけ。CellMenu の adjust）・オートフィル（指の動きは useGrid）。名前・枚数は見るだけ。
// 表の下に調整寸法の表（AdjustTable）を置き、W・H の入力中に欄が空か記号の後でその行を押すと、その調整寸法を入れる（仕様書 25.3・25.7）。
// 入力中にほかの部材の W・H を押したら、入れずに入力を終えてそのセルを選ぶ（調整に部材の寸法は使えない。仕様書 25.9）。
// 計算は engine（computeDimensions の adjustedByAxis）、欄に出すものは partsTable.ts の adjustDimCell、保存は store の setPartAdjust など
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isUsableAdjust } from '../../engine/adjusts'
import { columnRange, rowRange } from '../../engine/clipboard/cells'
import { formulaUnits } from '../../engine/formula/units'
import { adjustIdsInExpr } from '../../engine/formula/usages'
import { hasName } from '../../engine/parts'
import { CELL_COLS, type Adjust, type AdjustRow, type Axis, type CellClip, type CellRange, type DimensionResult, type Job } from '../../engine/types'
import { currentJob, type ReduceResult, type StoreAction } from '../../store/reducer'
import { CELL_COL_LABEL, clampRange, clipText, fillExtension, fillHint, fillText, isSingleAt, rangeEnd, rangeHas, rangeText, singleRange } from '../cellSelect'
import { claimOpen } from '../exclusive'
import { fmt } from '../format'
import { canInsertRef, insertAt, type Edit } from '../formulaEdit'
import { closeKeyboard } from '../keyboard'
import { adjustCellLabel, adjustDimCell, errorsWhileEditing, nextAdjustTabCell, type AdjustDimCell } from '../partsTable'
import { rangeKey, useOutsideEnd, usePadHeight, useRevealRow, useGrid, useGridBoxes, type PressAt } from '../useGrid'
import { AdjustTable } from './AdjustTable'
import { CellMenu } from './CellMenu'
import { FormulaKeys, FormulaView } from './FormulaKeys'
import { GridOverlay } from './GridOverlay'

interface Props {
  job: Job
  dims: DimensionResult
  adjusts: readonly Adjust[]
  /** 今コピー（切り取り）しているセル（アプリ全体で1つ。［仕上がり］のものは貼れない） */
  clip: CellClip | null
  dispatch: (action: StoreAction) => ReduceResult
  onError: (message: string | null) => void
}

/** 入力している欄（部材の id と W・H） */
interface Sel {
  partId: string
  axis: Axis
}
interface Cell {
  row: number
  axis: Axis
}

function cellOf(s: Sel | null, job: Job): Cell | null {
  if (!s) return null
  const row = job.parts.findIndex((p) => p.id === s.partId)
  return row < 0 ? null : { row, axis: s.axis }
}

const colOf = (axis: Axis): number => CELL_COLS.indexOf(axis)

export function PartAdjustTable({ job, dims, adjusts, clip, dispatch, onError }: Props) {
  const parts = job.parts
  const rowCount = parts.length
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selS, setSelS] = useState<Sel | null>(null)
  const sel = cellOf(selS, job)
  const selKey = sel ? `${sel.row}:${sel.axis}` : ''
  // 調整の式のカーソル（単位の番号）。同じ操作の中で続けて使えるよう手元にも持つ
  const [cursor, setCursorS] = useState(0)
  const cursorRef = useRef(0)
  const setCursor = (c: number) => {
    cursorRef.current = c
    setCursorS(c)
  }
  // 調整寸法の行を押して入れられなかった理由（キーの上の行に出す）
  const [refMsg, setRefMsg] = useState<string | null>(null)

  const jobRef = useRef(job)
  const selSRef = useRef(selS)
  useEffect(() => {
    jobRef.current = job
    selSRef.current = selS
  })
  const tableRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<HTMLDivElement>(null)
  const adjustWrapRef = useRef<HTMLDivElement>(null)
  const rowEls = useRef(new Map<number, HTMLDivElement>())
  const headEls = useRef<(HTMLButtonElement | null)[]>([])

  const setSel = (s: Sel | null) => {
    selSRef.current = s
    setSelS(s)
  }
  const curCell = () => cellOf(selSRef.current, jobRef.current)

  /** 押すと調整寸法が入るときか（W・H の入力中で、欄が空かカーソルのすぐ前が記号。仕様書 25.7） */
  const picking = (): boolean => {
    const c = curCell()
    if (!c) return false
    return canInsertRef(jobRef.current.parts[c.row]?.adjust[c.axis] ?? '', cursorRef.current)
  }

  const grid = useGrid({
    tableRef,
    rowEls,
    headEls,
    rowCount,
    colCount: CELL_COLS.length,
    onPressCell: (row, col) => pressCell(row, col),
    onPressRow: (row) => pressRow(row),
    onLongPress: (at) => openMenu(at),
    noLongPress: () => curCell() !== null,
    onFill: (from, to) => fillDone(from, to),
    onFillStart: () => onError(null),
    // ほかの表（調整寸法の表など）で選んだら、こちらの入力は終える
    onRelease: () => {
      if (curCell()) endRef.current()
    },
    resetKey: job.id,
  })
  const { range, active, rangeRef, activeRef, selectRange, dragging, fillTo } = grid

  const run = (action: StoreAction): ReduceResult => {
    const r = dispatch(action)
    if (r.ok) jobRef.current = currentJob(r.state) ?? jobRef.current
    else onError(r.message)
    return r
  }

  // ---------- 入力 ----------

  const endInput = () => {
    setSel(null)
    setRefMsg(null)
  }
  const endRef = useRef(endInput)
  useEffect(() => {
    endRef.current = endInput
  })

  /** そのセル（W・H）の入力を始める。カーソルは式の終わり */
  const startInput = (cell: Cell) => {
    const part = jobRef.current.parts[cell.row]
    if (!part) return
    closeKeyboard()
    onError(null)
    setNotice(null)
    setRefMsg(null)
    selectRange(singleRange({ row: cell.row, col: colOf(cell.axis) }))
    setSel({ partId: part.id, axis: cell.axis })
    setCursor(formulaUnits(part.adjust[cell.axis]).length)
  }

  /** キーを押すたびに保存する（setPartAdjust。読めない式もそのまま入れ、計算のエラーとして出す） */
  const editAdjust = (row: number, axis: Axis, e: Edit) => {
    setCursor(e.cursor)
    setRefMsg(null)
    const part = jobRef.current.parts[row]
    if (!part || e.text === part.adjust[axis]) return
    run({ type: 'setPartAdjust', partId: part.id, axis, text: e.text })
  }

  /**
   * 入力中に調整寸法の表の行を押したとき（仕様書 25.3・25.7）：欄が空かカーソルのすぐ前が記号なら、その調整寸法を入れて true。
   * 書きかけの行（名前だけ・寸法だけ）は入れずに知らせる（true）。それ以外は false（調整寸法の表がその行を選び、こちらの入力は終わる）
   */
  const putAdjust = (row: AdjustRow): boolean => {
    const c = curCell()
    if (!c) return false
    const text = jobRef.current.parts[c.row]?.adjust[c.axis] ?? ''
    if (!canInsertRef(text, cursorRef.current)) return false
    if (!isUsableAdjust(row)) {
      setRefMsg('名前と寸法をそろえると使えます')
      return true
    }
    editAdjust(c.row, c.axis, insertAt(text, cursorRef.current, `{n:${row.id}}`))
    return true
  }

  /** 「次へ」：W → H → 次の部材の W（入力のまま）。最後の部材の H の次は入力を終える */
  const goNext = () => {
    const c = curCell()
    if (!c) return
    const next = nextAdjustTabCell(c, jobRef.current.parts.length)
    if (next) startInput(next)
    else endInput()
  }

  // ---------- 選ぶ ----------

  /** セルを押したとき：1回目は選ぶ、選んでいる W・H をもう一度押すと入力（名前・枚数は見るだけ） */
  const pressCell = (row: number, col: number) => {
    const p = { row, col }
    const editing = curCell()
    if (editing) {
      if (editing.row === row && colOf(editing.axis) === col) return
      // 入力中にほかのセルを押したら（ほかの部材の W・H も。調整に部材の寸法は入れない）、入力を終えて そのセルを選ぶ
      endInput()
      selectRange(singleRange(p))
      return
    }
    onError(null)
    setNotice(null)
    const field = CELL_COLS[col]
    if (isSingleAt(rangeRef.current, p) && (field === 'W' || field === 'H')) startInput({ row, axis: field })
    else selectRange(singleRange(p))
  }

  /** 番号を押すと行全体、見出しを押すと列全体（入力中なら入力を終える） */
  const pressRow = (row: number) => {
    if (curCell()) endInput()
    onError(null)
    setNotice(null)
    selectRange(rowRange(row))
  }
  const pressColumn = (col: number) => {
    if (curCell()) endInput()
    onError(null)
    setNotice(null)
    selectRange(columnRange(jobRef.current, col))
  }

  /** オートフィル：引いた所まで同じ調整をくり返して入れる（W・H だけ。部材のある行まで） */
  const fillDone = (from: CellRange, to: CellRange) => {
    const r = run({ type: 'fillPartAdjustCells', from, to })
    if (!r.ok) return
    setNotice(r.paste ? fillText(r.paste.pasted, r.paste.skipped) : null)
    const a = activeRef.current
    selectRange(to, a && rangeHas(to, a) ? a : { row: to.top, col: to.left })
  }

  /** 長押しした所でメニューを開く。選んでいない所なら、そのセル（番号なら行全体）を選んでから */
  const openMenu = (at: PressAt) => {
    if (menuOpen) return
    if (curCell()) endInput()
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

  const padOpen = sel !== null
  // 入力している間：表・キー・（押すと入るときは）調整寸法の表の外を押したら入力を終える
  useOutsideEnd(
    padOpen,
    (t) => !!tableRef.current?.contains(t) || !!padRef.current?.contains(t) || (picking() && !!adjustWrapRef.current?.contains(t)),
    () => endRef.current(),
  )
  useEffect(() => {
    if (!padOpen) return
    return claimOpen('pad', () => endRef.current())
  }, [padOpen])
  const padH = usePadHeight(padRef, padOpen ? 'adjust' : null)
  useRevealRow(rowEls, padRef, selKey, padH)

  // ---------- 表示 ----------

  const dimsOf = (partId: string) => dims.parts.find((d) => d.partId === partId)
  const axisErrors = (partId: string, axis: Axis) => dimsOf(partId)?.errors.filter((x) => x.axis === axis) ?? []
  const selPart = sel ? parts[sel.row] : undefined
  const editingText = sel && selPart ? selPart.adjust[sel.axis] : ''
  const refIds = new Set(adjustIdsInExpr(editingText))
  const canPick = sel !== null && canInsertRef(editingText, cursor)

  const shown = range ? clampRange(range, rowCount) : null
  const shownEnd = shown ? rangeEnd(shown) : null
  const fillExt = dragging === 'fill' && fillTo && shown ? fillExtension(shown, fillTo) : null
  // 切り取った元の点線は、［調整］で切り取ったものだけ（［仕上がり］の切り取りは［仕上がり］の表に出す）
  const cutKey = rangeKey(clip?.cut && clip.source === 'adjust' && clip.cut.jobId === job.id ? clampRange(clip.cut.range, rowCount) : null)
  const clipNow = clipText(clip)
  const { handleAt, fillBox, cutBox } = useGridBoxes(tableRef, rowEls, headEls, shown, rangeKey(fillExt), cutKey)
  const showHandles = shown !== null && shownEnd !== null && !padOpen

  const menuTitle = (() => {
    if (!shown) return ''
    if (shown.rows === 1 && shown.cols === 1) {
      const p = parts[shown.top]
      const name = p && hasName(p) ? p.name : `#${shown.top + 1}`
      return `${name} の ${CELL_COL_LABEL[CELL_COLS[shown.left]]}（調整）`
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
      {parts.length === 0 ? (
        <p className="placeholder">部材はまだありません（［仕上がり］のタブで入れます）</p>
      ) : (
        <div
          className={`pt pt-edit adjtab${dragging ? ' dragging' : ''}`}
          ref={tableRef}
          role="table"
          aria-label="部材の表（調整）：押して選ぶ、もう一度押して入力、長押しでメニュー"
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
                  aria-label={`${CELL_COL_LABEL[f]} の列を選ぶ`}
                  onClick={() => pressColumn(c)}
                >
                  {CELL_COL_LABEL[f]}
                </button>
              </span>
            ))}
          </div>
          {parts.map((part, i) => {
            const d = dimsOf(part.id)
            const named = hasName(part)
            const label = named ? part.name : `#${i + 1}`
            const isSel = (axis: Axis) => sel !== null && sel.row === i && sel.axis === axis
            const rowIn = shown !== null && i >= shown.top && i < shown.top + shown.rows
            const rowClass = ['pt-row', 'part', part.quantity === null ? 'noqty' : '', sel?.row === i ? 'sel' : ''].filter(Boolean).join(' ')
            const rangeCls = (col: number): string => {
              if (!shown || !shownEnd) return ''
              const p = { row: i, col }
              if (!rangeHas(shown, p)) return ''
              const act = active !== null && active.row === i && active.col === col
              return [
                ' rs',
                p.row === shown.top ? ' et' : '',
                p.row === shownEnd.row ? ' eb' : '',
                p.col === shown.left ? ' el' : '',
                p.col === shownEnd.col ? ' er' : '',
                act ? ' act' : '',
              ].join('')
            }
            const inRange = (col: number) => shown !== null && rangeHas(shown, { row: i, col })

            const dimEl = (axis: Axis) => {
              const c = adjustDimCell(part, d, axis, adjusts)
              // 入力中のセルは、打っている途中に出やすいエラー（errorsWhileEditing で出さないもの）だけなら赤くせず、調整の値だけ出す（仕様書 18.5 と同じ）
              const typing = c.kind === 'error' && isSel(axis) && errorsWhileEditing(axisErrors(part.id, axis)).length === 0
              const typingLabel = c.kind === 'error' ? c.label : null
              const col = colOf(axis)
              return (
                <button
                  type="button"
                  className={`pt-cell pt-dim pa${c.kind === 'error' && !typing ? ' bad' : ''}${isSel(axis) ? ' on' : ''}${rangeCls(col)}`}
                  data-row={i}
                  data-col={col}
                  aria-label={`${label} の ${axis}（調整）：${adjustCellLabel(c)}`}
                  aria-selected={inRange(col)}
                  onClick={() => pressCell(i, col)}
                >
                  {typing ? typingLabel && <span className="pa-label num">{typingLabel}</span> : <AdjustCellBody cell={c} />}
                </button>
              )
            }

            return (
              <div
                key={part.id}
                className="pt-item"
                role="rowgroup"
                ref={(el) => {
                  if (el) rowEls.current.set(i, el)
                  else if (rowEls.current.get(i) === el) rowEls.current.delete(i)
                }}
              >
                <div className={rowClass} role="row">
                  <button
                    type="button"
                    className={`pt-cell pt-no${rowIn ? ' hl' : ''}`}
                    data-row={i}
                    aria-label={`${label} の行を選ぶ`}
                    onClick={() => pressRow(i)}
                  >
                    <span className="num">{named ? i + 1 : `#${i + 1}`}</span>
                    {part.rotatable && (
                      <span className="pt-rot" aria-label="回転してよい">
                        ↺
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`pt-cell pt-name${rangeCls(0)}`}
                    data-row={i}
                    data-col={0}
                    aria-label={`${i + 1}行目の名前：${named ? part.name : '空'}（見るだけ）`}
                    aria-selected={inRange(0)}
                    onClick={() => pressCell(i, 0)}
                  >
                    {named ? part.name : ''}
                  </button>
                  {dimEl('W')}
                  {dimEl('H')}
                  <button
                    type="button"
                    className={`pt-cell pt-qty num${rangeCls(3)}`}
                    data-row={i}
                    data-col={3}
                    aria-label={`${label} の枚数：${part.quantity ?? '空'}（見るだけ）`}
                    aria-selected={inRange(3)}
                    onClick={() => pressCell(i, 3)}
                  >
                    {part.quantity ?? ''}
                  </button>
                </div>
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
      )}
      {/* 調整寸法の表（仕様書 25.3）。押すと入る間は、行を押すとその調整寸法を調整の式に入れる */}
      <div ref={adjustWrapRef}>
        <AdjustTable picking={canPick ? putAdjust : null} refIds={refIds} onError={onError} />
      </div>
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
          adjust
        />
      )}
      {padOpen &&
        sel &&
        selPart &&
        createPortal(
          <div className="numpad pt-pad" ref={padRef} role="group" aria-label={`${hasName(selPart) ? selPart.name : `#${sel.row + 1}`} の ${sel.axis}（調整）のキー`}>
            <div className="numpad-in">
              <div className="pt-show" aria-live="polite">
                <span className="pt-show-name">
                  <span className="pt-show-label">{hasName(selPart) ? selPart.name : `#${sel.row + 1}`}</span>
                  <b className="adj-ink">{sel.axis} 調整</b>
                </span>
                <span className="pt-show-expr">
                  {editingText.trim() === '' ? (
                    <span className="pt-show-hint">− と調整寸法の行で入れる（空は調整なし）</span>
                  ) : (
                    <FormulaView
                      value={editingText}
                      adjusts={adjusts}
                      caret={cursor}
                      onCaret={(c) => editAdjust(sel.row, sel.axis, { text: editingText, cursor: c })}
                    />
                  )}
                </span>
                {(() => {
                  const errs = refMsg ? [refMsg] : [...new Set(errorsWhileEditing(axisErrors(selPart.id, sel.axis)).map((x) => x.message))]
                  const v = dimsOf(selPart.id)?.adjustedByAxis[sel.axis]
                  if (errs.length > 0) return <span className="pt-show-err">{errs.join('。')}</span>
                  return v !== undefined && <span className="pt-show-val num">調整後 {fmt(v)}</span>
                })()}
              </div>
              <FormulaKeys
                key={`${sel.row}-${sel.axis}`}
                value={editingText}
                cursor={cursor}
                onEdit={(e) => editAdjust(sel.row, sel.axis, e)}
                ariaLabel={`${sel.axis} の調整のボタン`}
                onNext={goNext}
                onClose={endInput}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** 欄の中身：調整の値を上に小さく、調整後の寸法を下に（375px の幅に収めるため2段）。調整が空なら仕上がり寸法を薄く */
function AdjustCellBody({ cell: c }: { cell: AdjustDimCell }) {
  switch (c.kind) {
    case 'empty':
      return null
    case 'finished':
      return <span className="num pa-fin">{fmt(c.value)}</span>
    case 'adjusted':
      return (
        <>
          <span className="pa-label num">{c.label}</span>
          <span className="num pa-val">{fmt(c.value)}</span>
        </>
      )
    case 'error':
      return (
        <>
          {c.label && <span className="pa-label num">{c.label}</span>}
          <span className="pa-err">エラー</span>
        </>
      )
  }
}
