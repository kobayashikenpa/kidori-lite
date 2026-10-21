// 部材の画面の上にたたんで置く設定（仕様書 4・9）：板のサイズ・刃厚・端切り・切り代・切り方と、調整寸法の一覧（アプリ全体）。
// 板のサイズ・刃厚・端切り・切り代・切り方は、開いている仕事に保存する。数はアプリの数字キーで入れる
import { useId, useState } from 'react'
import { customSheet } from '../../engine/defaults'
import { BOARD_SIZES, type BoardSizeKind, type CutMode, type Settings } from '../../engine/types'
import { useJobStore } from '../../store/useJobStore'
import { CUT_MODES, SHEET_KINDS, settingsSummary, sheetSizeText } from '../settings'
import { AdjustList } from './AdjustList'
import { Help } from './Help'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'

export function SettingsPanel() {
  const { job, dispatch } = useJobStore()
  const [open, setOpen] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [numError, setNumError] = useState<string | null>(null)
  const bodyId = useId()
  if (!job) return null
  const s = job.settings

  const pickSheet = (kind: BoardSizeKind) => {
    setSheetError(null)
    if (kind === s.sheet.sizeKind) return
    // 自由入力に替えたときは、いまの板の大きさから直してもらう
    const sheet =
      kind === 'custom'
        ? customSheet(s.sheet.width, s.sheet.length)
        : { sizeKind: kind, width: BOARD_SIZES[kind][0], length: BOARD_SIZES[kind][1] }
    const r = dispatch({ type: 'setSheet', sheet })
    if (!r.ok) setSheetError(r.message)
  }

  const commitSheet = (width: number, length: number): string | null => {
    if (!(width > 0 && length > 0)) return '板の大きさは 0 より大きい数を入れてください'
    const r = dispatch({ type: 'setSheet', sheet: customSheet(width, length) })
    return r.ok ? null : r.message
  }

  const commitNum = (key: 'kerf' | 'trim' | 'allowance') => (v: number) => {
    const r = dispatch({ type: 'updateSettings', patch: { [key]: v } as Partial<Omit<Settings, 'sheet'>> })
    return r.ok ? null : r.message
  }

  const pickCut = (mode: CutMode) => {
    dispatch({ type: 'updateSettings', patch: { cutMode: mode } })
  }

  return (
    <div className={`card settings${open ? ' open' : ''}`}>
      <button
        type="button"
        className="settings-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="settings-title">設定</span>
        <span className="settings-sum">{settingsSummary(s)}</span>
        <span className={`settings-arrow${open ? ' open' : ''}`} aria-hidden="true">
          ›
        </span>
      </button>

      {open && (
        <div id={bodyId} className="settings-body">
          <section className="settings-sec" aria-label="板のサイズ">
            <h3>
              <Help title="板のサイズ">
                部材を切り出す板の大きさ（妻手×長手）です。3×6 は 910×1820、4×8 は 1220×2430。ほかの大きさは「自由入力」で入れます。
              </Help>
            </h3>
            <Segmented ariaLabel="板のサイズ" value={s.sheet.sizeKind} options={SHEET_KINDS} onChange={pickSheet} />
            {s.sheet.sizeKind === 'custom' ? (
              <div className="settings-grid two">
                <div className="field">
                  <span className="label">妻手（短い辺）</span>
                  <NumberField
                    label="妻手"
                    value={s.sheet.width}
                    onCommit={(v) => commitSheet(v, s.sheet.length)}
                    onError={setSheetError}
                  />
                </div>
                <div className="field">
                  <span className="label">長手（長い辺）</span>
                  <NumberField
                    label="長手"
                    value={s.sheet.length}
                    onCommit={(v) => commitSheet(s.sheet.width, v)}
                    onError={setSheetError}
                  />
                </div>
              </div>
            ) : (
              <p className="settings-note num">{sheetSizeText(s.sheet)} mm</p>
            )}
            {sheetError && (
              <p className="msg err" role="alert">
                {sheetError}
              </p>
            )}
          </section>

          <section className="settings-sec" aria-label="刃厚・端切り・切り代">
            <div className="settings-grid three">
              <div className="field">
                <Help title={<span className="label">刃厚</span>}>1回切るごとに刃で削れて消える幅です。0 でもかまいません。</Help>
                <NumberField label="刃厚" value={s.kerf} onCommit={commitNum('kerf')} onError={setNumError} />
              </div>
              <div className="field">
                <Help title={<span className="label">端切り</span>}>
                  板の端を最初に切り落として矩を出す幅です（刃厚を含む）。0 で端切りなし。
                </Help>
                <NumberField label="端切り" value={s.trim} onCommit={commitNum('trim')} onError={setNumError} />
              </div>
              <div className="field">
                <Help title={<span className="label cut-ink">切り代</span>}>
                  あとで削り仕上げるための余分です。木取り寸法 ＝ 仕上がり寸法 ＋ 切り代（W・H に同じだけ足す）。
                </Help>
                <NumberField label="切り代" value={s.allowance} onCommit={commitNum('allowance')} onError={setNumError} />
              </div>
            </div>
            {numError && (
              <p className="msg err" role="alert">
                {numError}
              </p>
            )}
          </section>

          <section className="settings-sec" aria-label="切り方">
            <h3>
              <Help title="切り方">
                縦切り優先：板を縦長に置き、長手方向の帯を切り出してから切り分けます。横切り優先：板を横長に置き、妻手方向の帯を切り出してから切り分けます。おまかせ：両方を計算して、必要な板が少ないほうを使います。
              </Help>
            </h3>
            <Segmented ariaLabel="切り方" value={s.cutMode} options={CUT_MODES} onChange={pickCut} />
          </section>

          <section className="settings-sec" aria-label="調整寸法">
            <h3>
              <Help title="調整寸法">
                逃げ・ほぞ・メラミンなど、仕上がり寸法を伸ばしたり短くしたりする寸法です。名前と寸法で登録し、式のボタンで入れて足し引きします。どの仕事でも同じ一覧を使います。
              </Help>
            </h3>
            <AdjustList />
          </section>

        </div>
      )}
    </div>
  )
}
