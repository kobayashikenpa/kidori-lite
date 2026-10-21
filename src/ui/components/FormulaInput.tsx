// W・H の式の入力（仕様書 5.4・6）。<input> を使わず式を見せる枠にするので、押してもスマホのキーボードは出ない。
// 枠を押すとボタンの並びが開き、カーソルが末尾に来る。部材の寸法・調整寸法・数字・記号のボタンだけで式を作る。
// 調整寸法は {n:調整寸法のid} として式に入れ、画面では メラミン1 のように見せる（「mm」は付けない）。
// kidori の ui/components/FormulaInput.tsx をもとに、材料の厚みを外し、軸を W・H に、ボタンを5列にしたもの
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { adjustName } from '../../engine/defaults'
import { formulaLabels } from '../../engine/formula/display'
import { formulaUnits } from '../../engine/formula/units'
import { AXES, type Adjust, type Axis, type DimensionError, type Part } from '../../engine/types'
import { claimOpen } from '../exclusive'
import { fmt } from '../format'
import { clearAll, deleteBefore, insertAt, moveLeft, moveRight, type Edit, type PadKey } from '../formulaEdit'
import { closeKeyboard } from '../keyboard'
import { scrollIntoComfort } from '../scroll'

/** 数字・記号のボタン（表示, 入れる文字）。× ÷ − は * / - として式に入れる。5列 */
const KEYS: [string, PadKey][][] = [
  [['7', '7'], ['8', '8'], ['9', '9'], ['(', '('], [')', ')']],
  [['4', '4'], ['5', '5'], ['6', '6'], ['×', '*'], ['÷', '/']],
  [['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'], ['−', '-']],
  [['0', '0'], ['.', '.']],
]

type RefTab = 'part' | 'adjust'
const REF_TABS: { id: RefTab; label: string }[] = [
  { id: 'part', label: '部材' },
  { id: 'adjust', label: '調整寸法' },
]

