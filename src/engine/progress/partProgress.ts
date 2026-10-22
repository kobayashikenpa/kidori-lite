// 部材ごとの切り出しの進み具合（仕様書 8。例：側板 2/5）：固定した1枚（切り終わりを含む）でチェックした片の数から数える。
// kidori の progress/partProgress.ts をもとに、材料・フラッシュ・重ね切り・以前の木取り済み（checks.cut）を外したもの
import { cutQuantity, partLabels } from '../parts'
import type { Job } from '../types'

export interface PartCutProgress {
  partId: string
  name: string
  /** 切った片の数（total を超えない） */
  done: number
  /** 切り出す片の数（部材の枚数） */
  total: number
}

/** 部材ごとの切り出しの進み具合。並びは job.parts の順。枚数0・枚数が空の部材は入れない。name は表示用の名前（空なら #行番号） */
export function partCutProgress(job: Pick<Job, 'parts' | 'frozenSheets'>): PartCutProgress[] {
  const checked = new Map<string, number>()
  for (const s of job.frozenSheets) {
    const on = new Set(s.checked)
    for (const p of s.layout.placements) {
      if (on.has(p.pieceId)) checked.set(p.partId, (checked.get(p.partId) ?? 0) + 1)
    }
  }
  const labels = partLabels(job.parts)
  const out: PartCutProgress[] = []
  for (const part of job.parts) {
    const total = cutQuantity(part.quantity)
    if (!(total > 0)) continue
    out.push({ partId: part.id, name: labels.get(part.id)!, done: Math.min(total, checked.get(part.id) ?? 0), total })
  }
  return out
}
