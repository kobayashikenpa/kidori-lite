import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../engine/defaults'
import { shelfAdjusts, shelfJob, MELAMINE_ID } from '../engine/fixtures/shelf'
import type { Job } from '../engine/types'
import {
  addAdjust,
  addPart,
  copyJob,
  defaultJobName,
  deleteJob,
  makeJob,
  newPart,
  removeAdjusts,
  removePart,
  renameJob,
  setSheet,
  updateAdjust,
  updatePart,
  updateSettings,
} from './jobs'

const NOW = new Date(2026, 9, 21, 9, 0, 0)

function okJob(r: { ok: true; job: Job } | { ok: false; message: string }): Job {
  if (!r.ok) throw new Error(r.message)
  return r.job
}

function counter() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

describe('仕事', () => {
  it('新しい仕事の名前の初期値は「仕事 10/21」の形（月/日）', () => {
    expect(defaultJobName(NOW)).toBe('仕事 10/21')
    expect(defaultJobName(new Date(2026, 0, 5))).toBe('仕事 1/5')
  })

  it('新しい仕事は初期値の設定・部材なし。名前が空なら日付の名前', () => {
    const job = makeJob('  ', NOW, 'job-1')
    expect(job.name).toBe('仕事 10/21')
    expect(job.settings).toEqual(defaultSettings())
    expect(job.parts).toEqual([])
    expect(job.createdAt).toBe(NOW.toISOString())
    expect(makeJob(' 食器棚 ', NOW, 'job-2').name).toBe('食器棚')
  })

  it('名前を変える。空は断る', () => {
    const job = shelfJob()
    expect(okJob(renameJob(job, ' 本棚 ')).name).toBe('本棚')
    expect(renameJob(job, ' ').ok).toBe(false)
  })

  it('コピーは設定を引き継ぎ、名前は「◯◯のコピー」。部材は式のまま写し id は新しい', () => {
    const src = okJob(updateSettings(shelfJob(), { kerf: 4, allowance: 5, cutMode: 'auto' }))
    const withSheet = okJob(setSheet(src, { sizeKind: 'saburoku', width: 0, length: 0 }))
    const c = copyJob(withSheet, NOW, 'job-copy', counter())
    expect(c.id).toBe('job-copy')
    expect(c.name).toBe('棚のコピー')
    expect(c.settings).toEqual(withSheet.settings)
    expect(c.settings).not.toBe(withSheet.settings)
    expect(c.settings.sheet).not.toBe(withSheet.settings.sheet)
    expect(c.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板'])
    expect(c.parts[3].expr.W).toBe(`天板.W - 20 - {n:${MELAMINE_ID}}`)
    expect(c.parts.map((p) => p.id)).toEqual(['part-1', 'part-2', 'part-3', 'part-4'])
    expect(c.frozenSheets).toEqual([])
    expect(c.createdAt).toBe(NOW.toISOString())
  })

  it('削除。開いていた仕事なら開いていない状態にする', () => {
    const jobs = [shelfJob('a'), shelfJob('b')]
    expect(deleteJob(jobs, 'a', 'a')).toEqual({ jobs: [jobs[1]], currentJobId: null })
    expect(deleteJob(jobs, 'b', 'a')).toEqual({ jobs: [jobs[1]], currentJobId: 'b' })
  })
})

describe('設定', () => {
  it('刃厚・端切り・切り代は 0 以上', () => {
    const job = shelfJob()
    expect(okJob(updateSettings(job, { kerf: 0 })).settings.kerf).toBe(0)
    expect(updateSettings(job, { trim: -1 }).ok).toBe(false)
    expect(updateSettings(job, { allowance: Number.NaN }).ok).toBe(false)
  })

  it('板のサイズ：3×6 は決まった大きさ、自由入力は小さいほうを妻手にそろえる', () => {
    const job = shelfJob()
    expect(okJob(setSheet(job, { sizeKind: 'saburoku', width: 1, length: 1 })).settings.sheet).toEqual({
      sizeKind: 'saburoku',
      width: 910,
      length: 1820,
    })
    expect(okJob(setSheet(job, { sizeKind: 'custom', width: 2000, length: 1000 })).settings.sheet).toEqual({
      sizeKind: 'custom',
      width: 1000,
      length: 2000,
    })
    expect(setSheet(job, { sizeKind: 'custom', width: 0, length: 1000 }).ok).toBe(false)
  })
})

describe('部材', () => {
  it('足す・変える・消す', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: '天板', expr: { W: '400', H: '1800' } })))
    job = okJob(addPart(job, newPart('p2', { name: '棚板', expr: { W: '天板.W - 20', H: '300' }, quantity: 3 })))
    expect(job.parts.map((p) => p.name)).toEqual(['天板', '棚板'])
    job = okJob(updatePart(job, 'p2', { quantity: 4, rotatable: true }))
    expect(job.parts[1]).toMatchObject({ quantity: 4, rotatable: true, expr: { W: '天板.W - 20', H: '300' } })
    job = okJob(removePart(job, 'p1'))
    expect(job.parts.map((p) => p.id)).toEqual(['p2'])
    expect(removePart(job, 'p1').ok).toBe(false)
  })

  it('同じ名前（全角・半角の違いを含む）は足せない・変えられない', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: '棚板1' })))
    const r = addPart(job, newPart('p2', { name: '棚板１' }))
    expect(r.ok).toBe(false)
    job = okJob(addPart(job, newPart('p2', { name: '側板' })))
    expect(updatePart(job, 'p2', { name: '棚板1' }).ok).toBe(false)
  })

  it('枚数は 0 以上の整数', () => {
    const job = makeJob('x', NOW, 'job')
    expect(addPart(job, newPart('p', { name: 'a', quantity: -1 })).ok).toBe(false)
    expect(addPart(job, newPart('p', { name: 'a', quantity: 1.5 })).ok).toBe(false)
    expect(addPart(job, newPart('p', { name: 'a', quantity: 0 })).ok).toBe(true)
  })

  it('名前を変えると、使っている式もつけ替わる', () => {
    const job = okJob(updatePart(shelfJob(), 'part-tenita', { name: '天板A' }))
    expect(job.parts[3].expr).toEqual({ W: `天板A.W - 20 - {n:${MELAMINE_ID}}`, H: '天板A.H - 20 × 2' })
  })

  it('名前と式を同時に変えても、新しい式の参照もつけ替わる', () => {
    const job = okJob(updatePart(shelfJob(), 'part-zentai', { name: '外寸', expr: { W: '500', H: '1800' } }))
    expect(job.parts[0]).toMatchObject({ name: '外寸', expr: { W: '500', H: '1800' } })
    expect(job.parts[1].expr).toEqual({ W: '外寸.W', H: '外寸.H' })
  })
})

