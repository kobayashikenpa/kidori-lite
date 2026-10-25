// 調整寸法の表の行（書きかけを含む）と、式で使える調整寸法（第1.7版。仕様書 21.1・21.3）。新しく作ったもの（kidori には無い）。
// - AppData.adjusts は表の行（AdjustRow）。名前だけ・寸法だけの書きかけの行も持つ
// - 式・表示・計算・ファイルに渡すのは、名前と寸法がそろった行（usableAdjusts）だけ。
//   書きかけの行を使っている式は、一覧に見つからないので「削除した調整寸法」と同じエラー・表示になる（id は残るので、そろえ直せば元に戻る）
import { adjustName, adjustNameKey } from './defaults'
import { adjustUsagesOf, type AdjustUsage } from './formula/usages'
import { normalizeFormulaText } from './formula/tokenize'
import { exactText } from './round'
import type { Adjust, AdjustRow, Job } from './types'

/** 名前があり、寸法が 0 より大きい行（式で使える調整寸法）か */
export function isUsableAdjust(row: AdjustRow): row is Adjust {
  return row.name.trim() !== '' && row.value !== null && Number.isFinite(row.value) && row.value > 0
}

const usableCache = new WeakMap<readonly AdjustRow[], Adjust[]>()

/**
 * 式で使える調整寸法（表の並びのまま、書きかけの行を外したもの）。
 * 同じ一覧（同じ配列）を渡せば同じ配列を返す（画面の useMemo の依存が毎回変わらないように）
 */
export function usableAdjusts(rows: readonly AdjustRow[]): Adjust[] {
  const hit = usableCache.get(rows)
  if (hit) return hit
  const out = rows.filter(isUsableAdjust)
  usableCache.set(rows, out)
  return out
}

/** 名前も寸法も空の行（表から外す。保存しない） */
export function isBlankAdjustRow(row: Pick<AdjustRow, 'name' | 'value'>): boolean {
  return row.name.trim() === '' && row.value === null
}

/**
 * 寸法の欄の文字から寸法。空は null（寸法を空に）、0 より大きい数（全角・小数も）はその数、
 * それ以外（0・負の数・式・文字）は undefined（入れない）。寸法の欄はアプリのキーの数字と小数点だけ（仕様書 21.1）
 */
export function parseAdjustValue(text: string): number | null | undefined {
  const t = normalizeFormulaText(text).trim()
  if (t === '') return null
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return undefined
  const v = Number(t)
  return Number.isFinite(v) && v > 0 ? v : undefined
}

/** 寸法の欄の文字（丸めない。浮動小数の誤差だけ消す。空は ''） */
export function adjustValueText(value: number | null): string {
  return value === null ? '' : exactText(value)
}

/**
 * 表示名（名前＋寸法。adjustNameKey）が同じになる、式で使える行。row が書きかけなら重ならない（null）。
 * exceptId は自分の行（比べない）
 */
export function adjustConflict(
  rows: readonly AdjustRow[],
  row: Pick<AdjustRow, 'name' | 'value'>,
  exceptId?: string,
): Adjust | null {
  if (!isUsableAdjust({ id: '', name: row.name, value: row.value })) return null
  const key = adjustNameKey({ name: row.name, value: row.value as number })
  return usableAdjusts(rows).find((a) => a.id !== exceptId && adjustNameKey(a) === key) ?? null
}

/** 表示名が重なるときの文（「メラミン1」はもうあります） */
export function duplicateAdjustMessage(adjust: Pick<Adjust, 'name' | 'value'>): string {
  return `「${adjustName({ name: adjust.name.trim(), value: adjust.value })}」はもうあります`
}

/**
 * 前の一覧で式で使えた調整寸法のうち、後の一覧で 消えた・書きかけになった・表示名（名前・寸法）が変わったもの（前の一覧の並び）。
 * 前に書きかけだった行の変化は数えない（式で使えていなかったので値は変わらない）
 */
export function changedAdjusts(before: readonly AdjustRow[], after: readonly AdjustRow[]): Adjust[] {
  const byId = new Map(after.map((r) => [r.id, r]))
  return usableAdjusts(before).filter((a) => {
    const b = byId.get(a.id)
    return !b || !isUsableAdjust(b) || adjustName({ name: b.name.trim(), value: b.value }) !== adjustName({ name: a.name.trim(), value: a.value })
  })
}

export interface AdjustChangeUsages {
  /** 確かめる調整寸法：値・名前が変わる・消える・書きかけになるもののうち、今の仕事以外で使っているもの（前の一覧の並び・前の形） */
  changed: Adjust[]
  /** changed を使っている所（全部の仕事。今の仕事も入れる。部材ごとに1つ。adjustIds はその部材が使っている changed） */
  usages: (AdjustUsage & { adjustIds: string[] })[]
  /** usages の仕事の数（今の仕事も入れる。「◯件の仕事で使っています」） */
  jobCount: number
  /** usages のうち、今の仕事以外の仕事の数 */
  otherJobCount: number
}

/**
 * 調整寸法の表の操作の前の確認（仕様書 21.3）：before → after で値・名前が変わる調整寸法のうち、今の仕事（currentJobId）以外で使っているもの。
 * changed が空なら確認はいらない（この仕事でしか使っていない・どこでも使っていない）。currentJobId が null なら全部の仕事を「ほか」とみなす
 */
export function adjustChangeUsages(
  jobs: readonly Pick<Job, 'id' | 'name' | 'parts'>[],
  before: readonly AdjustRow[],
  after: readonly AdjustRow[],
  currentJobId: string | null,
): AdjustChangeUsages {
  const candidates = changedAdjusts(before, after)
  const all = adjustUsagesOf({ jobs }, candidates.map((a) => a.id))
  const usedElsewhere = new Set(all.filter((u) => u.jobId !== currentJobId).flatMap((u) => u.adjustIds))
  const changed = candidates.filter((a) => usedElsewhere.has(a.id))
  const ids = new Set(changed.map((a) => a.id))
  const usages = all
    .map((u) => ({ ...u, adjustIds: u.adjustIds.filter((id) => ids.has(id)) }))
    .filter((u) => u.adjustIds.length > 0)
  const jobIds = new Set(usages.map((u) => u.jobId))
  return {
    changed,
    usages,
    jobCount: jobIds.size,
    otherJobCount: [...jobIds].filter((id) => id !== currentJobId).length,
  }
}
