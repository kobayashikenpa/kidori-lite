// 片のチェックの付け外し（kidori の store/jobs.ts の setPieceCheck・setPartCheck と store/progress.test.ts をもとに、
// 材料・重ね切りを外し、計算として engine に置いたもの）
import { describe, expect, it } from 'vitest'
import { LATER, NOW, pack } from '../fixtures/progress'
import { shelfJob } from '../fixtures/shelf'
import type { Job } from '../types'
import { setPartCheck, setPieceCheck, type CheckResult, type SheetTarget } from './checks'

function ok(r: CheckResult): Job {
  if (!r.ok) throw new Error(r.message)
  return r.job
}

/** 見本の i 枚目（計算した1枚）を指す */
function computed(job: Job, i: number): SheetTarget {
  const r = pack(job)
  return { kind: 'computed', mode: r.mode, layout: r.sheets[i] }
}

const frozen = (sheetId: string): SheetTarget => ({ kind: 'frozen', sheetId })

describe('setPieceCheck（片1つの付け外し）', () => {
  it('計算した1枚の1つ目のチェックで、その1枚を固定する（checked はその片だけ）', () => {
    const job0 = shelfJob()
    const target = computed(job0, 0)
    const job = ok(setPieceCheck(job0, target, 'part-gawaita#1', true, NOW, 'sheet-x'))
    expect(job.frozenSheets).toHaveLength(1)
    const f = job.frozenSheets[0]
    expect(f).toMatchObject({ id: 'sheet-x', mode: 'vertical', checked: ['part-gawaita#1'], frozenAt: NOW.toISOString() })
    expect(f.layout).toEqual(target.kind === 'computed' ? target.layout : null)
    expect(f.completedAt).toBeUndefined()
    // 元の仕事は書き換えない
    expect(job0.frozenSheets).toEqual([])
  })

  it('計算した1枚で外すのは何もしない（同じ仕事を返す）', () => {
    const job0 = shelfJob()
    expect(ok(setPieceCheck(job0, computed(job0, 0), 'part-gawaita#1', false, NOW))).toBe(job0)
  })

  it('固定した1枚に足す・同じチェックをもう一度は何もしない・外す', () => {
    const job0 = shelfJob()
    const j1 = ok(setPieceCheck(job0, computed(job0, 0), 'part-gawaita#1', true, NOW, 's'))
    const j2 = ok(setPieceCheck(j1, frozen('s'), 'part-tenita#1', true, LATER))
    expect(j2.frozenSheets[0].checked).toEqual(['part-gawaita#1', 'part-tenita#1'])
    expect(ok(setPieceCheck(j2, frozen('s'), 'part-tenita#1', true, LATER))).toBe(j2)
    const j3 = ok(setPieceCheck(j2, frozen('s'), 'part-gawaita#1', false, LATER))
    expect(j3.frozenSheets[0].checked).toEqual(['part-tenita#1'])
  })

  it('全部チェックで切り終わり（completedAt）、1つ外すと切り終わりが消える', () => {
    const job0 = shelfJob()
    let job = ok(setPieceCheck(job0, computed(job0, 1), 'part-tanaita#2', true, NOW, 's'))
    job = ok(setPieceCheck(job, frozen('s'), 'part-tanaita#3', true, LATER))
    expect(job.frozenSheets[0].completedAt).toBe(LATER.toISOString())
    job = ok(setPieceCheck(job, frozen('s'), 'part-tanaita#3', false, LATER))
    expect(job.frozenSheets[0].completedAt).toBeUndefined()
    expect('completedAt' in job.frozenSheets[0]).toBe(false)
  })

  it('片が1つだけの1枚は、1つ目のチェックで固定と同時に切り終わり', () => {
    const job0 = shelfJob()
    job0.parts = job0.parts.filter((p) => p.id === 'part-zentai' || p.id === 'part-tenita')
    const job = ok(setPieceCheck(job0, computed(job0, 0), 'part-tenita#1', true, NOW, 's'))
    expect(job.frozenSheets[0].completedAt).toBe(NOW.toISOString())
  })

  it('チェックを全部外すと固定も外れ（1枚を消す）、今の部材で並べ直される', () => {
    const job0 = shelfJob()
    const j1 = ok(setPieceCheck(job0, computed(job0, 0), 'part-gawaita#1', true, NOW, 's'))
    expect(pack(j1).sheets).toHaveLength(1)
    const j2 = ok(setPieceCheck(j1, frozen('s'), 'part-gawaita#1', false, LATER))
    expect(j2.frozenSheets).toEqual([])
    expect(pack(j2).sheets).toHaveLength(2)
  })

  it('写しに無い片・無い1枚は断る', () => {
    const job0 = shelfJob()
    expect(setPieceCheck(job0, computed(job0, 0), 'none#1', true, NOW).ok).toBe(false)
    expect(setPieceCheck(job0, frozen('none'), 'part-gawaita#1', true, NOW).ok).toBe(false)
    const j1 = ok(setPieceCheck(job0, computed(job0, 0), 'part-gawaita#1', true, NOW, 's'))
    expect(setPieceCheck(j1, frozen('s'), 'part-tanaita#2', true, NOW).ok).toBe(false)
  })
})

