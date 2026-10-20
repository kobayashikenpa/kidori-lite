// 部材のコピー・まとめて貼り付け・複製（仕様書 5.3）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { MELAMINE_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import type { CopiedPart, Job, Part } from '../types'
import { applyPaste, copyParts, duplicateName, duplicatePart, previewPaste } from './copy'

/** 決まった id を順に出す */
function ids(): (prefix: string) => string {
  let n = 0
  return (prefix) => `${prefix}-new${++n}`
}

function emptyJob(): Job {
  return createJob({ id: 'job-other', name: 'ほかの仕事', now: '2026-10-20T00:00:00.000Z' })
}

function part(id: string, name: string, W = '100', H = '200', quantity = 1): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

const copied = (name: string, W = '100', H = '200'): CopiedPart => ({ name, expr: { W, H }, quantity: 1, rotatable: false })

describe('copyParts（式のまま、画面の並びで）', () => {
  it('選んだ部材を部材の並びでコピーする。式は式のまま、id・仕上がりの完了は持たない', () => {
    const job = shelfJob()
    job.parts[3].rotatable = true
    job.parts[3].finishedDone = true
    const c = copyParts(job, ['part-tanaita', 'part-tenita'])
    expect(c).toEqual([
      { name: '天板', expr: { W: '全体.W', H: '全体.H' }, quantity: 1, rotatable: false },
      { name: '棚板', expr: { W: `天板.W - 20 - {n:${MELAMINE_ID}}`, H: '天板.H - 20 × 2' }, quantity: 3, rotatable: true },
    ])
  })

  it('写し：コピーしたあと元の部材を書き換えてもコピーは変わらない。無い id は無視する', () => {
    const job = shelfJob()
    const c = copyParts(job, ['part-gawaita', 'none'])
    job.parts[2].expr.H = '1'
    expect(c).toEqual([{ name: '側板', expr: { W: '全体.W', H: '700' }, quantity: 2, rotatable: false }])
  })
})

describe('previewPaste（貼り付けの確認）', () => {
  it('空の仕事に見本を全部貼る：全部足せて、注意は無い', () => {
    const c = copyParts(shelfJob(), shelfJob().parts.map((p) => p.id))
    const pv = previewPaste(emptyJob(), c, shelfAdjusts())
    expect(pv.rows.map((r) => [r.part.name, r.ok, r.warnings])).toEqual([
      ['全体', true, []],
      ['天板', true, []],
      ['側板', true, []],
      ['棚板', true, []],
    ])
    expect([pv.addCount, pv.skipCount, pv.hasWarnings]).toEqual([4, 0, false])
  })

  it('今の部材と同じ名前は足せない（「棚板 はもうあります」）。全角・半角の違いも同じ名前', () => {
    const job = { ...emptyJob(), parts: [part('a', '棚板'), part('b', '棚板1')] }
    const pv = previewPaste(job, [copied('棚板'), copied('棚板１'), copied('天板')], shelfAdjusts())
    expect(pv.rows.map((r) => (r.ok ? [r.part.name, true] : [r.part.name, r.reason, r.message]))).toEqual([
      ['棚板', 'duplicateName', '棚板 はもうあります'],
      ['棚板１', 'duplicateName', '棚板１ はもうあります'],
      ['天板', true],
    ])
    expect([pv.addCount, pv.skipCount]).toEqual([1, 2])
  })

  it('貼る部材どうしで同じ名前なら、2つ目からは足せない', () => {
    const pv = previewPaste(emptyJob(), [copied('棚板'), copied('棚板', '300')], shelfAdjusts())
    expect(pv.rows.map((r) => r.ok)).toEqual([true, false])
    expect(pv.rows[1]).toMatchObject({ reason: 'duplicateName' })
  })

  it('貼り先に無い部材を参照していると注意（足すことはできる）', () => {
    // 見本から 天板・棚板 だけをコピー：天板は 全体 を参照している
    const c = copyParts(shelfJob(), ['part-tenita', 'part-tanaita'])
    const pv = previewPaste(emptyJob(), c, shelfAdjusts())
    expect(pv.rows.map((r) => [r.part.name, r.ok, r.warnings])).toEqual([
      ['天板', true, ['全体 がありません']],
      ['棚板', true, []],
    ])
    expect([pv.addCount, pv.hasWarnings]).toEqual([2, true])
  })

  it('貼り先に同じ名前の部材があれば、その部材を参照するので注意は無い', () => {
    const c = copyParts(shelfJob(), ['part-tenita'])
    const job = { ...emptyJob(), parts: [part('z', '全体', '500', '900', 0)] }
    expect(previewPaste(job, c, shelfAdjusts()).rows[0].warnings).toEqual([])
  })

  it('削除した調整寸法を使っていると注意', () => {
    const c = copyParts(shelfJob(), shelfJob().parts.map((p) => p.id))
    const pv = previewPaste(emptyJob(), c, [])
    expect(pv.rows[3].warnings).toEqual(['削除した調整寸法を使っています'])
  })

  it('同じ部材を2回参照しても注意は1つ。全角で書いた参照も同じ部材', () => {
    const pv = previewPaste(emptyJob(), [copied('棚板', '全体.W - 20', '全体．Ｈ')], shelfAdjusts())
    expect(pv.rows[0].warnings).toEqual(['全体 がありません'])
    const pv2 = previewPaste({ ...emptyJob(), parts: [part('z', '全体1')] }, [copied('棚板', '全体１.W', '全体1.H')], shelfAdjusts())
    expect(pv2.rows[0].warnings).toEqual([])
  })
})

