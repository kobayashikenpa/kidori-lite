// 仕事の一覧の並べ方と1行の文字（画面から切り離して試せるようにする）
import type { Job } from '../engine/types'
import { formatDateTime } from './format'

/** 新しい順（最後に変えた日の新しいものが上）に並べた写し */
export function sortJobsNewestFirst(jobs: readonly Job[]): Job[] {
  return [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 一覧の1行の下に出す文字（例：「部材 4件・最後に変えた日 2026/10/21 09:00」） */
export function jobMeta(job: Pick<Job, 'parts' | 'updatedAt'>): string {
  return `部材 ${job.parts.length}件・最後に変えた日 ${formatDateTime(job.updatedAt)}`
}
