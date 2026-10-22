// 式のボタンの並び（仕様書 5.4・15.1）：「部材｜調整寸法」のタブ・数字・記号・◀▶・1字消す・全部消す。
// 部材の編集シートの式の欄（FormulaInput）と、部材の表のアプリのキー（PartsTable）の両方で使う。
// 計算はしない（式の文字とカーソルを変えるだけ。formulaEdit.ts）。kidori の ui/components/FormulaInput.tsx のボタンの部分をもとにしたもの
import { useState, type PointerEvent, type ReactNode } from 'react'
import { adjustName } from '../../engine/defaults'
import { formulaLabels } from '../../engine/formula/display'
import { formulaUnits } from '../../engine/formula/units'
import { AXES, type Adjust, type Axis, type Part } from '../../engine/types'
import { fmt } from '../format'
import { clearAll, deleteBefore, insertAt, moveLeft, moveRight, type Edit, type PadKey } from '../formulaEdit'

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

/** ボタンを押しても注目が移らないようにする（画面が跳ねない・スマホのキーボードが出ないように） */
const keepFocus = (e: PointerEvent) => e.preventDefault()

/** 式を、参照・調整寸法を色つきの塊にして見せる。caret（単位の番号）を渡すとカーソルを出す */
export function FormulaView({ value, adjusts, caret }: { value: string; adjusts: readonly Adjust[]; caret?: number }) {
  const units = formulaUnits(value)
  const labels = formulaLabels(value, adjusts)
  return (
    <>
      {units.map((u, i) => {
        const gap = i > 0 && u.start > units[i - 1].end
        // 削除した調整寸法は赤で見せる（直す場所が分かるように）
        const missing = u.kind === 'adjust' && labels[i].startsWith('（削除した')
        const chip = missing ? 'chip-bad' : CHIP_CLASS[u.kind]
        return (
          <span key={`${u.start}-${u.text}`} className="expr-unit-wrap">
            {caret === i && <span className="caret" aria-hidden="true" />}
            <span className={`expr-unit num${gap ? ' gap' : ''}${chip ? ` chip ${chip}` : ''}`}>{labels[i]}</span>
          </span>
        )
      })}
      {caret !== undefined && caret >= units.length && <span className="caret" aria-hidden="true" />}
    </>
  )
}

interface Props {
  /** 式の文字 */
  value: string
  /** カーソル（単位の番号） */
  cursor: number
  /** 式かカーソルが変わったとき */
  onEdit: (e: Edit) => void
  adjusts: readonly Adjust[]
  /** 参照ボタンに出す部材（名前のある部材だけ。編集中の部材自身は除く） */
  parts: readonly Part[]
  /** 参照ボタンに添える、部材ごとの仕上がり寸法（軸ごと。計算できない軸は無い） */
  finishedOf: (partId: string) => Partial<Record<Axis, number>>
  /** いちばん下の段の「全部消す」の後ろに並べるボタン（完了・閉じる・次へ など。合わせて3列ぶん） */
  actions: ReactNode
  id?: string
  ariaLabel?: string
}

export function FormulaKeys({ value, cursor, onEdit, adjusts, parts, finishedOf, actions, id, ariaLabel }: Props) {
  // 部材の寸法と調整寸法は、タブで切り替える1つの欄にまとめる（部材が多くてもボタンが画面に収まるように）
  const [tab, setTab] = useState<RefTab>('part')
  // 部材の参照は2段階：まず部材名、次に W・H
  const [refPartId, setRefPartId] = useState<string | null>(null)
  const refPart = tab === 'part' ? (parts.find((p) => p.id === refPartId) ?? null) : null

  const apply = (edit: (text: string, at: number) => Edit) => onEdit(edit(value, cursor))
  const put = (piece: string) => apply((t, at) => insertAt(t, at, piece))
  const keep = keepFocus

  return (
    <div className="pad" id={id} role="group" aria-label={ariaLabel}>
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
            <p className="pad-empty">名前のあるほかの部材がありません</p>
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
                <button key={a.id} type="button" className="pad-ref adjust" onPointerDown={keep} onClick={() => put(`{n:${a.id}}`)}>
                  <span className="ref-name">{adjustName(a)}</span>
                </button>
              ))}
            </div>
          ))}
      </div>
      <div className="pad-keys expr-keys">
        {KEYS.flat().map(([label, k]) => (
          <button key={label} type="button" className="pad-key num" onPointerDown={keep} onClick={() => put(k)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          className="pad-key"
          aria-label="カーソルを左へ"
          onPointerDown={keep}
          onClick={() => onEdit({ text: value, cursor: moveLeft(value, cursor) })}
        >
          ◀
        </button>
        <button
          type="button"
          className="pad-key"
          aria-label="カーソルを右へ"
          onPointerDown={keep}
          onClick={() => onEdit({ text: value, cursor: moveRight(value, cursor) })}
        >
          ▶
        </button>
        <button type="button" className="pad-key" onPointerDown={keep} onClick={() => apply(deleteBefore)}>
          1字消す
        </button>
        <button type="button" className="pad-key span2" onPointerDown={keep} onClick={() => apply(clearAll)}>
          全部消す
        </button>
        {actions}
      </div>
    </div>
  )
}
