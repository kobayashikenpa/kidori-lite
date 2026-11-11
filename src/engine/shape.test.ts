// 保存データ・ファイルの形の確かめ（部材の調整。第2.1版。仕様書 25.2・25.5）
import { describe, expect, it } from 'vitest'
import { shelfJob } from './fixtures/shelf'
import { isPart, readJob, readJobs } from './shape'

/** 第2.0版までの部材（調整 adjust が無い）にした仕事 */
function oldJob(id = 'job-old') {
  const job = JSON.parse(JSON.stringify(shelfJob(id))) as Record<string, unknown> & { parts: Record<string, unknown>[] }
  for (const p of job.parts) delete p.adjust
  return job
}

describe('部材の調整（adjust）の読み込み', () => {
  it('調整の無い第2.0版までの部材は、調整なし（W・H とも空）として読む', () => {
    const job = readJob(oldJob())
    expect(job).not.toBeNull()
    expect(job!.parts.map((p) => p.adjust)).toEqual(job!.parts.map(() => ({ W: '', H: '' })))
    // ほかの中身は変わらない
    expect(job!.parts.map((p) => p.expr)).toEqual(shelfJob().parts.map((p) => p.expr))
  })

  it('調整のある部材はそのまま読む', () => {
    const src = shelfJob()
    src.parts[3] = { ...src.parts[3], adjust: { W: '−{n:adjust-melamine}', H: '' } }
    const job = readJob(JSON.parse(JSON.stringify(src)))
    expect(job!.parts[3].adjust).toEqual({ W: '−{n:adjust-melamine}', H: '' })
  })

  it('調整の形が違う（文字でない・軸が無い）部材は読めない', () => {
    for (const adjust of [{ W: 1, H: '' }, { W: '' }, 'x', null, []]) {
      const job = oldJob() as { parts: Record<string, unknown>[] }
      job.parts[0].adjust = adjust
      expect(readJob(job), JSON.stringify(adjust)).toBeNull()
    }
  })

  it('readJobs も調整の無い仕事を読める。1つでも読めなければ null', () => {
    const jobs = readJobs([oldJob('a'), shelfJob('b')])
    expect(jobs!.map((j) => j.parts[0].adjust)).toEqual([
      { W: '', H: '' },
      { W: '', H: '' },
    ])
    const bad = oldJob('c') as { parts: Record<string, unknown>[] }
    bad.parts[0].adjust = { W: 1, H: 2 }
    expect(readJobs([oldJob('a'), bad])).toBeNull()
  })

  it('isPart は調整のある部材だけを通す（読み込みは readJob で調整を足してから確かめる）', () => {
    expect(isPart(shelfJob().parts[0])).toBe(true)
    expect(isPart(oldJob().parts[0])).toBe(false)
  })

  it('おまかせ（auto）で調整の無い古い仕事も読める', () => {
    const job = oldJob() as unknown as { settings: Record<string, unknown> }
    job.settings.cutMode = 'auto'
    const r = readJob(job)
    expect(r?.settings.cutMode).toBe('vertical')
    expect(r?.parts[0].adjust).toEqual({ W: '', H: '' })
  })
})
