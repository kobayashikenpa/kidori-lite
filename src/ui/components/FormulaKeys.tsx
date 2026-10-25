// 式のボタンの並び（仕様書 20.1。スマホの数字キーボードと同じく、真ん中の3列が数字で 1 2 3 が上）：
//   ＝ ＋ − × ÷ ／ 全部消す 1 2 3 ⌫ ／ ◀ 4 5 6 ▶ ／ ( 7 8 9 ) ／ 閉じる 0（2列） . 次へ
// 部材の寸法・調整寸法はキーでなく、表のセルを押して入れる（仕様書 20.2・21.2。第1.7版でキーの上の調整寸法のボタンはなくした）。
// 部材の表・調整寸法の表のアプリのキーで使う。枚数・調整寸法の寸法のキーも同じ並び（使わないキーは薄く出して押せない）。
// 計算はしない（式の文字とカーソルを変えるだけ。formulaEdit.ts）。kidori の ui/components/FormulaInput.tsx のボタンの部分をもとにしたもの
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { formulaLabels } from '../../engine/formula/display'
import { parseRefText } from '../../engine/formula/tokenize'
import { formulaUnits } from '../../engine/formula/units'
import type { Adjust } from '../../engine/types'
import { caretFromTap, clearAll, deleteBefore, insertAt, moveLeft, moveRight, type Edit, type PadKey } from '../formulaEdit'

/** 数字かどうか（枚数・調整寸法の寸法で押せるキー） */
const isDigit = (k: string) => /^\d$/.test(k)

/** 式の中で色つきの塊として見せる単位 */
const CHIP_CLASS: Partial<Record<string, string>> = {
  partRef: 'chip-ref',
  adjust: 'chip-adjust',
  bad: 'chip-bad',
}

/** ボタンを押しても注目が移らないようにする（画面が跳ねない・スマホのキーボードが出ないように） */
const keepFocus = (e: PointerEvent) => e.preventDefault()

/**
 * 式を、参照・調整寸法を色つきの塊にして見せる。caret（単位の番号）を渡すとカーソルを出す。
 * onCaret を渡すと、式を押した所にカーソルを移す（仕様書 18.7。塊の中は近いほうの端。formulaEdit の caretFromTap）。
 * equals なら先頭に「＝」を付けて出す（仕様書 20.2。「＝」は式の文字には入れない）。
 * refColors を渡すと、部材の寸法の塊を、表の色の枠と同じ色にする（鍵はそろえた部材名）
 */
export function FormulaView({
  value,
  adjusts,
  caret,
  onCaret,
  equals = false,
  refColors,
}: {
  value: string
  adjusts: readonly Adjust[]
  caret?: number
  onCaret?: (cursor: number) => void
  equals?: boolean
  refColors?: ReadonlyMap<string, number>
}) {
  const units = formulaUnits(value)
  const labels = formulaLabels(value, adjusts)
  const body = (
    <>
      {equals && <span className="expr-eq">＝</span>}
      {units.map((u, i) => {
        const gap = i > 0 && u.start > units[i - 1].end
        // 削除した調整寸法は赤で見せる（直す場所が分かるように）
        const missing = u.kind === 'adjust' && labels[i].startsWith('（削除した')
        const chip = missing ? 'chip-bad' : CHIP_CLASS[u.kind]
        const ref = u.kind === 'partRef' && refColors ? parseRefText(u.text) : null
        const color = ref ? refColors?.get(ref.part) : undefined
        return (
          <span key={`${u.start}-${u.text}`} className="expr-unit-wrap">
            {caret === i && <span className="caret" aria-hidden="true" />}
            <span className={`expr-unit num${gap ? ' gap' : ''}${chip ? ` chip ${chip}` : ''}${color !== undefined ? ` refc-${color}` : ''}`}>
              {labels[i]}
            </span>
          </span>
        )
      })}
      {caret !== undefined && caret >= units.length && <span className="caret" aria-hidden="true" />}
    </>
  )
  if (!onCaret) return body
  const tap = (e: MouseEvent<HTMLSpanElement>) => {
    // 単位ごとの位置を測る（カーソルの棒と「＝」は数えない。「＝」を押したら先頭）
    const boxes = [...e.currentTarget.querySelectorAll('.expr-unit')].map((el) => el.getBoundingClientRect())
    onCaret(caretFromTap(boxes, e.clientX, e.clientY))
  }
  return (
    <span className="expr-tap" onPointerDown={keepFocus} onClick={tap}>
      {body}
    </span>
  )
}

interface Props {
  /** 式の文字（先頭の「＝」は入れない） */
  value: string
  /** カーソル（単位の番号） */
  cursor: number
  /** 式かカーソルが変わったとき */
  onEdit: (e: Edit) => void
  /** 「＝」で始めた入力か（仕様書 20.2） */
  equals?: boolean
  /** 「＝」を付けた・外したとき（「＝」のキー・カーソルが先頭のときの 1字消す・全部消す） */
  onEquals?: (on: boolean) => void
  /** 「閉じる」「次へ」（W・H・枚数・調整寸法で同じ位置） */
  onClose: () => void
  onNext: () => void
  /**
   * 数字だけのキーにする（枚数：仕様書 16.2・20.1、調整寸法の寸法：仕様書 21.1）：数字・1字消す・全部消す だけ押せる
   * （onKey に '0'〜'9'・'back'・'clear'。decimal なら小数点 '.' も）。＝・記号・( )・◀▶ は同じ場所に薄く出して押せない
   */
  numeric?: { onKey: (key: string) => void; decimal?: boolean }
  id?: string
  ariaLabel?: string
}

