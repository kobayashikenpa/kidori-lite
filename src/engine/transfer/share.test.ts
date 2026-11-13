// 仕事1つのファイル（仕様書 15.3。kidori の store/transfer/share.test.ts を参考に、材料・フラッシュ・重ね切り・手持ちを外して作り直したもの）
import { describe, expect, it } from 'vitest'
import { freezeAt } from '../fixtures/progress'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { buildJobFile, jobFile, jobFileName } from './share'

/** 見本の棚に、切り出しチェックと仕上がりの完了を付けたもの */
function usedShelf() {
  const job = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 })
  job.parts = job.parts.map((p) => (p.id === 'part-tenita' ? { ...p, finishedDone: true } : p))
  return job
}

describe('jobFile・buildJobFile', () => {
  it('外側は app: kidori-lite・kind: job・version 1・job・adjusts だけ。空白なしの JSON', () => {
    const text = buildJobFile(shelfJob(), shelfAdjusts())
    const data = JSON.parse(text)
    expect(Object.keys(data).sort()).toEqual(['adjusts', 'app', 'job', 'kind', 'version'])
    expect([data.app, data.kind, data.version]).toEqual(['kidori-lite', 'job', 1])
    expect(text).not.toMatch(/\n/)
  })

  it('調整寸法は、その仕事の調整の欄で使っているものだけ（見本はメラミン1 だけ。第2.1版 仕様書 25.5）', () => {
    expect(jobFile(shelfJob(), shelfAdjusts()).adjusts).toEqual([{ id: MELAMINE_ID, name: 'メラミン', value: 1 }])
  })

  it('両方使っていれば両方（アプリの一覧の並び）。使っていない調整寸法・削除した調整寸法は入れない', () => {
    const job = shelfJob()
    job.parts[2].adjust.H = `-{n:${SHEET_ID}} - {n:gone}`
    const extra = [...shelfAdjusts(), { id: 'adjust-hozo', name: 'ほぞ', value: 15 }]
    expect(jobFile(job, extra).adjusts.map((a) => a.id)).toEqual([MELAMINE_ID, SHEET_ID])
  })

  it('仕上がりの式に残っている調整寸法（削除した調整寸法など）は入れない。使っているのは調整の欄だけ', () => {
    const job = shelfJob()
    job.parts[2].expr.H = `700 - {n:${SHEET_ID}}`
    expect(jobFile(job, shelfAdjusts()).adjusts.map((a) => a.id)).toEqual([MELAMINE_ID])
    job.parts[3].adjust.W = ''
    expect(jobFile(job, shelfAdjusts()).adjusts).toEqual([])
  })

  it('切り出しチェック（固定した1枚）と仕上がりの完了を外す。設定・部材の式・調整・枚数・回転はそのまま', () => {
    const job = usedShelf()
    const f = jobFile(job, shelfAdjusts())
    expect(f.job.frozenSheets).toEqual([])
    expect(f.job.parts.every((p) => !p.finishedDone)).toBe(true)
    expect(f.job.settings).toEqual(job.settings)
    expect(f.job.parts.map((p) => [p.id, p.name, p.expr, p.adjust, p.quantity, p.rotatable])).toEqual(
      job.parts.map((p) => [p.id, p.name, p.expr, p.adjust, p.quantity, p.rotatable]),
    )
    expect(f.job.parts[3].adjust).toEqual({ W: `-{n:${MELAMINE_ID}}`, H: '' })
    // 調整は写し（元の部材と同じオブジェクトにしない）
    expect(f.job.parts[3].adjust).not.toBe(job.parts[3].adjust)
    expect(f.job.name).toBe('棚')
  })

  it('元の仕事は変えない', () => {
    const job = usedShelf()
    const before = JSON.parse(JSON.stringify(job))
    jobFile(job, shelfAdjusts())
    expect(job).toEqual(before)
  })

  it('名前が空・枚数が空の部材もそのまま入る', () => {
    const job = shelfJob()
    job.parts.push({ id: 'p5', name: '', expr: { W: '300', H: '400' }, adjust: { W: '', H: '' }, thickness: null, rowColor: null, cellColors: {}, memo: '', quantity: null, rotatable: true, finishedDone: true })
    expect(jobFile(job, shelfAdjusts()).job.parts[4]).toEqual({
      id: 'p5',
      name: '',
      expr: { W: '300', H: '400' },
      adjust: { W: '', H: '' },
      thickness: null,
      rowColor: null,
      cellColors: {},
      memo: '',
      quantity: null,
      rotatable: true,
      finishedDone: false,
    })
  })
})

describe('部材の厚み（第2.2版。仕様書 26.7）', () => {
  it('厚みも入る（空は null のまま）。ファイルの版は 1 のまま', () => {
    const job = shelfJob()
    job.parts[1] = { ...job.parts[1], thickness: 18 }
    const f = jobFile(job, shelfAdjusts())
    expect(f.version).toBe(1)
    expect(f.job.parts.map((p) => p.thickness)).toEqual([null, 18, null, null])
  })
})

describe('色とメモ（第2.2版。仕様書 26.7）', () => {
  it('行の色・セルの色・メモも入る（セルの色は写し）', () => {
    const job = shelfJob()
    job.parts[3] = { ...job.parts[3], rowColor: 'blue', cellColors: { W: 'red' }, memo: '木目を縦に' }
    const f = jobFile(job, shelfAdjusts())
    expect(f.job.parts[3]).toMatchObject({ rowColor: 'blue', cellColors: { W: 'red' }, memo: '木目を縦に' })
    expect(f.job.parts[3].cellColors).not.toBe(job.parts[3].cellColors)
  })
})

describe('jobFileName', () => {
  it('「本棚.kidori-lite.json」', () => {
    expect(jobFileName({ name: '本棚' })).toBe('本棚.kidori-lite.json')
  })

  it('ファイル名に使えない文字（\\ / : * ? " < > |）・空白・制御文字は「_」に置き換える', () => {
    expect(jobFileName({ name: '本棚 A/B:C*?"<>|\\' })).toBe('本棚_A_B_C_______.kidori-lite.json')
    expect(jobFileName({ name: '本棚　2\t' })).toBe('本棚_2.kidori-lite.json')
  })

  it('前後の空白は外す。空なら「仕事.kidori-lite.json」', () => {
    expect(jobFileName({ name: '  本棚  ' })).toBe('本棚.kidori-lite.json')
    expect(jobFileName({ name: '   ' })).toBe('仕事.kidori-lite.json')
    expect(jobFileName({ name: '' })).toBe('仕事.kidori-lite.json')
  })

  it('名前の部分は 50 文字まで', () => {
    expect(jobFileName({ name: 'あ'.repeat(60) })).toBe(`${'あ'.repeat(50)}.kidori-lite.json`)
  })
})