describe('applyPaste（足せる部材だけを後ろに足す）', () => {
  it('ほかの仕事に貼ると、足せる部材だけが後ろに足される（新しい id・仕上がりの完了は外す）', () => {
    const job = { ...emptyJob(), parts: [part('a', '棚板')] }
    const c = [copied('天板'), copied('棚板'), copied('側板')]
    const next = applyPaste(job, c, ids())
    expect(next.parts.map((p) => [p.id, p.name])).toEqual([
      ['a', '棚板'],
      ['part-new1', '天板'],
      ['part-new2', '側板'],
    ])
    expect(next.parts[1]).toEqual({ id: 'part-new1', name: '天板', expr: { W: '100', H: '200' }, quantity: 1, rotatable: false, finishedDone: false })
    // 元の仕事は書き換えない
    expect(job.parts).toHaveLength(1)
  })

  it('貼った部材どうしの参照はそのまま使える（全体・天板・棚板を貼ると寸法が出る）', () => {
    const c = copyParts(shelfJob(), shelfJob().parts.map((p) => p.id))
    const next = applyPaste(emptyJob(), c, ids())
    const d = computeDimensions(next, shelfAdjusts())
    expect(d.errors).toEqual([])
    expect(d.parts.map((p) => [p.name, p.finished])).toEqual([
      ['全体', { W: 400, H: 1800 }],
      ['天板', { W: 400, H: 1800 }],
      ['側板', { W: 400, H: 700 }],
      ['棚板', { W: 379, H: 1760 }],
    ])
  })

  it('貼り先に無い部材を参照していると、足したうえで式のエラー（全体 がありません）', () => {
    const c = copyParts(shelfJob(), ['part-tenita'])
    const next = applyPaste(emptyJob(), c, ids())
    const d = computeDimensions(next, shelfAdjusts())
    expect(next.parts.map((p) => p.name)).toEqual(['天板'])
    expect(d.errors.map((e) => [e.kind, e.refs])).toEqual([
      ['unknownRef', ['全体']],
      ['unknownRef', ['全体']],
    ])
  })

  it('コピーしたものを貼った部材を書き換えても、コピーは変わらない（何度でも貼れる）', () => {
    const c = [copied('天板')]
    const next = applyPaste(emptyJob(), c, ids())
    next.parts[0].expr.W = '1'
    expect(c[0].expr.W).toBe('100')
  })
})

describe('duplicateName（複製の名前）', () => {
  it('棚板 → 棚板のコピー → 棚板のコピー2 → 棚板のコピー3', () => {
    let job = { ...emptyJob(), parts: [part('a', '棚板')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー')
    job = { ...job, parts: [...job.parts, part('b', '棚板のコピー')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー2')
    job = { ...job, parts: [...job.parts, part('c', '棚板のコピー2')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー3')
  })

  it('「棚板のコピー」を複製しても「棚板のコピー2」（のコピーのコピー にしない）', () => {
    const job = { ...emptyJob(), parts: [part('a', '棚板'), part('b', '棚板のコピー')] }
    expect(duplicateName(job, '棚板のコピー')).toBe('棚板のコピー2')
  })

  it('空いている番号を使う。全角・半角の違いも同じ名前とみなす', () => {
    const job = { ...emptyJob(), parts: [part('a', '棚板'), part('b', '棚板のコピー'), part('c', '棚板のコピー３')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー2')
    const job2 = { ...emptyJob(), parts: [part('a', '棚板'), part('b', '棚板のコピー'), part('c', '棚板のコピー２')] }
    expect(duplicateName(job2, '棚板')).toBe('棚板のコピー3')
  })
})

describe('duplicatePart（部材の複製）', () => {
  it('式・枚数・回転を写し、名前は「棚板のコピー」、元の部材のすぐ後ろに足す', () => {
    const job = shelfJob()
    job.parts[3].rotatable = true
    job.parts[3].finishedDone = true
    const r = duplicatePart(job, 'part-tanaita', ids())
    if (!r.ok) throw new Error(r.message)
    expect(r.partId).toBe('part-new1')
    expect(r.job.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板', '棚板のコピー'])
    expect(r.job.parts[4]).toEqual({
      id: 'part-new1',
      name: '棚板のコピー',
      expr: { W: `天板.W - 20 - {n:${MELAMINE_ID}}`, H: '天板.H - 20 × 2' },
      quantity: 3,
      rotatable: true,
      finishedDone: false,
    })
    expect(job.parts).toHaveLength(4)
  })

  it('途中の部材を複製すると、そのすぐ後ろ。もう1回で「天板のコピー2」', () => {
    const r1 = duplicatePart(shelfJob(), 'part-tenita', ids())
    if (!r1.ok) throw new Error(r1.message)
    const r2 = duplicatePart(r1.job, 'part-tenita', () => 'part-x')
    if (!r2.ok) throw new Error(r2.message)
    expect(r2.job.parts.map((p) => p.name)).toEqual(['全体', '天板', '天板のコピー2', '天板のコピー', '側板', '棚板'])
  })

  it('複製した部材の寸法は元と同じ', () => {
    const r = duplicatePart(shelfJob(), 'part-tanaita', ids())
    if (!r.ok) throw new Error(r.message)
    const d = computeDimensions(r.job, shelfAdjusts())
    expect(d.parts[4].finished).toEqual(d.parts[3].finished)
  })

  it('無い部材は断る', () => {
    expect(duplicatePart(shelfJob(), 'none', ids()).ok).toBe(false)
  })
})
