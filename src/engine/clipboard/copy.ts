// 部材のコピー・まとめて貼り付け・複製（仕様書 5.3。アプリの中だけ）。新しく作ったもの（kidori には無い）。
// - コピーは式のまま持つ（部材は名前で参照するので、貼った部材どうしの参照はそのまま使える。調整寸法 {n:id} はアプリ全体の一覧なのでそのまま）
// - 貼り付けは、今の部材と同じ名前のもの・貼る部材どうしで2つ目からの同じ名前を足さない（normalizePartName で比べる）
// - 同じ仕事の中で部材を増やすときは複製（名前は「棚板のコピー」「棚板のコピー2」…）
// 仕事は書き換えず、新しい仕事を返す（updatedAt は保存の側で付ける）
import { adjustIdsInExpr } from '../formula/usages'
import { isBraceText, normalizePartName, parseRefText, splitChunks } from '../formula/tokenize'
import { AXES, type Adjust, type CopiedPart, type Job, type Part } from '../types'

function copyOf(p: Pick<Part, 'name' | 'expr' | 'quantity' | 'rotatable'>): CopiedPart {
  return { name: p.name, expr: { W: p.expr.W, H: p.expr.H }, quantity: p.quantity, rotatable: p.rotatable }
}

/** 選んだ部材をコピーする（並びは画面＝job.parts の順。無い id は無視する）。id・仕上がりの完了は持たない */
export function copyParts(job: Pick<Job, 'parts'>, partIds: readonly string[]): CopiedPart[] {
  const ids = new Set(partIds)
  return job.parts.filter((p) => ids.has(p.id)).map(copyOf)
}

/** 貼り付けの確認の1行 */
export type PasteRow =
  | { part: CopiedPart; ok: true; warnings: string[] }
  | {
      part: CopiedPart
      ok: false
      /** duplicateName：今の部材か、先に貼る部材と同じ名前 */
      reason: 'duplicateName'
      /** 画面に出す理由（例：「棚板 はもうあります」） */
      message: string
      warnings: string[]
    }

export interface PastePreview {
  /** コピーした並び */
  rows: PasteRow[]
  /** 足せる部材の数（「5件を追加します」） */
  addCount: number
  /** 足せない部材の数（「足せないもの 1件」） */
  skipCount: number
  /** 注意のある行がある（「式に無い部材があります」） */
  hasWarnings: boolean
}

/** 式で参照している部材名（書いたままの名前・出てきた順・重なりなし。読めない式の中でも探す） */
function partRefsInExpr(expr: string): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = []
  for (const item of splitChunks(expr)) {
    if ('type' in item || isBraceText(item.text)) continue
    const ref = parseRefText(item.text)
    if (!ref || out.some((r) => r.key === ref.part)) continue
    const dot = Math.max(item.text.lastIndexOf('.'), item.text.lastIndexOf('．'))
    out.push({ key: ref.part, text: dot > 0 ? item.text.slice(0, dot) : ref.part })
  }
  return out
}

/**
 * 1つの部材を貼ったときの注意。known は貼ったあとにある部材名（normalizePartName した名前）。
 * 無い部材の参照 →「全体 がありません」（部材ごとに1つ、W → H の順）、削除した調整寸法 →「削除した調整寸法を使っています」
 */
function warningsOf(part: CopiedPart, known: ReadonlySet<string>, adjustIds: ReadonlySet<string>): string[] {
  const missing: string[] = []
  const seen = new Set<string>()
  let unknownAdjust = false
  for (const axis of AXES) {
    for (const r of partRefsInExpr(part.expr[axis])) {
      if (known.has(r.key) || seen.has(r.key)) continue
      seen.add(r.key)
      missing.push(`${r.text} がありません`)
    }
    if (adjustIdsInExpr(part.expr[axis]).some((id) => !adjustIds.has(id))) unknownAdjust = true
  }
  return unknownAdjust ? [...missing, '削除した調整寸法を使っています'] : missing
}

