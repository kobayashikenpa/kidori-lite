// 3×6 と 4×8 の比べ（仕様書 8）：今の設定の板を 3×6・4×8 に置き換えて木取りし、枚数・歩留まりを並べる。
// kidori の packing/sizes.ts をもとに、材料ごとの行・重ね切りの組の行・手持ち・端材から取った1枚を外したもの
import { round1 } from '../round'
import { BOARD_SIZES, type DimensionResult, type Job } from '../types'
import { packJob } from './index'

export type StandardSize = 'saburoku' | 'shihachi'

export interface SizeSummary {
  kind: StandardSize
  /** 妻手（mm） */
  width: number
  /** 長手（mm） */
  length: number
  /** 必要な板の枚数（packJob の sheetCount） */
  sheetCount: number
  /** 全体の歩留まり（packJob の yieldRate） */
  yieldRate: number
  /** 板に収まらない部材の数 */
  unplacedCount: number
}

export interface SizeComparison {
  /** 3×6、4×8 の順 */
  options: [SizeSummary, SizeSummary]
  /** 枚数が少ない方。入らない部材が出るサイズ・枚数 0 のサイズがあれば比べない。同じ枚数なら null */
  fewer: StandardSize | null
  /** 歩留まりが高い方（小数第1位の % で比べる）。比べない条件は fewer と同じ。同じなら null */
  higher: StandardSize | null
}

/** 3×6・4×8 のどちらが枚数が少ないか・歩留まりが高いか（画面の「枚数が少ない」「歩留まりが高い」の印） */
export function pickBetterSize(options: readonly [SizeSummary, SizeSummary]): Pick<SizeComparison, 'fewer' | 'higher'> {
  const [a, b] = options
  const fits = (o: SizeSummary) => o.unplacedCount === 0 && o.sheetCount > 0
  if (!fits(a) || !fits(b)) return { fewer: null, higher: null }
  const ya = round1(a.yieldRate * 100)
  const yb = round1(b.yieldRate * 100)
  return {
    fewer: a.sheetCount === b.sheetCount ? null : a.sheetCount < b.sheetCount ? a.kind : b.kind,
    higher: ya === yb ? null : ya > yb ? a.kind : b.kind,
  }
}

/** 板だけを kind のサイズにした写し（部材・ほかの設定は共有する。packJob は書き換えない） */
function withSize(job: Job, kind: StandardSize): Job {
  const [width, length] = BOARD_SIZES[kind]
  return { ...job, settings: { ...job.settings, sheet: { sizeKind: kind, width, length } } }
}

/**
 * 3×6 と 4×8 で木取りした枚数・歩留まり。切り方・刃厚・端切り・切り代は今の設定のまま。
 * 今の板が自由入力でも 3×6・4×8 で比べる（仕様書 8）。packJob を2回呼ぶ。元の仕事は変えない。
 * 固定した1枚は、どちらの計算でも packJob と同じに数える（architecture.md 3.4。暫定）
 */
export function compareStandardSizes(job: Job, dims: DimensionResult): SizeComparison {
  const kinds: [StandardSize, StandardSize] = ['saburoku', 'shihachi']
  const [a, b] = kinds.map((kind): SizeSummary => {
    const r = packJob(withSize(job, kind), dims)
    const [width, length] = BOARD_SIZES[kind]
    return { kind, width, length, sheetCount: r.sheetCount, yieldRate: r.yieldRate, unplacedCount: r.unplaced.length }
  })
  const options: [SizeSummary, SizeSummary] = [a, b]
  return { options, ...pickBetterSize(options) }
}
