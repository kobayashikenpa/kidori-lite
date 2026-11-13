// エクセルのような表（部材の表・調整寸法の表）のセルを選ぶ仕組み（仕様書 17.1・17.2・17.4・21.1）。
// 選んでいる範囲と起点・丸い取っ手で範囲を広げる・四角い取っ手でオートフィル・長押しでメニュー・取っ手と点線の印の位置。
// 第1.7版で PartsTable から外に出し、調整寸法の表（AdjustTable）でも同じ仕組みを使う。
// 選んでいる範囲はアプリで1つの表だけ（ほかの表が選んだら、こちらの範囲は外す。exclusive.ts の claimOpen）
// 第2.0版：選んでいる行の番号を上下に引くと、その行を動かす（部材の表だけ。moveRowsFrom・onMoveRows。仕様書 24.2）
// 第2.2版：番号を長押しすると行が持ち上がり、指についてくる。ほかの行はすべってよけ、離した所に入る（liftRowsFrom。仕様書 26.5）。
// 長押しして動かさずに離したときは長押しのメニュー。行の動きの決まりは dragRows.ts
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { CellRange } from '../engine/types'
import { fillTarget, fixedCorner, keepActive, spanRange, type GridPoint } from './cellSelect'
import { gapAt, rowShift, targetGap, type RowBox } from './dragRows'
import { claimOpen } from './exclusive'
import { revealDelta, visibleRange } from './scroll'

/** 取っ手を引いて表の上下の端に近づいたら、表を少しずつスクロールする（端からの距離 px と、1こまの最大の動き px） */
const EDGE_ZONE = 48
const EDGE_STEP = 18

/** 入力するセルを選んだあと、見えている範囲（スマホのキーボード）が動くのに合わせて行を見せ直す時間（ms。仕様書 26.4） */
const REVEAL_FOLLOW_MS = 1500

/** 長押しでメニューを出すまでの時間（ms）と、取り消しにする指の動き（px） */
export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP = 10

/** 長押しした所：セル（col は列の位置）か、番号（行全体。col が null） */
export type PressAt = { row: number; col: number | null }

/** 押した要素から、表のセル・番号を探す（data-row・data-col。名前の入力欄は除く） */
export function pressAtOf(target: EventTarget | null): PressAt | null {
  if (!(target instanceof Element) || target.closest('input')) return null
  const el = target.closest<HTMLElement>('[data-row]')
  if (!el) return null
  const row = Number(el.dataset.row)
  const col = el.dataset.col === undefined ? null : Number(el.dataset.col)
  return Number.isInteger(row) ? { row, col } : null
}

/** 画面の位置にある、その表のセル・番号（取っ手は除いて、その下を見る）。表の外なら null */
function cellUnder(table: HTMLElement | null, x: number, y: number): PressAt | null {
  const el = document.elementsFromPoint(x, y).find((e) => !e.closest('.pt-handle'))
  if (!el || !table || !table.contains(el)) return null
  return pressAtOf(el)
}

/**
 * 画面の上に止めてあるもの（仕事の名前の帯・部材の画面のタブと式の欄。第2.1版 仕様書 25.8）の下の端（px）。
 * 表の行がこれより上に隠れないようにスクロールする
 */
export function stickyBottom(): number {
  let bottom = 0
  for (const sel of ['.topbar', '.parts-sticky']) {
    const el = document.querySelector(sel)
    if (el) bottom = Math.max(bottom, el.getBoundingClientRect().bottom)
  }
  return bottom
}

/** 引いている指が表の上下の端（上の見出し・下のタブの近く）にあるとき、1こまにスクロールする量（px。端に無ければ 0） */
function edgeDelta(y: number): number {
  const top = stickyBottom() + EDGE_ZONE
  const bottom = (document.querySelector('.tabbar')?.getBoundingClientRect().top ?? window.innerHeight) - EDGE_ZONE
  if (y < top) return -Math.min(EDGE_STEP, Math.ceil((top - y) / 3))
  if (y > bottom) return Math.min(EDGE_STEP, Math.ceil((y - bottom) / 3))
  return 0
}

/** 番号を引いて動かせる行：top から rows 行（部材のある行だけ）と、動かせる先の数（部材の数） */
export type MovableRows = { top: number; rows: number; limit: number }

/** 表の左上からの四角（点線の印に使う） */
export type Box = { top: number; left: number; width: number; height: number }