/** 式の中で色つきの塊として見せる単位 */
const CHIP_CLASS: Partial<Record<string, string>> = {
  partRef: 'chip-ref',
  adjust: 'chip-adjust',
  bad: 'chip-bad',
}

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
  // 部材の寸法と調整寸法は、タブで切り替える1つの欄にまとめる（部材が多くても式の欄とボタンが画面に収まるように）
  const [tab, setTab] = useState<RefTab>('part')
  // 部材の参照は2段階：まず部材名、次に W・H
  const [refPartId, setRefPartId] = useState<string | null>(null)
  const refPart = tab === 'part' ? (parts.find((p) => p.id === refPartId) ?? null) : null

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

  const apply = (edit: (text: string, at: number) => Edit) => {
    const e = edit(value, cursor)
    setCursor(e.cursor)
    if (e.text !== value) onChange(e.text)
  }
  const put = (piece: string) => apply((t, at) => insertAt(t, at, piece))

  // ボタンを押しても注目が移らないようにする（画面が跳ねないように）
  const keep = (e: PointerEvent) => e.preventDefault()

  const openAtEnd = () => {
    closeKeyboard()
    setCursor(units.length)
    setRefPartId(null)
    setErrFullFor(null)
    onOpenChange(true)
  }

  const spoken = labels.length > 0 ? labels.join(' ') : '空'
  const shownErrors = value.trim() === '' ? [] : errors
  const errorText = [...new Set(shownErrors.map((e) => e.message))].join('。')
  // エラーの全文を出しているか（押したときだけ。ふだんは1行に切り詰める）。文が変わったら1行に戻す
  const [errFullFor, setErrFullFor] = useState<string | null>(null)
  const errFull = shownErrors.length > 0 && errFullFor === errorText

  const key = (label: string, k: PadKey) => (
    <button key={label} type="button" className="pad-key num" onPointerDown={keep} onClick={() => put(k)}>
      {label}
    </button>
  )

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
        {units.map((u, i) => {
          const gap = i > 0 && u.start > units[i - 1].end
          // 削除した調整寸法は赤で見せる（直す場所が分かるように）
          const missing = u.kind === 'adjust' && labels[i].startsWith('（削除した')
          const chip = missing ? 'chip-bad' : CHIP_CLASS[u.kind]
          return (
            <span key={`${u.start}-${u.text}`} className="expr-unit-wrap">
              {open && cursor === i && <span className="caret" aria-hidden="true" />}
              <span className={`expr-unit num${gap ? ' gap' : ''}${chip ? ` chip ${chip}` : ''}`}>{labels[i]}</span>
            </span>
          )
        })}
        {open && cursor === units.length && <span className="caret" aria-hidden="true" />}
      </button>
      {open && (
        <div className="pad" id={`${id}-pad`} ref={padRef} role="group" aria-label={`${axis} の式のボタン`}>
          <div className="pad-tabs" role="tablist" aria-label="式に入れるもの">
            {REF_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`pad-tab ${t.id}${tab === t.id ? ' on' : ''}`}
                onPointerDown={keep}
                onClick={() => {
                  setTab(t.id)
                  setRefPartId(null)
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pad-refs" role="tabpanel" aria-label={REF_TABS.find((t) => t.id === tab)?.label}>
            {tab === 'part' &&
              (parts.length === 0 ? (
                <p className="pad-empty">ほかの部材がありません</p>
              ) : refPart ? (
                // 2段階目：選んだ部材の W・H。押すと式に入れて、部材名の並びに戻る
                <div className="pad-grid">
                  <button
                    type="button"
                    className="pad-ref back"
                    aria-label={`${refPart.name} の選択をやめて部材の一覧に戻る`}
                    onPointerDown={keep}
                    onClick={() => setRefPartId(null)}
                  >
                    <span className="ref-name">{refPart.name}</span>
                    <span className="ref-val">◀ 戻る</span>
                  </button>
                  {AXES.map((a) => {
                    const v = finishedOf(refPart.id)[a]
                    return (
                      <button
                        key={a}
                        type="button"
                        className="pad-ref"
                        aria-label={`${refPart.name}.${a}（${v !== undefined ? fmt(v) : '計算できない'}）を入れる`}
                        onPointerDown={keep}
                        onClick={() => {
                          put(`${refPart.name}.${a}`)
                          setRefPartId(null)
                        }}
                      >
                        <span className="ref-name">
                          {refPart.name}.{a}
                        </span>
                        <span className="ref-val num">{v !== undefined ? fmt(v) : '―'}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                // 1段階目：部材名の並び（多いときは中でスクロール）
                <div className="pad-grid">
                  {parts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="pad-ref part"
                      aria-label={`${p.name} の寸法を選ぶ`}
                      onPointerDown={keep}
                      onClick={() => setRefPartId(p.id)}
                    >
                      <span className="ref-name">{p.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            {tab === 'adjust' &&
              (adjusts.length === 0 ? (
                <p className="pad-empty">調整寸法がありません（設定で足せます）</p>
              ) : (
                <div className="pad-grid">
                  {adjusts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="pad-ref adjust"
                      onPointerDown={keep}
                      onClick={() => put(`{n:${a.id}}`)}
                    >
                      <span className="ref-name">{adjustName(a)}</span>
                    </button>
                  ))}
                </div>
              ))}
          </div>
          <div className="pad-keys expr-keys">
            {KEYS.flat().map(([label, k]) => key(label, k))}
            <button
              type="button"
              className="pad-key"
              aria-label="カーソルを左へ"
              onPointerDown={keep}
              onClick={() => setCursor(moveLeft(value, cursor))}
            >
              ◀
            </button>
            <button
              type="button"
              className="pad-key"
              aria-label="カーソルを右へ"
              onPointerDown={keep}
              onClick={() => setCursor(moveRight(value, cursor))}
            >
              ▶
            </button>
            <button type="button" className="pad-key" onPointerDown={keep} onClick={() => apply(deleteBefore)}>
              1字消す
            </button>
            <button type="button" className="pad-key span2" onPointerDown={keep} onClick={() => apply(clearAll)}>
              全部消す
            </button>
            <button type="button" className="pad-key done span3" onPointerDown={keep} onClick={() => onOpenChange(false)}>
              完了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
