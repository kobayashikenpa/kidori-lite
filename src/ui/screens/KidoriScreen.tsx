// 木取りの画面（仕様書 8）：上に必要な板の枚数・全体の歩留まり（大きく）・今の板と切り方、3×6 と 4×8 の比べ（押すとそのサイズにして仕事に保存）、
// 板に収まらない部材・計算から外した部材の知らせ、板1枚ごとの配置図・歩留まり・端材の一覧・切り出しチェック、部材ごとの進み具合。切る順番は出さない。
// 計算はすべて engine（computeDimensions → packJob・compareStandardSizes・frozenSheetViews・sheetPartChecklist・partCutProgress）、
// チェックの付け外しは store の setPartCheck（engine の setPartCheck）。
// pieceId は1枚の中でだけ重ならないので、1枚をまたぐキーは1枚の id（固定した1枚の id、計算した1枚は「c」＋何枚目か）と組にする
// 部材・設定・調整寸法・固定した1枚が変わったときだけ計算し直す（useMemo）
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { packJob } from '../../engine/packing'
import { compareStandardSizes, type SizeSummary, type StandardSize } from '../../engine/packing/sizes'
import type { SheetTarget } from '../../engine/progress/checks'
import { frozenSheetViews, type FrozenSheetView } from '../../engine/progress/frozen'
import { partCutProgress } from '../../engine/progress/partProgress'
import { sheetPartChecklist, type SheetPartRow } from '../../engine/progress/sheetChecklist'
import { BOARD_SIZES, type SheetLayout } from '../../engine/types'
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'
import { SheetChecklist } from '../components/SheetChecklist'
import { SheetDiagram } from '../components/SheetDiagram'
import { fmt } from '../format'
import { pct, scrapLabel } from '../kidoriView'
import { cutModeLabel, sheetLabel, sheetSizeText } from '../settings'

/** 画面に出す1枚（固定した1枚、または計算した1枚） */
interface SheetEntry {
  /** React のキー・1枚の id（固定した1枚は id、計算した1枚は「c」＋何枚目か） */
  key: string
  /** 通し番号（固定した1枚 → 計算した1枚） */
  no: number
  layout: SheetLayout
  /** 板の呼び名（4×8 など） */
  board: string
  mode: 'vertical' | 'horizontal'
  trim: number
  /** 固定した1枚なら、そのまとめ（部材が変わっています・切り終わり） */
  view: FrozenSheetView | null
  /** チェックを付け外しする相手 */
  target: SheetTarget
  /** チェックした片（計算した1枚は空） */
  checked: readonly string[]
  /** 切り出しチェックの一覧（同じ部材を1行） */
  rows: SheetPartRow[]
}

const DRIFT_REASON: Record<FrozenSheetView['drift'][number]['reason'], string> = {
  size: '寸法',
  count: '枚数',
  removed: '部材の削除',
}

const SIZE_LABEL: Record<StandardSize, string> = { saburoku: '3×6', shihachi: '4×8' }