/** 範囲を文字にする（描き直しの鍵）・戻す */
export const rangeKey = (r: CellRange | null): string => (r ? `${r.top}:${r.left}:${r.rows}:${r.cols}` : '')
function rangeOfKey(key: string): CellRange | null {
  if (key === '') return null
  const [top, left, rows, cols] = key.split(':').map(Number)
  return { top, left, rows, cols }
}
const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

export const sameRange = (a: CellRange | null, b: CellRange | null) =>
  a === b || (a !== null && b !== null && a.top === b.top && a.left === b.left && a.rows === b.rows && a.cols === b.cols)

export interface GridOptions {
  tableRef: RefObject<HTMLDivElement | null>
  /** 行の要素（中の1つ目の要素がセルの並び）。行の番号が鍵 */
  rowEls: RefObject<Map<number, HTMLDivElement>>
  /** 見出しの列の要素（列の位置の順） */
  headEls: RefObject<(HTMLElement | null)[]>
  rowCount: number
  colCount: number
  /** 取っ手を動かさずに離したとき：指の位置のセルを押したことにする */
  onPressCell: (row: number, col: number) => void
  /** 同じく番号（行全体） */
  onPressRow: (row: number) => void
  /** 長押し（メニューを開く） */
  onLongPress: (at: PressAt) => void
  /** 長押しのメニューを出さないとき（式の入力中に、押したセルの寸法を入れる場面など） */
  noLongPress: () => boolean
  /** オートフィル（指を離したとき。to は元を含む範囲） */
  onFill: (from: CellRange, to: CellRange) => void
  /** オートフィルの取っ手を押し始めたとき */
  onFillStart: () => void
  /** ほかの表が範囲を選んだとき（この表は選んでいる範囲を外され、入力していれば終える） */
  onRelease: () => void
  /** これが変わったら選んでいる範囲を外す（部材の表は仕事の id） */
  resetKey?: string
  /**
   * 番号を引いて行を動かす（仕様書 24.2）：row の番号を押し始めたとき、すぐ引いて動かせるなら動かす行を返す（選んでいる行の番号のときだけ）。
   * 無ければ（または null なら）liftRowsFrom を見る
   */
  moveRowsFrom?: (row: number) => MovableRows | null
  /**
   * 番号を長押しして持ち上げる（仕様書 26.5）：row の番号を押し始めたとき、長押しで持ち上げられる行（選んでいる行の外なら その行だけ）。
   * null なら持ち上げない（ふつうの番号。長押しでメニュー）。長押しまでに指が動いたら、ふつうのスクロール
   */
  liftRowsFrom?: (row: number) => MovableRows | null
  /** 行を持ち上げたとき（その行を選んだ状態にしてほしい） */
  onLift?: (rows: MovableRows) => void
  /** 番号を引いて離したとき：top から rows 行を、元の並びの to の位置（to 行目の上）へ動かす */
  onMoveRows?: (top: number, rows: number, to: number) => void
}

