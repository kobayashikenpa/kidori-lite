// W・H の式の入力（仕様書 5.4・6）。<input> を使わず式を見せる枠にするので、押してもスマホのキーボードは出ない。
// 枠を押すとボタンの並びが開き、カーソルが末尾に来る。部材の寸法・調整寸法・数字・記号のボタンだけで式を作る。
// 調整寸法は {n:調整寸法のid} として式に入れ、画面では メラミン1 のように見せる（「mm」は付けない）。
// kidori の ui/components/FormulaInput.tsx をもとに、材料の厚みを外し、軸を W・H に、ボタンを5列にしたもの
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { formulaLabels } from '../../engine/formula/display'
import { formulaUnits } from '../../engine/formula/units'
import type { Adjust, Axis, DimensionError, Part } from '../../engine/types'
import { claimOpen } from '../exclusive'
import { fmt } from '../format'
import { closeKeyboard } from '../keyboard'
import { scrollIntoComfort } from '../scroll'
import { FormulaKeys, FormulaView } from './FormulaKeys'

interface Props {
  axis: Axis
  value: string
  onChange: (v: string) => void
  /** 調整寸法（アプリ全体の一覧） */
  adjusts: readonly Adjust[]
  /** 参照ボタンに出す部材（編集中の部材自身は除く） */
  parts: readonly Part[]
  /** 参照ボタンに添える、部材ごとの仕上がり寸法（軸ごと。計算できない軸は無い） */
  finishedOf: (partId: string) => Partial<Record<Axis, number>>
  /** この欄の仕上がり寸法（計算できなければ null） */
  finished: number | null
  /** この欄の式のエラー */
  errors: DimensionError[]
  /** ボタンの並びを開いているか */
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FormulaInput({ axis, value, onChange, adjusts, parts, finishedOf, finished, errors, open, onOpenChange }: Props) {
  const id = `expr-${axis}`
  const units = formulaUnits(value)
  const labels = formulaLabels(value, adjusts)
  // カーソル＝単位の番号（0〜単位の数）
  const [cursorRaw, setCursor] = useState(units.length)
  const cursor = Math.min(cursorRaw, units.length)
  const fieldRef = useRef<HTMLDivElement>(null)
  const padRef = useRef<HTMLDivElement>(null)

  // ボタンの並びを開いたら、式の欄とボタンが見やすい位置に来るようにスクロールする
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      if (fieldRef.current && padRef.current) scrollIntoComfort(fieldRef.current, padRef.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  // 数字キーなど、ほかのボタンの並びとは同時に開かない
  const closeRef = useRef(onOpenChange)
  useEffect(() => {
    closeRef.current = onOpenChange
  })
  useEffect(() => {
    if (!open) return
    return claimOpen('pad', () => closeRef.current(false))
  }, [open])

  // ボタンを押しても注目が移らないようにする（画面が跳ねないように）
  const keep = (e: PointerEvent) => e.preventDefault()

  const openAtEnd = () => {
    closeKeyboard()
    setCursor(units.length)
    setErrFullFor(null)
    onOpenChange(true)
  }

  const spoken = labels.length > 0 ? labels.join(' ') : '空'
  const shownErrors = value.trim() === '' ? [] : errors
  const errorText = [...new Set(shownErrors.map((e) => e.message))].join('。')
  // エラーの全文を出しているか（押したときだけ。ふだんは1行に切り詰める）。文が変わったら1行に戻す
  const [errFullFor, setErrFullFor] = useState<string | null>(null)
  const errFull = shownErrors.length > 0 && errFullFor === errorText

  return (
    <div className="field expr-field" ref={fieldRef}>
      {/* 欄の上の1行：ふだんは仕上がりの値、エラーのときは同じ行に赤で出す（1行に切り詰め、押すと全文）。
          行の高さは変わらないので、エラーが出ても消えても下のボタンの位置がずれない */}
      <div className="expr-head">
        <span className="expr-axis" aria-hidden="true">
          {axis}
        </span>
        {shownErrors.length > 0 ? (
          <button
            type="button"
            className={`expr-err${errFull ? ' full' : ''}`}
            aria-expanded={errFull}
            onPointerDown={keep}
            onClick={() => setErrFullFor(errFull ? null : errorText)}
          >
            <span id={`${id}-err`} role="alert">
              {errorText}
            </span>
          </button>
        ) : (
          finished !== null && (
            <span className="expr-result num" aria-live="polite">
              仕上がり {fmt(finished)}
            </span>
          )
        )}
      </div>
      <button
        type="button"
        className={`expr-box${open ? ' active' : ''}${shownErrors.length > 0 ? ' bad' : ''}`}
        aria-describedby={shownErrors.length > 0 ? `${id}-err` : undefined}
        aria-expanded={open}
        aria-controls={`${id}-pad`}
        aria-label={`${axis} の式：${spoken}。押すとボタンで入力できます`}
        onClick={openAtEnd}
      >
        {units.length === 0 && !open && <span className="expr-placeholder">押して数値または式を入力</span>}
        <FormulaView value={value} adjusts={adjusts} caret={open ? cursor : undefined} />
      </button>
      {open && (
        <div ref={padRef}>
          <FormulaKeys
            id={`${id}-pad`}
            ariaLabel={`${axis} の式のボタン`}
            value={value}
            cursor={cursor}
            onEdit={(e) => {
              setCursor(e.cursor)
              if (e.text !== value) onChange(e.text)
            }}
            adjusts={adjusts}
            parts={parts}
            finishedOf={finishedOf}
            actions={
              <button type="button" className="pad-key done span3" onPointerDown={keep} onClick={() => onOpenChange(false)}>
                完了
              </button>
            }
          />
        </div>
      )}
    </div>
  )
}
