// 部材の画面（仕様書 5.1・5.2・9・15.1・16・21・25）：［仕上がり］［調整］［木取り］のタブと部材の表。
// ［仕上がり］は入力できる表（押して選ぶ・もう一度押して入力。仕様書 17.1）。
// ［調整］は部材ごとの調整の表（PartAdjustTable。仕様書 25.2）。その下に調整寸法の表（AdjustTable。仕様書 25.3 で［仕上がり］から移した）を PartAdjustTable が置く。
// ［木取り］のタブのときだけ、表の上に切り代（数字キーで変える。仕様書 16.4）。［木取り］は同じ形の表を見るだけ。
// タブのすぐ下に式の欄（FormulaBar の置き場所 slot。仕様書 25.8）。タブと式の欄は画面の上に止める（上の仕事の名前の下）。
// 寸法の計算は engine（computeDimensions）、切り出しの進み具合は engine（partCutProgress）に任せる
import { usableAdjusts } from '../../engine/adjusts'
import { useEffect, useMemo, useState } from 'react'
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
  // 式の欄の置き場所（表が選んでいるセルの中身をここへ出す）
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null)
  // タブと式の欄を止める位置（上の仕事の名前の帯の高さ。文字の大きさ・画面の向きで変わるので測る）
  const stickyTop = useTopbarHeight()
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
          部材の名前・厚み・W・H・枚数を、［仕上がり］のタブの表に仕上がり寸法で入れます（厚みは入れなくてもかまいません）。メラミン・シートの厚みや逃げなど、仕上がり寸法に足し引きする分は［調整］のタブに部材ごとに入れます。木取り寸法（調整後の寸法 ＋ 切り代）は［木取り］のタブで見られます。セルを1回押すと選び、タブのすぐ下の欄にそのセルの中身（式なら 天板.W − 20）が出ます。欄を押すか、選んでいるセルをもう一度押すと、その欄で入力できます（キーは画面の下。右の ✓ で入力を終えます）。エラーの理由は欄のすぐ下に赤で出ます。タブと欄は、表をスクロールしても画面の上に残ります。
        </Help>
      </h2>

      <div className="parts-sticky" style={{ top: stickyTop }}>
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
        {/* 式の欄（仕様書 25.8）。何も選んでいない・名前のセルのときは空の欄（高さは変えない） */}
        <div className={`fx-slot ${TAB_CLASS[tab]}`} ref={setBarSlot} aria-label="選んだセルの中身" />
      </div>

      <div className={`parts-band ${TAB_CLASS[tab]}`}>
        {tab === 'finished' ? (
          <Help title="仕上がり寸法">
            家具として完成したときの寸法です。セルを1回押すと選び（太い枠）、タブのすぐ下の欄にそのセルの中身が出ます。欄を押すか、選んでいるセルをもう一度押すと入力できます。名前はその場でスマホのキーボード、厚み・W・H・枚数は上の欄で入力し、下にアプリのキーが出ます（W・H は数字のほか、式も入れられます。欄の式を押すとその位置にカーソルが移ります）。厚みは入れなくてもかまいません（数字だけ。小数も入ります）。W・H の式では 天板.T のように厚みを使えます。厚みは木取り（板への並べ方）には影響しません。式は「＝」を付けずに、そのまま打ち始めます（＋ − × ÷ ( ) や部材の寸法が入っていれば式）。入力中、欄が空か、カーソルのすぐ前が ＋ − × ÷ ( のときに、ほかの部材の W・H・厚みのセルを押すと、その寸法（例：天板.W、厚みなら 天板.T）が入ります（名前の無い部材は使えません。厚みが空の部材の 天板.T はエラーになります）。数字や寸法のすぐ後で押すと、入力を終えてそのセルを選びます。メラミン・シートの厚みなど調整寸法は、ここでは使わず［調整］のタブに入れます。「次へ」（名前はスマホのキーボードの改行）で、入力したまま進みます。名前は次の行の名前、厚みは次の行の厚みへ縦に進み、W・H・枚数は W → H → 枚数 → 次の行の W と横に進みます。名前を打つときは、打っている行がキーボードに隠れないよう表が動きます。「閉じる」か欄の右の ✓ で入力を終えても、セルは選んだままです。選んでいるセルの角の丸い取っ手を引くと、選ぶ範囲を広げられます。番号を押すとその行全体、見出し（名前・厚み・W・H・枚数）を押すとその列全体を選びます。見出しを長押しすると並べ替えのメニュー（厚み・W・H・枚数は大きい順・小さい順、名前はあいうえお順・逆の順）が出て、並べ替えた順で保存します（空・エラーの部材は一番下。名前の無い部材の「#3」は新しい行の番号になります）。番号を長押しすると、その行が持ち上がって指についてきます（ほかの行がよけます）。そのまま引いて、入れたい所で指を離すと、その順で保存します（表の上や下の端まで引くと表が動きます）。選んでいる行（複数行も）の番号は、長押ししなくてもすぐ上下に引けます。長押しして動かさずに離すと、長押しのメニューが出ます。セルを長押しすると、切り取り・コピー・貼り付け・クリア・色・行の挿入と削除・複製・回転・仕上がりのメニューが出ます。「色」（赤・青・黄・なし）は、セルを長押ししたときは選んでいるセルに、番号を長押ししたときは選んでいる行全体に付きます（セルの色と行の色が両方あるときはセルの色。番号の「なし」は行の色だけ消します）。色は［調整］［木取り］の表にも同じ所に出て、並べ替え・行の移動・複製でも部材についていきます。コピー・貼り付けでは色は写らず、クリアでも消えません。右下の四角い取っ手を上か下へ引くと、選んでいるセルの値をくり返して入れます（オートフィル）。名前をコピーして貼ったとき・オートフィルしたときは、同じ名前のまま入ります。同じ名前の部材は名前が赤くなり、選ぶと上の欄の下に「同じ名前があります」と出ます（どちらかの名前を変えると消えます）。同じ名前の部材の寸法（棚板.W など）を使う式は、どちらか決まらないのでエラーになります。打って同じ名前にすることはできません。式で入れた欄は計算した寸法に「ƒ」が付き、エラーは赤で「エラー」と出ます（選ぶと、上の欄のすぐ下に理由）。枚数が空の行は薄く出て、木取りに入りません（0 は寸法だけの行）。↺ は回転してよい部材、グレーの行は仕上がった部材です。何も入っていない行は保存しません。W は板の妻手、H は板の長手に合わせて置きます（回転しない部材）。
          </Help>
        ) : tab === 'adjust' ? (
          <Help title="調整（仕上がり寸法に足し引きする分）">
            コバに貼るメラミン・シートの厚みや逃げなど、仕上がり寸法に足し引きする分を、部材ごとに W・H へ入れます。W・H のセルを1回押すと選び、上の欄に調整の値が出ます。欄を押すか、もう一度押すと欄で入力でき、下にアプリのキーが出ます。「＝」は付けずに、先頭の − で引き、＋ か記号なしで足します（例：−メラミン1×2、−2）。調整寸法は、欄が空か ＋ − × ÷ ( のすぐ後で、下の調整寸法の表の行を押すと入ります。部材の寸法（天板.W）は使えません。入力中にほかの部材の W・H を押すと、入力を終えてそのセルを選びます。「次へ」で W → H → 次の部材の W と進みます。名前・厚み・枚数は見るだけです（入れるのは［仕上がり］のタブ）。取っ手で範囲を広げ、番号で行、見出しで列を選べます。長押しで切り取り・コピー・貼り付け・クリア・色のメニュー（同じ調整をまとめて何行にも貼れます。［仕上がり］でコピーしたものは貼れません。色は［仕上がり］と同じく、セルの長押しはセルの色、番号の長押しは行の色）、右下の四角い取っ手を引くとオートフィル。欄には、入れた値（例：−メラミン1）の下に調整後の寸法を出します。調整が空の欄は調整なしで、仕上がり寸法を薄く出します。調整後の寸法が 0 以下・式が読めない・削除した調整寸法を使っている、などは赤で「エラー」と出ます。仕上がり寸法がエラーのときは、調整後もエラーです。木取り寸法 ＝ 調整後の寸法 ＋ 切り代です。式の中の参照（天板.W）は、いつも仕上がり寸法を使います。表の下の調整寸法の表に、メラミン・シート・逃げなどの名前と寸法を入れておきます。
          </Help>
        ) : (
          <Help title={`木取り寸法（調整後 ＋ 切り代 ${fmt(job.settings.allowance)}）`}>
            パネルソーで切る寸法です。木取り寸法 ＝ 調整後の寸法（仕上がり寸法 ＋ ［調整］の値）＋ 切り代。見るだけで、ここでは編集できません（入力は［仕上がり］と［調整］のタブ）。厚みは［仕上がり］で入れたものを見るだけで出します（切り代は足しません）。色は［仕上がり］［調整］で付けたものを見るだけで出します。厚み・W・H・枚数のセルを押すと、上の欄にその部材の仕上がりの式（または数字）が出ます（見るだけ）。「切った 2/5」は木取りの画面でチェックした数です。枚数 0 の行は「切らない」、枚数が空の行は薄く出て、木取りに入りません。
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
          <PartsTable job={job} dims={dims} adjusts={adjusts} clip={data.cellClip} dispatch={dispatch} onError={setError} barSlot={barSlot} />
        </>
      ) : tab === 'adjust' ? (
        <PartAdjustTable job={job} dims={dims} adjusts={adjusts} clip={data.cellClip} dispatch={dispatch} onError={setError} barSlot={barSlot} />
      ) : (
        <>
          <div className="allowance-row">
            <Help className="allowance-label" title={<span className="label cut-ink">切り代</span>}>
              あとで削り仕上げるための余分です。木取り寸法 ＝ 調整後の寸法 ＋ 切り代（W・H に同じだけ足す）。変えると、下の表の木取り寸法がすぐ変わります。この仕事に保存します（木取りの画面でも変えられ、同じ値です）。
            </Help>
            <NumberField label="切り代" value={job.settings.allowance} onCommit={commitAllowance} onError={setError} />
          </div>
          <CutTable job={job} dims={dims} adjusts={adjusts} progress={progress} barSlot={barSlot} />
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

/** 上の仕事の名前の帯（.topbar）の高さ（px）。測れないときは 0 */
function useTopbarHeight(): number {
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.topbar')
    if (!el) return
    const measure = () => setH(el.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return h
}