export function useGrid(opts: GridOptions) {
  const o = useRef(opts)
  useEffect(() => {
    o.current = opts
  })

  // 選んでいる範囲と、その起点（アクティブセル）。入力していないときも選んだまま（仕様書 17.1）
  const [range, setRangeS] = useState<CellRange | null>(null)
  const [active, setActiveS] = useState<GridPoint | null>(null)
  const [key, setKey] = useState(opts.resetKey)
  if (key !== opts.resetKey) {
    setKey(opts.resetKey)
    setRangeS(null)
    setActiveS(null)
  }
  const rangeRef = useRef(range)
  const activeRef = useRef(active)
  useEffect(() => {
    rangeRef.current = range
    activeRef.current = active
  })
  // ほかの表が選んだときに呼ばれる（同じ関数のままにする）
  const [release] = useState(() => () => {
    rangeRef.current = null
    activeRef.current = null
    setRangeS(null)
    setActiveS(null)
    o.current.onRelease()
  })

  /** 範囲を選ぶ（起点は指定が無ければ左上）。ほかの表の範囲は外す */
  const selectRange = (r: CellRange, a: GridPoint = { row: r.top, col: r.left }) => {
    claimOpen('cellRange', release)
    if (!sameRange(rangeRef.current, r)) {
      rangeRef.current = r
      setRangeS(r)
    }
    const cur = activeRef.current
    if (!cur || cur.row !== a.row || cur.col !== a.col) {
      activeRef.current = a
      setActiveS(a)
    }
  }
  /** 範囲を外す（選んでいない） */
  const clearRange = () => {
    rangeRef.current = null
    activeRef.current = null
    setRangeS(null)
    setActiveS(null)
  }

  // ---------- 取っ手（丸＝範囲を広げる・縮める、四角＝オートフィル） ----------

  // 長押しのあと・取っ手の上を押したあとに来る「押した」（指を離したときの click）を1回だけ捨てる（入力が始まったり、メニューがすぐ閉じたりしないように）
  const swallowClick = useRef(false)

  const dragRef = useRef<{
    id: number
    /** range：丸い取っ手で範囲を変える。fill：四角い取っ手でオートフィル */
    mode: 'range' | 'fill'
    fixed: GridPoint
    /** オートフィルの元の範囲 */
    from: CellRange
    /** 押し始めた位置（動かさずに離したら、下のセルを押したことにする） */
    sx: number
    sy: number
    /** 指が LONG_PRESS_SLOP より動いたか（動くまでは範囲を変えない。取っ手の上の「押す」「長押し」と分ける） */
    moved: boolean
    /** 取っ手の上で動かさずに押し続けたら、指の下のセルの長押しとしてメニューを開く */
    timer: number
    x: number
    y: number
    raf: number
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
  } | null>(null)
  const [dragging, setDragging] = useState<'range' | 'fill' | null>(null)
  // オートフィルで引いた先（元を含む範囲。引いている間だけ）
  const [fillTo, setFillToS] = useState<CellRange | null>(null)
  const fillToRef = useRef<CellRange | null>(null)
  const setFillTo = (r: CellRange | null) => {
    if (sameRange(fillToRef.current, r)) return
    fillToRef.current = r
    setFillToS(r)
  }

  /** 画面の位置にある表のセル（表の外なら、いちばん近い行・列） */
  const pointAt = (x: number, y: number): GridPoint => {
    const { rowEls, headEls, rowCount, colCount } = o.current
    let row = 0
    for (let i = 0; i < rowCount; i++) {
      const el = rowEls.current.get(i)?.firstElementChild
      if (!el) continue
      row = i
      if (el.getBoundingClientRect().bottom > y) break
    }
    let col = 0
    for (let c = 1; c < colCount; c++) {
      const el = headEls.current[c]
      if (el && x >= el.getBoundingClientRect().left) col = c
    }
    return { row, col }
  }

  const dragTo = () => {
    const d = dragRef.current
    if (!d || !d.moved) return
    const p = pointAt(d.x, d.y)
    if (d.mode === 'fill') {
      // 表の上の知らせは変えない（引いている間に表が上下にずれないように。引いた先の行数は点線の中に出す）
      setFillTo(fillTarget(d.from, p))
      return
    }
    const a = activeRef.current
    const r = spanRange(d.fixed, p)
    selectRange(r, a ? keepActive(a, r, d.fixed) : d.fixed)
  }

  /** 引いている間：指が表の上下の端（上の見出し・下のタブの近く）にあれば、少しずつスクロールする */
  const edgeScroll = () => {
    const d = dragRef.current
    if (!d) return
    if (!d.moved) {
      d.raf = requestAnimationFrame(edgeScroll)
      return
    }
    const dy = edgeDelta(d.y)
    if (dy !== 0) {
      window.scrollBy(0, dy)
      dragTo()
    }
    d.raf = requestAnimationFrame(edgeScroll)
  }

  /** 引き終わり（指を離した＝commit、取り消された＝commit なし）。オートフィルは離したときに入れる */
  const endDrag = (commit = false) => {
    const d = dragRef.current
    if (!d) return
    cancelAnimationFrame(d.raf)
    clearTimeout(d.timer)
    window.removeEventListener('pointermove', d.move)
    window.removeEventListener('pointerup', d.up)
    window.removeEventListener('pointercancel', d.up)
    dragRef.current = null
    setDragging(null)
    // 取っ手を動かさずに離したら、指の位置のセル（番号）を押したことにする（取っ手がセルに重なっても押せるように。
    // 選んでいるセル自身なら2回目の押し方＝入力）
    if (!d.moved) {
      setFillTo(null)
      const at = commit ? cellUnder(o.current.tableRef.current, d.x, d.y) : null
      if (at) {
        // 指を離したあとに来る click は捨てる（ここで押したことにしたので。出てきたキーなどに当たらないように）
        swallowClick.current = true
        if (at.col === null) o.current.onPressRow(at.row)
        else o.current.onPressCell(at.row, at.col)
      }
      return
    }
    if (d.mode !== 'fill') return
    const to = fillToRef.current
    setFillTo(null)
    if (!commit || !to) return
    o.current.onFill(d.from, to)
  }

  // 取っ手は範囲が変わると別の行に描き直されるので、指の動きは画面全体（window）で追う
  const onHandleDown = (which: 'start' | 'end' | 'fill') => (e: ReactPointerEvent<HTMLSpanElement>) => {
    const r = rangeRef.current
    if (!r) return
    e.preventDefault()
    e.stopPropagation()
    endDrag()
    cancelPress()
    // 左上の丸い取っ手は、選んでいる行の一番上の番号に重なる。番号の上なら、取っ手ではなく番号を押したことにする（引くと行を動かす。仕様書 24.2）
    if (which === 'start' && !o.current.noLongPress()) {
      const under = cellUnder(o.current.tableRef.current, e.clientX, e.clientY)
      const rows = under && under.col === null ? (o.current.moveRowsFrom?.(under.row) ?? null) : null
      if (under && rows) {
        startMove(e, rows, true, under, under.row)
        return
      }
    }
    const id = e.pointerId
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || ev.pointerId !== id) return
      d.x = ev.clientX
      d.y = ev.clientY
      if (!d.moved && Math.hypot(d.x - d.sx, d.y - d.sy) > LONG_PRESS_SLOP) {
        d.moved = true
        clearTimeout(d.timer)
      }
      dragTo()
    }
    // 動かさずに押し続けたら：引くのをやめて、指の下のセルの長押し（メニュー）にする
    const hold = () => {
      const d = dragRef.current
      if (!d || d.id !== id || d.moved) return
      const at = cellUnder(o.current.tableRef.current, d.x, d.y)
      endDrag()
      if (at) longPress(at)
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId === id) endDrag(ev.type === 'pointerup')
    }
    const mode = which === 'fill' ? 'fill' : 'range'
    dragRef.current = {
      id,
      mode,
      fixed: fixedCorner(r, which === 'start' ? 'start' : 'end'),
      from: r,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      timer: window.setTimeout(hold, LONG_PRESS_MS),
      x: e.clientX,
      y: e.clientY,
      raf: requestAnimationFrame(edgeScroll),
      move,
      up,
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    setDragging(mode)
    if (mode === 'fill') o.current.onFillStart()
  }
  const endDragRef = useRef(endDrag)
  useEffect(() => {
    endDragRef.current = endDrag
  })
  useEffect(() => () => endDragRef.current(), [])

  // ---------- 長押し（仕様書 17.2） ----------

  const pressRef = useRef<{ id: number; x: number; y: number; timer: number; at: PressAt } | null>(null)

  const cancelPress = () => {
    const p = pressRef.current
    if (!p) return
    clearTimeout(p.timer)
    pressRef.current = null
  }

  // ---------- 番号を引いて行を動かす（仕様書 24.2）・長押しで持ち上げる（仕様書 26.5） ----------

  const moveRef = useRef<{
    id: number
    sx: number
    sy: number
    y: number
    /** 選んでいる行の番号（24.2）：押してすぐ引ける。false なら長押しで持ち上げるまで引けない（それまでに指が動いたらスクロール） */
    immediate: boolean
    /** 長押しで持ち上げたか */
    lifted: boolean
    /** 指が LONG_PRESS_SLOP より動いて、引き始めたか */
    moved: boolean
    rows: MovableRows
    /** 動かす先（元の並びの行と行の間。0〜limit）。並びが変わらない所なら null */
    to: number | null
    /** 長押しして動かさずに離したときに開く、長押しのメニューの場所 */
    at: PressAt
    /** 取っ手の下の番号から始めたとき、その行（すぐ離したら、番号を押したことにする） */
    pressRow: number | null
    /** 持ち上げる前の各行の位置（表の上の端から）と、持ち上げたときの指の位置（表の上の端から） */
    base: RowBox[] | null
    startY: number
    timer: number
    raf: number
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
    touch: (e: TouchEvent) => void
  } | null>(null)
  const [moving, setMoving] = useState(false)

  /** 表の上の端からの位置 */
  const tableTop = () => o.current.tableRef.current?.getBoundingClientRect().top ?? 0

  /** 持ち上げる前の各行（部材の行）の位置を測る（行を動かして見せる前に） */
  const measureRows = (limit: number): RowBox[] => {
    const t = tableTop()
    const out: RowBox[] = []
    for (let i = 0; i < limit; i++) {
      const r = o.current.rowEls.current.get(i)?.getBoundingClientRect()
      out.push(r ? { top: r.top - t, height: r.height } : { top: out.length ? out[out.length - 1].top + out[out.length - 1].height : 0, height: 0 })
    }
    return out
  }

  /** 行の見た目を動かす：持ち上げた行は指についてくる、ほかの行は動かす先をあけるようによける（CSS の transform） */
  const showMove = () => {
    const m = moveRef.current
    if (!m || !m.base) return
    const { top, rows } = m.rows
    const blockH = m.base.slice(top, top + rows).reduce((h, b) => h + b.height, 0)
    const dy = m.moved ? m.y - tableTop() - m.startY : 0
    o.current.rowEls.current.forEach((el, i) => {
      if (i >= top && i < top + rows) {
        el.dataset.lift = '1'
        el.style.transform = `translateY(${dy}px)`
        return
      }
      const k = rowShift(i, top, rows, m.to)
      el.style.transform = k === 0 ? '' : `translateY(${k * blockH}px)`
    })
  }

  /** 行の見た目を元に戻す（instant：すべらせずにすぐ。並べ替えたあとに、新しい位置から戻ってくるように見えないよう） */
  const clearMove = (instant: boolean) => {
    o.current.rowEls.current.forEach((el) => {
      delete el.dataset.lift
      if (instant) el.style.transition = 'none'
      el.style.transform = ''
    })
    if (instant) {
      requestAnimationFrame(() => {
        o.current.rowEls.current.forEach((el) => {
          el.style.transition = ''
        })
      })
    }
  }

  /** 指の位置から動かす先（行と行の間）を決め、行の見た目を動かす */
  const moveTo = () => {
    const m = moveRef.current
    if (!m || !m.moved || !m.base) return
    const { top, rows, limit } = m.rows
    m.to = targetGap(gapAt(m.y - tableTop(), m.base, limit), top, rows)
    showMove()
  }

  /** 長押しで持ち上げる（影が付いて少し浮く。仕様書 26.5） */
  const lift = () => {
    const m = moveRef.current
    if (!m || m.moved || m.lifted) return
    m.lifted = true
    m.base = measureRows(m.rows.limit)
    m.startY = m.y - tableTop()
    setMoving(true)
    showMove()
    navigator.vibrate?.(10)
    o.current.onLift?.(m.rows)
  }

  /** 引いている間：指が表の上下の端にあれば、少しずつスクロールする */
  const moveScroll = () => {
    const m = moveRef.current
    if (!m) return
    if (m.moved) {
      const dy = edgeDelta(m.y)
      if (dy !== 0) {
        window.scrollBy(0, dy)
        moveTo()
      }
    }
    m.raf = requestAnimationFrame(moveScroll)
  }

  /** 引き終わり（commit：指を離した）。動かしていれば離した位置へ行を動かす。持ち上げて動かさずに離したら長押しのメニュー */
  const endMove = (commit = false) => {
    const m = moveRef.current
    if (!m) return
    cancelAnimationFrame(m.raf)
    clearTimeout(m.timer)
    window.removeEventListener('pointermove', m.move)
    window.removeEventListener('pointerup', m.up)
    window.removeEventListener('pointercancel', m.up)
    window.removeEventListener('touchmove', m.touch)
    moveRef.current = null
    setMoving(false)
    if (m.moved) {
      // 指を離したあとに来る click（番号を押した＝行を選ぶ）は捨てる
      swallowClick.current = true
      clearMove(true)
      if (commit && m.to !== null) o.current.onMoveRows?.(m.rows.top, m.rows.rows, m.to)
      return
    }
    if (m.lifted) {
      clearMove(true)
      // 持ち上げたまま動かさずに離した：今までどおり長押しのメニュー（仕様書 26.5）
      if (commit) {
        swallowClick.current = true
        o.current.onLongPress(m.at)
      }
      return
    }
    // すぐ離した：取っ手の下の番号なら番号を押したことにする（取っ手に当たった click は捨てる）。ふつうの番号は click で行を選ぶ
    if (commit && m.pressRow !== null) {
      swallowClick.current = true
      o.current.onPressRow(m.pressRow)
    }
  }

  /**
   * 番号を押し始めたとき：immediate（選んでいる行の番号。24.2）なら すぐ引ける。そうでなければ長押しで持ち上げてから引ける。
   * どちらも、動かさずに LONG_PRESS_MS 押し続けると持ち上がる
   */
  const startMove = (e: ReactPointerEvent<Element>, rows: MovableRows, immediate: boolean, at: PressAt, pressRow: number | null = null) => {
    endMove()
    const id = e.pointerId
    const move = (ev: PointerEvent) => {
      const m = moveRef.current
      if (!m || ev.pointerId !== id) return
      m.y = ev.clientY
      if (!m.moved && Math.hypot(ev.clientX - m.sx, ev.clientY - m.sy) > LONG_PRESS_SLOP) {
        if (!m.lifted && !m.immediate) {
          // 持ち上げる前に指が動いた：表のスクロール（今までどおり）
          endMove()
          return
        }
        m.moved = true
        cancelPress()
        if (!m.base) {
          m.base = measureRows(m.rows.limit)
          m.startY = m.sy - tableTop()
        }
        setMoving(true)
      }
      if (m.moved) {
        ev.preventDefault()
        moveTo()
      }
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId === id) endMove(ev.type === 'pointerup')
    }
    // 持ち上げたあと・引いている間は、指で画面がスクロールしないようにする（番号は指でなぞるとスクロールする所なので）
    const touch = (ev: TouchEvent) => {
      const m = moveRef.current
      if (m && (m.lifted || m.moved) && ev.cancelable) ev.preventDefault()
    }
    moveRef.current = {
      id,
      sx: e.clientX,
      sy: e.clientY,
      y: e.clientY,
      immediate,
      lifted: false,
      moved: false,
      rows,
      to: null,
      at,
      pressRow,
      base: null,
      startY: 0,
      timer: window.setTimeout(lift, LONG_PRESS_MS),
      raf: requestAnimationFrame(moveScroll),
      move,
      up,
      touch,
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('touchmove', touch, { passive: false })
  }
  const endMoveRef = useRef(endMove)
  useEffect(() => {
    endMoveRef.current = endMove
  })
  useEffect(() => () => endMoveRef.current(), [])

  /** 長押しのメニューを開くとき（引いている間は開かない）。開いたら、指を離したときの click を捨てる */
  const longPress = (at: PressAt) => {
    cancelPress()
    if (dragRef.current) return
    // 番号を動かさずに押し続けたら、引くのはやめて長押しのメニュー（仕様書 24.2）
    if (moveRef.current) {
      if (moveRef.current.moved) return
      endMove()
    }
    swallowClick.current = true
    o.current.onLongPress(at)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    cancelPress()
    // マウスの右ボタンは contextmenu で開く
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (o.current.noLongPress()) return
    const at = pressAtOf(e.target)
    if (!at) return
    if (at.col === null) {
      // 選んでいる行の番号なら、すぐ上下に引ける（仕様書 24.2）。そうでなければ長押しで持ち上げてから引ける（仕様書 26.5）。
      // どちらも動かさずに長押しすると持ち上がり、そのまま離すと長押しのメニュー
      const rows = o.current.moveRowsFrom?.(at.row) ?? null
      if (rows) {
        startMove(e, rows, true, at)
        return
      }
      const lifted = o.current.liftRowsFrom?.(at.row) ?? null
      if (lifted) {
        startMove(e, lifted, false, at)
        return
      }
    }
    const timer = window.setTimeout(() => longPress(at), LONG_PRESS_MS)
    pressRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer, at }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pressRef.current
    if (!p || p.id !== e.pointerId) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) cancelPress()
  }
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pressRef.current?.id === e.pointerId) cancelPress()
  }
  /** 長押しの決まったメニュー（Android の長押し・マウスの右クリック）は止めて、このアプリのメニューを出す。名前の入力欄の中は止めない */
  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('input')) return
    e.preventDefault()
    // 番号を押している間（持ち上げる・引く）は、指を離したときにメニューを決める（Android の長押しの contextmenu では開かない）
    if (moveRef.current) return
    if (o.current.noLongPress()) return
    const at = pressAtOf(e.target)
    if (at) longPress(at)
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.preventDefault()
      e.stopPropagation()
    }
    // 次に押し始めたら、捨てる印は消す（長押しのあとに click が来なかったとき）
    const onDown = () => {
      swallowClick.current = false
    }
    window.addEventListener('click', onClick, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [])
  const cancelPressRef = useRef(cancelPress)
  useEffect(() => {
    cancelPressRef.current = cancelPress
  })
  useEffect(() => () => cancelPressRef.current(), [])

  return {
    range,
    active,
    rangeRef,
    activeRef,
    selectRange,
    clearRange,
    dragging,
    fillTo,
    onHandleDown,
    /** 番号を引いて行を動かしている（持ち上げている）間か */
    moving,
    tableHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onContextMenu,
    },
  }
}

