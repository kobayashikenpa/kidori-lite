// 入力欄が見やすい位置に来るように、いちばん近いスクロールする枠（部材の編集シート・画面全体）を動かす
// 式のボタンの並び（FormulaInput）と数字キー（KeypadField）で使う。kidori の ui/scroll.ts から、文字の入力欄の部分を外したもの

/** いちばん近いスクロールする枠。無ければ画面全体 */
export function nearestScroller(el: HTMLElement): HTMLElement | null {
  let box: HTMLElement | null = el.parentElement
  while (box && box !== document.body && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  // body の overflow は画面全体のスクロールになる（body 自身は動かない）
  const s = box && box !== document.body ? box : document.scrollingElement
  return s instanceof HTMLElement ? s : null
}

/** 枠の四角と、Safari の見えている範囲（visualViewport：キーボードが出ると狭くなる）の重なり */
function visibleBand(r: DOMRect) {
  const vv = window.visualViewport
  return {
    viewTop: Math.max(r.top, vv ? vv.offsetTop : 0),
    viewBottom: Math.min(r.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight),
  }
}

function scrollerRect(scroller: HTMLElement) {
  return scroller === document.scrollingElement ? new DOMRect(0, 0, window.innerWidth, window.innerHeight) : scroller.getBoundingClientRect()
}

/** 動きを減らす設定なら、なめらかにしない */
function scrollByDelta(scroller: HTMLElement, delta: number) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  scroller.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' })
}

/** 式の欄とボタンの並びが見えるように、いちばん近いスクロールする枠（部材の編集シート）を動かす。
 * 全部が収まるなら動かす量をいちばん少なく、収まらないなら式の欄を枠の上端に合わせる。
 * 下端は、枠の下の余白（iPhone のホームバーの分 safe-area を含む）と、Safari の見えている範囲（visualViewport）を考える */
export function scrollIntoComfort(field: HTMLElement, pad: HTMLElement) {
  const scroller = nearestScroller(field)
  if (!scroller) return
  const r = scrollerRect(scroller)
  const { viewTop, viewBottom } = visibleBand(r)
  const margin = 8
  const bottomMargin = Math.max(margin, Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0)
  const top = field.getBoundingClientRect().top
  const bottom = pad.getBoundingClientRect().bottom
  // いまのスクロール位置からの差
  const needDown = bottom - (viewBottom - bottomMargin) // 正ならこれだけ下へ動かすとボタンの並びの下端が見える
  const maxDown = top - (viewTop + margin) // これより下へ動かすと式の欄の上端が隠れる
  let delta = 0
  if (bottom - top > viewBottom - bottomMargin - (viewTop + margin)) delta = maxDown
  else if (needDown > 0) delta = needDown
  else if (maxDown < 0) delta = maxDown
  if (Math.abs(delta) < 1) return
  scrollByDelta(scroller, delta)
}

/** 数字キー（画面の下に出る）に隠れないように、入力欄を上へ動かす。下が足りなければ枠の下に余白を足す。
 * 返す関数で余白を元に戻す */
export function keepAbovePad(field: HTMLElement, pad: HTMLElement): () => void {
  const scroller = nearestScroller(field)
  if (!scroller) return () => {}
  const target = scroller === document.scrollingElement ? document.body : scroller
  const prev = target.style.paddingBottom
  const base = Number.parseFloat(getComputedStyle(target).paddingBottom) || 0
  const padH = pad.getBoundingClientRect().height
  target.style.paddingBottom = `${base + padH}px`
  const { viewTop } = visibleBand(scrollerRect(scroller))
  const margin = 12
  const f = field.getBoundingClientRect()
  const padTop = pad.getBoundingClientRect().top
  let delta = 0
  if (f.bottom > padTop - margin) delta = f.bottom - (padTop - margin)
  if (f.top - delta < viewTop + margin) delta = f.top - (viewTop + margin)
  if (Math.abs(delta) >= 1) scrollByDelta(scroller, delta)
  return () => {
    target.style.paddingBottom = prev
  }
}