/** キーの1つ（表示, 入れる文字か操作）。null は「0」の2列目（何も置かない） */
type KeyDef =
  | { kind: 'put'; label: string; k: PadKey; aria?: string }
  | { kind: 'eq' | 'clear' | 'back' | 'left' | 'right' | 'close' | 'next' }

/** キーの並び（5列 × 5段。仕様書 20.1）。0 は2列ぶん */
const LAYOUT: KeyDef[][] = [
  [
    { kind: 'eq' },
    { kind: 'put', label: '＋', k: '+', aria: '足す' },
    { kind: 'put', label: '−', k: '-', aria: '引く' },
    { kind: 'put', label: '×', k: '*', aria: '掛ける' },
    { kind: 'put', label: '÷', k: '/', aria: '割る' },
  ],
  [{ kind: 'clear' }, { kind: 'put', label: '1', k: '1' }, { kind: 'put', label: '2', k: '2' }, { kind: 'put', label: '3', k: '3' }, { kind: 'back' }],
  [{ kind: 'left' }, { kind: 'put', label: '4', k: '4' }, { kind: 'put', label: '5', k: '5' }, { kind: 'put', label: '6', k: '6' }, { kind: 'right' }],
  [
    { kind: 'put', label: '(', k: '(', aria: 'かっこ開き' },
    { kind: 'put', label: '7', k: '7' },
    { kind: 'put', label: '8', k: '8' },
    { kind: 'put', label: '9', k: '9' },
    { kind: 'put', label: ')', k: ')', aria: 'かっこ閉じ' },
  ],
  [{ kind: 'close' }, { kind: 'put', label: '0', k: '0' }, { kind: 'put', label: '.', k: '.', aria: '小数点' }, { kind: 'next' }],
]

export function FormulaKeys({ value, cursor, onEdit, equals = false, onEquals, onClose, onNext, numeric, id, ariaLabel }: Props) {
  const apply = (edit: (text: string, at: number) => Edit) => onEdit(edit(value, cursor))
  const put = (piece: string) => apply((t, at) => insertAt(t, at, piece))
  const keep = keepFocus
  const qty = numeric !== undefined

  /** 数字・記号のキーを押したとき */
  const pressKeyOf = (k: PadKey) => {
    if (numeric) numeric.onKey(k)
    else put(k)
  }
  /** このキーを押せるか（数字だけのキーは数字と、decimal なら小数点） */
  const enabled = (k: PadKey) => (numeric ? isDigit(k) || (k === '.' && numeric.decimal === true) : true)

  /** 1字消す：カーソルが先頭で「＝」があれば「＝」を消す（式でない入力に戻る。仕様書 20.2） */
  const back = () => {
    if (numeric) numeric.onKey('back')
    else if (cursor === 0 && equals) onEquals?.(false)
    else apply(deleteBefore)
  }
  /** 全部消す（「＝」も外す） */
  const clear = () => {
    if (numeric) numeric.onKey('clear')
    else {
      apply(clearAll)
      if (equals) onEquals?.(false)
    }
  }

  const keyOf = (d: KeyDef, i: number): ReactNode => {
    const base = { type: 'button' as const, onPointerDown: keep }
    switch (d.kind) {
      case 'put':
        return (
          <button
            key={i}
            {...base}
            className={`pad-key num${d.k === '0' ? ' span2' : ''}${/^\d$/.test(d.k) ? ' digit' : ' sym'}`}
            aria-label={d.aria}
            disabled={!enabled(d.k)}
            onClick={() => pressKeyOf(d.k)}
          >
            {d.label}
          </button>
        )
      case 'eq':
        return (
          <button
            key={i}
            {...base}
            className={`pad-key num sym eq${equals && !qty ? ' on' : ''}`}
            aria-label="＝（式を始める）"
            aria-pressed={!qty ? equals : undefined}
            disabled={qty || !onEquals}
            onClick={() => onEquals?.(true)}
          >
            ＝
          </button>
        )
      case 'clear':
        return (
          <button key={i} {...base} className="pad-key" onClick={clear}>
            全部消す
          </button>
        )
      case 'back':
        return (
          <button key={i} {...base} className="pad-key" aria-label="1字消す" onClick={back}>
            <span className="pad-key-icon" aria-hidden="true">
              ⌫
            </span>
            <span className="pad-key-sub" aria-hidden="true">
              1字消す
            </span>
          </button>
        )
      case 'left':
      case 'right':
        return (
          <button
            key={i}
            {...base}
            className="pad-key"
            aria-label={d.kind === 'left' ? 'カーソルを左へ' : 'カーソルを右へ'}
            disabled={qty}
            onClick={() => onEdit({ text: value, cursor: (d.kind === 'left' ? moveLeft : moveRight)(value, cursor) })}
          >
            {d.kind === 'left' ? '◀' : '▶'}
          </button>
        )
      case 'close':
        return (
          <button key={i} {...base} className="pad-key" onClick={onClose}>
            閉じる
          </button>
        )
      case 'next':
        return (
          <button key={i} {...base} className="pad-key done" aria-label="次へ" onClick={onNext}>
            <span>次へ</span>
            <span className="pad-key-sub" aria-hidden="true">
              ↵
            </span>
          </button>
        )
    }
  }

  return (
    <div className={`pad${qty ? ' qty' : ''}`} id={id} role="group" aria-label={ariaLabel}>
      <div className="pad-keys expr-keys">{LAYOUT.flat().map(keyOf)}</div>
    </div>
  )
}
