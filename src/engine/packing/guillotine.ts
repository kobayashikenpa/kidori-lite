// 帯詰め（ギロチンカット）の配置。
// kidori の packing/guillotine.ts をもとに、手持ち（StockKind・SheetSpec・packOnStock）と重ね切りの端材の行を外し、
// 1種類の板（無限にある）だけにしたもの。同じ幅を優先する並べ方（kidori 17.13）と、その選び方（chooseWay）はそのまま。
// 帯を並べる方向を p、帯の中で片を並べる方向を q とする「帯の座標」で計算し、最後に板の座標に直す。
// 縦切り優先・横切り優先とも、その置き方（縦長／横長）の座標で同じ処理をする：
// p は使える範囲の右端から左へ、q は上端（奥）から下（手前）へ。片は右上から左下に向かって埋まり、
// 余りは左と帯の下（左下）に残る。
// - 縦切り優先（縦長）：帯は長手方向の縦長。帯の幅＝片の妻手方向の大きさ
// - 横切り優先（横長）：帯は妻手の幅いっぱいの縦長（図の上では縦）。帯の幅＝片の長手方向の大きさ
import { round1 } from '../round'
import type { Placement, Rect } from '../types'
import type { Orientation, Piece } from './pieces'
import type { StripMode } from './sheet'

export type { StripMode } from './sheet'

/** 帯の座標の長方形。p・pw：帯を並べる方向の位置と大きさ、q・qh：帯の中の方向の位置と大きさ */
export interface LocalRect {
  p: number
  q: number
  pw: number
  qh: number
}

/** 帯の座標と板の座標の対応 */
export interface Frame {
  mode: StripMode
  /** 使える範囲（その置き方の座標） */
  usable: Rect
  /** 帯を並べる方向の長さ */
  pCap: number
  /** 帯の長さ */
  qCap: number
  toBoard(r: LocalRect): Rect
  /** 片の向きを帯の座標の大きさにする */
  sizes(o: Orientation): { pw: number; qh: number }
}

/** usable はその切り方の置き方の座標（sheet.ts の usableRect(board, trim, mode)） */
export function frameOf(mode: StripMode, usable: Rect): Frame {
  const right = usable.x + usable.w
  const top = usable.y + usable.h
  return {
    mode,
    usable,
    pCap: usable.w,
    qCap: usable.h,
    toBoard: (r) => ({ x: round1(right - r.p - r.pw), y: round1(top - r.q - r.qh), w: r.pw, h: r.qh }),
    // 片の向きは板の辺に対する大きさ（x：妻手方向、y：長手方向）。横長では長手方向が図の横
    sizes: mode === 'horizontal' ? (o) => ({ pw: o.y, qh: o.x }) : (o) => ({ pw: o.x, qh: o.y }),
  }
}

export interface StripItem {
  local: LocalRect
  placement: Placement
}

export interface StripLayout {
  /** 帯の座標での帯（長さは帯の端から端まで＝qCap） */
  local: LocalRect
  /** 板の座標での帯 */
  rect: Rect
  /** 帯の中の上端から詰めた順 */
  items: StripItem[]
}

export interface RawSheet {
  /** 右端から並べた順 */
  strips: StripLayout[]
}

export interface GuillotineResult {
  frame: Frame
  sheets: RawSheet[]
  /** 入る向きがなかった片（pieces.ts で除いているので通常は空） */
  unplaced: Piece[]
}

interface Cand {
  o: Orientation
  pw: number
  qh: number
}

interface WorkStrip {
  p: number
  pw: number
  /** 帯の中で使った長さ（最後の片の奥の端） */
  used: number
  items: { piece: Piece; c: Cand; q: number }[]
}

interface WorkSheet {
  strips: WorkStrip[]
  /** 最後の帯の反対側の端（帯がなければ 0） */
  pEnd: number
}

/**
 * 片を帯詰めで1つの大きさの板（無限にある）に並べる。片の向きは piece.orientations。
 * 片はどれも使える範囲に入る向きを1つ以上持つこと（pieces.ts で確認する）。入る向きが無い片は unplaced に返す。
 * 1. 帯の幅（p 方向）の大きい順 → 長さ（q 方向）の大きい順に並べる（基準の向きは、帯の中の方向に長く置く向き）
 * 2. 開いている板の帯を先頭から見て、片と同じ幅で、残りの長さに刃厚込みで入る最初の帯に置く
 *    （帯の中に縦に並べるのは、なるべく同じ幅の部材だけ。sameWidthFirst が false なら飛ばす）
 * 3. なければ、残りの幅がある板に新しい帯を作る
 * 4. それもなければ、幅が収まり残りの長さに入る（幅の広い）最初の帯に置く
 *    （sameWidthFirst が false なら kidori 第2.4版までと同じく 3 の前に、同じ幅に限らず置く＝First Fit）
 * 5. それもなければ新しい板を出す
 * 計算量は 片の数 × 帯の数
 *
 * sameWidthFirst：帯の中は同じ幅の部材を優先する（初期値 true）。false は kidori 第2.4版までの並べ方。
 * どちらを使うかは chooseWay で決める（仕様書 7：同じ幅を優先して板が増えるときは、幅が収まる最初の帯に入れる並べ方）
 */
