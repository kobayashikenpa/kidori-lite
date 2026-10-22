// ファイルから取り込む：読んだファイルを今の保存データに足す（仕様書 15.3・15.4）。純粋関数（元のデータは書き換えない）。
// kidori の importShared・importBackup・rekeyJob（store/jobs.ts）を参考に、材料・フラッシュ・重ね切りの組を外し、
// 調整寸法をアプリ全体の一覧に合わせる（表示名が同じならそれを使い、無ければ足す）ようにしたもの
import { adjustNameKey } from '../defaults'
import { remapAdjustIds } from '../formula/usages'
import type { Adjust, AppData, FrozenSheet, Job, Part } from '../types'
import type { TransferFile } from './envelope'

export interface ImportResult {
  /** 取り込んだあとの保存データ（仕事は後ろに足す。今ある仕事・コピーした部材は変えない） */
  data: AppData
  /** 足した仕事の id（足した順） */
  jobIds: string[]
  /** 調整寸法の一覧に新しく足したもの（表示名が同じものが無かったもの） */
  addedAdjusts: Adjust[]
  /** 画面に出す知らせ（「「本棚」を取り込みました」「3件の仕事を追加しました」） */
  message: string
}

/**
 * ファイルの調整寸法を今の一覧に合わせる。表示名（adjustNameKey）が同じものが今の一覧（または先に足したもの）にあればその id、
 * 無ければ newId('adjust') で足す。戻り値は ファイルの id → 今の一覧の id と、足した調整寸法
 */
function mergeAdjusts(
  current: readonly Adjust[],
  incoming: readonly Adjust[],
  newId: (prefix: string) => string,
): { map: Map<string, string>; added: Adjust[] } {
  const byKey = new Map<string, string>()
  for (const a of current) if (!byKey.has(adjustNameKey(a))) byKey.set(adjustNameKey(a), a.id)
  const map = new Map<string, string>()
  const added: Adjust[] = []
  for (const a of incoming) {
    if (map.has(a.id)) continue
    const key = adjustNameKey(a)
    let id = byKey.get(key)
    if (id === undefined) {
      id = newId('adjust')
      byKey.set(key, id)
      added.push({ id, name: a.name.trim(), value: a.value })
    }
    map.set(a.id, id)
  }
  return { map, added }
}

/** 重ならない仕事の名前：同じ名前（前後の空白を除く）があれば「棚のコピー」「棚のコピー2」…（暫定） */
function uniqueJobName(name: string, taken: readonly string[]): string {
  const set = new Set(taken.map((n) => n.trim()))
  if (!set.has(name.trim())) return name
  const base = `${name.trim()}のコピー`
  if (!set.has(base)) return base
  for (let i = 2; ; i++) if (!set.has(`${base}${i}`)) return `${base}${i}`
}

/**
 * 仕事の id を新しくした写し（深いコピー）。部材の id、式の {n:id}（adjustMap）、
 * keepProgress なら固定した1枚の id・片の partId／pieceId・checked もつけ替える。keepProgress でなければ固定した1枚と仕上がりの完了を外す
 */
function rekeyJob(
  job: Job,
  newId: (prefix: string) => string,
  adjustMap: ReadonlyMap<string, string>,
  keepProgress: boolean,
): Job {
  const partIds = new Map<string, string>()
  const parts: Part[] = job.parts.map((p) => {
    const id = newId('part')
    partIds.set(p.id, id)
    return {
      ...p,
      id,
      expr: { W: remapAdjustIds(p.expr.W, adjustMap), H: remapAdjustIds(p.expr.H, adjustMap) },
      finishedDone: keepProgress ? p.finishedDone : false,
    }
  })
  /** 片の id（`${partId}#n`）の部材の部分をつけ替える */
  const piece = (pieceId: string) => {
    const i = pieceId.lastIndexOf('#')
    if (i < 0) return pieceId
    const to = partIds.get(pieceId.slice(0, i))
    return to === undefined ? pieceId : `${to}${pieceId.slice(i)}`
  }
  const frozenSheets: FrozenSheet[] = keepProgress
    ? job.frozenSheets.map((f) => {
        const copy = JSON.parse(JSON.stringify(f)) as FrozenSheet
        copy.id = newId('frozen')
        for (const pl of copy.layout.placements) {
          pl.partId = partIds.get(pl.partId) ?? pl.partId
          pl.pieceId = piece(pl.pieceId)
        }
        copy.checked = copy.checked.map(piece)
        return copy
      })
    : []
  return {
    ...job,
    id: newId('job'),
    settings: { ...job.settings, sheet: { ...job.settings.sheet } },
    parts,
    frozenSheets,
  }
}

/**
 * 読んだファイル（readTransferFile の file）を今の保存データに足す。
 * - 仕事・部材・固定した1枚の id は振り直し、コピーとして後ろに足す（今ある仕事は変えない）。名前が重なれば「◯◯のコピー」
 * - 調整寸法は表示名が同じものが今の一覧にあればそれを使い、無ければ新しい id で足して、式の {n:id} をつけ替える
 * - 共有（kind: job）：切り出しチェック・仕上がりの完了は無し。作った日・変えた日は now
 * - バックアップ（kind: backup）：切り出しチェック・仕上がりの完了も戻す。作った日・変えた日はファイルのまま
 */
export function importTransfer(
  data: AppData,
  file: TransferFile,
  newId: (prefix: string) => string,
  now: Date,
): ImportResult {
  const { map, added } = mergeAdjusts(data.adjusts, file.adjusts, newId)
  const names = data.jobs.map((j) => j.name)
  const incoming = file.kind === 'job' ? [file.job] : file.jobs
  const keepProgress = file.kind === 'backup'
  const jobs = incoming.map((src) => {
    const job = rekeyJob(src, newId, map, keepProgress)
    const name = uniqueJobName(src.name, names)
    names.push(name)
    if (keepProgress) return { ...job, name }
    const t = now.toISOString()
    return { ...job, name, createdAt: t, updatedAt: t }
  })
  return {
    data: { ...data, jobs: [...data.jobs, ...jobs], adjusts: [...data.adjusts, ...added] },
    jobIds: jobs.map((j) => j.id),
    addedAdjusts: added,
    message: file.kind === 'job' ? `「${jobs[0].name}」を取り込みました` : `${jobs.length}件の仕事を追加しました`,
  }
}
