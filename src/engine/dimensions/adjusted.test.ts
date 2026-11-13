// 調整後の寸法（第2.1版。仕様書 25.1・25.2）：仕上がり → 調整後（仕上がり ＋ 調整）→ 木取り（調整後 ＋ 切り代）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { REF_IN_ADJUST_MESSAGE } from '../formula/adjustExpr'
import { findSavingHint } from '../hints/saving'
import { sortParts } from '../order'
import { packJob } from '../packing'
import { compareStandardSizes } from '../packing/sizes'
import { freezeSheet, frozenSheetViews } from '../progress/frozen'
import type { Adjust, Axis, Job, Part } from '../types'
import { computeDimensions } from './index'

function mkPart(name: string, expr: Partial<Record<Axis, string>>, adjust: Partial<Record<Axis, string>> = {}, quantity = 1): Part {
  return {
    id: `id-${name}`,
    name,
    expr: { W: '100', H: '100', ...expr },
    adjust: { W: '', H: '', ...adjust },
    thickness: null,
    rowColor: null,
    cellColors: {},
    memo: '',
    quantity,
    rotatable: false,
    finishedDone: false,
  }
}

function withParts(...extra: Part[]): Job {
  const job = shelfJob()
  job.parts.push(...extra)
  return job
}

function setAdjust(job: Job, name: string, adjust: Partial<Record<Axis, string>>): Job {
  return { ...job, parts: job.parts.map((p) => (p.name === name ? { ...p, adjust: { ...p.adjust, ...adjust } } : p)) }
}

function dimsOf(job: Job, name: string, adjusts: Adjust[] = shelfAdjusts()) {
  return computeDimensions(job, adjusts).parts.find((p) => p.name === name)!
}

describe('見本（仕様書 6章の棚・25.4 の形：棚板 W は仕上がり 天板.W − 20・調整 −メラミン1）', () => {
  it('棚板 W：仕上がり 380・調整後 379・木取り 389。H：仕上がり 1760・調整後 1760・木取り 1770', () => {
    const d = dimsOf(shelfJob(), '棚板')
    expect(d.finished).toEqual({ W: 380, H: 1760 })
    expect(d.adjusted).toEqual({ W: 379, H: 1760 })
    expect(d.cut).toEqual({ W: 389, H: 1770 })
    expect(d.adjustByAxis).toEqual({ W: -1, H: 0 })
    expect(d.adjustedByAxis).toEqual({ W: 379, H: 1760 })
    expect(d.errors).toEqual([])
  })

  it('調整の無い部材は 調整後 ＝ 仕上がり（調整の値は 0）', () => {
    const d = dimsOf(shelfJob(), '側板')
    expect(d.finished).toEqual({ W: 400, H: 700 })
    expect(d.adjusted).toEqual({ W: 400, H: 700 })
    expect(d.adjustByAxis).toEqual({ W: 0, H: 0 })
    expect(d.cut).toEqual({ W: 410, H: 710 })
  })

  it('側板の 天板.W は天板の仕上がり（400）を使う：天板に調整 −5 を入れても 側板 W は 400、棚板 W は 380', () => {
    const job = setAdjust(shelfJob(), '天板', { W: '-5' })
    expect(dimsOf(job, '天板').finished).toEqual({ W: 400, H: 1800 })
    expect(dimsOf(job, '天板').adjusted).toEqual({ W: 395, H: 1800 })
    expect(dimsOf(job, '天板').cut).toEqual({ W: 405, H: 1810 })
    expect(dimsOf(job, '側板').finished).toEqual({ W: 400, H: 700 })
    expect(dimsOf(job, '側板').adjusted).toEqual({ W: 400, H: 700 })
    expect(dimsOf(job, '棚板').finished).toEqual({ W: 380, H: 1760 })
    expect(dimsOf(job, '棚板').adjusted).toEqual({ W: 379, H: 1760 })
  })

  it('切り代を 5 にすると棚板の木取りは 384×1765（調整後は変わらない）', () => {
    const job = shelfJob()
    job.settings.allowance = 5
    expect(dimsOf(job, '棚板').adjusted).toEqual({ W: 379, H: 1760 })
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 384, H: 1765 })
  })

  it('メラミン1 の寸法を 2 にすると、棚板の調整後 W は 378・木取り 388（仕上がりは 380 のまま）', () => {
    const adjusts = shelfAdjusts().map((a) => (a.id === MELAMINE_ID ? { ...a, value: 2 } : a))
    const d = dimsOf(shelfJob(), '棚板', adjusts)
    expect(d.finished).toEqual({ W: 380, H: 1760 })
    expect(d.adjusted).toEqual({ W: 378, H: 1760 })
    expect(d.cut).toEqual({ W: 388, H: 1770 })
  })
})