/** 取っ手の位置（表の左上からの px）：範囲の左上の角と右下の角 */
export type Corners = { top: number; bottom: number; left: number; right: number }

/**
 * 取っ手と点線の印の位置を測る。行の要素と見出しの列の要素から測る。描き直すたびと、表の大きさが変わったときに測り直す
 * （同じ位置なら状態は変えない）。shown は表に出す範囲、fillKey・cutKey は点線の印の範囲（rangeKey）
 */
export function useGridBoxes(
  tableRef: RefObject<HTMLDivElement | null>,
  rowEls: RefObject<Map<number, HTMLDivElement>>,
  headEls: RefObject<(HTMLElement | null)[]>,
  shown: CellRange | null,
  fillKey: string,
  cutKey: string,
) {
  const [handleAt, setHandleAt] = useState<Corners | null>(null)
  const [fillBox, setFillBox] = useState<Box | null>(null)
  const [cutBox, setCutBox] = useState<Box | null>(null)
  const handleTop = shown?.top ?? -1
  const handleBottom = shown ? shown.top + shown.rows - 1 : -1
  const handleLeft = shown?.left ?? -1
  const handleRight = shown ? shown.left + shown.cols - 1 : -1
  const measure = () => {
    const topEl = rowEls.current.get(handleTop)?.firstElementChild
    const botEl = rowEls.current.get(handleBottom)?.firstElementChild
    const leftEl = headEls.current[handleLeft]
    const rightEl = headEls.current[handleRight]
    const table = tableRef.current
    let next: Corners | null = null
    if (topEl && botEl && leftEl && rightEl && table) {
      const t = table.getBoundingClientRect()
      next = {
        top: topEl.getBoundingClientRect().top - t.top,
        bottom: botEl.getBoundingClientRect().bottom - t.top,
        left: leftEl.getBoundingClientRect().left - t.left,
        right: rightEl.getBoundingClientRect().right - t.left,
      }
    }
    setHandleAt((cur) =>
      cur && next && cur.top === next.top && cur.bottom === next.bottom && cur.left === next.left && cur.right === next.right ? cur : next,
    )
    /** 範囲の四角（表の左上から） */
    const boxOf = (key: string): Box | null => {
      const r = rangeOfKey(key)
      if (!r || !table) return null
      const tEl = rowEls.current.get(r.top)?.firstElementChild
      const bEl = rowEls.current.get(r.top + r.rows - 1)?.firstElementChild
      const lEl = headEls.current[r.left]
      const rEl = headEls.current[r.left + r.cols - 1]
      if (!tEl || !bEl || !lEl || !rEl) return null
      const t = table.getBoundingClientRect()
      const top = tEl.getBoundingClientRect().top - t.top
      const left = lEl.getBoundingClientRect().left - t.left
      return { top, left, width: rEl.getBoundingClientRect().right - t.left - left, height: bEl.getBoundingClientRect().bottom - t.top - top }
    }
    const fill = boxOf(fillKey)
    setFillBox((cur) => (sameBox(cur, fill) ? cur : fill))
    const cut = boxOf(cutKey)
    setCutBox((cur) => (sameBox(cur, cut) ? cur : cut))
  }
  const measureRef = useRef(measure)
  // 描き直すたびに測る（行・知らせ・範囲が変わると位置が変わるため）
  useLayoutEffect(() => {
    measureRef.current = measure
    measureRef.current()
  })
  // 表の大きさが変わったとき（画面の向き・文字の大きさなど）
  useEffect(() => {
    const table = tableRef.current
    if (typeof ResizeObserver === 'undefined' || !table) return
    const ro = new ResizeObserver(() => measureRef.current())
    ro.observe(table)
    return () => ro.disconnect()
  }, [tableRef])
  return { handleAt, fillBox, cutBox }
}

