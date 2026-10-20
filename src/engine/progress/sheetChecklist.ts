// 1枚ごとのチェックの一覧（仕様書 8）：同じ部材を1行にまとめる（例：「□ 側板 ×2枚」）。
// 並びは切る順番に取り出される順（その片を取り出す最後の工程の小さい順。同じなら layout.placements の順）。
// kidori の progress/sheetChecklist.ts をもとにしたもの。取り出す工程（pieceReleaseSteps）は kidori の sheetProgress.ts から
// この関数だけを持ってきた（残りの材料の表示は持ってこない）
import { round1 } from '../round'
import type { Job, Rect, SheetLayout } from '../types'

/** 比べるときに許す誤差（小数第1位に丸めたうえで 0.1mm） */
const TOL = 0.1 + 1e-9

const le = (a: number, b: number) => round1(a) <= round1(b) + TOL

/** outer が inner を含む */
function contains(outer: Rect, inner: Rect): boolean {
  return le(outer.x, inner.x) && le(outer.y, inner.y) && le(inner.x + inner.w, outer.x + outer.w) && le(inner.y + inner.h, outer.y + outer.h)
}

/**
 * 片ごとに、その片を取り出す最後の工程（CutStep.no）。within がその片を含む工程のうち一番大きい no。
 * 工程が1つも要らない片（板全体がその片）は 0
 */
export function pieceReleaseSteps(layout: Pick<SheetLayout, 'placements' | 'cuts'>): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of layout.placements) {
    let last = 0
    for (const c of layout.cuts) if (c.no > last && contains(c.within, p)) last = c.no
    out.set(p.pieceId, last)
  }
  return out
}

export interface SheetChecklistRow {
  pieceId: string
  partId: string
  /** 今の部材名（部材が無ければ写しの名前） */
  name: string
  /** その1枚（固定した1枚の写し、または計算の結果）の木取り寸法 */
  sizeLabel: string
  done: boolean
}

/** 1枚の片を1行ずつ（切る順番に取り出される順） */
export function sheetChecklist(job: Pick<Job, 'parts'>, layout: SheetLayout, checked: readonly string[]): SheetChecklistRow[] {
  const names = new Map(job.parts.map((p) => [p.id, p.name]))
  const done = new Set(checked)
  const steps = pieceReleaseSteps(layout)
  const ordered = layout.placements
    .map((p, i) => ({ p, i, step: steps.get(p.pieceId) ?? 0 }))
    .sort((a, b) => a.step - b.step || a.i - b.i)
    .map(({ p }) => p)
  return ordered.map((p) => ({
    pieceId: p.pieceId,
    partId: p.partId,
    name: names.get(p.partId) ?? p.name,
    sizeLabel: p.sizeLabel,
    done: done.has(p.pieceId),
  }))
}

export interface SheetPartRow {
  partId: string
  /** 今の部材名（部材が無ければ写しの名前） */
  name: string
  /** 木取り寸法（その1枚の最初の片の sizeLabel） */
  sizeLabel: string
  /** その1枚の、この部材の片（切る順番に取り出される順）。「×◯枚」は pieceIds.length */
  pieceIds: string[]
  /** 片がすべてチェック済み */
  done: boolean
}

/**
 * 1枚の片を部材ごとにまとめる（画面のチェックの一覧はこちら）。
 * 行の並びは、その部材の片が最初に取り出される順。計算した1枚は checked に [] を渡す
 */
export function sheetPartChecklist(job: Pick<Job, 'parts'>, layout: SheetLayout, checked: readonly string[]): SheetPartRow[] {
  const rows = new Map<string, SheetPartRow>()
  for (const r of sheetChecklist(job, layout, checked)) {
    const row = rows.get(r.partId)
    if (row) {
      row.pieceIds.push(r.pieceId)
      row.done = row.done && r.done
    } else {
      rows.set(r.partId, { partId: r.partId, name: r.name, sizeLabel: r.sizeLabel, pieceIds: [r.pieceId], done: r.done })
    }
  }
  return [...rows.values()]
}
