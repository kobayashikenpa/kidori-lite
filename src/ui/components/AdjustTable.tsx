// 調整寸法の表（第1.7版。仕様書 21.1〜21.3）：部材の表の下に置く 番号・名前・寸法 の表。たたまない。
// 操作は部材の表と同じ：1回押して選ぶ・もう一度押して入力（名前はスマホのキーボード、寸法はアプリのキーの数字と小数点）・
// 「次へ」で 名前 → 寸法 → 次の行の名前・取っ手で範囲・番号で行全体・見出しで列全体・長押しのメニュー・オートフィル（指の動きは useGrid）。
// 初めは5行、いちばん下に入れたら1行増え、「＋ 5行足す」で増やせる（足した行はアプリを開いている間だけ）。
// 入力は確定したとき（次へ・閉じる・ほかを押したとき）に保存する。ほかの仕事で使っている調整寸法が変わる・消えるときは確かめてから
// （store の adjustTableOutcome → engine の adjustChangeUsages）。
// 部材の表で「＝」で入力している間（picking）は、行（名前か寸法のセル）を押すとその調整寸法を式に入れる（仕様書 21.2）
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { adjustChangeUsages, adjustConflict, adjustValueText, duplicateAdjustMessage, isBlankAdjustRow, isUsableAdjust } from '../../engine/adjusts'
import { adjustCellText, adjustColumnRange, adjustRowRange, selectedAdjustIds } from '../../engine/clipboard/adjustCells'
import { ADJUST_COLS, type AdjustCol, type AdjustRow, type AppData, type CellRange } from '../../engine/types'
import { newId } from '../../store/jobs'
import { adjustTableOutcome, type AdjustTableAction, type ReduceResult } from '../../store/reducer'
import { useJobStore } from '../../store/useJobStore'
import {
  ADJUST_COL_LABEL,
  adjustAddRowsMin,
  adjustConfirmText,
  adjustInputRow,
  adjustRowCount,
  adjustRowLabel,
  nextAdjustCell,
  sessionAdjustMinRows,
  setSessionAdjustMinRows,
} from '../adjustTable'
import { clampRange, clipText, fillExtension, fillHint, fillText, isSingleAt, pasteText, rangeEnd, rangeHas, rangeText, singleRange } from '../cellSelect'
import { claimOpen } from '../exclusive'
import { closeKeyboard } from '../keyboard'
import { pressKey } from '../numpad'
import { rangeKey, useOutsideEnd, usePadHeight, useRevealRow, useGrid, useGridBoxes, type PressAt } from '../useGrid'
import { FormulaKeys } from './FormulaKeys'
import { GridOverlay } from './GridOverlay'
import { Help } from './Help'
import { Sheet } from './Sheet'

interface Props {
  /** 部材の表で「＝」で入力している間：押した行の調整寸法を式に入れる（入れられるかは呼ぶ側が決める）。それ以外は null */
  picking: ((row: AdjustRow) => void) | null
  /** 入力中の式に入っている調整寸法（その行に色の枠） */
  refIds: ReadonlySet<string>
  onError: (message: string | null) => void
}

/** 入力しているセル（行の id と列）。rowId が null なら いちばん上の空の行 */
interface Sel {
  rowId: string | null
  col: AdjustCol
}
interface Cell {
  row: number
  col: AdjustCol
}

function cellOf(s: Sel | null, rows: readonly AdjustRow[]): Cell | null {
  if (!s) return null
  if (s.rowId === null) return { row: rows.length, col: s.col }
  const row = rows.findIndex((r) => r.id === s.rowId)
  return row < 0 ? null : { row, col: s.col }
}

const colOf = (c: AdjustCol): number => ADJUST_COLS.indexOf(c)

/** 確かめてから行う操作（ほかの仕事で使っている調整寸法が変わる・消えるとき。行を削除はいつも） */
interface Confirm {
  text: string
  ok: string
  run: () => void
}