describe('仕様書 25.2 の例', () => {
  it('W900 に −メラミン1×2 で 調整後 898・木取り 908（切り代10）', () => {
    const job = withParts(mkPart('X', { W: '900', H: '300' }, { W: `−{n:${MELAMINE_ID}}×2` }))
    const d = dimsOf(job, 'X')
    expect(d.adjustByAxis).toEqual({ W: -2, H: 0 })
    expect(d.adjusted).toEqual({ W: 898, H: 300 })
    expect(d.cut).toEqual({ W: 908, H: 310 })
  })

  it('−2、−シート0.5 − メラミン1、＋3 も足し引きする', () => {
    const job = withParts(
      mkPart('A', { W: '900', H: '300' }, { W: '−2', H: `−{n:${SHEET_ID}} − {n:${MELAMINE_ID}}` }),
      mkPart('B', { W: '900', H: '300' }, { W: '＋3', H: '3' }),
    )
    expect(dimsOf(job, 'A').adjusted).toEqual({ W: 898, H: 298.5 })
    expect(dimsOf(job, 'A').cut).toEqual({ W: 908, H: 308.5 })
    expect(dimsOf(job, 'B').adjusted).toEqual({ W: 903, H: 303 })
  })
})

describe('調整のエラー（DimensionError の field で 仕上がり／調整 を分ける）', () => {
  it('仕上がりの欄のエラーは field: finished', () => {
    const job = withParts(mkPart('X', { W: '無い.W' }))
    expect(dimsOf(job, 'X').errors).toEqual([expect.objectContaining({ axis: 'W', kind: 'unknownRef', field: 'finished' })])
  })

  it('調整後が 0 以下ならエラー（field: adjust・nonPositive）。仕上がりは出し、調整後・木取りは出さない', () => {
    const job = withParts(mkPart('X', { W: '2', H: '300' }, { W: '-2' }))
    const d = dimsOf(job, 'X')
    expect(d.errors).toEqual([
      { partId: 'id-X', axis: 'W', field: 'adjust', kind: 'nonPositive', message: '調整後の寸法が 0 以下になります（0）' },
    ])
    expect(d.finishedByAxis).toEqual({ W: 2, H: 300 })
    expect(d.finished).toEqual({ W: 2, H: 300 })
    expect(d.adjustByAxis).toEqual({ W: -2, H: 0 })
    expect(d.adjustedByAxis).toEqual({ H: 300 })
    expect(d.adjusted).toBeNull()
    expect(d.cutByAxis).toEqual({ H: 310 })
    expect(d.cut).toBeNull()
  })

  it('0 以下は小数第1位に丸めて比べる（1 − 0.96 ＝ 0.04 → 0 でエラー、1 − 0.94 ＝ 0.06 → 0.1 はよい）', () => {
    const job = withParts(mkPart('X', { W: '1' }, { W: '-0.96' }), mkPart('Y', { W: '1' }, { W: '-0.94' }))
    expect(dimsOf(job, 'X').errors[0]).toMatchObject({ field: 'adjust', kind: 'nonPositive' })
    expect(dimsOf(job, 'Y').errors).toEqual([])
    expect(dimsOf(job, 'Y').adjustedByAxis.W).toBeCloseTo(0.06)
  })

  it('マイナスになるときは −で出す（調整後の寸法が 0 以下になります（−5））', () => {
    const job = withParts(mkPart('X', { W: '5' }, { W: '-10' }))
    expect(dimsOf(job, 'X').errors[0].message).toBe('調整後の寸法が 0 以下になります（−5）')
  })

  it('仕上がりがエラーなら調整後もエラー（調整後・木取りを出さない）。調整の欄のエラーは足さない', () => {
    const job = withParts(mkPart('X', { W: '無い.W', H: '300' }, { W: '-1' }))
    const d = dimsOf(job, 'X')
    expect(d.adjustByAxis).toEqual({ W: -1, H: 0 })
    expect(d.adjustedByAxis).toEqual({ H: 300 })
    expect(d.cutByAxis).toEqual({ H: 310 })
    expect(d.errors.map((e) => [e.axis, e.field, e.kind])).toEqual([['W', 'finished', 'unknownRef']])
  })

  it('仕上がりも調整もエラーなら、両方のエラー（仕上がり → 調整 の順）', () => {
    const job = withParts(mkPart('X', { W: '無い.W' }, { W: '−' }))
    expect(dimsOf(job, 'X').errors.map((e) => [e.field, e.kind])).toEqual([
      ['finished', 'unknownRef'],
      ['adjust', 'syntax'],
    ])
  })

  it('調整の式が読めない（−だけ）は syntax・入れている途中の印。仕上がりは出す', () => {
    const job = withParts(mkPart('X', { W: '900' }, { W: '−' }))
    const d = dimsOf(job, 'X')
    expect(d.errors).toEqual([expect.objectContaining({ axis: 'W', field: 'adjust', kind: 'syntax', incomplete: true })])
    expect(d.finishedByAxis.W).toBe(900)
    expect(d.adjustByAxis.W).toBeUndefined()
    expect(d.adjustedByAxis.W).toBeUndefined()
    expect(d.cut).toBeNull()
  })

  it('調整に部材の寸法を書くとエラー「調整には部材の寸法は使えません」', () => {
    const job = withParts(mkPart('X', { W: '900' }, { H: '−天板.W' }))
    expect(dimsOf(job, 'X').errors).toEqual([expect.objectContaining({ axis: 'H', field: 'adjust', kind: 'syntax', message: REF_IN_ADJUST_MESSAGE })])
  })

  it('削除した調整寸法（一覧に無い id）は unknownAdjust（field: adjust）', () => {
    const adjusts = shelfAdjusts().filter((a) => a.id !== MELAMINE_ID)
    const d = dimsOf(shelfJob(), '棚板', adjusts)
    expect(d.errors).toEqual([
      { partId: 'part-tanaita', axis: 'W', field: 'adjust', kind: 'unknownAdjust', message: '削除した調整寸法を使っています' },
    ])
    expect(d.finished).toEqual({ W: 380, H: 1760 })
    expect(d.cut).toBeNull()
  })

  it('0 で割るとエラー（field: adjust・divideByZero）', () => {
    const job = withParts(mkPart('X', {}, { W: '1 ÷ 0' }))
    expect(dimsOf(job, 'X').errors[0]).toMatchObject({ field: 'adjust', kind: 'divideByZero' })
  })

  it('調整のエラーは、その部材を参照しているほかの部材には伝わらない（参照は仕上がりを使うため）', () => {
    const job = setAdjust(shelfJob(), '天板', { W: '−' })
    expect(dimsOf(job, '天板').errors).toHaveLength(1)
    expect(dimsOf(job, '側板').errors).toEqual([])
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 389, H: 1770 })
  })

  it('全部の部材のエラー（DimensionResult.errors）にも調整のエラーが入る', () => {
    const job = withParts(mkPart('X', {}, { W: '−' }))
    expect(computeDimensions(job, shelfAdjusts()).errors.map((e) => [e.partId, e.field])).toEqual([['id-X', 'adjust']])
  })
})