/** 画面の下に出したアプリのキーの高さ（表の下に同じだけ余白を足して、いちばん下の行もキーの上に出せるようにする）。出していなければ 0 */
export function usePadHeight(padRef: RefObject<HTMLDivElement | null>, openKey: string | null): number {
  const [padH, setPadH] = useState(0)
  useEffect(() => {
    const el = padRef.current
    if (!openKey || !el) return
    const measure = () => setPadH(el.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [padRef, openKey])
  return padH
}

/**
 * 入力している行が、上に止めたタブ・式の欄と、キー（名前のときはスマホのキーボード）の間に見えるようにスクロールする（仕様書 15.1・26.4）。
 * selKey は入力しているセルの鍵（"行:列"。入力していなければ ''）。
 * 名前の入力ではスマホのキーボードが少し遅れて出て、見えている範囲（visualViewport）が狭くなったり、iPhone の Safari が自分で画面を動かしたりする。
 * そのため、選んだすぐあと（REVEAL_FOLLOW_MS の間）は visualViewport の大きさ・位置が変わるたびに合わせ直す（その後はキーボードの出し入れのときだけ）
 */
export function useRevealRow(
  rowEls: RefObject<Map<number, HTMLDivElement>>,
  padRef: RefObject<HTMLDivElement | null>,
  selKey: string,
  padH: number,
) {
  useEffect(() => {
    if (!selKey) return
    const row = Number(selKey.split(':')[0])
    const started = Date.now()
    const reveal = (smooth: boolean) => {
      const rowEl = rowEls.current.get(row)
      if (!rowEl) return
      const vv = window.visualViewport
      const band = visibleRange(
        vv ? { offsetTop: vv.offsetTop, height: vv.height } : { offsetTop: 0, height: window.innerHeight },
        stickyBottom(),
        padRef.current ? padRef.current.getBoundingClientRect().top : null,
      )
      const r = rowEl.getBoundingClientRect()
      const delta = revealDelta({ top: r.top, bottom: r.bottom }, band, 8)
      if (delta === 0) return
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      // 合わせ直しはすぐに動かす（なめらかに動かしている途中で測ると、行き過ぎるため）
      window.scrollBy({ top: delta, behavior: smooth && !reduce ? 'smooth' : 'auto' })
    }
    const frame = requestAnimationFrame(() => reveal(true))
    let again = 0
    const follow = (e: Event) => {
      // 選んですぐの間は、見えている範囲が動くたび（キーボードが出る・Safari が動かす）に合わせ直す。その後はキーボードの出し入れ（resize）だけ
      if (e.type === 'scroll' && Date.now() - started > REVEAL_FOLLOW_MS) return
      cancelAnimationFrame(again)
      again = requestAnimationFrame(() => reveal(false))
    }
    const vv = window.visualViewport
    vv?.addEventListener('resize', follow)
    vv?.addEventListener('scroll', follow)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(again)
      vv?.removeEventListener('resize', follow)
      vv?.removeEventListener('scroll', follow)
    }
  }, [rowEls, padRef, selKey, padH])
}

/**
 * スマホのキーボードの高さ（px。第2.2版 仕様書 26.4）：画面の高さと、見えている範囲（visualViewport）の下の端の差。active でないとき・測れないときは 0。
 * 名前の入力中、表の下にこの高さの余白を足して、いちばん下の行もキーボードの上まで上げられるようにする
 * （iPhone の Safari・最近の Android の Chrome は、キーボードが出ても画面（レイアウト）が縮まないため）
 */
export function useKeyboardHeight(active: boolean): number {
  const [h, setH] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const measure = () => setH(Math.max(0, Math.round(window.innerHeight - vv.height)))
    measure()
    vv.addEventListener('resize', measure)
    return () => vv.removeEventListener('resize', measure)
  }, [active])
  return active ? h : 0
}

/**
 * 入力している間：表とキーの外を押したら入力を終える（end）。Escape でも終える。inside は外とみなさない所。
 * ほかの表（.pt-edit）のセルを押したときは、押したことが決まってから（click のあと）終える。
 * 指を置いたときに終えると、キーとその分の余白が消えて画面がずれ、押したことが別のセルに当たるため
 */
export function useOutsideEnd(active: boolean, inside: (t: Node) => boolean, end: () => void) {
  const r = useRef({ inside, end })
  useEffect(() => {
    r.current = { inside, end }
  })
  useEffect(() => {
    if (!active) return
    let pending = false
    const onDown = (e: PointerEvent) => {
      pending = false
      const t = e.target
      if (!(t instanceof Node) || r.current.inside(t)) return
      if (t instanceof Element && t.closest('.pt-edit')) {
        pending = true
        return
      }
      r.current.end()
    }
    const onClick = () => {
      if (!pending) return
      pending = false
      r.current.end()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') r.current.end()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [active])
}
