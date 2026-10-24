// 式のボタンの並び（仕様書 20.1。スマホの数字キーボードと同じく、真ん中の3列が数字で 1 2 3 が上）：
//   ＝ ＋ − × ÷ ／ 全部消す 1 2 3 ⌫ ／ ◀ 4 5 6 ▶ ／ ( 7 8 9 ) ／ 閉じる 0（2列） . 次へ
// 一番上の段の上に、調整寸法のボタンの欄（メラミン1・シート0.5・＋ 追加）。部材の寸法はキーでなく、表のセルを押して入れる（仕様書 20.2）。
// 部材の表のアプリのキー（PartsTable）で使う。枚数のキーも同じ並び（使わないキーは薄く出して押せない）。
// 「＋ 追加」で、キーの所で調整寸法を足し、そのまま式に入れる。
// 計算はしない（式の文字とカーソルを変えるだけ。formulaEdit.ts）。kidori の ui/components/FormulaInput.tsx のボタンの部分をもとにしたもの
import { useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { adjustName } from '../../engine/defaults'
import { validateAdjust, type AdjustDraft } from '../../store/jobs'
import { formulaLabels } from '../../engine/formula/display'
import { parseRefText } from '../../engine/formula/tokenize'
import { formulaUnits } from '../../engine/formula/units'
import type { Adjust } from '../../engine/types'
import { parseNum } from '../format'
import { closeKeyboard } from '../keyboard'
import { pressKey } from '../numpad'
import { ADJUST_PRESETS } from '../settings'
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
  adjusts: readonly Adjust[]
  /** 「閉じる」「次へ」（W・H・枚数で同じ位置） */
  onClose: () => void
  onNext: () => void
  /**
   * 枚数のキーにする（仕様書 16.2・20.1）：数字・1字消す・全部消す だけ押せる（onKey に '0'〜'9'・'back'・'clear'）。
   * 調整寸法のボタン・＝・記号・( )・◀▶・小数点は同じ場所に薄く出して押せない
   */
  quantity?: { onKey: (key: string) => void }
  /** 「＋ 追加」で足すとき（store の addAdjust）。足せたら id、だめなら理由 */
  onAddAdjust?: (draft: AdjustDraft) => { ok: true; id: string } | { ok: false; message: string }
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

export function FormulaKeys({
  value,
  cursor,
  onEdit,
  equals = false,
  onEquals,
  adjusts,
  onClose,
  onNext,
  quantity,
  onAddAdjust,
  id,
  ariaLabel,
}: Props) {
  // 調整寸法の追加の欄（キーの所に出す）。null は出していない
  const [adding, setAdding] = useState<AddDraft | null>(null)

  const apply = (edit: (text: string, at: number) => Edit) => onEdit(edit(value, cursor))
  const put = (piece: string) => apply((t, at) => insertAt(t, at, piece))
  const keep = keepFocus
  const qty = quantity !== undefined

  // 追加の欄を出している間は、数字のキー・1字消す・全部消す で寸法を入れる
  const addNum = (k: string) => {
    if (!adding) return
    closeKeyboard()
    setAdding({ ...adding, size: pressKey(adding.size, k, false, false), error: null })
  }
  const check = adding ? checkAdd(adjusts, adding) : null
  const submitAdd = () => {
    if (!adding || !check?.draft || !onAddAdjust) return
    closeKeyboard()
    const r = onAddAdjust(check.draft)
    if (!r.ok) {
      setAdding({ ...adding, error: r.message })
      return
    }
    setAdding(null)
    put(`{n:${r.id}}`)
  }

  /** 数字・記号のキーを押したとき */
  const pressKeyOf = (k: PadKey) => {
    if (adding) addNum(k)
    else if (quantity) quantity.onKey(k)
    else put(k)
  }
  /** このキーを押せるか（枚数は数字だけ、調整寸法の追加は数字と小数点だけ） */
  const enabled = (k: PadKey) => (qty ? isDigit(k) : adding ? isDigit(k) || k === '.' : true)

  /** 1字消す：カーソルが先頭で「＝」があれば「＝」を消す（式でない入力に戻る。仕様書 20.2） */
  const back = () => {
    if (adding) addNum('back')
    else if (quantity) quantity.onKey('back')
    else if (cursor === 0 && equals) onEquals?.(false)
    else apply(deleteBefore)
  }
  /** 全部消す（「＝」も外す） */
  const clear = () => {
    if (adding) addNum('clear')
    else if (quantity) quantity.onKey('clear')
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
            disabled={qty || adding !== null || !onEquals}
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
            disabled={qty || adding !== null}
            onClick={() => onEdit({ text: value, cursor: (d.kind === 'left' ? moveLeft : moveRight)(value, cursor) })}
          >
            {d.kind === 'left' ? '◀' : '▶'}
          </button>
        )
      case 'close':
        return adding ? (
          <button
            key={i}
            {...base}
            className="pad-key"
            onClick={() => {
              closeKeyboard()
              setAdding(null)
            }}
          >
            やめる
          </button>
        ) : (
          <button key={i} {...base} className="pad-key" onClick={onClose}>
            閉じる
          </button>
        )
      case 'next':
        return adding ? (
          <button key={i} {...base} className="pad-key done" disabled={!check?.draft} onClick={submitAdd}>
            追加
          </button>
        ) : (
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
      {adding ? (
        <AdjustAddPanel
          draft={adding}
          problem={check?.problem ?? null}
          preview={check?.draft ? adjustName(check.draft) : null}
          onDraft={setAdding}
        />
      ) : (
        // 調整寸法のボタンの欄（1段。多いときは横にスクロール。「＋ 追加」はいつも右端に見せる）
        <div className="pad-refs" role="group" aria-label={qty ? '枚数' : '調整寸法'}>
          {qty ? (
            <p className="pad-empty">枚数は数字だけ入れます</p>
          ) : (
            <>
              <div className="pad-strip">
                {adjusts.map((a) => (
                  <button key={a.id} type="button" className="pad-ref adjust" onPointerDown={keep} onClick={() => put(`{n:${a.id}}`)}>
                    <span className="ref-name">{adjustName(a)}</span>
                  </button>
                ))}
                {adjusts.length === 0 && !onAddAdjust && <p className="pad-empty">調整寸法がありません</p>}
              </div>
              {onAddAdjust && (
                <button
                  type="button"
                  className="pad-ref add"
                  aria-label="調整寸法を追加して式に入れる"
                  onPointerDown={keep}
                  onClick={() => setAdding({ choice: null, freeName: '', size: '', error: null })}
                >
                  <span className="ref-name">＋ 追加</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
      <div className="pad-keys expr-keys">{LAYOUT.flat().map(keyOf)}</div>
    </div>
  )
}

type NameChoice = (typeof ADJUST_PRESETS)[number] | 'free'

/** キーの所で入れている調整寸法（名前の選び方・自由入力の名前・寸法の文字・足せなかった理由） */
interface AddDraft {
  choice: NameChoice | null
  freeName: string
  size: string
  error: string | null
}

/** 追加の欄の今の入力から、足せる中身（draft）か、足せない理由（problem）。空のままなら両方 null（ボタンを押せないだけ） */
function checkAdd(adjusts: readonly Adjust[], d: AddDraft): { draft: AdjustDraft | null; problem: string | null } {
  const name = d.choice === null ? '' : d.choice === 'free' ? d.freeName.trim() : d.choice
  const value = parseNum(d.size)
  if (d.error) return { draft: null, problem: d.error }
  if (name === '' || value === null) return { draft: null, problem: null }
  if (Number.isNaN(value) || value <= 0) return { draft: null, problem: '寸法は 0 より大きい数を入れてください' }
  const problem = validateAdjust(adjusts, { name, value })
  return problem ? { draft: null, problem } : { draft: { name, value }, problem: null }
}

/**
 * 調整寸法の追加の欄（仕様書 4.1・16.5）。調整寸法のボタンの欄の所に出す（下のキーの位置は変わらない）。
 * 名前は［逃げ］［ほぞ］［自由入力］（自由入力はスマホのキーボード）、寸法は下の数字のキーで入れる
 */
function AdjustAddPanel({
  draft,
  problem,
  preview,
  onDraft,
}: {
  draft: AddDraft
  problem: string | null
  preview: string | null
  onDraft: (d: AddDraft) => void
}) {
  const pick = (choice: NameChoice) => {
    onDraft({ ...draft, choice, error: null })
    if (choice !== 'free') closeKeyboard()
  }
  const choices: { value: NameChoice; label: string }[] = [
    ...ADJUST_PRESETS.map((p) => ({ value: p, label: p })),
    { value: 'free', label: '自由入力' },
  ]
  return (
    <div className="pad-add" role="group" aria-label="調整寸法を追加">
      <div className="pad-add-names" role="group" aria-label="名前">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`pad-tab adjust${draft.choice === c.value ? ' on' : ''}`}
            aria-pressed={draft.choice === c.value}
            onPointerDown={keepFocus}
            onClick={() => pick(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="pad-add-row">
        {draft.choice === 'free' ? (
          <input
            className="input pad-add-name"
            aria-label="名前（自由入力）"
            value={draft.freeName}
            placeholder="名前"
            enterKeyHint="done"
            autoComplete="off"
            onChange={(e) => onDraft({ ...draft, freeName: e.target.value, error: null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') closeKeyboard()
            }}
          />
        ) : (
          <span className={`pad-add-name label-box${draft.choice ? '' : ' muted'}`}>{draft.choice ?? '名前を選ぶ'}</span>
        )}
        <span className="pad-add-size num" aria-label={`寸法 ${draft.size || '空'}`} aria-live="polite">
          {draft.size === '' ? <span className="keypad-placeholder">寸法</span> : draft.size}
          <span className="unit">mm</span>
        </span>
      </div>
      <p className={`pad-add-msg${problem ? ' bad' : ''}`} role={problem ? 'alert' : undefined}>
        {problem ?? (preview ? `「${preview}」を足して式に入れます` : '名前を選び、寸法を数字のキーで入れます')}
      </p>
    </div>
  )
}
