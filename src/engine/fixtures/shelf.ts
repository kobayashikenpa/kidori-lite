// 仕様書 6章の例（全体・天板・側板・棚板）。テストで使う。呼ぶたびに新しいオブジェクト
import { createJob } from '../defaults'
import type { Adjust, Job, Part } from '../types'

export const MELAMINE_ID = 'adjust-melamine'
export const SHEET_ID = 'adjust-sheet'

/** 初期の調整寸法（メラミン1・シート0.5）を、決まった id で */
export function shelfAdjusts(): Adjust[] {
  return [
    { id: MELAMINE_ID, name: 'メラミン', value: 1 },
    { id: SHEET_ID, name: 'シート', value: 0.5 },
  ]
}

function part(id: string, name: string, W: string, H: string, quantity: number): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

/** 仕様書 6章の棚（仕上がりのタブで入力した形）。棚板の「メラミン1」は {n:adjust-melamine} */
export function shelfJob(id = 'job-shelf', name = '棚'): Job {
  const job = createJob({ id, name, now: '2026-10-20T00:00:00.000Z' })
  job.parts = [
    part('part-zentai', '全体', '1800', '400', 0),
    part('part-tenita', '天板', '全体.W', '全体.H', 1),
    part('part-gawaita', '側板', '700', '全体.H', 2),
    part('part-tanaita', '棚板', '天板.W - 20 × 2', `天板.H - 20 - {n:${MELAMINE_ID}}`, 3),
  ]
  return job
}
