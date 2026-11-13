// 何を戻したかの文（第2.3版。仕様書 27.1・27.4、architecture 16.3）。React に依存しない純粋な関数。
// 1回の名前（historyLabel）は操作の前の状態から作る。部材の呼び名は今の表示名（名前の無い部材は「#3」）
import { partLabelAt } from '../engine/parts'
import type { Part, Settings } from '../engine/types'
import type { PartPatch } from './jobs'
import type { StoreAction, StoreState } from './reducer'

/** 設定の名前（updateSettings に渡した順にこの並びで出す） */
const SETTING_NAMES: readonly [keyof Omit<Settings, 'sheet'>, string][] = [
  ['kerf', '刃厚'],
  ['trim', '端切り'],
  ['allowance', '切り代'],
  ['cutMode', '切り方'],
]

/** 部材の欄の名前と、patch でその欄が変わるか（部材の画面の並び：名前・厚み・W・H・枚数、そのあと調整・回転・仕上がり・メモ・色） */
const PART_FIELDS: readonly [string, (cur: Part, patch: PartPatch) => boolean | undefined][] = [
  ['名前', (c, p) => p.name !== undefined && p.name.trim() !== c.name],
  ['厚み', (c, p) => p.thickness !== undefined && p.thickness !== c.thickness],
  ['W', (c, p) => p.expr?.W !== undefined && p.expr.W !== c.expr.W],
  ['H', (c, p) => p.expr?.H !== undefined && p.expr.H !== c.expr.H],
  ['枚数', (c, p) => p.quantity !== undefined && p.quantity !== c.quantity],
  ['調整 W', (c, p) => p.adjust?.W !== undefined && p.adjust.W !== c.adjust.W],
  ['調整 H', (c, p) => p.adjust?.H !== undefined && p.adjust.H !== c.adjust.H],
  ['回転', (c, p) => p.rotatable !== undefined && p.rotatable !== c.rotatable],
  ['仕上がり', (c, p) => p.finishedDone !== undefined && p.finishedDone !== c.finishedDone],
  ['メモ', (c, p) => p.memo !== undefined && p.memo !== c.memo],
  ['色', (c, p) => (p.rowColor !== undefined && p.rowColor !== c.rowColor) || p.cellColors !== undefined],
]

/** 空の行に入れて部材を作ったときの欄（入っている最初の欄） */
function addedField(part: Partial<Omit<Part, 'id'>>): string | null {
  if (part.name !== undefined && part.name.trim() !== '') return '名前'
  if (part.thickness !== undefined && part.thickness !== null) return '厚み'
  if (part.expr?.W) return 'W'
  if (part.expr?.H) return 'H'
  if (part.quantity !== undefined && part.quantity !== null) return '枚数'
  return null
}

/** 操作の対象の仕事の部材と、その表示名 */
function partOf(before: StoreState, jobId: string | undefined, partId: string): { part: Part; name: string } | null {
  const job = before.data.jobs.find((j) => j.id === (jobId ?? before.currentJobId))
  const i = job ? job.parts.findIndex((p) => p.id === partId) : -1
  if (!job || i < 0) return null
  return { part: job.parts[i], name: partLabelAt(job.parts[i], i) }
}

/**
 * 部材の欄の名前（「棚板 の W」「棚板 の厚み」「棚板 の調整 H」。仕様書 27.1 の例の形で、W・H の前だけ空白を入れる）。
 * 部材が見つからなければ欄の名前だけ
 */
function partField(name: string | undefined, field: string): string {
  if (name === undefined) return field
  return `${name} の${/^[A-Za-z]/.test(field) ? ' ' : ''}${field}`
}

/**
 * 1回の名前（architecture 16.3）。before は操作の前の状態。まとまりは最初の操作の名前を使う（history.ts）。
 * 戻せない操作・記録しない操作は ''（記録しないので使わない）
 */
export function historyLabel(action: StoreAction, before: StoreState): string {
  switch (action.type) {
    case 'updatePart': {
      const t = partOf(before, action.jobId, action.partId)
      if (!t) return '部材'
      const hit = PART_FIELDS.find(([, changed]) => changed(t.part, action.patch))
      return partField(t.name, hit ? hit[0] : '中身')
    }
    case 'addPart': {
      const job = before.data.jobs.find((j) => j.id === (action.jobId ?? before.currentJobId))
      const field = addedField(action.part)
      if (field === null) return '行の追加'
      return partField(partLabelAt({ name: '' }, job ? job.parts.length : 0), field)
    }
    case 'setPartAdjust':
      return partField(partOf(before, action.jobId, action.partId)?.name, `調整 ${action.axis}`)
    case 'setPartMemo':
      return partField(partOf(before, action.jobId, action.partId)?.name, 'メモ')
    case 'insertPart':
      return '行の挿入'
    case 'removePart':
    case 'deleteRows':
      return '行の削除'
    case 'duplicatePart':
      return '複製'
    case 'sortParts':
      return '並べ替え'
    case 'moveParts':
      return '行の移動'
    case 'pasteCells':
    case 'pastePartAdjustCells':
      return '貼り付け'
    case 'fillCells':
    case 'fillPartAdjustCells':
      return 'オートフィル'
    case 'clearCells':
    case 'clearPartAdjustCells':
      return 'クリア'
    case 'setCellColor':
    case 'setRowColor':
      return '色'
    case 'setAllRotatable':
      return '全部回転してよい'
    case 'setAdjustCell':
    case 'pasteAdjustCells':
    case 'fillAdjustCells':
    case 'clearAdjustCells':
    case 'deleteAdjustRows':
    case 'insertAdjustRow':
    case 'addAdjust':
    case 'updateAdjust':
    case 'removeAdjusts':
      return '調整寸法の表'
    case 'setSheet':
      return '板のサイズ'
    case 'updateSettings': {
      const names = SETTING_NAMES.filter(([key]) => action.patch[key] !== undefined).map(([, n]) => n)
      return names.length > 0 ? names.join('・') : '設定'
    }
    case 'setPartCheck':
    case 'setPieceCheck':
      return '切り出しチェック'
    default:
      return ''
  }
}

/** 戻す・進むの知らせる文（未決事項 6）：「戻しました：棚板 の W」「進めました：棚板 の W」 */
export function historyNotice(kind: 'undo' | 'redo', label: string): string {
  const head = kind === 'undo' ? '戻しました' : '進めました'
  return label ? `${head}：${label}` : head
}