describe('調整寸法', () => {
  it('足す・変える・消す', () => {
    let list = shelfAdjusts()
    const r1 = addAdjust(list, { name: ' 逃げ ', value: 1 }, 'a-nige')
    if (!r1.ok) throw new Error(r1.message)
    list = r1.adjusts
    expect(list.at(-1)).toEqual({ id: 'a-nige', name: '逃げ', value: 1 })
    const r2 = updateAdjust(list, 'a-nige', { name: '逃げ', value: 0.5 })
    if (!r2.ok) throw new Error(r2.message)
    expect(r2.adjusts.at(-1)?.value).toBe(0.5)
    const r3 = removeAdjusts(r2.adjusts, ['a-nige', MELAMINE_ID])
    if (!r3.ok) throw new Error(r3.message)
    expect(r3.adjusts.map((a) => a.name)).toEqual(['シート'])
  })

  it('名前が空・寸法が 0 以下・表示名が重なるものは断る', () => {
    const list = shelfAdjusts()
    expect(addAdjust(list, { name: '', value: 1 }, 'x').ok).toBe(false)
    expect(addAdjust(list, { name: '逃げ', value: 0 }, 'x').ok).toBe(false)
    const dup = addAdjust(list, { name: 'メラミン', value: 1 }, 'x')
    expect(dup).toEqual({ ok: false, message: '「メラミン1」はもうあります' })
    // 名前「逃げ1」寸法5 と 名前「逃げ」寸法15 は同じ「逃げ15」
    const a = addAdjust(list, { name: '逃げ1', value: 5 }, 'x')
    if (!a.ok) throw new Error(a.message)
    expect(addAdjust(a.adjusts, { name: '逃げ', value: 15 }, 'y').ok).toBe(false)
  })

  it('自分自身とは重ならない（寸法を変えずに名前の空白だけ直せる）', () => {
    const list = shelfAdjusts()
    expect(updateAdjust(list, MELAMINE_ID, { name: 'メラミン ', value: 1 }).ok).toBe(true)
    expect(updateAdjust(list, MELAMINE_ID, { name: 'シート', value: 0.5 }).ok).toBe(false)
  })
})
