import { describe, expect, it } from 'vitest'
import { shelfJob } from '../engine/fixtures/shelf'
import { jobMeta, sortJobsNewestFirst } from './jobList'

describe('仕事の一覧', () => {
  it('最後に変えた日の新しい順', () => {
    const a = { ...shelfJob('a', 'A'), updatedAt: new Date(2026, 9, 20).toISOString() }
    const b = { ...shelfJob('b', 'B'), updatedAt: new Date(2026, 9, 21, 8).toISOString() }
    const c = { ...shelfJob('c', 'C'), updatedAt: new Date(2026, 9, 21, 9).toISOString() }
    expect(sortJobsNewestFirst([a, c, b]).map((j) => j.name)).toEqual(['C', 'B', 'A'])
  })

  it('部材の数と最後に変えた日', () => {
    const job = { ...shelfJob(), updatedAt: new Date(2026, 9, 21, 9, 5).toISOString() }
    expect(jobMeta(job)).toBe('部材 4件・最後に変えた日 2026/10/21 09:05')
  })
})
