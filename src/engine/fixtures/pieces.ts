// 帯詰め（packing）のテストで使う片。部材から片を作る処理（E-06）より前に、帯詰め・切る順番・端材・歩留まりを確かめるためのもの
import type { Orientation, Piece } from '../packing/pieces'
import { round1 } from '../round'

/**
 * 1枚の片。x：妻手方向、y：長手方向（回転しない部材の W・H と同じ）。sizeLabel は W×H。
 * rotatable なら W・H を入れ替えた向きも足す（正方形は1つ）
 */
export function piece(id: string, x: number, y: number, rotatable = false): Piece {
  const orientations: Orientation[] = [{ x, y, rotated: false }]
  if (rotatable && x !== y) orientations.push({ x: y, y: x, rotated: true })
  return { pieceId: `${id}#1`, partId: id, name: id, sizeLabel: `${x}×${y}`, orientations }
}

/** 部材1つぶんの片（枚数ぶん）。sides に入る向きだけを残す */
function partPieces(
  partId: string,
  name: string,
  W: number,
  H: number,
  quantity: number,
  rotatable: boolean,
  sides: { short: number; long: number },
): Piece[] {
  const cands: Orientation[] = [{ x: W, y: H, rotated: false }]
  if (rotatable && W !== H) cands.push({ x: H, y: W, rotated: true })
  const orientations = cands.filter((o) => round1(o.x) <= round1(sides.short) && round1(o.y) <= round1(sides.long))
  const out: Piece[] = []
  for (let i = 1; i <= quantity; i++) {
    out.push({ pieceId: `${partId}#${i}`, partId, name, sizeLabel: `${W}×${H}`, orientations })
  }
  return out
}

/** 3×6・端切り5 の縦切り優先で使える範囲の辺 */
const SABUROKU_SIDES = { short: 905, long: 1820 }

/**
 * kidori の見本（本棚）のランバー18 と同じ大きさの片（3×6 で 3枚になる）。
 * 側板×2（410×1810）・天地板×2（410×874）・棚板×4（390×873）。どれも W を妻手方向に置く（回転しない）
 */
export function kidoriLumberPieces(): Piece[] {
  return [
    ...partPieces('part-gawaita', '側板', 410, 1810, 2, false, SABUROKU_SIDES),
    ...partPieces('part-tenchi', '天地板', 410, 874, 2, false, SABUROKU_SIDES),
    ...partPieces('part-tanaita', '棚板', 390, 873, 4, false, SABUROKU_SIDES),
  ]
}

/** kidori の見本（本棚）のベニヤ4 と同じ大きさの片：背板×1（900×1800） */
export function kidoriVeneerPieces(): Piece[] {
  return partPieces('part-seita', '背板', 900, 1800, 1, false, SABUROKU_SIDES)
}

/**
 * 仕様書 6章の棚の木取り寸法（切り代10）の片を、全部「回転してよい」にしたもの（4×8・端切り5）。
 * 天板 1810×410 ×1・側板 710×410 ×2・棚板 1770×389 ×3。天板・棚板は W が妻手（1215）に入らないので、回した向きだけが残る
 */
export function shelfRotatablePieces(): Piece[] {
  const sides = { short: 1215, long: 2425 }
  return [
    ...partPieces('part-tenita', '天板', 1810, 410, 1, true, sides),
    ...partPieces('part-gawaita', '側板', 710, 410, 2, true, sides),
    ...partPieces('part-tanaita', '棚板', 1770, 389, 3, true, sides),
  ]
}
