import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../engine/defaults'
import { computeDimensions } from '../engine/dimensions'
import { shelfJob } from '../engine/fixtures/shelf'
import { formulaText } from '../engine/formula/display'
import { findSavingHint } from '../engine/hints/saving'
import { packJob } from '../engine/packing'
import type { Adjust } from '../engine/types'
import { SAMPLE_NAME, sampleJob } from './sample'

const T = new Date(2026, 9, 22, 9, 0, 0)

function ids() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

const pct = (r: number) => Math.round(r * 1000) / 10

describe('見本の仕事（仕様書 16.7・19.1）', () => {
  const adjusts: Adjust[] = [
    { id: 'a-mel', name: 'メラミン', value: 1 },
    { id: 'a-sheet', name: 'シート', value: 0.5 },
  ]

  it('名前は「見本 棚」、設定は初期値、部材は6章の棚から「全体」を除いた3つ', () => {
    const { job, adjusts: out } = sampleJob(adjusts, T, ids())
    expect(job.name).toBe(SAMPLE_NAME)
    expect(job.settings).toEqual(defaultSettings())
    expect(job.parts.map((p) => [p.name, p.expr.W, p.expr.H, p.quantity])).toEqual([
      ['天板', '400', '1800', 1],
      ['側板', '天板.W', '700', 2],
      ['棚板', '天板.W - 20 - {n:a-mel}', '天板.H - 20 × 2', 3],
    ])
    expect(out).toEqual(adjusts)
    expect(formulaText(job.parts[2].expr.W, out)).toContain('メラミン1')
  })

  it('6章のテスト用の棚と同じ寸法・木取り（4×8・縦切り優先 2枚・57.2%）', () => {
    const { job, adjusts: out } = sampleJob(adjusts, T, ids())
    const dims = computeDimensions(job, out)
    expect(dims.errors).toEqual([])
    expect(dims.parts.map((d) => [d.name, d.finished, d.cut])).toEqual([
      ['天板', { W: 400, H: 1800 }, { W: 410, H: 1810 }],
      ['側板', { W: 400, H: 700 }, { W: 410, H: 710 }],
      ['棚板', { W: 379, H: 1760 }, { W: 389, H: 1770 }],
    ])
    const fixture = computeDimensions(shelfJob(), [{ id: 'adjust-melamine', name: 'メラミン', value: 1 }])
    const r = packJob(job, dims)
    expect(job.settings.sheet.sizeKind).toBe('shihachi')
    expect(job.settings.cutMode).toBe('vertical')
    expect(r.sheets).toHaveLength(2)
    expect(pct(r.yieldRate)).toBe(57.2)
    expect(packJob(shelfJob(), fixture).yieldRate).toBe(r.yieldRate)
  })

  it('横切り優先・切り代 11 で 3枚になり、お知らせは「切り代を 10mm にすると、板が 1 枚減ります」（仕様書 19.2。切り代 10 ならお知らせなし）', () => {
    const { job, adjusts: out } = sampleJob(adjusts, T, ids())
    const wide = { ...job, settings: { ...job.settings, cutMode: 'horizontal' as const, allowance: 11 } }
    expect(packJob(wide, computeDimensions(wide, out)).sheetCount).toBe(3)
    const hint = findSavingHint(wide, out)
    expect(hint).toMatchObject({ change: { kind: 'allowance', value: 10 }, from: 3, to: 2 })
    expect(hint?.message).toBe('切り代を 10mm にすると、板が 1 枚減ります')
    const back = { ...wide, settings: { ...wide.settings, allowance: 10 } }
    expect(findSavingHint(back, out)).toBeNull()
  })

  it('メラミン1 が一覧に無ければ最後に足して、その id を式に使う（元の一覧は変えない）', () => {
    const only = [{ id: 'a-sheet', name: 'シート', value: 0.5 }]
    const { job, adjusts: out } = sampleJob(only, T, ids())
    expect(only).toHaveLength(1)
    expect(out).toHaveLength(2)
    const mel = out[1]
    expect(mel).toMatchObject({ name: 'メラミン', value: 1 })
    expect(job.parts[2].expr.W).toBe(`天板.W - 20 - {n:${mel.id}}`)
    const r = packJob(job, computeDimensions(job, out))
    expect(pct(r.yieldRate)).toBe(57.2)
  })

  it('名前「メラミン」でも寸法が違えば別のもの（メラミン2 しか無ければ メラミン1 を足す）', () => {
    const { adjusts: out } = sampleJob([{ id: 'a2', name: 'メラミン', value: 2 }], T, ids())
    expect(out.map((a) => a.value)).toEqual([2, 1])
  })

  it('押すたびに新しい id の仕事と部材', () => {
    const make = ids()
    const a = sampleJob(adjusts, T, make).job
    const b = sampleJob(adjusts, T, make).job
    expect(a.id).not.toBe(b.id)
    expect(new Set([...a.parts, ...b.parts].map((p) => p.id)).size).toBe(6)
  })
})
