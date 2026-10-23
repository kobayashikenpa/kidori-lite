// 部材を1枚ずつの「片」にする。回転の指定（回転しない／回転してよい）で、板の辺に対する向き（x・y）を決める。
// kidori の packing/pieces.ts をもとに、材料ごとの分け（groupRuns の材料）・木目・フラッシュ・重ね切り・手持ち・
// 木取り済み（checks.cut）を外し、1種類の板（settings.sheet）だけにしたもの。固定した1枚の片を引く仕組みは残す（数は E-08 で渡す）
import { round1 } from '../round'
import type { DimensionResult, Job, PackingResult, UnplacedReason } from '../types'
import { usableSides, type BoardSize, type StripMode } from './sheet'
import { cutQuantity } from '../parts'

/**
 * 板の辺に対する片の向き（置き方＝縦長／横長によらない）。x：妻手方向の大きさ、y：長手方向の大きさ。
 * 回転しない部材は x ＝ 木取り W、y ＝ 木取り H。横長に置く横切り優先では、配置図の横が y、縦が x になる（guillotine.ts の frameOf で直す）
 */
export interface Orientation {
  x: number
  y: number
  /** 部材の W を板の長手方向に置いた（回転した）とき true */
  rotated: boolean
}

/** 切り出す片（部材の1枚ぶん） */
export interface Piece {
  /** `${partId}#${連番}` */
  pieceId: string
  partId: string
  name: string
  /** 配置図に出す寸法（木取り寸法の W×H） */
  sizeLabel: string
  /**
   * 置いてよい向き（使える範囲に入るものだけ）。回転してよい部材は2つになることがある
   */
  orientations: Orientation[]
}

/** 片の形：木取り寸法の W・H と、回転してよいか */
export interface PieceShape {
  W: number
  H: number
  rotatable: boolean
}

export type Unplaced = { partId: string; name: string; reason: UnplacedReason }

/** 1つの部材の片の並び。片の id は `${partId}#1` 〜 `${partId}#${count}` */
export interface PieceRun {
  partId: string
  name: string
  /** 片の数（固定した1枚の片を引いた残り。1以上） */
  count: number
  shape: PieceShape
  /** 木取り寸法の W×H（小数第1位まで） */
  sizeLabel: string
}

export interface ExpandResult {
  /** 部材の並び */
  runs: PieceRun[]
  /** 計算から除いた部材（寸法のエラー。枚数0の行は含めない） */
  skipped: PackingResult['skipped']
}

/** 固定した1枚の片の数（部材の id → 片の数）。progress/frozen.ts の frozenDemand で数える */
export type FrozenCounts = ReadonlyMap<string, number>

function fmt(v: number): string {
  return String(round1(v))
}

/**
 * 部材を片の並びにする（部材の並び）。
 * - 枚数0 の行（全体 など）と枚数が空（null）の行は片にせず、除いた一覧にも出さない
 * - 名前は表示用の名前（dims の name。名前が空なら #行番号）
 * - 固定した1枚（frozen）の片の数は、部材の枚数から数だけで引く（寸法は見ない。0 未満にはしない）。
 *   引いて 0 になった部材は、寸法のエラーがあっても除いた一覧に出さない（kidori と同じ）
 * - 寸法のエラーがある部材（木取り寸法が出ない）は skipped（dimensionError）
 */
export function expandPieces(job: Pick<Job, 'parts'>, dims: DimensionResult, frozen: FrozenCounts = new Map()): ExpandResult {
  const partById = new Map(job.parts.map((p) => [p.id, p]))
  const runs: PieceRun[] = []
  const skipped: ExpandResult['skipped'] = []
  for (const d of dims.parts) {
    const quantity = cutQuantity(d.quantity)
    if (quantity < 1) continue
    const count = Math.max(0, quantity - (frozen.get(d.partId) ?? 0))
    if (count === 0) continue
    if (d.errors.length > 0 || !d.cut) {
      skipped.push({ partId: d.partId, name: d.name, reason: 'dimensionError' })
      continue
    }
    const shape: PieceShape = { W: d.cut.W, H: d.cut.H, rotatable: partById.get(d.partId)?.rotatable === true }
    runs.push({ partId: d.partId, name: d.name, count, shape, sizeLabel: `${fmt(shape.W)}×${fmt(shape.H)}` })
  }
  return { runs, skipped }
}

/**
 * 片を置いてよい向き（回転の指定と、使える範囲に入るか）。
 * 回転しない：W を妻手方向（x）、H を長手方向（y）。回転してよい：その向きと、回した向き（正方形は1つ）。
 * mode は使える範囲を決める切り方（横切り優先は長手も端切りする）
 */
export function orientationsFor(shape: PieceShape, board: BoardSize, trim: number, mode: StripMode): Orientation[] {
  const { W, H, rotatable } = shape
  const candidates: Orientation[] = [{ x: W, y: H, rotated: false }]
  if (rotatable && round1(W) !== round1(H)) candidates.push({ x: H, y: W, rotated: true })
  const sides = usableSides(board, trim, mode)
  return candidates.filter((o) => round1(o.x) <= round1(sides.short) && round1(o.y) <= round1(sides.long))
}

/**
 * 片の並びを片にする（部材の並び）。使える範囲にどう置いても入らない部材は unplaced（tooLarge。部材ごとに1つ）。
 * mode は向きを判定する切り方（設定の切り方）
 */
export function piecesOf(
  runs: readonly PieceRun[],
  board: BoardSize,
  trim: number,
  mode: StripMode,
): { pieces: Piece[]; unplaced: Unplaced[] } {
  const pieces: Piece[] = []
  const unplaced: Unplaced[] = []
  for (const r of runs) {
    const orientations = orientationsFor(r.shape, board, trim, mode)
    if (orientations.length === 0) {
      unplaced.push({ partId: r.partId, name: r.name, reason: 'tooLarge' })
      continue
    }
    for (let i = 1; i <= r.count; i++) {
      pieces.push({ pieceId: `${r.partId}#${i}`, partId: r.partId, name: r.name, sizeLabel: r.sizeLabel, orientations })
    }
  }
  return { pieces, unplaced }
}
