// 木取りの画面（仕様書 8）：上に必要な板の枚数・全体の歩留まり（大きく）・今の板と切り方、3×6 と 4×8 の比べ（押すとそのサイズにして仕事に保存）、
// 板に収まらない部材・計算から外した部材の知らせ、板1枚ごとの配置図・歩留まり・端材の一覧。切る順番は出さない。
// 計算はすべて engine（computeDimensions → packJob・compareStandardSizes・frozenSheetViews）。
// 部材・設定・調整寸法・固定した1枚が変わったときだけ計算し直す（useMemo）
import { useMemo, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { packJob } from '../../engine/packing'
import { compareStandardSizes, type SizeSummary, type StandardSize } from '../../engine/packing/sizes'
import { frozenSheetViews, type FrozenSheetView } from '../../engine/progress/frozen'
import { BOARD_SIZES, type SheetLayout } from '../../engine/types'
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'
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
    }
  }, [job, adjusts])
  const [openFinished, setOpenFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!job || !calc) return null
  const { dims, result, compare, views } = calc
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
    })),
    ...result.sheets.map((sh) => ({
      key: `c${sh.index}`,
      layout: sh,
      board: sheetLabel(result.sheet),
      mode: result.mode,
      trim: s.trim,
      view: null,
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

  return (
    <section>
      <h2>
        <Help title="木取り">
          部材の木取り寸法（仕上がり寸法 ＋ 切り代）を板に並べた結果です。板のサイズ・刃厚・端切り・切り代・切り方は、部材の画面の「設定」で変えられます。
          部材は右（端切りをした側）の上から詰め、端材は左下に残ります。
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

      {active.length > 0 && (
        <div className="stack kd-sheets">
          {active.map((e) => (
            <SheetCard key={e.key} entry={e} count={count} colorOf={colorOf} />
          ))}
        </div>
      )}

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
          {openFinished && (
            <div className="stack kd-finished">
              {finished.map((e) => (
                <SheetCard key={e.key} entry={e} count={count} colorOf={colorOf} />
              ))}
            </div>
          )}
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
}

function SheetCard({ entry, count, colorOf }: SheetCardProps) {
  const { layout, no } = entry
  const landscape = layout.orientation === 'landscape'
  const complete = entry.view?.complete === true
  return (
    <article className={`card kd-sheet${complete ? ' finished' : ''}`} aria-label={`${no}枚目`}>
      <header className="kd-sheet-head">
        <span className="kd-sheet-no">
          {complete ? '切り終わり ' : ''}
          {no}枚目<span className="kd-of num"> / {count}枚</span>
        </span>
        <span className="kd-sheet-yield num">歩留まり {pct(layout.yieldRate)}</span>
      </header>
      <p className="band-note num">
        {entry.board}（{fmt(layout.boardWidth)}×{fmt(layout.boardLength)}）・{cutModeLabel(entry.mode)}・部材 {layout.placements.length}枚
      </p>
      <SheetDiagram layout={layout} no={no} colorOf={colorOf} />
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
    </article>
  )
}
