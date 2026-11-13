// 入力欄が見やすい位置に来るように、いちばん近いスクロールする枠（シート・画面全体）を動かす
// 数字キー（KeypadField）で使う。kidori の ui/scroll.ts から、文字の入力欄の部分を外したもの
// 第2.2版（仕様書 26.4）：表の入力している行を見せるスクロールの量（revealDelta）と、見えている範囲（visibleRange）もここに置く

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


/** 縦の範囲（px。画面の上からの位置） */
export interface Band {
  top: number
  bottom: number
}

/**
 * 行（rect）を、見えている範囲（band）の中に margin を空けて入れるためにスクロールする量（px。+ は下へ）。
 * 下にはみ出していれば下の端に、上に隠れていれば上の端に合わせる（両方なら上を優先＝行の頭が見える）。入っていれば 0。
 * 動きが 1px 未満なら 0
 */
export function revealDelta(rect: Band, band: Band, margin: number): number {
  let delta = 0
  if (rect.bottom > band.bottom - margin) delta = rect.bottom - (band.bottom - margin)
  if (rect.top - delta < band.top + margin) delta = rect.top - (band.top + margin)
  return Math.abs(delta) < 1 ? 0 : delta
}

/**
 * 表の行が見えている範囲（画面の上からの px）：上は 画面の上に止めてあるもの（タブ・式の欄）の下の端 と 見えている範囲の上 の下のほう、
 * 下は 見えている範囲の下（スマホのキーボードが出ると visualViewport が狭くなる）と アプリのキーの上の端 の上のほう。
 * view は visualViewport の { offsetTop, height }（無ければ画面の高さ）。iPhone の Safari はキーボードが出ても画面（レイアウト）は縮まず、
 * 見えている範囲だけが狭く・ずれる（offsetTop）ので、それに合わせる
 */
export function visibleRange(view: { offsetTop: number; height: number }, stickyBottom: number, padTop: number | null): Band {
  const viewBottom = view.offsetTop + view.height
  return {
    top: Math.max(view.offsetTop, stickyBottom),
    bottom: padTop === null ? viewBottom : Math.min(viewBottom, padTop),
  }
}
