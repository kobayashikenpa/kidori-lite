// ファイルから取り込む：読み込みと確認のまとめ（仕様書 15.3・15.4。kidori の store/transfer/read.test.ts を参考に作り直したもの）
import { describe, expect, it } from 'vitest'
import { shelfAdjusts, legacyShelfJob } from '../fixtures/shelf'
import { buildBackupFile } from './backup'
import { MAX_TRANSFER_SIZE, READ_FAILED } from './envelope'
import { readTransferFile } from './read'
import { buildJobFile } from './share'

const failed = { ok: false, message: '読み込めませんでした' }

describe('readTransferFile：読めるファイル', () => {
  it('仕事1つのファイル：種類 job と、確認に出す仕事の名前・部材の数', () => {
    const r = readTransferFile(buildJobFile(legacyShelfJob(), shelfAdjusts()))
    expect(r.ok).toBe(true)
    if (!r.ok || r.kind !== 'job') throw new Error('読めない')
    expect(r.summary).toEqual({ jobName: '棚', partCount: 4 })
    expect(r.file.job.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板'])
    expect(r.file.adjusts.map((a) => a.name)).toEqual(['メラミン'])
  })

  it('バックアップ：種類 backup と、確認に出す仕事の数・名前', () => {
    const r = readTransferFile(buildBackupFile({ jobs: [legacyShelfJob('a', '本棚'), legacyShelfJob('b', '食器棚')], adjusts: shelfAdjusts() }))
    expect(r.ok).toBe(true)
    if (!r.ok || r.kind !== 'backup') throw new Error('読めない')
    expect(r.summary).toEqual({ jobCount: 2, jobNames: ['本棚', '食器棚'] })
    expect(r.file.adjusts).toHaveLength(2)
  })

  it('名前が空・枚数が空の部材があっても読める', () => {
    const job = legacyShelfJob()
    job.parts.push({ id: 'p5', name: '', expr: { W: '300', H: '400' }, adjust: { W: '', H: '' }, quantity: null, rotatable: false, finishedDone: false })
    const r = readTransferFile(buildJobFile(job, shelfAdjusts()))
    expect(r.ok && r.kind === 'job' && r.summary.partCount).toBe(5)
  })

  it('部材の調整の無い第2.0版までのファイル（共有・バックアップ）は、調整なしとして読む（第2.1版。仕様書 25.5）', () => {
    const strip = (text: string) => {
      const v = JSON.parse(text) as { job?: { parts: Record<string, unknown>[] }; jobs?: { parts: Record<string, unknown>[] }[] }
      for (const j of v.job ? [v.job] : (v.jobs ?? [])) for (const p of j.parts) delete p.adjust
      return JSON.stringify(v)
    }
    const one = readTransferFile(strip(buildJobFile(legacyShelfJob(), shelfAdjusts())))
    if (!one.ok || one.kind !== 'job') throw new Error('読めない')
    expect(one.file.job.parts.map((p) => p.adjust)).toEqual(one.file.job.parts.map(() => ({ W: '', H: '' })))
    const backup = readTransferFile(strip(buildBackupFile({ jobs: [legacyShelfJob('a', '本棚')], adjusts: shelfAdjusts() })))
    if (!backup.ok || backup.kind !== 'backup') throw new Error('読めない')
    expect(backup.file.jobs[0].parts.every((p) => p.adjust.W === '' && p.adjust.H === '')).toBe(true)
  })

  it('第1.3版までの切り方「おまかせ」（auto）の仕事・バックアップは、縦切り優先にして読む（仕様書 18.2）', () => {
    const auto = (j: ReturnType<typeof legacyShelfJob>) => JSON.parse(JSON.stringify(j).replace('"cutMode":"vertical"', '"cutMode":"auto"'))
    const one = readTransferFile(buildJobFile(auto(legacyShelfJob()), shelfAdjusts()))
    expect(one.ok && one.kind === 'job' && one.file.job.settings.cutMode).toBe('vertical')
    const h = legacyShelfJob('b', '食器棚')
    h.settings.cutMode = 'horizontal'
    const backup = readTransferFile(buildBackupFile({ jobs: [auto(legacyShelfJob('a', '本棚')), h], adjusts: shelfAdjusts() }))
    expect(backup.ok && backup.kind === 'backup' && backup.file.jobs.map((j) => j.settings.cutMode)).toEqual(['vertical', 'horizontal'])
  })

  it('先頭に BOM があっても読める', () => {
    expect(readTransferFile(`﻿${buildJobFile(legacyShelfJob(), shelfAdjusts())}`).ok).toBe(true)
  })
})

describe('readTransferFile：読めないファイルは「読み込めませんでした」', () => {
  const job = () => JSON.parse(buildJobFile(legacyShelfJob(), shelfAdjusts()))
  const backup = () => JSON.parse(buildBackupFile({ jobs: [legacyShelfJob()], adjusts: shelfAdjusts() }))

  it('文言', () => {
    expect(READ_FAILED).toBe('読み込めませんでした')
  })

  it.each([
    ['空', ''],
    ['空白だけ', '   '],
    ['JSON でない', '{こわれた'],
    ['途中で切れた', buildJobFile(legacyShelfJob(), shelfAdjusts()).slice(0, 100)],
    ['null', 'null'],
    ['配列', '[]'],
    ['文字', '"kidori-lite"'],
    ['写真などほかのファイル', '\u0089PNG\r\n'],
  ])('%s', (_label, text) => {
    expect(readTransferFile(text)).toEqual(failed)
  })

  it.each([
    ['kidori の共有のファイル', { app: 'kidori', kind: 'share', version: 1, dataVersion: 3, exportedAt: '2026-10-22T00:00:00.000Z', job: legacyShelfJob() }],
    ['kidori のバックアップ', { app: 'kidori', kind: 'backup', version: 1, dataVersion: 3, exportedAt: '2026-10-22T00:00:00.000Z', jobs: [] }],
    ['app が無い', { ...job(), app: undefined }],
    ['kind が違う（kidori の share）', { ...job(), kind: 'share' }],
    ['version が違う', { ...job(), version: 2 }],
    ['job が無い', { ...job(), job: undefined }],
    ['job の部材の枚数がおかしい', { ...job(), job: { ...legacyShelfJob(), parts: [{ ...legacyShelfJob().parts[0], quantity: -1 }] } }],
    ['job の設定が無い', { ...job(), job: { ...legacyShelfJob(), settings: undefined } }],
    ['adjusts が無い', { ...job(), adjusts: undefined }],
    ['調整寸法の寸法が 0', { ...job(), adjusts: [{ id: 'a', name: '逃げ', value: 0 }] }],
    ['jobs が配列でない', { ...backup(), jobs: {} }],
    ['jobs の中に読めない仕事', { ...backup(), jobs: [legacyShelfJob(), { id: 'x' }] }],
    ['バックアップに adjusts が無い', { ...backup(), adjusts: undefined }],
  ])('%s', (_label, data) => {
    expect(readTransferFile(JSON.stringify(data))).toEqual(failed)
  })

  it('大きすぎる（20MB 超）', () => {
    expect(readTransferFile(' '.repeat(MAX_TRANSFER_SIZE + 1))).toEqual(failed)
  })
})
