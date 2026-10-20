// 部材ごとの進み具合（kidori の progress/partProgress.test.ts をもとに、材料・フラッシュ・重ね切り・以前の checks.cut を外し、
// 見本を仕様書 6章の棚にしたもの）
import { describe, expect, it } from 'vitest'
import { freezeAt, withPart } from '../fixtures/progress'
import { shelfJob } from '../fixtures/shelf'
import type { Job } from '../types'
import { partCutProgress } from './partProgress'

const rows = (job: Job) => partCutProgress(job).map((r) => [r.name, r.done, r.total])

describe('partCutProgress', () => {
  it('何もチェックしていない：部材の順・全体（枚数0）は入らない', () => {
    expect(rows(shelfJob())).toEqual([
      ['天板', 0, 1],
      ['側板', 0, 2],
      ['棚板', 0, 3],
    ])
    expect(partCutProgress(shelfJob())[0].partId).toBe('part-tenita')
  })

  it('側板 5枚：2枚目の1枚の側板×2 にチェックすると 2/5', () => {
    const job0 = withPart(shelfJob(), 'part-gawaita', { quantity: 5 })
    const job = freezeAt(job0, 1, { partId: 'part-gawaita', n: 2 })
    expect(rows(job)[1]).toEqual(['側板', 2, 5])
  })

  it('続けて残りの1枚目の側板×3 にチェックすると 5/5（どの1枚から切っても）', () => {
    let job = withPart(shelfJob(), 'part-gawaita', { quantity: 5 })
    job = freezeAt(job, 1, { partId: 'part-gawaita', n: 2 })
    job = freezeAt(job, 0, { partId: 'part-gawaita', n: 3 })
    expect(rows(job)[1]).toEqual(['側板', 5, 5])
    expect(rows(job)[0]).toEqual(['天板', 0, 1])
  })

  it('片の1つだけにチェック → 1。固定しただけ（チェックなし）は数えない', () => {
    expect(rows(freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 }))[1]).toEqual(['側板', 1, 2])
    expect(rows(freezeAt(shelfJob(), 0))[1]).toEqual(['側板', 0, 2])
  })

  it('切り終わりの1枚のチェックも数える', () => {
    const job = freezeAt(shelfJob(), 1, { partId: 'part-tanaita', n: 2 })
    expect(job.frozenSheets[0].completedAt).toBeDefined()
    expect(rows(job)[2]).toEqual(['棚板', 2, 3])
  })

  it('固定したあと部材の枚数を減らしても done は total を超えない。枚数0 にすると行が無くなる', () => {
    const job = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 2 })
    expect(rows(withPart(job, 'part-gawaita', { quantity: 1 }))[1]).toEqual(['側板', 1, 1])
    expect(rows(withPart(job, 'part-gawaita', { quantity: 0 })).map((r) => r[0])).toEqual(['天板', '棚板'])
  })

  it('部材を消すと行も無い。名前を変えると今の名前', () => {
    const job = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 2 })
    expect(rows(withPart(job, 'part-gawaita', { name: '側板L' }))[1]).toEqual(['側板L', 2, 2])
    expect(rows({ ...job, parts: job.parts.filter((p) => p.id !== 'part-gawaita') }).map((r) => r[0])).toEqual(['天板', '棚板'])
  })
})
