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

function part(id: string, name: string, W: string, H: string, quantity: number, adjustW = ''): Part {
  return { id, name, expr: { W, H }, adjust: { W: adjustW, H: '' }, quantity, rotatable: false, finishedDone: false }
}

/**
 * 仕様書 6章の棚（仕上がりのタブで入力した形）。第2.1版（25.4）から、棚板 W は 仕上がり `天板.W - 20`・調整 `-{n:adjust-melamine}`（−メラミン1）。
 * 回転しない部材は W を板の妻手に置くので、W が短い形（全体 W400×H1800）にしている。
 * 仕上がり／調整後／木取り（切り代10）：天板 400×1800 / 400×1800 / 410×1810、側板 400×700 / 400×700 / 410×710、
 * 棚板 380×1760 / 379×1760 / 389×1770
 */
export function shelfJob(id = 'job-shelf', name = '棚'): Job {
  const job = createJob({ id, name, now: '2026-10-20T00:00:00.000Z' })
  job.parts = [
    part('part-zentai', '全体', '400', '1800', 0),
    part('part-tenita', '天板', '全体.W', '全体.H', 1),
    part('part-gawaita', '側板', '全体.W', '700', 2),
    part('part-tanaita', '棚板', '天板.W - 20', '天板.H - 20 × 2', 3, `-{n:${MELAMINE_ID}}`),
  ]
  return job
}

/**
 * 第2.0版までの形の棚（棚板 W の仕上がりの式に調整寸法：`天板.W - 20 - {n:adjust-melamine}`、調整は無し）。
 * 第2.1版で仕上がりの式では調整寸法を使えなくした（仕様書 25.4）ので、古いデータの読み込み・置き換えのテストで使う。
 * 仕上がり（置き換える前）／木取り：棚板 379×1760 / 389×1770
 */
export function legacyShelfJob(id = 'job-shelf', name = '棚'): Job {
  const job = shelfJob(id, name)
  job.parts[3] = { ...job.parts[3], expr: { W: `天板.W - 20 - {n:${MELAMINE_ID}}`, H: '天板.H - 20 × 2' }, adjust: { W: '', H: '' } }
  return job
}
