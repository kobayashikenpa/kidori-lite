// 1枚ごとの切り出しチェック（仕様書 8。配置図のすぐ下）：1行＝1部材（例：□ 側板 ×2枚・410×710）。
// 行を押すと、その1枚の同じ部材の片をまとめて付け外しする（1つ目のチェックでその1枚を固定する。固定のボタンは無い）。
// 各行の左に、その部材の配置図と同じ色の印を付けて凡例を兼ねる（第2.1版 仕様書 25.2。切った行は配置図と同じくグレー）。
// 中身は engine の sheetPartChecklist の結果をそのまま並べる。kidori の ui/components/SheetChecklist.tsx をもとにしたもの
import type { SheetPartRow } from '../../engine/progress/sheetChecklist'
import { pieceColorClass } from '../kidoriView'

interface Props {
  /** 読み上げ用（「2枚目」） */
  label: string
  rows: readonly SheetPartRow[]
  /** その1枚のチェック済みの片（「残り ◯枚」に使う） */
  checked: readonly string[]
  /** 行を見分けるキー（1枚の id と部材の組。押した行の位置を保つのに使う） */
  rowKey: (row: SheetPartRow) => string
  /** 部材ごとの色の番号（配置図と同じ。部材の表の何行目か） */
  colorOf: (partId: string) => number
  onToggle: (row: SheetPartRow, el: HTMLElement) => void
}

export function SheetChecklist({ label, rows, checked, rowKey, colorOf, onToggle }: Props) {
  const done = new Set(checked)
  const left = rows.reduce((n, r) => n + r.pieceIds.filter((id) => !done.has(id)).length, 0)
  return (
    <div className="cl">
      <div className="cl-head">
        <h4>切り出しチェック</h4>
        <span className="cl-count num">{left === 0 ? 'すべて切り終わり' : `残り ${left}枚`}</span>
      </div>
      <ul className="cl-list">
        {rows.map((r) => (
          <li key={r.partId}>
            <button
              type="button"
              role="checkbox"
              aria-checked={r.done}
              aria-label={`${label} の ${r.name} ${r.pieceIds.length}枚 ${r.sizeLabel} を切った`}
              data-cl-key={rowKey(r)}
              className={`cl-row${r.done ? ' done' : ''}`}
              onClick={(e) => onToggle(r, e.currentTarget)}
            >
              <span className="check-box" aria-hidden="true">
                {r.done ? '✓' : ''}
              </span>
              <span className={`cl-swatch ${r.done ? 'done' : pieceColorClass(colorOf(r.partId))}`} aria-hidden="true" />
              <span className="cl-name">
                {r.name}
                <span className="cl-qty num"> ×{r.pieceIds.length}枚</span>
              </span>
              <span className="cl-size num">{r.sizeLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
