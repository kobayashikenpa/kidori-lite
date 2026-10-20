// 調整寸法を式で使っている部材の一覧（1つの仕事の中・全部の仕事から）
// kidori の formula/usages.ts をもとに、材料の厚み・id のつけ替え・共有用の id 集めを外し、
// 調整寸法がアプリ全体で1つの一覧になったので、全部の仕事から探す adjustUsages を足したもの
import { AXES, type AppData, type Axis, type Job } from '../types'
import { isBraceText, parseBraceText, splitChunks } from './tokenize'

/** 式に出てくる {n:…} の id（出てきた順・重なりもそのまま。読めない式の中でも探す） */
export function adjustIdsInExpr(expr: string): string[] {
  const out: string[] = []
  for (const item of splitChunks(expr)) {
    if ('type' in item || !isBraceText(item.text)) continue
    const b = parseBraceText(item.text)
    if (b) out.push(b.id)
  }
  return out
}

/** 部材の式で ids のどれかを使っている軸（W→H の順） */
function axesUsing(expr: Readonly<Record<Axis, string>>, ids: ReadonlySet<string>): Axis[] {
  return AXES.filter((a) => adjustIdsInExpr(expr[a]).some((id) => ids.has(id)))
}

/** 式で ids のどれかを使っている部材を「部材名（軸）」で返す（部材の並び順・部材ごとに1つ。軸が両方なら 棚板（W・H）） */
function partsUsing(job: Pick<Job, 'parts'>, ids: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const p of job.parts) {
    const axes = axesUsing(p.expr, ids)
    if (axes.length > 0) out.push(`${p.name}（${axes.join('・')}）`)
  }
  return out
}

/** 1つの仕事で、式でその調整寸法を使っている部材（例：［棚板（H）］） */
export function partsUsingAdjust(job: Pick<Job, 'parts'>, adjustId: string): string[] {
  return partsUsing(job, new Set([adjustId]))
}

/** 1つの仕事で、式でいくつかの調整寸法のどれかを使っている部材（部材ごとに1つ） */
export function partsUsingAdjusts(job: Pick<Job, 'parts'>, adjustIds: readonly string[]): string[] {
  return partsUsing(job, new Set(adjustIds))
}

/** 調整寸法を使っている所（どの仕事のどの部材の、どの軸か） */
export interface AdjustUsage {
  jobId: string
  jobName: string
  partId: string
  partName: string
  /** 使っている軸（W→H の順） */
  axes: Axis[]
}

/**
 * 全部の仕事から、式でその調整寸法を使っている部材を探す（仕事の並び順・部材の並び順・部材ごとに1つ）。
 * 調整寸法の寸法の変更・削除の前の確認に使う。仕事の数は jobId の重なりを除いて数える
 */
export function adjustUsages(data: Pick<AppData, 'jobs'>, adjustId: string): AdjustUsage[] {
  return adjustUsagesOf(data, [adjustId]).map((u) => ({
    jobId: u.jobId,
    jobName: u.jobName,
    partId: u.partId,
    partName: u.partName,
    axes: u.axes,
  }))
}

/**
 * 全部の仕事から、式でいくつかの調整寸法のどれかを使っている部材を探す（部材ごとに1つ。一括削除の確認用）。
 * adjustIds には、その部材が使っている調整寸法を、引数の並び順で入れる
 */
export function adjustUsagesOf(
  data: Pick<AppData, 'jobs'>,
  adjustIds: readonly string[],
): (AdjustUsage & { adjustIds: string[] })[] {
  const out: (AdjustUsage & { adjustIds: string[] })[] = []
  if (adjustIds.length === 0) return out
  const wanted = new Set(adjustIds)
  for (const job of data.jobs) {
    for (const p of job.parts) {
      const axes = axesUsing(p.expr, wanted)
      if (axes.length === 0) continue
      const used = new Set(AXES.flatMap((a) => adjustIdsInExpr(p.expr[a])))
      out.push({
        jobId: job.id,
        jobName: job.name,
        partId: p.id,
        partName: p.name,
        axes,
        adjustIds: [...new Set(adjustIds)].filter((id) => used.has(id)),
      })
    }
  }
  return out
}