describe('木取りの計算・お知らせ・比べ・固定は、調整後 ＋ 切り代 の木取り寸法を使う', () => {
  /** 調整 −1 を入れた仕事と、仕上がりで 1 引いた仕事（木取り寸法が同じ） */
  function pair(): [Job, Job] {
    const a = createJob({ id: 'job-a', name: 'a', now: '2026-11-11T00:00:00.000Z' })
    a.parts = [mkPart('背板', { W: '603', H: '1200' }, { W: '-1' }, 4)]
    const b = createJob({ id: 'job-b', name: 'b', now: '2026-11-11T00:00:00.000Z' })
    b.parts = [mkPart('背板', { W: '602', H: '1200' }, {}, 4)]
    a.settings.allowance = 5
    b.settings.allowance = 5
    return [a, b]
  }

  it('packJob：調整後の木取り寸法で並べる（仕上がりで同じ寸法にした仕事と同じ結果）', () => {
    const [a, b] = pair()
    const ra = packJob(a, computeDimensions(a, shelfAdjusts()))
    const rb = packJob(b, computeDimensions(b, shelfAdjusts()))
    expect(ra.sheetCount).toBe(rb.sheetCount)
    expect(ra.sheets[0].placements.map((p) => [p.w, p.h, p.sizeLabel])).toEqual(rb.sheets[0].placements.map((p) => [p.w, p.h, p.sizeLabel]))
    expect(ra.sheets[0].placements[0].sizeLabel).toContain('607')
  })

  it('見本の棚板は 389×1770 で並ぶ', () => {
    const job = shelfJob()
    const r = packJob(job, computeDimensions(job, shelfAdjusts()))
    const tana = r.sheets.flatMap((s) => s.placements).filter((p) => p.partId === 'part-tanaita')
    expect(tana).toHaveLength(3)
    for (const p of tana) expect([p.w, p.h].sort((x, y) => x - y)).toEqual([389, 1770])
  })

  it('板を減らせるお知らせ・3×6 と 4×8 の比べも同じ結果', () => {
    const [a, b] = pair()
    expect(findSavingHint(a, shelfAdjusts())).toEqual(findSavingHint(b, shelfAdjusts()))
    expect(findSavingHint(a, shelfAdjusts())).not.toBeNull()
    expect(compareStandardSizes(a, computeDimensions(a, shelfAdjusts()))).toEqual(compareStandardSizes(b, computeDimensions(b, shelfAdjusts())))
  })

  it('調整を変えると、固定した1枚が「部材が変わっています」（size）になる', () => {
    const job = shelfJob()
    const r = packJob(job, computeDimensions(job, shelfAdjusts()))
    const frozen = { ...job, frozenSheets: [freezeSheet(job, r.mode, r.sheets[0], 'sheet-1', new Date('2026-11-11T00:00:00.000Z'))] }
    const before = frozenSheetViews(frozen, computeDimensions(frozen, shelfAdjusts()))
    expect(before[0].drift).toEqual([])
    const tana = setAdjust(frozen, '棚板', { W: `−{n:${MELAMINE_ID}}×2` })
    const after = frozenSheetViews(tana, computeDimensions(tana, shelfAdjusts()))
    expect(after[0].drift.map((d) => [d.name, d.reason])).toEqual([['棚板', 'size']])
  })

  it('並べ替え（W の大きい順）は仕上がり寸法で比べる（調整後では比べない）', () => {
    const job = createJob({ id: 'job', name: 'x', now: '2026-11-11T00:00:00.000Z' })
    // 仕上がり A 500・B 490。調整後は A 480・B 490
    job.parts = [mkPart('B', { W: '490' }), mkPart('A', { W: '500' }, { W: '-20' })]
    const dims = computeDimensions(job, shelfAdjusts())
    expect(sortParts(job.parts, dims, 'W', 'desc').map((p) => p.name)).toEqual(['A', 'B'])
  })

  it('調整の欄だけがエラーの部材も、仕上がり寸法の順に並ぶ（一番下に回さない）', () => {
    const job = createJob({ id: 'job', name: 'x', now: '2026-11-11T00:00:00.000Z' })
    // C は仕上がり 400 で、調整「−」が書きかけ（調整の欄のエラー）
    job.parts = [mkPart('A', { W: '500' }), mkPart('B', { W: '380' }), mkPart('C', { W: '400' }, { W: '-' })]
    const dims = computeDimensions(job, shelfAdjusts())
    expect(dims.parts[2].errors.map((e) => e.field)).toEqual(['adjust'])
    expect(sortParts(job.parts, dims, 'W', 'desc').map((p) => p.name)).toEqual(['A', 'C', 'B'])
  })
})