export function packGuillotine(
  pieces: readonly Piece[],
  usable: Rect,
  kerf: number,
  mode: StripMode,
  sameWidthFirst = true,
): GuillotineResult {
  const frame = frameOf(mode, usable)
  const items = pieces.map((piece, idx) => {
    // 試す順：帯の中の方向に長く置く向き（main）を先に
    const cands: Cand[] = piece.orientations.map((o) => ({ o, ...frame.sizes(o) }))
    let main: Cand | null = null
    for (const c of cands) if (!main || c.qh > main.qh) main = c
    const tries = main ? [main, ...cands.filter((c) => c !== main)] : []
    return { piece, idx, tries, key: main ?? { pw: 0, qh: 0 } }
  })
  items.sort((a, b) => b.key.pw - a.key.pw || b.key.qh - a.key.qh || a.idx - b.idx)

  const pCap = round1(frame.pCap)
  const qCap = round1(frame.qCap)
  const sheets: WorkSheet[] = []
  const unplaced: Piece[] = []

  /** exact：片と同じ幅の帯だけに置く。そうでなければ幅が収まる帯に置く */
  const placeInStrips = (piece: Piece, tries: Cand[], exact: boolean): boolean => {
    for (const sh of sheets) {
      for (const st of sh.strips) {
        for (const c of tries) {
          const q = round1(st.used + kerf)
          const wide = exact ? round1(c.pw) === round1(st.pw) : round1(c.pw) <= round1(st.pw)
          if (wide && round1(q + c.qh) <= qCap) {
            st.items.push({ piece, c, q })
            st.used = round1(q + c.qh)
            return true
          }
        }
      }
    }
    return false
  }

  const openStrip = (sh: WorkSheet, piece: Piece, tries: Cand[]): boolean => {
    const p = sh.strips.length === 0 ? 0 : round1(sh.pEnd + kerf)
    for (const c of tries) {
      if (round1(p + c.pw) <= pCap && round1(c.qh) <= qCap) {
        sh.strips.push({ p, pw: c.pw, used: round1(c.qh), items: [{ piece, c, q: 0 }] })
        sh.pEnd = round1(p + c.pw)
        return true
      }
    }
    return false
  }

  for (const { piece, tries } of items) {
    if (tries.length === 0) {
      unplaced.push(piece)
      continue
    }
    if (sameWidthFirst) {
      if (placeInStrips(piece, tries, true)) continue
      if (sheets.some((sh) => openStrip(sh, piece, tries))) continue
      if (placeInStrips(piece, tries, false)) continue
    } else {
      if (placeInStrips(piece, tries, false)) continue
      if (sheets.some((sh) => openStrip(sh, piece, tries))) continue
    }
    const sh: WorkSheet = { strips: [], pEnd: 0 }
    if (openStrip(sh, piece, tries)) sheets.push(sh)
    else unplaced.push(piece)
  }

  return {
    frame,
    unplaced,
    sheets: sheets.map((sh) => ({
      strips: sh.strips.map((st) => {
        const local: LocalRect = { p: st.p, q: 0, pw: st.pw, qh: qCap }
        return {
          local,
          rect: frame.toBoard(local),
          items: st.items.map(({ piece, c, q }) => {
            // 帯より細い片は帯の右端に寄せる
            const l: LocalRect = { p: st.p, q, pw: c.pw, qh: c.qh }
            const r = frame.toBoard(l)
            const placement: Placement = {
              ...r,
              pieceId: piece.pieceId,
              partId: piece.partId,
              name: piece.name,
              rotated: c.o.rotated,
              sizeLabel: piece.sizeLabel,
            }
            return { local: l, placement }
          }),
        }
      }),
    })),
  }
}

/** 並べ方の比べに使う形（入らない片と板の並び） */
export interface WayLayout {
  sheets: readonly unknown[]
  unplaced: readonly unknown[]
}

/**
 * 並べ方の比べ方（kidori 17.13 の preferSameWidth。仕様書 7）：同じ幅を優先する並べ方 same を採るなら true。
 * 入らない片が少ないほう → 必要な板が少ないほう → 同じなら同じ幅を優先するほう
 */
export function preferSameWidth(same: WayLayout, old: WayLayout): boolean {
  if (same.unplaced.length !== old.unplaced.length) return same.unplaced.length < old.unplaced.length
  return same.sheets.length <= old.sheets.length
}

/**
 * 並べ方（同じ幅を優先するか）を選ぶ（kidori 17.13 の chooseWay）。fixed が無ければ両方を並べて preferSameWidth で選ぶ。
 * run はその並べ方で並べた結果を返す
 */
export function chooseWay<L extends WayLayout>(fixed: boolean | undefined, run: (sameWidthFirst: boolean) => L): L {
  if (fixed !== undefined) return run(fixed)
  const same = run(true)
  const old = run(false)
  return preferSameWidth(same, old) ? same : old
}
