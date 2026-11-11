// 部材の画面（仕様書 5.1・5.2・9・15.1・16・21・25）：［仕上がり］［調整］［木取り］のタブと部材の表。
// ［仕上がり］は入力できる表（押して選ぶ・もう一度押して入力。仕様書 17.1）。
// ［調整］は部材ごとの調整の表（PartAdjustTable。仕様書 25.2）。その下に調整寸法の表（AdjustTable。仕様書 25.3 で［仕上がり］から移した）を PartAdjustTable が置く。
// ［木取り］のタブのときだけ、表の上に切り代（数字キーで変える。仕様書 16.4）。［木取り］は同じ形の表を見るだけ。
// 寸法の計算は engine（computeDimensions）、切り出しの進み具合は engine（partCutProgress）に任せる
import { usableAdjusts } from '../../engine/adjusts'
import { useMemo, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { partCutProgress } from '../../engine/progress/partProgress'
import { browserStorage } from '../../store/storage'
import { useJobStore } from '../../store/useJobStore'
import { CutTable } from '../components/CutTable'
import { Help } from '../components/Help'
import { PartAdjustTable } from '../components/PartAdjustTable'
import { PartsTable } from '../components/PartsTable'
import { NumberField } from '../components/NumberField'
import { fmt } from '../format'
import { rotationState } from '../partsTable'
import { loadPartsTab, PARTS_TABS, savePartsTab, type PartsTab } from '../partsTab'

const ROTATION_TEXT = { all: 'オン', some: '一部', none: 'オフ' } as const

/** タブの色の印（仕上がり＝青、調整＝緑、木取り＝橙） */
const TAB_CLASS: Record<PartsTab, string> = { finished: 'fin', adjust: 'adjust', cut: 'cut' }

export function PartsScreen() {
  const { job, data, dispatch } = useJobStore()
  const [tab, setTabState] = useState<PartsTab>(() => loadPartsTab(browserStorage()))
  const [error, setError] = useState<string | null>(null)
  const adjusts = usableAdjusts(data.adjusts)
  const dims = useMemo(() => (job ? computeDimensions(job, adjusts) : null), [job, adjusts])
  const progress = useMemo(() => (job ? partCutProgress(job) : []), [job])
  if (!job || !dims) return null

  const setTab = (t: PartsTab) => {
    setTabState(t)
    setError(null)
    savePartsTab(browserStorage(), t)
  }
  const rotation = rotationState(job.parts)

  const toggleAllRotation = () => {
    const r = dispatch({ type: 'setAllRotatable', rotatable: rotation !== 'all' })
    setError(r.ok ? null : r.message)
  }

  const commitAllowance = (v: number): string | null => {
    const r = dispatch({ type: 'updateSettings', patch: { allowance: v } })
    return r.ok ? null : r.message
  }

  return (
    <section>
      <h2>
        <Help title="部材">
          部材の名前・W・H・枚数を、［仕上がり］のタブの表に仕上がり寸法で入れます。メラミン・シートの厚みや逃げなど、仕上がり寸法に足し引きする分は［調整］のタブに部材ごとに入れます。木取り寸法（調整後の寸法 ＋ 切り代）は［木取り］のタブで見られます。セルを1回押すと選び、もう一度押すと入力できます。
        </Help>
      </h2>

      <div className="parts-tabs" role="tablist" aria-label="仕上がり・調整・木取りの切り替え">
        {PARTS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={`parts-tab ${TAB_CLASS[t.value]}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`parts-band ${TAB_CLASS[tab]}`}>
        {tab === 'finished' ? (
          <Help title="仕上がり寸法">
            家具として完成したときの寸法です。セルを1回押すと選び（太い枠）、選んでいるセルをもう一度押すと入力できます。名前はスマホのキーボード、W・H・枚数は下にアプリのキーが出ます（W・H は数字のほか、式も入れられます）。式は「＝」を付けずに、そのまま打ち始めます（＋ − × ÷ ( ) や部材の寸法が入っていれば式）。入力中、欄が空か、カーソルのすぐ前が ＋ − × ÷ ( のときに、ほかの部材の W・H のセルを押すと、その寸法（例：天板.W）が入ります（名前の無い部材は使えません）。数字や寸法のすぐ後で押すと、入力を終えてそのセルを選びます。メラミン・シートの厚みなど調整寸法は、ここでは使わず［調整］のタブに入れます。「次へ」で 名前 → W → H → 枚数 → 次の行 と、入力したまま進みます。「閉じる」で入力を終えても、セルは選んだままです。選んでいるセルの角の丸い取っ手を引くと、選ぶ範囲を広げられます。番号を押すとその行全体、見出し（名前・W・H・枚数）を押すとその列全体を選びます。見出しを長押しすると並べ替えのメニュー（W・H・枚数は大きい順・小さい順、名前はあいうえお順・逆の順）が出て、並べ替えた順で保存します（空・エラーの部材は一番下。名前の無い部材の「#3」は新しい行の番号になります）。番号を押して行を選んだあと、選んでいる行の番号を上下に引くと、その行を動かせます（複数行も）。セルを長押しすると、切り取り・コピー・貼り付け・クリア・行の挿入と削除・複製・回転・仕上がりのメニューが出ます。右下の四角い取っ手を上か下へ引くと、選んでいるセルの値をくり返して入れます（オートフィル）。式で入れた欄は計算した寸法に「ƒ」が付き、エラーは赤で「エラー」と出ます（押すとキーの上に理由）。枚数が空の行は薄く出て、木取りに入りません（0 は寸法だけの行）。↺ は回転してよい部材、グレーの行は仕上がった部材です。何も入っていない行は保存しません。W は板の妻手、H は板の長手に合わせて置きます（回転しない部材）。
          </Help>
        ) : tab === 'adjust' ? (
          <Help title="調整（仕上がり寸法に足し引きする分）">
            コバに貼るメラミン・シートの厚みや逃げなど、仕上がり寸法に足し引きする分を、部材ごとに W・H へ入れます。W・H のセルを1回押すと選び、もう一度押すと下にアプリのキーが出ます。「＝」は付けずに、先頭の − で引き、＋ か記号なしで足します（例：−メラミン1×2、−2）。調整寸法は、欄が空か ＋ − × ÷ ( のすぐ後で、下の調整寸法の表の行を押すと入ります。部材の寸法（天板.W）は使えません。入力中にほかの部材の W・H を押すと、入力を終えてそのセルを選びます。「次へ」で W → H → 次の部材の W と進みます。名前・枚数は見るだけです（入れるのは［仕上がり］のタブ）。取っ手で範囲を広げ、番号で行、見出しで列を選べます。長押しで切り取り・コピー・貼り付け・クリアのメニュー（同じ調整をまとめて何行にも貼れます。［仕上がり］でコピーしたものは貼れません）、右下の四角い取っ手を引くとオートフィル。欄には、入れた値（例：−メラミン1）の下に調整後の寸法を出します。調整が空の欄は調整なしで、仕上がり寸法を薄く出します。調整後の寸法が 0 以下・式が読めない・削除した調整寸法を使っている、などは赤で「エラー」と出ます。仕上がり寸法がエラーのときは、調整後もエラーです。木取り寸法 ＝ 調整後の寸法 ＋ 切り代です。式の中の参照（天板.W）は、いつも仕上がり寸法を使います。表の下の調整寸法の表に、メラミン・シート・逃げなどの名前と寸法を入れておきます。
          </Help>
        ) : (
          <Help title={`木取り寸法（調整後 ＋ 切り代 ${fmt(job.settings.allowance)}）`}>
            パネルソーで切る寸法です。木取り寸法 ＝ 調整後の寸法（仕上がり寸法 ＋ ［調整］の値）＋ 切り代。見るだけで、ここでは編集できません（入力は［仕上がり］と［調整］のタブ）。「切った 2/5」は木取りの画面でチェックした数です。枚数 0 の行は「切らない」、枚数が空の行は薄く出て、木取りに入りません。
          </Help>
        )}
      </div>

      {tab === 'finished' ? (
        <>
          <div className="rot-all">
            <Help className="rot-all-label" title="全部回転してよい">
              オンにすると全部の部材が「回転してよい」（W・H を入れ替えて置いてもよい）に、オフにすると全部「回転しない」（W を板の妻手、H を板の長手に合わせて置く）になります。部材ごとに違うときは「一部」と出ます。部材ごとの回転は、セルを長押しして変えます。
            </Help>
            <button
              type="button"
              role="switch"
              aria-checked={rotation === 'all' ? 'true' : rotation === 'some' ? 'mixed' : 'false'}
              aria-label={`全部回転してよい：${ROTATION_TEXT[rotation]}`}
              className={`rot-switch ${rotation}`}
              disabled={job.parts.length === 0}
              onClick={toggleAllRotation}
            >
              <span className="rot-knob" aria-hidden="true" />
              <span className="rot-text">{ROTATION_TEXT[rotation]}</span>
            </button>
          </div>
          <PartsTable job={job} dims={dims} adjusts={adjusts} clip={data.cellClip} dispatch={dispatch} onError={setError} />
        </>
      ) : tab === 'adjust' ? (
        <PartAdjustTable job={job} dims={dims} adjusts={adjusts} clip={data.cellClip} dispatch={dispatch} onError={setError} />
      ) : (
        <>
          <div className="allowance-row">
            <Help className="allowance-label" title={<span className="label cut-ink">切り代</span>}>
              あとで削り仕上げるための余分です。木取り寸法 ＝ 調整後の寸法 ＋ 切り代（W・H に同じだけ足す）。変えると、下の表の木取り寸法がすぐ変わります。この仕事に保存します（木取りの画面でも変えられ、同じ値です）。
            </Help>
            <NumberField label="切り代" value={job.settings.allowance} onCommit={commitAllowance} onError={setError} />
          </div>
          <CutTable job={job} dims={dims} adjusts={adjusts} progress={progress} />
        </>
      )}
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
