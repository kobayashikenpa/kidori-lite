// 式のボタンの並び（仕様書 5.4・15.1・16.2・16.5）：「部材｜調整寸法」のタブ・数字・記号・◀▶・1字消す・全部消す。
// 部材の表のアプリのキー（PartsTable）で使う。枚数のキーも同じ並び（使わないキーは薄く出して押せない）。
// 「調整寸法」のタブの「＋ 追加」で、キーの所で調整寸法を足し、そのまま式に入れる。
// 計算はしない（式の文字とカーソルを変えるだけ。formulaEdit.ts）。kidori の ui/components/FormulaInput.tsx のボタンの部分をもとにしたもの
import { useState, type PointerEvent, type ReactNode } from 'react'
import { adjustName } from '../../engine/defaults'
import { validateAdjust, type AdjustDraft } from '../../store/jobs'
import { formulaLabels } from '../../engine/formula/display'
import { formulaUnits } from '../../engine/formula/units'
import { AXES, type Adjust, type Axis, type Part } from '../../engine/types'
import { fmt, parseNum } from '../format'
import { closeKeyboard } from '../keyboard'
import { pressKey } from '../numpad'
import { ADJUST_PRESETS } from '../settings'
import { clearAll, deleteBefore, insertAt, moveLeft, moveRight, type Edit, type PadKey } from '../formulaEdit'

/** 数字かどうか（枚数・調整寸法の寸法で押せるキー） */
const isDigit = (k: string) => /^\d$/.test(k)

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
  /**
   * 枚数のキーにする（仕様書 16.2）：数字・1字消す・全部消す だけ押せる（onKey に '0'〜'9'・'back'・'clear'）。
   * 「部材｜調整寸法」のタブ・記号・◀▶・小数点は同じ場所に薄く出して押せない
   */
  quantity?: { onKey: (key: string) => void }
  /** 「調整寸法」のタブの「＋ 追加」で足すとき（store の addAdjust）。足せたら id、だめなら理由 */
  onAddAdjust?: (draft: AdjustDraft) => { ok: true; id: string } | { ok: false; message: string }
  id?: string
  ariaLabel?: string
}

export function FormulaKeys({
  value,
  cursor,
  onEdit,
  adjusts,
  parts,
  finishedOf,
  actions,
  quantity,
  onAddAdjust,
  id,
  ariaLabel,
}: Props) {
  // 部材の寸法と調整寸法は、タブで切り替える1つの欄にまとめる（部材が多くてもボタンが画面に収まるように）
  const [tab, setTab] = useState<RefTab>('part')
  // 部材の参照は2段階：まず部材名、次に W・H
  const [refPartId, setRefPartId] = useState<string | null>(null)
  const refPart = tab === 'part' ? (parts.find((p) => p.id === refPartId) ?? null) : null
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
        <>
          <div className="pad-tabs" role="tablist" aria-label="式に入れるもの">
            {REF_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={!qty && tab === t.id}
                className={`pad-tab ${t.id}${!qty && tab === t.id ? ' on' : ''}`}
                disabled={qty}
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
          <div className="pad-refs" role="tabpanel" aria-label={qty ? '枚数' : REF_TABS.find((t) => t.id === tab)?.label}>
            {qty && <p className="pad-empty">枚数は数字だけ入れます</p>}
            {!qty && tab === 'part' &&
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
            {!qty && tab === 'adjust' && (
              <div className="pad-grid">
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
                {adjusts.map((a) => (
                  <button key={a.id} type="button" className="pad-ref adjust" onPointerDown={keep} onClick={() => put(`{n:${a.id}}`)}>
                    <span className="ref-name">{adjustName(a)}</span>
                  </button>
                ))}
                {adjusts.length === 0 && !onAddAdjust && <p className="pad-empty">調整寸法がありません</p>}
              </div>
            )}
          </div>
        </>
      )}
      <div className="pad-keys expr-keys">
        {KEYS.flat().map(([label, k]) => (
          <button
            key={label}
            type="button"
            className="pad-key num"
            disabled={!enabled(k)}
            onPointerDown={keep}
            onClick={() => pressKeyOf(k)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="pad-key"
          aria-label="カーソルを左へ"
          disabled={qty || adding !== null}
          onPointerDown={keep}
          onClick={() => onEdit({ text: value, cursor: moveLeft(value, cursor) })}
        >
          ◀
        </button>
        <button
          type="button"
          className="pad-key"
          aria-label="カーソルを右へ"
          disabled={qty || adding !== null}
          onPointerDown={keep}
          onClick={() => onEdit({ text: value, cursor: moveRight(value, cursor) })}
        >
          ▶
        </button>
        <button
          type="button"
          className="pad-key"
          onPointerDown={keep}
          onClick={() => (adding ? addNum('back') : quantity ? quantity.onKey('back') : apply(deleteBefore))}
        >
          1字消す
        </button>
        <button
          type="button"
          className="pad-key span2"
          onPointerDown={keep}
          onClick={() => (adding ? addNum('clear') : quantity ? quantity.onKey('clear') : apply(clearAll))}
        >
          全部消す
        </button>
        {adding ? (
          <>
            <button
              type="button"
              className="pad-key"
              onPointerDown={keep}
              onClick={() => {
                closeKeyboard()
                setAdding(null)
              }}
            >
              やめる
            </button>
            <button type="button" className="pad-key done span2" disabled={!check?.draft} onPointerDown={keep} onClick={submitAdd}>
              追加
            </button>
          </>
        ) : (
          actions
        )}
      </div>
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
 * 調整寸法の追加の欄（仕様書 4.1・16.5）。「部材｜調整寸法」のタブと一覧の所に出す（下のキーの位置は変わらない）。
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