/**
 * 貼り付けの確認（すぐには足さない）。行ごとに足せるか・足せない理由・注意を出す。
 * - 今の部材と同じ名前は足せない（「棚板 はもうあります」）。貼る部材どうしで同じ名前なら2つ目から足せない
 * - 式が、貼ったあとの仕事に無い部材を参照していれば注意（足すことはできる。足したあと式のエラーになる）
 * - adjusts（アプリ全体の調整寸法）に無い調整寸法を使っていれば注意
 */
export function previewPaste(job: Pick<Job, 'parts'>, copied: readonly CopiedPart[], adjusts: readonly Adjust[]): PastePreview {
  const existing = new Set(job.parts.map((p) => normalizePartName(p.name)))
  const known = new Set([...existing, ...copied.map((c) => normalizePartName(c.name))])
  const adjustIds = new Set(adjusts.map((a) => a.id))
  const taken = new Set(existing)
  const rows = copied.map((part): PasteRow => {
    const key = normalizePartName(part.name)
    const warnings = warningsOf(part, known, adjustIds)
    if (taken.has(key)) {
      const message = existing.has(key) ? `${part.name} はもうあります` : `${part.name} は貼る部材の中にもうあります`
      return { part, ok: false, reason: 'duplicateName', message, warnings }
    }
    taken.add(key)
    return { part, ok: true, warnings }
  })
  const addCount = rows.filter((r) => r.ok).length
  return { rows, addCount, skipCount: rows.length - addCount, hasWarnings: rows.some((r) => r.warnings.length > 0) }
}

/**
 * 足せる部材だけを今の部材の後ろに足した仕事（並びはコピーした並び）。
 * id は newId('part')、仕上がりの完了は外す。足せるかは previewPaste と同じ決まり
 */
export function applyPaste(job: Job, copied: readonly CopiedPart[], newId: (prefix: string) => string): Job {
  const taken = new Set(job.parts.map((p) => normalizePartName(p.name)))
  const added: Part[] = []
  for (const c of copied) {
    const key = normalizePartName(c.name)
    if (taken.has(key)) continue
    taken.add(key)
    added.push({ id: newId('part'), ...copyOf(c), finishedDone: false })
  }
  return { ...job, parts: [...job.parts, ...added] }
}

const COPY = 'のコピー'

/**
 * 複製の名前：「棚板のコピー」、あれば「棚板のコピー2」「棚板のコピー3」…（空いている一番小さい番号）。
 * 「棚板のコピー」「棚板のコピー2」を複製するときも「棚板」をもとにする（のコピーのコピー にしない）。
 * 今の部材と比べるのは normalizePartName でそろえた名前
 */
export function duplicateName(job: Pick<Job, 'parts'>, name: string): string {
  const m = new RegExp(`^(.+)${COPY}[0-9０-９]*$`).exec(name)
  const base = m ? m[1] : name
  const taken = new Set(job.parts.map((p) => normalizePartName(p.name)))
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${base}${COPY}` : `${base}${COPY}${n}`
    if (!taken.has(normalizePartName(candidate))) return candidate
  }
}

export type DuplicateResult = { ok: true; job: Job; partId: string } | { ok: false; message: string }

/**
 * 部材の複製：式・枚数・回転を写し、名前は duplicateName、元の部材のすぐ後ろに足す。
 * id は newId('part')（partId で返す。画面で編集を開くため）、仕上がりの完了は外す
 */
export function duplicatePart(job: Job, partId: string, newId: (prefix: string) => string): DuplicateResult {
  const i = job.parts.findIndex((p) => p.id === partId)
  if (i < 0) return { ok: false, message: '部材が見つかりません' }
  const src = job.parts[i]
  const part: Part = { id: newId('part'), ...copyOf(src), name: duplicateName(job, src.name), finishedDone: false }
  return { ok: true, job: { ...job, parts: [...job.parts.slice(0, i + 1), part, ...job.parts.slice(i + 1)] }, partId: part.id }
}
