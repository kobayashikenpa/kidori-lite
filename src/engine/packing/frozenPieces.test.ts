// 固定した1枚の片を、部材の枚数から数だけで引いてから並べる（kidori の packing/frozenPieces.test.ts をもとに、
// 材料ごとの分け・フラッシュ・木取り済み（checks.cut・done）を外し、見本を仕様書 6章の棚にしたもの）
import { describe, expect, it } from 'vitest'
import { dimsOf, freezeAt, NOW, pack, withPart } from '../fixtures/progress'
import { shelfJob } from '../fixtures/shelf'
import { freezeSheet, frozenDemand } from '../progress/frozen'
import type { Job, Part } from '../types'
import { expandPieces } from './pieces'

const names = (job: Job) => pack(job).sheets.map((s) => s.placements.map((p) => p.name))
const counts = (job: Job, partId: string) =>
  expandPieces(job, dimsOf(job), frozenDemand(job)).runs.filter((r) => r.partId === partId).map((r) => r.count)

describe('expandPieces・packJob：固定した片を計算から除く', () => {
  it('固定が無ければ今までどおり（2枚）', () => {
    expect(pack(shelfJob()).sheetCount).toBe(2)
  })

  it('1枚目を固定すると、計算するのは棚板×2 の1枚。必要な枚数は固定した1枚を足して 2', () => {
    const job = freezeAt(shelfJob(), 0)
    const r = pack(job)
    expect(names(job)).toEqual([['棚板', '棚板']])
    expect(r.sheets.map((s) => s.index)).toEqual([1])
    expect(r.sheetCount).toBe(2)
    expect(r.skipped).toEqual([])
  })

  it('部材を足しても、固定した1枚の並べ方は変わらず、足した部材は残りの計算に並ぶ', () => {
    const job0 = freezeAt(shelfJob(), 0)
    const frozen = JSON.parse(JSON.stringify(job0.frozenSheets[0]))
    const extra: Part = { id: 'part-ji', name: '地板', expr: { W: '400', H: '600' }, quantity: 1, rotatable: false, finishedDone: false }
    const job = { ...job0, parts: [...job0.parts, extra] }
    expect(job.frozenSheets[0]).toEqual(frozen)
    expect(names(job)).toEqual([['地板', '棚板', '棚板']])
    expect(pack(job).sheetCount).toBe(2)
  })

  it('設定を変えても固定した1枚は写しのまま、残りだけ並べ直す', () => {
    const job = freezeAt(shelfJob(), 0)
    job.settings = { ...job.settings, kerf: 10, cutMode: 'horizontal' }
    const r = pack(job)
    expect(r.mode).toBe('horizontal')
    expect(job.frozenSheets[0].kerf).toBe(3)
    expect(job.frozenSheets[0].mode).toBe('vertical')
    expect(r.sheets.flatMap((s) => s.placements.map((p) => p.name))).toEqual(['棚板', '棚板'])
  })

  it('全部の片を固定すると計算する1枚は無く、必要な枚数は固定した1枚（切り終わりを含む）', () => {
    let job = freezeAt(shelfJob(), 0, { partId: 'part-tenita', n: 1 })
    job = freezeAt(job, 0, { partId: 'part-tanaita', n: 2 })
    expect(job.frozenSheets[1].completedAt).toBe(NOW.toISOString())
    const r = pack(job)
    expect(r.sheets).toEqual([])
    expect(r.sheetCount).toBe(2)
  })

  it('全体の歩留まりは、固定した1枚と計算した1枚を合わせて出す（固定の前と同じ並べ方なら同じ値）', () => {
    const before = pack(shelfJob())
    const after = pack(freezeAt(shelfJob(), 0))
    expect(after.yieldRate).toBeCloseTo(before.yieldRate, 10)
  })

  it('一部だけ引く：側板の片を1つだけ持つ1枚を固定すると、残りの側板は1枚。片の id の連番は 1 から', () => {
    const job0 = shelfJob()
    const r = pack(job0)
    const f = freezeSheet(job0, r.mode, r.sheets[0], 's', NOW)
    f.layout.placements = f.layout.placements.filter((p) => p.pieceId === 'part-gawaita#1')
    const job = { ...job0, frozenSheets: [f] }
    expect(counts(job, 'part-gawaita')).toEqual([1])
    const pieces = pack(job).sheets.flatMap((s) => s.placements).filter((p) => p.partId === 'part-gawaita')
    expect(pieces.map((p) => p.pieceId)).toEqual(['part-gawaita#1'])
  })

  it('数だけで引く：固定したあと寸法を変えても引き続ける', () => {
    const job = withPart(freezeAt(shelfJob(), 0), 'part-gawaita', { expr: { W: '全体.W', H: '650' } })
    expect(names(job).flat()).not.toContain('側板')
  })

  it('固定した数が今の枚数より多くても 0 未満にしない', () => {
    const job = withPart(freezeAt(shelfJob(), 0), 'part-gawaita', { quantity: 1 })
    const r = pack(job)
    expect(names(job)).toEqual([['棚板', '棚板']])
    expect(r.unplaced).toEqual([])
    expect(r.skipped).toEqual([])
  })

  it('枚数を増やすと、増えた分だけ計算した1枚に並ぶ', () => {
    const job = withPart(freezeAt(shelfJob(), 0), 'part-gawaita', { quantity: 3 })
    expect(counts(job, 'part-gawaita')).toEqual([1])
    expect(names(job).flat().filter((n) => n === '側板')).toHaveLength(1)
  })

  it('全部固定した部材は、今は寸法のエラーがあっても skipped に出さない', () => {
    const job = withPart(freezeAt(shelfJob(), 0), 'part-gawaita', { expr: { W: '(', H: '700' } })
    expect(pack(job).skipped).toEqual([])
  })
})
