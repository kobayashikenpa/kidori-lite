// 保存データ・ファイルの形の確かめ（部材の調整。第2.1版。仕様書 25.2・25.5）
import { describe, expect, it } from 'vitest'
import { toV21 } from './fixtures/legacy'
import { shelfJob } from './fixtures/shelf'
import { isCellClip, isCellRange, isPart, readCellClip, readJob, readJobs } from './shape'

/** 第2.0版までの部材（調整 adjust も、第2.2版の厚みも無い）にした仕事 */
function oldJob(id = 'job-old') {
  const job = toV21(shelfJob(id)) as unknown as Record<string, unknown> & { parts: Record<string, unknown>[] }
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

  it('おまかせ（auto）で調整の無い古い仕事も読める（厚みも無い）', () => {
    const job = oldJob() as unknown as { settings: Record<string, unknown> }
    job.settings.cutMode = 'auto'
    const r = readJob(job)
    expect(r?.settings.cutMode).toBe('vertical')
    expect(r?.parts[0].adjust).toEqual({ W: '', H: '' })
    expect(r?.parts[0].thickness).toBeNull()
  })
})

describe('部材の厚み（thickness。第2.2版 仕様書 26.1・26.7）', () => {
  it('厚みの無い第2.1版の部材は、厚みなし（null）として読む。ほかの中身は変わらない', () => {
    const src = shelfJob()
    const job = readJob(toV21(src))
    expect(job).not.toBeNull()
    expect(job!.parts.map((p) => p.thickness)).toEqual([null, null, null, null])
    expect(job!.parts.map((p) => [p.name, p.expr, p.adjust, p.quantity])).toEqual(src.parts.map((p) => [p.name, p.expr, p.adjust, p.quantity]))
  })

  it('厚みのある部材はそのまま読む（小数も）', () => {
    const src = shelfJob()
    src.parts[1] = { ...src.parts[1], thickness: 18 }
    src.parts[3] = { ...src.parts[3], thickness: 2.5 }
    const job = readJob(JSON.parse(JSON.stringify(src)))
    expect(job!.parts.map((p) => p.thickness)).toEqual([null, 18, null, 2.5])
  })

  it('厚みが 0 以下・数でない部材は読めない（仕事ごと読めない）', () => {
    for (const thickness of [0, -1, '18', Number.NaN, Number.POSITIVE_INFINITY, {}, []]) {
      const job = JSON.parse(JSON.stringify(shelfJob())) as { parts: Record<string, unknown>[] }
      job.parts[0].thickness = thickness
      expect(readJob(job), String(thickness)).toBeNull()
    }
  })

  it('isPart は厚み（数か null）のある部材だけを通す', () => {
    expect(isPart(shelfJob().parts[0])).toBe(true)
    expect(isPart(toV21(shelfJob()).parts[0])).toBe(false)
  })

  it('調整も厚みも無い第2.0版の部材も読める', () => {
    const job = readJob(oldJob())
    expect(job!.parts.every((p) => p.thickness === null && p.adjust.W === '')).toBe(true)
  })
})

describe('コピーしたセルの列の並び（第2.2版。仕様書 26.8）', () => {
  const K = 'name,T,W,H,qty'

  it('範囲は 5 列（名前・厚み・W・H・枚数）まで', () => {
    expect(isCellRange({ top: 0, left: 0, rows: 1, cols: 5 })).toBe(true)
    expect(isCellRange({ top: 0, left: 4, rows: 1, cols: 1 })).toBe(true)
    expect(isCellRange({ top: 0, left: 1, rows: 1, cols: 5 })).toBe(false)
  })

  it('列の並びの印（columns）が今の並びのクリップだけを通す', () => {
    expect(isCellClip({ rows: 1, cols: 5, cells: [['棚板', '18', '1', '2', '3']], columns: K })).toBe(true)
    expect(isCellClip({ rows: 1, cols: 4, cells: [['棚板', '1', '2', '3']] })).toBe(false)
    expect(isCellClip({ rows: 1, cols: 1, cells: [['1']], columns: 'name,W,H,qty' })).toBe(false)
  })

  it('前の版のクリップ（印なし）は readCellClip で null（切り取りの元があっても）', () => {
    expect(readCellClip({ rows: 1, cols: 1, cells: [['1']] })).toBeNull()
    expect(readCellClip({ rows: 1, cols: 1, cells: [['1']], cut: { jobId: 'j', range: { top: 0, left: 1, rows: 1, cols: 1 } } })).toBeNull()
    const ok = { rows: 1, cols: 1, cells: [['1']], cut: { jobId: 'j', range: { top: 0, left: 1, rows: 1, cols: 1 } }, columns: K }
    expect(readCellClip(ok)).toEqual(ok)
  })
})

describe('色とメモの読み込み（第2.2版。仕様書 26.3・26.7）', () => {
  const marked = () => {
    const job = shelfJob()
    job.parts[2] = { ...job.parts[2], rowColor: 'blue' }
    job.parts[3] = { ...job.parts[3], cellColors: { W: 'red', T: 'yellow' }, memo: '木目を縦に\n角は R2' }
    return job
  }

  it('色・メモのある部材はそのまま読む', () => {
    const job = readJob(JSON.parse(JSON.stringify(marked())))
    expect(job).toEqual(marked())
  })

  it('色・メモの無い前の版の部材は、色なし・メモなしとして読む', () => {
    const job = readJob(toV21(marked()))
    expect(job!.parts.map((p) => [p.rowColor, p.cellColors, p.memo])).toEqual(job!.parts.map(() => [null, {}, '']))
  })

  it('知らない色・知らない列・形の違うものは、色なし（メモなし）にして読む（仕事は読める）', () => {
    const raw = JSON.parse(JSON.stringify(marked())) as { parts: Record<string, unknown>[] }
    raw.parts[0].rowColor = 'green'
    raw.parts[1].rowColor = 3
    raw.parts[1].cellColors = { W: 'purple', H: 'blue', D: 'red', qty: null }
    raw.parts[2].cellColors = 'red'
    raw.parts[3].memo = 12
    const job = readJob(raw)
    expect(job).not.toBeNull()
    expect(job!.parts.map((p) => [p.rowColor, p.cellColors, p.memo])).toEqual([
      [null, {}, ''],
      [null, { H: 'blue' }, ''],
      ['blue', {}, ''],
      [null, { W: 'red', T: 'yellow' }, ''],
    ])
  })

  it('isPart は色・メモの形が正しい部材だけを通す', () => {
    const p = shelfJob().parts[0]
    expect(isPart(p)).toBe(true)
    expect(isPart({ ...p, rowColor: 'green' })).toBe(false)
    expect(isPart({ ...p, cellColors: { W: 'pink' } })).toBe(false)
    expect(isPart({ ...p, cellColors: { D: 'red' } })).toBe(false)
    expect(isPart({ ...p, memo: null })).toBe(false)
  })
})
