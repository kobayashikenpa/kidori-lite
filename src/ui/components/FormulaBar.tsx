// 部材の画面の式の欄（第2.1版。仕様書 25.8。kidori-simple 28章と同じもの）。置く所はタブのすぐ下（PartsScreen の slot）。
// 表（部材の表・［調整］の表・調整寸法の表・［木取り］の表）が、選んでいるセルの中身をこの欄に出す（slot へ createPortal）。
// - 選んでいるだけのとき：中身（式は 天板.W − 20 のように塊つき、数字は 400）。欄を押すと、そのセルの入力を始める（onPress）
// - 入力中：中身とカーソル（式を押すとその位置へ。FormulaView の onCaret）。右の「✓」で入力を終える（キーの「閉じる」と同じ）
// - 見るだけ（［木取り］）：押しても入力しない・✓ は無い
// エラーの理由は欄のすぐ下に赤で出す（表の位置がずれないよう、欄の下に重ねて出す）。部材名・列の名前は出さない
// 第2.2版：名前のセル（欄の中身は空）でも「同じ名前があります」を欄の下に出せるよう、中身が無くて理由だけあるときは空の欄（点線）と理由を出す（仕様書 26.6）。
// 選んでいる行の部材にメモがあれば、エラーの下にメモ（2行まで、続きは「…」）を重ねて出し、押すとメモの欄を開く（仕様書 26.3・26.8）
import type { PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Adjust } from '../../engine/types'
import type { BarContent } from '../fxBar'
import { FormulaView } from './FormulaKeys'

interface Props {
  /** 欄を置く所（PartsScreen のタブのすぐ下）。無ければ何も出さない */
  slot: HTMLElement | null
  /** 中身（null なら出さない＝空の欄） */
  content: BarContent | null
  adjusts: readonly Adjust[]
  /** 読み上げ用（例：「棚板 の W」） */
  label: string
  /** 入力中か（カーソルと ✓ を出す） */
  editing?: boolean
  /** 入力中のカーソル（式の単位の番号）。式でない中身は終わりに出す */
  caret?: number
  /** 入力中に式を押したとき（押した所へカーソルを移す） */
  onCaret?: (cursor: number) => void
  /** 式の中の部材の寸法の塊の色（表の色の枠と同じ） */
  refColors?: ReadonlyMap<string, number>
  /** 選んでいるだけのときに欄を押したとき（入力を始める）。見るだけなら無し */
  onPress?: () => void
  /** 「✓」（入力を終える） */
  onDone?: () => void
  /** 入力中で中身が空のときの手引き */
  hint?: string
  /** 欄のすぐ下に赤で出す理由 */
  errors?: readonly string[]
  /** 欄の右に小さく出す補い（枚数の「3枚」など） */
  note?: string
  /** 選んでいる行の部材のメモ（無ければ出さない） */
  memo?: string
  /** メモを押したとき（メモの欄を開く） */
  onMemo?: () => void
}

/** ボタンを押しても注目が移らないようにする（画面が跳ねない・スマホのキーボードが出ないように） */
const keepFocus = (e: PointerEvent) => e.preventDefault()

export function FormulaBar({ slot, content, adjusts, label, editing = false, caret, onCaret, refColors, onPress, onDone, hint, errors = [], note, memo, onMemo }: Props) {
  if (!slot) return null
  // 欄のすぐ下に重ねて出すもの：エラーの理由、その下にメモ（表の位置がずれないよう、表に重ねる）
  const hasMemo = memo !== undefined && memo.trim() !== ''
  const below = (errors.length > 0 || hasMemo) && (
    <div className="fx-below">
      {errors.length > 0 && (
        <p className="fx-err" role="alert">
          {errors.join('。')}
        </p>
      )}
      {hasMemo && (
        <button type="button" className="fx-memo" onPointerDown={keepFocus} onClick={onMemo} aria-label={`メモ：${memo}（押すと全文）`}>
          <span className="fx-memo-text">
            <b>メモ</b> {memo}
          </span>
        </button>
      )}
    </div>
  )
  if (!content) {
    // 中身の無い欄（名前のセルなど）：理由があるときだけ、空の欄（点線。高さは同じ）と理由を出す
    if (!below) return null
    return createPortal(
      <>
        <div className="fx-row">
          <div className="fx-bar blank" aria-hidden="true" />
        </div>
        {below}
      </>,
      slot,
    )
  }
  const empty = content.kind === 'expr' ? content.expr.trim() === '' : content.text === ''
  const view = !onPress && !editing
  const body =
    content.kind === 'expr' ? (
      empty ? null : (
        <FormulaView value={content.expr} adjusts={adjusts} caret={editing ? caret : undefined} refColors={refColors} onCaret={editing ? onCaret : undefined} />
      )
    ) : (
      <span className="fx-chars">{content.text}</span>
    )
  return createPortal(
    <>
      <div className="fx-row">
        <div
          className={`fx-bar${editing ? ' editing' : ''}${view ? ' view' : ''}`}
          role={editing ? 'group' : view ? 'status' : 'button'}
          tabIndex={!editing && !view ? 0 : undefined}
          aria-label={`${label}${editing ? '（入力中）' : view ? '（見るだけ）' : '（押すと入力）'}`}
          onPointerDown={keepFocus}
          onClick={() => {
            if (!editing) onPress?.()
          }}
          onKeyDown={(e) => {
            if (!editing && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onPress?.()
            }
          }}
        >
          <span className="fx-text num">
            {body}
            {/* 式でない中身・空の式は、カーソルを終わりに出す */}
            {editing && (content.kind === 'text' || empty) && <span className="caret" aria-hidden="true" />}
            {editing && empty && hint && <span className="fx-hint">{hint}</span>}
          </span>
          {note && <span className="fx-note">{note}</span>}
        </div>
        {editing && onDone && (
          <button type="button" className="fx-done" aria-label="入力を終える" onPointerDown={keepFocus} onClick={onDone}>
            ✓
          </button>
        )}
      </div>
      {below}
    </>,
    slot,
  )
}