export function KidoriScreen() {
  const { job, data, dispatch } = useJobStore()
  const adjusts = data.adjusts
  // 部材・設定・調整寸法・固定した1枚が変わったときだけ計算する（仕事は、部材・設定・固定した1枚・名前を変えたときだけ新しくなる。
  // 名前はこの画面では変えないので、仕事と調整寸法を見ていれば足りる）
  const calc = useMemo(() => {
    if (!job) return null
    const dims = computeDimensions(job, adjusts)
    return {
      dims,
      result: packJob(job, dims),
      compare: compareStandardSizes(job, dims),
      views: frozenSheetViews(job, dims),
      progress: partCutProgress(job),
    }
  }, [job, adjusts])
  const [openFinished, setOpenFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // チェックで失敗したときの知らせ（その1枚の中に出す）
  const [checkError, setCheckError] = useState<{ key: string; message: string } | null>(null)
  // チェックを付け外しすると1枚の並びが変わる（計算した1枚が固定した1枚になって前に来る）ので、押した行が画面の同じ位置に残るようにスクロールを戻す
  const anchor = useRef<{ key: string; top: number } | null>(null)
  useLayoutEffect(() => {
    const a = anchor.current
    if (!a) return
    anchor.current = null
    const el = document.querySelector<HTMLElement>(`[data-cl-key="${CSS.escape(a.key)}"]`)
    if (!el) return
    const delta = el.getBoundingClientRect().top - a.top
    if (Math.abs(delta) > 1) window.scrollBy(0, delta)
  }, [job])
  if (!job || !calc) return null
  const { dims, result, compare, views, progress } = calc
  const s = job.settings

  // 1枚の並び：固定した1枚（固定した順）→ 計算した1枚。通し番号もこの順に振り直す
  const entries: SheetEntry[] = [
    ...views.map((v) => ({
      key: v.sheet.id,
      layout: v.sheet.layout,
      board: sheetLabel(v.sheet.sheet),
      mode: v.sheet.mode,
      trim: v.sheet.trim,
      view: v,
      target: { kind: 'frozen', sheetId: v.sheet.id } as SheetTarget,
      checked: v.sheet.checked,
      rows: sheetPartChecklist(job, v.sheet.layout, v.sheet.checked),
    })),
    ...result.sheets.map((sh) => ({
      key: `c${sh.index}`,
      layout: sh,
      board: sheetLabel(result.sheet),
      mode: result.mode,
      trim: s.trim,
      view: null,
      target: { kind: 'computed', mode: result.mode, layout: sh } as SheetTarget,
      checked: [],
      rows: sheetPartChecklist(job, sh, []),
    })),
  ].map((e, i) => ({ ...e, no: i + 1 }))
  const active = entries.filter((e) => !e.view?.complete)
  const finished = entries.filter((e) => e.view?.complete)
  const count = entries.length
  const colorOf = (partId: string) => Math.max(0, job.parts.findIndex((p) => p.id === partId))
  const empty = count === 0 && result.unplaced.length === 0 && result.skipped.length === 0

  const pickSize = (kind: StandardSize) => {
    if (s.sheet.sizeKind === kind) return
    const [width, length] = BOARD_SIZES[kind]
    const r = dispatch({ type: 'setSheet', sheet: { sizeKind: kind, width, length } })
    setError(r.ok ? null : r.message)
  }

  const toggle = (e: SheetEntry, row: SheetPartRow, el: HTMLElement) => {
    const top = el.getBoundingClientRect().top
    const before = new Set(job.frozenSheets.map((f) => f.id))
    const r = dispatch({ type: 'setPartCheck', target: e.target, partId: row.partId, done: !row.done })
    if (!r.ok) {
      setCheckError({ key: e.key, message: r.message })
      return
    }
    setCheckError(null)
    // 計算した1枚に付けたときは、新しく固定した1枚の id が、押した行の1枚の id になる
    const next = r.state.data.jobs.find((j) => j.id === job.id)
    const made = next?.frozenSheets.find((f) => !before.has(f.id))
    anchor.current = { key: `${made ? made.id : e.key}:${row.partId}`, top }
  }
  const card = (e: SheetEntry) => (
    <SheetCard
      key={e.key}
      entry={e}
      count={count}
      colorOf={colorOf}
      error={checkError?.key === e.key ? checkError.message : null}
      onToggle={(row, el) => toggle(e, row, el)}
    />
  )

  return (
    <section>
      <h2>
        <Help title="木取り">
          部材の木取り寸法（仕上がり寸法 ＋ 切り代）を板に並べた結果です。板のサイズ・刃厚・端切り・切り代・切り方は、部材の画面の「設定」で変えられます。
          部材は右（端切りをした側）の上から詰め、端材は左下に残ります。
          部材を切ったら、配置図の下の切り出しチェックを押します。1つ目のチェックで、その1枚の並べ方を固定します（部材や設定を変えても、その1枚は変わりません）。
          全部チェックすると「切り終わり」として下にたたみ、チェックを全部外すと固定が外れます。
        </Help>
      </h2>

      {empty ? (
        <div className="card placeholder">切り出す部材がありません。部材の画面で、部材と枚数を入れてください。</div>
      ) : (
        <div className="card kd-summary">
          <div className="kd-big">
            <div>
              <span className="kd-k">必要な板</span>
              <span className="kd-v num">
                {result.sheetCount}
                <small>枚</small>
              </span>
            </div>
            <div>
              <span className="kd-k">全体の歩留まり</span>
              <span className="kd-v num">{result.sheetCount > 0 ? pct(result.yieldRate) : '―'}</span>
            </div>
          </div>
          <p className="kd-board">
            <span>
              板：<b>{sheetLabel(s.sheet)}</b>
              {s.sheet.sizeKind !== 'custom' && <span className="num">（{sheetSizeText(s.sheet)}）</span>}
            </span>
            <span>
              切り方：<b>{cutModeLabel(result.mode)}</b>
              {s.cutMode === 'auto' && <span className="chip ok">おまかせで選択</span>}
            </span>
          </p>
          <p className="kd-board-sub num">
            刃厚 {fmt(s.kerf)}・端切り {fmt(s.trim)}・切り代 {fmt(s.allowance)}
          </p>
        </div>
      )}

      {!empty && (
        <section className="kd-compare" aria-label="3×6 と 4×8 の比べ">
          <h3>
            <Help title="3×6 と 4×8 の比べ">
              同じ部材を 3×6（910×1820）と 4×8（1220×2430）で計算した、必要な板の枚数と歩留まりです。押すと、その板のサイズに切り替わります（仕事に保存します）。
            </Help>
          </h3>
          <div className="kd-sizes">
            {compare.options.map((o) => (
              <SizeButton
                key={o.kind}
                o={o}
                current={s.sheet.sizeKind === o.kind}
                fewer={compare.fewer === o.kind}
                higher={compare.higher === o.kind}
                onPick={() => pickSize(o.kind)}
              />
            ))}
          </div>
          {s.sheet.sizeKind === 'custom' && (
            <p className="band-note num">今の板は 自由入力（{sheetSizeText(s.sheet)}）です。押すと 3×6・4×8 に切り替わります</p>
          )}
          {error && (
            <p className="msg err" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {result.unplaced.length > 0 && (
        <div className="card kd-issues err" role="alert">
          <h4>板に収まらない部材</h4>
          <p className="band-note">どう置いても板（端切りの後）に入りません。寸法か板のサイズを見直してください。</p>
          <ul>
            {result.unplaced.map((u) => {
              const cut = dims.parts.find((d) => d.partId === u.partId)?.cut
              return (
                <li key={u.partId}>
                  <b>{u.name}</b>
                  {cut && <span className="num">（木取り {`${fmt(cut.W)}×${fmt(cut.H)}`}）</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {result.skipped.length > 0 && (
        <div className="card kd-issues warn" role="alert">
          <h4>計算から外した部材（寸法のエラー）</h4>
          <p className="band-note">部材の画面で式を直すと、木取りに入ります。</p>
          <ul>
            {result.skipped.map((k) => {
              const msg = dims.parts.find((d) => d.partId === k.partId)?.errors[0]?.message
              return (
                <li key={k.partId}>
                  <b>{k.name}</b>
                  {msg && `：${msg}`}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {progress.length > 0 && job.frozenSheets.length > 0 && (
        <div className="card kd-progress">
          <h4>部材ごとの進み具合</h4>
          <ul className="pp-list">
            {progress.map((p) => {
              const all = p.done >= p.total
              return (
                <li key={p.partId} className={`pp-row${all ? ' all' : ''}`}>
                  <span className="pp-name">{p.name}</span>
                  <span
                    className="pp-bar"
                    role="progressbar"
                    aria-label={`${p.name} の切り出し`}
                    aria-valuemin={0}
                    aria-valuemax={p.total}
                    aria-valuenow={p.done}
                  >
                    <span className="pp-fill" style={{ width: `${(Math.min(p.done, p.total) / p.total) * 100}%` }} />
                  </span>
                  <span className="pp-count num">
                    {p.done}/{p.total}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {active.length > 0 && <div className="stack kd-sheets">{active.map(card)}</div>}

      {finished.length > 0 && (
        <>
          <button
            type="button"
            className="kd-finished-btn"
            aria-expanded={openFinished}
            onClick={() => setOpenFinished((o) => !o)}
          >
            <span className="num">切り終わり {finished.length}枚</span>
            <span className="kd-finished-hint">{openFinished ? '閉じる' : '開いて見る'}</span>
          </button>
          {openFinished && <div className="stack kd-finished">{finished.map(card)}</div>}
        </>
      )}
    </section>
  )
}

interface SizeButtonProps {
  o: SizeSummary
  current: boolean
  fewer: boolean
  higher: boolean
  onPick: () => void
}

function SizeButton({ o, current, fewer, higher, onPick }: SizeButtonProps) {
  const label = SIZE_LABEL[o.kind]
  return (
    <button
      type="button"
      className="kd-size"
      aria-pressed={current}
      aria-label={`${label}：必要な板 ${o.sheetCount}枚、歩留まり ${pct(o.yieldRate)}${o.unplacedCount > 0 ? `、収まらない部材 ${o.unplacedCount}件` : ''}${current ? '（今の板）' : ''}`}
      onClick={onPick}
    >
      <span className="kd-size-name">
        {label}
        {current && <span className="kd-size-now">今の板</span>}
      </span>
      <span className="kd-size-count num">
        {o.sheetCount}
        <small>枚</small>
      </span>
      <span className="kd-size-yield num">歩留まり {o.sheetCount > 0 ? pct(o.yieldRate) : '―'}</span>
      {(fewer || higher || o.unplacedCount > 0) && (
        <span className="kd-size-tags">
          {fewer && <span className="chip ok">枚数が少ない</span>}
          {higher && <span className="chip ok">歩留まりが高い</span>}
          {o.unplacedCount > 0 && <span className="chip bad">収まらない {o.unplacedCount}件</span>}
        </span>
      )}
    </button>
  )
}

interface SheetCardProps {
  entry: SheetEntry
  count: number
  colorOf: (partId: string) => number
  error: string | null
  onToggle: (row: SheetPartRow, el: HTMLElement) => void
}

function SheetCard({ entry, count, colorOf, error, onToggle }: SheetCardProps) {
  const { layout, no } = entry
  const landscape = layout.orientation === 'landscape'
  const complete = entry.view?.complete === true
  const drift = entry.view?.drift ?? []
  return (
    <article className={`card kd-sheet${complete ? ' finished' : ''}`} aria-label={`${no}枚目`}>
      {drift.length > 0 && (
        <p className="kd-drift" role="note">
          部材が変わっています：{drift.map((d) => `${d.name}（${DRIFT_REASON[d.reason]}）`).join('・')}
          <span className="band-note">この1枚は固定したままです。並べ直すときは、チェックをすべて外してください。</span>
        </p>
      )}
      <header className="kd-sheet-head">
        <span className="kd-sheet-no">
          {complete ? '切り終わり ' : ''}
          {no}枚目<span className="kd-of num"> / {count}枚</span>
          {entry.view && !complete && <span className="chip kd-fixed">固定</span>}
        </span>
        <span className="kd-sheet-yield num">歩留まり {pct(layout.yieldRate)}</span>
      </header>
      <p className="band-note num">
        {entry.board}（{fmt(layout.boardWidth)}×{fmt(layout.boardLength)}）・{cutModeLabel(entry.mode)}・部材 {layout.placements.length}枚
      </p>
      <SheetDiagram layout={layout} no={no} colorOf={colorOf} checked={entry.checked} />
      <p className="dg-legend">
        {layout.trims.length > 0 && (
          <span>
            <i className="dg-key trim" />
            端切り {fmt(entry.trim)}（{landscape ? (layout.usable.y > 0 ? '下・右' : '上・右') : '右'}）
          </span>
        )}
        <span>
          <i className="dg-key scrap" />
          端材
        </span>
        {entry.checked.length > 0 && (
          <span>
            <i className="dg-key done" />
            済（切った部材）
          </span>
        )}
        <span>寸法は W×H（木取り寸法）</span>
      </p>
      <div className="kd-scraps">
        <span className="kd-scraps-h">端材</span>
        {layout.scraps.length === 0 ? (
          <span className="kd-scraps-none">なし</span>
        ) : (
          <ul className="kd-scraps-list num">
            {layout.scraps.map((r, i) => (
              <li key={i}>{scrapLabel(r, layout.orientation)}</li>
            ))}
          </ul>
        )}
      </div>
      <SheetChecklist
        label={`${no}枚目`}
        rows={entry.rows}
        checked={entry.checked}
        rowKey={(r) => `${entry.key}:${r.partId}`}
        onToggle={onToggle}
      />
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}
