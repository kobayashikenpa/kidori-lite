// 部材の表（仕様書 15.1・15.2。［仕上がり］のタブ）：番号・名前・W・H・枚数。表の下にいつも空の行。
// 名前はその場でスマホのキーボード。W・H・枚数はスマホのキーボードを出さず、画面の下のアプリのキーで入れる（式も使える。枚数は数字だけ）。
// 入力はキーを押すたびに保存する。空の行に入れたときに部材を作り、何も入っていない部材は表から外す（保存しない）。
// 寸法の計算は engine（computeDimensions の結果を受け取る）。式の文字の編集は formulaEdit.ts
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { validatePartName } from '../../engine/formula/tokenize'
import { formulaUnits } from '../../engine/formula/units'
import { hasName, referableParts } from '../../engine/parts'
import type { Adjust, Axis, DimensionResult, Job, Part } from '../../engine/types'
import { currentJob, type ReduceResult, type StoreAction } from '../../store/reducer'
import { claimOpen } from '../exclusive'
import { fmt } from '../format'
import type { Edit } from '../formulaEdit'
import { closeKeyboard } from '../keyboard'
import { pressKey } from '../numpad'
import {
  inputRow,
  isBlankPart,
  nextCell,
  quantityFromText,
  quantityText,
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
  /** 「選んでコピー」で選んでいる部材（null は選んでいない） */
  picking: ReadonlySet<string> | null
  onTogglePick: (partId: string) => void
  /** 番号を押したとき（部材の編集シートを開く。U-12 でメニューに替える） */
  onOpenPart: (partId: string) => void
  onError: (message: string | null) => void
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

/** キーを押しても注目が移らないようにする（スマホのキーボードが出ない・画面が跳ねないように） */
const keep = (e: ReactPointerEvent) => e.preventDefault()

export function PartsTable({ job, dims, adjusts, dispatch, picking, onTogglePick, onOpenPart, onError }: Props) {
  const parts = job.parts
  const rowCount = tableRowCount(parts.length)
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
  const tableRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<HTMLDivElement>(null)
  const nameInputs = useRef(new Map<number, HTMLInputElement>())
  const rowEls = useRef(new Map<number, HTMLDivElement>())

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
    if (cell.field === 'name') {
      setDraft(part?.name ?? '')
      return
    }
    // アプリのキーを出すときは、スマホのキーボードをしまう
    closeKeyboard()
    if (cell.field !== 'qty') setCursor(formulaUnits(part?.expr[cell.field] ?? '').length)
  }
  const selectRef = useRef(selectCell)
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

  /** 「次へ」：名前 → W → H → 枚数 → 次の行の名前。名前に移るときはスマホのキーボードを出す */
  const goNext = () => {
    const cur = curCell()
    if (!cur) return
    const next = nextCell(cur, jobRef.current.parts.length)
    selectCell(next)
    // 押した操作の中で注目を移すと、スマホのキーボードが出る
    if (next.field === 'name') nameInputs.current.get(next.row)?.focus()
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

  const firstEmpty = parts.length
  const focusFirstEmptyName = () => nameInputs.current.get(firstEmpty)?.focus()

  const rows = Array.from({ length: rowCount }, (_, i) => i)

  return (
    <>
      <div className={`pt${picking ? ' picking' : ''}`} ref={tableRef} role="table" aria-label="部材の表（仕上がり寸法）">
        <div className="pt-row pt-head" role="row">
          <span role="columnheader">番号</span>
          <span role="columnheader">名前</span>
          <span role="columnheader">W</span>
          <span role="columnheader">H</span>
          <span role="columnheader">枚数</span>
        </div>
        {rows.map((i) => {
          const part = parts[i]
          const key = part ? part.id : `empty-${i}`
          const isSel = (f: TableField) => sel !== null && sel.row === i && sel.field === f
          const rowSel = sel !== null && sel.row === i
          const picked = part && picking ? picking.has(part.id) : false
          const label = part && hasName(part) ? part.name : `#${i + 1}`
          const rowClass = [
            'pt-row',
            part ? 'part' : 'empty',
            part && part.quantity === null ? 'noqty' : '',
            part?.finishedDone && !picking ? 'done' : '',
            picked ? 'picked' : '',
            rowSel ? 'sel' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const cellPress = (f: TableField) => () => {
            if (picking) {
              if (part) onTogglePick(part.id)
              return
            }
            selectCell({ row: i, field: f })
          }

          const numCell = picking ? (
            <button
              type="button"
              className={`pt-cell pt-no pt-pick${picked ? ' on' : ''}`}
              disabled={!part}
              aria-pressed={part ? picked : undefined}
              aria-label={part ? `${label} をコピーに選ぶ` : undefined}
              onClick={cellPress('name')}
            >
              {part && (
                <span className="check-box" aria-hidden="true">
                  {picked ? '✓' : ''}
                </span>
              )}
            </button>
          ) : part ? (
            <button
              type="button"
              className="pt-cell pt-no"
              aria-label={`${label} の編集（回転・複製・削除）`}
              onClick={() => {
                selectCell(null)
                onOpenPart(part.id)
              }}
            >
              <span className="num">{hasName(part) ? i + 1 : `#${i + 1}`}</span>
              {part.rotatable && (
                <span className="pt-rot" aria-label="回転してよい">
                  ↺
                </span>
              )}
            </button>
          ) : (
            <span className="pt-cell pt-no muted num" aria-hidden="true">
              {i + 1}
            </span>
          )

          // 名前の欄：部材の行といちばん上の空の行はその場で入力できる欄。ほかの空の行は押すといちばん上の空の行へ
          const nameCell =
            picking ? (
              <button type="button" className="pt-cell pt-name" disabled={!part} tabIndex={-1} onClick={cellPress('name')}>
                {part && hasName(part) ? part.name : ''}
              </button>
            ) : part || i === firstEmpty ? (
              <input
                ref={(el) => {
                  if (el) nameInputs.current.set(i, el)
                  else if (nameInputs.current.get(i) === el) nameInputs.current.delete(i)
                }}
                className={`pt-cell pt-name pt-input${isSel('name') ? ' on' : ''}${isSel('name') && rowMsg ? ' bad' : ''}`}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                enterKeyHint="next"
                aria-label={`${i + 1}行目の名前`}
                placeholder={part ? '' : '名前'}
                value={isSel('name') ? nameDraft : (part?.name ?? '')}
                onFocus={() => selectCell({ row: i, field: 'name' })}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setNameMsg(null)
                }}
                onKeyDown={(e) => onNameKey(i, e)}
                onBlur={() => onNameBlur(i)}
              />
            ) : (
              <button type="button" className="pt-cell pt-name" aria-label={`${i + 1}行目の名前`} onClick={focusFirstEmptyName} />
            )

          const dimCellEl = (axis: Axis) => {
            const c = part ? tableDimCell(part, dimsOf(part.id), axis, adjusts) : ({ kind: 'empty' } as const)
            const text =
              c.kind === 'empty' ? '' : c.kind === 'error' ? 'エラー' : c.kind === 'formula' ? `${fmt(c.value)} 式` : fmt(c.value)
            return (
              <button
                type="button"
                className={`pt-cell pt-dim${c.kind === 'error' ? ' bad' : ''}${isSel(axis) ? ' on' : ''}`}
                aria-label={`${label} の ${axis}：${text || '空'}`}
                disabled={picking !== null && !part}
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
                  className={`pt-cell pt-qty num${isSel('qty') ? ' on' : ''}`}
                  aria-label={`${label} の枚数：${part?.quantity ?? '空'}`}
                  disabled={picking !== null && !part}
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
      </div>
      {padOpen && <div className="pt-spacer" style={{ height: padH }} aria-hidden="true" />}
      {padOpen &&
        sel &&
        createPortal(
          <div className="numpad pt-pad" ref={padRef} role="group" aria-label={`${selLabel} の ${FIELD_LABEL[sel.field]} のキー`}>
            <div className="numpad-in">
              {sel.field === 'qty' ? (
                <QtyKeys
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
                  value={selPart?.expr[padAxis] ?? ''}
                  cursor={cursor}
                  onEdit={(e) => editExpr(sel.row, padAxis, e)}
                  finished={selPart ? dimsOf(selPart.id)?.finishedByAxis[padAxis] : undefined}
                  errors={selPart ? [...new Set(dimsOf(selPart.id)?.errors.filter((x) => x.axis === padAxis).map((x) => x.message))] : []}
                  adjusts={adjusts}
                  parts={referableParts(parts.filter((p) => p.id !== selPart?.id))}
                  finishedOf={(id) => dimsOf(id)?.finishedByAxis ?? {}}
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
  onNext: () => void
  onClose: () => void
}

/** W・H のキー：上の1行に式の全文と計算した寸法（エラーなら赤で理由）、その下に式のボタン */
function ExprKeys({ label, axis, value, cursor, onEdit, finished, errors, adjusts, parts, finishedOf, onNext, onClose }: ExprKeysProps) {
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
        actions={
          <>
            <button type="button" className="pad-key" onPointerDown={keep} onClick={onClose}>
              閉じる
            </button>
            <button type="button" className="pad-key done span2" onPointerDown={keep} onClick={onNext}>
              次へ
            </button>
          </>
        }
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

/** 枚数のキー：数字・1字消す・全部消す・次へ・閉じる だけ（式・部材のボタンは出さない） */
function QtyKeys({ label, quantity, onKey, onNext, onClose }: QtyKeysProps) {
  const key = (text: string, k: string) => (
    <button type="button" className="pad-key num" onPointerDown={keep} onClick={() => onKey(k)}>
      {text}
    </button>
  )
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
      <div className="pad-keys qty-keys">
        {key('7', '7')}
        {key('8', '8')}
        {key('9', '9')}
        <button type="button" className="pad-key" onPointerDown={keep} onClick={() => onKey('back')}>
          1字消す
        </button>
        {key('4', '4')}
        {key('5', '5')}
        {key('6', '6')}
        <button type="button" className="pad-key" onPointerDown={keep} onClick={() => onKey('clear')}>
          全部消す
        </button>
        {key('1', '1')}
        {key('2', '2')}
        {key('3', '3')}
        <button type="button" className="pad-key" onPointerDown={keep} onClick={onClose}>
          閉じる
        </button>
        <button type="button" className="pad-key num span3" onPointerDown={keep} onClick={() => onKey('0')}>
          0
        </button>
        <button type="button" className="pad-key done" onPointerDown={keep} onClick={onNext}>
          次へ
        </button>
      </div>
    </>
  )
}