describe('setPartCheck（その1枚の同じ部材をまとめて付け外し）', () => {
  it('「側板 ×2枚」を1回押すと、その1枚の側板が全部チェックされて固定される', () => {
    const job0 = shelfJob()
    const job = ok(setPartCheck(job0, computed(job0, 0), 'part-gawaita', true, NOW, 's'))
    expect(job.frozenSheets).toHaveLength(1)
    expect(job.frozenSheets[0].checked).toEqual(['part-gawaita#1', 'part-gawaita#2'])
    expect(job.frozenSheets[0].completedAt).toBeUndefined()
  })

  it('すべての部材の行を押すと切り終わり。1行外すと切り終わりでなくなり、全部外すと固定が外れる', () => {
    const job0 = shelfJob()
    let job = ok(setPartCheck(job0, computed(job0, 0), 'part-gawaita', true, NOW, 's'))
    job = ok(setPartCheck(job, frozen('s'), 'part-tenita', true, NOW))
    job = ok(setPartCheck(job, frozen('s'), 'part-tanaita', true, LATER))
    expect(job.frozenSheets[0].completedAt).toBe(LATER.toISOString())
    job = ok(setPartCheck(job, frozen('s'), 'part-tenita', false, LATER))
    expect(job.frozenSheets[0].completedAt).toBeUndefined()
    job = ok(setPartCheck(job, frozen('s'), 'part-gawaita', false, LATER))
    job = ok(setPartCheck(job, frozen('s'), 'part-tanaita', false, LATER))
    expect(job.frozenSheets).toEqual([])
  })

  it('一部だけ付いている行を押すと、残りの片だけ付ける', () => {
    const job0 = shelfJob()
    let job = ok(setPieceCheck(job0, computed(job0, 0), 'part-gawaita#2', true, NOW, 's'))
    job = ok(setPartCheck(job, frozen('s'), 'part-gawaita', true, NOW))
    expect(job.frozenSheets[0].checked).toEqual(['part-gawaita#2', 'part-gawaita#1'])
  })

  it('計算した1枚で外すのは何もしない。その1枚に無い部材・無い1枚は断り、元の仕事のまま', () => {
    const job0 = shelfJob()
    expect(ok(setPartCheck(job0, computed(job0, 0), 'part-gawaita', false, NOW))).toBe(job0)
    expect(setPartCheck(job0, computed(job0, 1), 'part-gawaita', true, NOW).ok).toBe(false)
    expect(setPartCheck(job0, frozen('none'), 'part-gawaita', true, NOW).ok).toBe(false)
  })
})