export function AdjustTable({ picking, refIds, onError }: Props) {
  const { state, data, dispatch } = useJobStore()
  const rows = data.adjusts
  // 「＋ 5行足す」で増やした行の数の下限（アプリを開いている間だけ。保存しない）
  const [minRows, setMinRows] = useState(sessionAdjustMinRows)
  const rowCount = adjustRowCount(rows.length, minRows)
  const addRows = () => {
    const next = adjustAddRowsMin(rows.length, minRows)
    setSessionAdjustMinRows(next)
    setMinRows(next)
  }

  const [selS, setSelS] = useState<Sel | null>(null)
  const sel = cellOf(selS, rows)
  const selKey = sel ? `${sel.row}:${sel.col}` : ''
  const [nameDraft, setNameDraftS] = useState('')
  const [valueDraft, setValueDraftS] = useState('')
  // 保存できなかった理由（名前は行の下、寸法はキーの上に出す）
  const [msg, setMsg] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  // 同じ操作の中で続けて使えるよう、最新の保存データ・入力しているセル・書きかけを手元にも持つ
  const dataRef = useRef<AppData>(data)
  const jobIdRef = useRef(state.currentJobId)
  const selSRef = useRef(selS)
  const nameDraftRef = useRef('')
  const valueDraftRef = useRef('')
  const pickingRef = useRef(picking)
  useEffect(() => {
    dataRef.current = data
    jobIdRef.current = state.currentJobId
    selSRef.current = selS
    pickingRef.current = picking
  })
  const setSel = (s: Sel | null) => {
    selSRef.current = s
    setSelS(s)
  }
  const setNameDraft = (t: string) => {
    nameDraftRef.current = t
    setNameDraftS(t)
  }
  const setValueDraft = (t: string) => {
    valueDraftRef.current = t
    setValueDraftS(t)
  }
  const latestRows = () => dataRef.current.adjusts
  const curCell = () => cellOf(selSRef.current, latestRows())

  const tableRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<HTMLDivElement>(null)
  const nameInputs = useRef(new Map<number, HTMLInputElement>())
  const rowEls = useRef(new Map<number, HTMLDivElement>())
  const headEls = useRef<(HTMLButtonElement | null)[]>([])

  const grid = useGrid({
    tableRef,
    rowEls,
    headEls,
    rowCount,
    colCount: ADJUST_COLS.length,
    onPressCell: (row, col) => pressCell(row, col),
    onPressRow: (row) => pressRow(row),
    onLongPress: (at) => openMenu(at),
    noLongPress: () => pickingRef.current !== null,
    onFill: (from, to) => fillDone(from, to),
    onFillStart: () => onError(null),
    // 部材の表で選んだら、こちらの入力は終える
    onRelease: () => {
      if (curCell()) leaveRef.current(endInput)
    },
  })
  const { range, active, rangeRef, activeRef, selectRange, dragging, fillTo } = grid

  // ---------- 保存（確かめてから） ----------

  /** 1回の操作を当てる。失敗したら理由を出す */
  const exec = (action: Parameters<typeof dispatch>[0]): ReduceResult => {
    const r = dispatch(action)
    if (r.ok) dataRef.current = r.state.data
    else onError(r.message)
    return r
  }

  /**
   * 調整寸法の表の操作。ほかの仕事で使っている調整寸法が変わる・消えるなら、確かめてから当てる（仕様書 21.3）。
   * make は当てるときに操作を作る（確かめている間に行の位置が変わっても合うように）。
   * 結果：'done' 当てた／'pending' 確かめている（OK で当てて onDone）／'fail' 当てられない（理由は返す）
   */
  const guarded = (
    make: () => AdjustTableAction,
    onDone: (r: Extract<ReduceResult, { ok: true }>) => void,
    always?: { text: string; ok: string },
  ): { kind: 'done' } | { kind: 'pending' } | { kind: 'fail'; message: string } => {
    const d = dataRef.current
    const out = adjustTableOutcome(d, make(), newId)
    if (!out.ok) return { kind: 'fail', message: out.message }
    const usage = adjustChangeUsages(d.jobs, d.adjusts, out.adjusts, jobIdRef.current)
    const text = adjustConfirmText(usage, out.adjusts, jobIdRef.current)
    const apply = () => {
      const r = exec(make())
      if (r.ok) onDone(r)
    }
    if (text || always) {
      setConfirm({
        text: [text, always?.text].filter(Boolean).join('。'),
        ok: always?.ok ?? '変える',
        run: apply,
      })
      return { kind: 'pending' }
    }
    apply()
    return { kind: 'done' }
  }

  // ---------- 入力 ----------

  const endInput = () => {
    setSel(null)
    setMsg(null)
  }

  /**
   * 入力しているセルを確定して、then を行う。確かめが要るときは入力を終えて確かめ、OK のあとに then。
   * stay なら、保存できないとき入力を続けて理由を出す（then はしない）。stay でなければ元に戻して理由を出し、then を行う
   */
  const leave = (then: () => void, stay = false) => {
    const cur = curCell()
    if (!cur) {
      then()
      return
    }
    const rowsNow = latestRows()
    const row = rowsNow[cur.row] as AdjustRow | undefined
    const text = cur.col === 'name' ? nameDraftRef.current : valueDraftRef.current
    const same = cur.col === 'name' ? text.trim() === (row?.name ?? '') : text === adjustCellText(rowsNow, cur)
    if (same) {
      then()
      return
    }
    const rowId = row?.id ?? null
    const col = cur.col
    const make = (): AdjustTableAction => {
      const now = latestRows()
      const i = rowId === null ? now.length : now.findIndex((r) => r.id === rowId)
      return { type: 'setAdjustCell', pos: { row: i < 0 ? now.length : i, col }, text }
    }
    const r = guarded(make, (res) => {
      // 空の行に入れたら、その行を入力しているセルにする（続けて「次へ」で寸法へ）
      const s = selSRef.current
      if (s && s.rowId === null && res.id) setSel({ rowId: res.id, col: s.col })
      then()
    })
    if (r.kind === 'done') return
    if (r.kind === 'pending') {
      endInput()
      return
    }
    if (stay) {
      setMsg(r.message)
      return
    }
    onError(`${r.message}。元に戻しました`)
    then()
  }
  const leaveRef = useRef(leave)
  useEffect(() => {
    leaveRef.current = leave
  })

  /** そのセルの入力を始める。名前は欄を作ってから、押した操作の中で注目を移す（スマホのキーボードが出るように） */
  const startInput = (cell: Cell) => {
    const now = latestRows()
    const row = adjustInputRow(cell.row, now.length)
    const r = now[row] as AdjustRow | undefined
    const next: Sel = { rowId: r?.id ?? null, col: cell.col }
    setMsg(null)
    onError(null)
    setNotice(null)
    if (cell.col === 'name') {
      flushSync(() => {
        selectRange(singleRange({ row, col: 0 }))
        setSel(next)
        setNameDraft(r?.name ?? '')
      })
      nameInputs.current.get(row)?.focus()
      return
    }
    // アプリのキーを出すときは、スマホのキーボードをしまう
    closeKeyboard()
    selectRange(singleRange({ row, col: 1 }))
    setSel(next)
    setValueDraft(adjustValueText(r?.value ?? null))
  }

  /** セルを押したとき：1回目は選ぶ、選んでいるセルをもう一度押すと入力（部材の表と同じ） */
  const pressCell = (row: number, colIndex: number) => {
    const col = ADJUST_COLS[colIndex]
    // 部材の表で「＝」で入力している間は、押した行の調整寸法を式に入れる（空の行は何もしない）
    const pick = pickingRef.current
    if (pick) {
      const r = latestRows()[row] as AdjustRow | undefined
      if (r) pick(r)
      return
    }
    const p = { row, col: colIndex }
    const editing = curCell()
    if (editing) {
      if (editing.row === row && editing.col === col) return
      // 入力中にほかのセルを押したら、入力を終えて そのセルを選ぶ
      leave(() => {
        endInput()
        selectRange(singleRange(p))
      })
      return
    }
    onError(null)
    setNotice(null)
    if (isSingleAt(rangeRef.current, p)) startInput({ row, col })
    else selectRange(singleRange(p))
  }

  /** 番号を押すと行全体、見出しを押すと列全体（入力中なら入力を終える） */
  const pressRow = (row: number) => {
    if (pickingRef.current) return
    leave(() => {
      endInput()
      onError(null)
      setNotice(null)
      selectRange(adjustRowRange(row))
    })
  }
  const pressColumn = (col: number) => {
    if (pickingRef.current) return
    leave(() => {
      endInput()
      onError(null)
      setNotice(null)
      selectRange(adjustColumnRange(latestRows(), col))
    })
  }

  /** 名前の欄の Enter（キーボードの「次へ」）：確定して同じ行の寸法へ */
  const onNameKey = (row: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換を確定する Enter は除く
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    const input = e.currentTarget
    leave(() => {
      startInput({ row, col: 'value' })
      input.blur()
    }, true)
  }
  /** 名前の欄から離れたとき（キーボードを閉じた・ほかを押した）：確定して入力を終える（選んだまま） */
  const onNameBlur = (row: number) => {
    const cur = curCell()
    if (!cur || cur.row !== row || cur.col !== 'name') return
    leave(endInput)
  }

  /** 寸法のキー：数字・小数点・1字消す・全部消す */
  const pressValue = (k: string) => {
    setMsg(null)
    setValueDraft(pressKey(valueDraftRef.current, k, false, false))
  }
  /** 「次へ」：名前 → 寸法 → 次の行の名前（入力のまま） */
  const goNext = () => {
    const cur = curCell()
    if (!cur) return
    leave(() => startInput(nextAdjustCell(cur, latestRows().length)), true)
  }
  const close = () => leave(endInput, true)

  // 名前も寸法も空の行は表から外す（保存しない）。入力している行と、選んでいる範囲の行（行を上に挿入で足した空の行など）は外さない。
  // 範囲より上の行を外したときは、範囲もその分だけ上にずらす（部材の表と同じ）
  const selRowId = selS?.rowId ?? null
  const rangeTop = range?.top ?? -1
  const rangeRows = range?.rows ?? 0
  useEffect(() => {
    const blank = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => isBlankAdjustRow(r) && r.id !== selRowId && !(i >= rangeTop && i < rangeTop + rangeRows))
    if (blank.length === 0) return
    const res = dispatch({ type: 'removeAdjusts', adjustIds: blank.map(({ r }) => r.id) })
    if (!res.ok) return
    dataRef.current = res.state.data
    const above = blank.filter(({ i }) => i < rangeTop).length
    const cur = rangeRef.current
    const a = activeRef.current
    if (cur && above > 0) selectRange({ ...cur, top: cur.top - above }, a ? { row: a.row - above, col: a.col } : undefined)
  }, [rows, selRowId, rangeTop, rangeRows, dispatch, rangeRef, activeRef, selectRange])

  const padOpen = sel !== null && sel.col === 'value'
  const anySel = sel !== null

  // 入力している間：表とキーの外を押したら入力を終える（ほかの表のセルは押したことが決まってから。useOutsideEnd）
  useOutsideEnd(
    anySel,
    (t) => !!tableRef.current?.contains(t) || !!padRef.current?.contains(t),
    () => leaveRef.current(endInput),
  )
  useEffect(() => {
    if (!padOpen) return
    return claimOpen('pad', () => leaveRef.current(endInput))
  }, [padOpen])

  const padH = usePadHeight(padRef, padOpen ? 'value' : null)
  useRevealRow(rowEls, padRef, selKey, padH)

  // ---------- オートフィル・長押しのメニュー ----------

  /** オートフィルの取っ手を離したとき（ほかの仕事で使っている調整寸法が変わるなら確かめてから） */
  const fillDone = (from: CellRange, to: CellRange) => {
    const r = guarded(
      () => ({ type: 'fillAdjustCells', from, to }),
      (res) => {
        setNotice(res.adjustPaste ? fillText(res.adjustPaste.pasted, res.adjustPaste.skipped, res.adjustPaste.renamed.length) : null)
        const a = activeRef.current
        selectRange(to, a && rangeHas(to, a) ? a : { row: to.top, col: to.left })
      },
    )
    if (r.kind === 'fail') onError(r.message)
  }

  /** 長押しした所でメニューを開く。選んでいない所なら、そのセル（番号なら行全体）を選んでから */
  const openMenu = (at: PressAt) => {
    if (menuOpen) return
    leave(() => {
      endInput()
      const r = rangeRef.current
      if (at.col === null) {
        const whole = r !== null && r.left === 0 && r.cols === ADJUST_COLS.length && at.row >= r.top && at.row < r.top + r.rows
        if (!whole) selectRange(adjustRowRange(at.row))
      } else {
        const p = { row: at.row, col: at.col }
        if (!r || !rangeHas(r, p)) selectRange(singleRange(p))
      }
      onError(null)
      setNotice(null)
      setMenuOpen(true)
      navigator.vibrate?.(10)
    })
  }

  // ---------- 表示 ----------

  const shown = range ? clampRange(range, rowCount) : null
  const shownEnd = shown ? rangeEnd(shown) : null
  const clip = data.adjustClip
  const clipNow = clipText(clip)
  const fillExt = dragging === 'fill' && fillTo && shown ? fillExtension(shown, fillTo) : null
  const cutKey = rangeKey(clip?.cut ? clampRange(clip.cut, rowCount) : null)
  const selRow = sel ? (rows[sel.row] as AdjustRow | undefined) : undefined
  const liveNameError =
    sel?.col === 'name' && nameDraft.trim() !== '' && selRow?.value != null
      ? (() => {
          const same = adjustConflict(rows, { name: nameDraft, value: selRow.value }, selRow.id)
          return same ? duplicateAdjustMessage(same) : null
        })()
      : null
  const rowMsg = sel?.col === 'name' ? (msg ?? liveNameError) : null
  const { handleAt, fillBox, cutBox } = useGridBoxes(tableRef, rowEls, headEls, shown, rangeKey(fillExt), cutKey)
  const showHandles = shown !== null && shownEnd !== null && !anySel && picking === null
  const lines = Array.from({ length: rowCount }, (_, i) => i)

  const menuTitle = (() => {
    if (!shown) return ''
    if (shown.rows === 1 && shown.cols === 1) return `${adjustRowLabel(rows[shown.top], shown.top)} の ${ADJUST_COL_LABEL[ADJUST_COLS[shown.left]]}`
    return rangeText(shown)
  })()

  return (
    <section className="adj" aria-label="調整寸法">
      <h2 className="adj-title">
        <Help title="調整寸法">
          メラミン・シート・逃げ・ほぞ など、仕上がり寸法を伸ばしたり短くしたりする寸法です。どの仕事でも同じ表を使います。名前と寸法の両方を入れた行が、式で「メラミン1」のように使えます（寸法は 0 より大きい数）。操作は部材の表と同じで、セルを1回押すと選び、もう一度押すと入力できます（名前はスマホのキーボード、寸法はアプリのキー）。長押しでメニュー、右下の四角い取っ手でオートフィル。同じ名前と寸法になるときは、名前の後ろに ②③… を付けます。部材の W・H をキーの「＝」から入力している間に、この表の行を押すと、その調整寸法が式に入ります。ほかの仕事でも使っている調整寸法を変える・消すときは、確かめてから変えます。
        </Help>
      </h2>
      {(notice || clipNow) && (
        <div className="pt-status" role="status" aria-live="polite">
          {notice && <p className="pt-notice">{notice}</p>}
          {clipNow && <p className="pt-clip">{clipNow}</p>}
        </div>
      )}
      <div
        className={`pt pt-edit adj-table${dragging ? ' dragging' : ''}${picking ? ' picking' : ''}`}
        ref={tableRef}
        role="table"
        aria-label="調整寸法の表：押して選ぶ、もう一度押して入力、長押しでメニュー"
        {...grid.tableHandlers}
      >
        <div className="pt-row pt-head" role="row">
          <span role="columnheader" className="pt-hno">
            番号
          </span>
          {ADJUST_COLS.map((c, i) => (
            <span key={c} role="columnheader" className="pt-hwrap">
              <button
                type="button"
                ref={(el) => {
                  headEls.current[i] = el
                }}
                className={`pt-hcell${i === 0 ? ' left' : ''}${shown && i >= shown.left && i < shown.left + shown.cols ? ' hl' : ''}`}
                aria-label={`${ADJUST_COL_LABEL[c]} の列を選ぶ`}
                onClick={() => pressColumn(i)}
              >
                {ADJUST_COL_LABEL[c]}
              </button>
            </span>
          ))}
        </div>
        {lines.map((i) => {
          const row = rows[i] as AdjustRow | undefined
          const key = row ? row.id : `empty-${i}`
          const isSel = (c: AdjustCol) => sel !== null && sel.row === i && sel.col === c
          const rowSel = sel !== null && sel.row === i
          const rowIn = shown !== null && i >= shown.top && i < shown.top + shown.rows
          const usable = row !== undefined && isUsableAdjust(row)
          const label = adjustRowLabel(row, i)
          const ref = row && refIds.has(row.id) ? ' refc refa' : ''
          const rangeCls = (c: AdjustCol): string => {
            if (!shown || !shownEnd) return ''
            const p = { row: i, col: colOf(c) }
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
          const inRange = (c: AdjustCol) => shown !== null && rangeHas(shown, { row: i, col: colOf(c) })
          const valueText = isSel('value') ? valueDraft : adjustValueText(row?.value ?? null)

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
              <div className={`pt-row${row ? '' : ' empty'}${row && !usable ? ' adj-draft' : ''}${rowSel ? ' sel' : ''}`} role="row">
                <button
                  type="button"
                  className={`pt-cell pt-no${row ? '' : ' muted'}${rowIn ? ' hl' : ''}`}
                  data-row={i}
                  aria-label={`${label} の行を選ぶ`}
                  onClick={() => pressRow(i)}
                >
                  <span className="num">{i + 1}</span>
                </button>
                {isSel('name') ? (
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
                    aria-label={`調整寸法 ${i + 1}行目の名前`}
                    value={nameDraft}
                    onChange={(e) => {
                      setNameDraft(e.target.value)
                      setMsg(null)
                    }}
                    onKeyDown={(e) => onNameKey(i, e)}
                    onBlur={() => onNameBlur(i)}
                  />
                ) : (
                  <button
                    type="button"
                    className={`pt-cell pt-name${rangeCls('name')}${ref}`}
                    data-row={i}
                    data-col={0}
                    aria-label={`調整寸法 ${i + 1}行目の名前：${row?.name || '空'}`}
                    aria-selected={inRange('name')}
                    onClick={() => pressCell(i, 0)}
                  >
                    {row?.name ?? ''}
                  </button>
                )}
                <button
                  type="button"
                  className={`pt-cell pt-dim adj-value${isSel('value') ? ' on' : ''}${rangeCls('value')}${ref}`}
                  data-row={i}
                  data-col={1}
                  aria-label={`調整寸法 ${i + 1}行目の寸法：${valueText || '空'}`}
                  aria-selected={inRange('value')}
                  onClick={() => pressCell(i, 1)}
                >
                  {valueText !== '' && <span className="num">{valueText}</span>}
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
      {padOpen && <div className="pt-spacer" style={{ height: padH }} aria-hidden="true" />}
      {menuOpen && shown && (
        <AdjustMenu
          title={menuTitle}
          range={shown}
          rows={rows}
          clipText={clipNow}
          hasClip={clip !== null}
          onClose={() => setMenuOpen(false)}
          onCopy={(cut) => {
            const r = exec(cut ? { type: 'cutAdjustCells', range: shown } : { type: 'copyAdjustCells', range: shown })
            if (r.ok) setNotice(cut ? '切り取りました。貼る所を長押し→貼り付け' : 'コピーしました。貼る所を長押し→貼り付け')
          }}
          onPaste={() => {
            const r = guarded(
              () => ({ type: 'pasteAdjustCells', range: shown }),
              (res) => setNotice(res.adjustPaste ? pasteText(res.adjustPaste.pasted, res.adjustPaste.skipped, res.adjustPaste.renamed.length) : '貼りました'),
            )
            if (r.kind === 'fail') onError(r.message)
          }}
          onClear={() => {
            const r = guarded(
              () => ({ type: 'clearAdjustCells', range: shown }),
              () => setNotice('クリアしました'),
            )
            if (r.kind === 'fail') onError(r.message)
          }}
          onInsertAbove={() => {
            const r = exec({ type: 'insertAdjustRow', index: shown.top })
            if (r.ok && r.id) startInput({ row: shown.top, col: 'name' })
          }}
          onDelete={() => {
            const ids = selectedAdjustIds(rows, shown)
            const what = ids.length === 1 ? `「${adjustRowLabel(rows.find((x) => x.id === ids[0]), shown.top)}」` : `${ids.length}行`
            const r = guarded(
              () => ({ type: 'deleteAdjustRows', range: shown }),
              () => {
                setNotice(`${ids.length}行を削除しました`)
                selectRange(singleRange({ row: shown.top, col: shown.left }))
              },
              { text: `${what}を削除しますか？`, ok: '削除する' },
            )
            if (r.kind === 'fail') onError(r.message)
          }}
        />
      )}
      {confirm && (
        <Sheet title="確認" onClose={() => setConfirm(null)}>
          <div className="confirm-box stack" role="alertdialog" aria-label="調整寸法の確認">
            <p className="confirm-text">{confirm.text}</p>
            <div className="foot">
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                やめる
              </button>
              <button
                type="button"
                className={`btn solid ${confirm.ok === '削除する' ? 'danger' : 'primary'}`}
                onClick={() => {
                  const run = confirm.run
                  setConfirm(null)
                  run()
                }}
              >
                {confirm.ok}
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {padOpen &&
        sel &&
        createPortal(
          <div className="numpad pt-pad" ref={padRef} role="group" aria-label={`${adjustRowLabel(selRow, sel.row)} の寸法のキー`}>
            <div className="numpad-in">
              <div className="pt-show" aria-live="polite">
                <span className="pt-show-name">
                  <span className="pt-show-label">{selRow?.name || `${sel.row + 1}行目`}</span>
                  <b>寸法</b>
                </span>
                <span className="pt-show-expr num">
                  {valueDraft}
                  {valueDraft !== '' && <span className="unit"> mm</span>}
                </span>
                {msg ? (
                  <span className="pt-show-err">{msg}</span>
                ) : (
                  <span className="pt-show-val small">数字と小数点だけ</span>
                )}
              </div>
              <FormulaKeys
                value=""
                cursor={0}
                onEdit={() => {}}
                numeric={{ onKey: pressValue, decimal: true }}
                ariaLabel="調整寸法の寸法のボタン"
                onNext={goNext}
                onClose={close}
              />
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}

interface MenuProps {
  title: string
  range: CellRange
  rows: readonly AdjustRow[]
  clipText: string | null
  hasClip: boolean
  onClose: () => void
  onCopy: (cut: boolean) => void
  onPaste: () => void
  onClear: () => void
  onInsertAbove: () => void
  onDelete: () => void
}

/** 調整寸法の表の長押しのメニュー（部材の表の CellMenu の 切り取り・コピー・貼り付け・クリア・行を上に挿入・行を削除 と同じ並び） */
function AdjustMenu({ title, range, rows, clipText: clipNow, hasClip, onClose, onCopy, onPaste, onClear, onInsertAbove, onDelete }: MenuProps) {
  const hasRows = selectedAdjustIds(rows, range).length > 0
  const canInsert = range.top < rows.length
  // メニューを閉じてから行う（確かめが要るときは、閉じたあとに確認を出す）
  const then = (f: () => void) => () => {
    onClose()
    f()
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="cm-group">
        <div className="cm-keys four">
          <button type="button" className="btn" onClick={then(() => onCopy(true))}>
            切り取り
          </button>
          <button type="button" className="btn" onClick={then(() => onCopy(false))}>
            コピー
          </button>
          <button type="button" className="btn primary" disabled={!hasClip} onClick={then(onPaste)}>
            貼り付け
          </button>
          <button type="button" className="btn" disabled={!hasRows} onClick={then(onClear)}>
            クリア
          </button>
        </div>
        <p className="cm-clip">{clipNow ?? 'コピーしたものはありません'}</p>
      </div>
      <div className="cm-keys two">
        <button type="button" className="btn" disabled={!canInsert} onClick={then(onInsertAbove)}>
          行を上に挿入
        </button>
        <button type="button" className="btn danger" disabled={!hasRows} onClick={then(onDelete)}>
          行を削除
        </button>
      </div>
    </Sheet>
  )
}
