// 仕上がりの式の調整寸法を数字に置き換える（第2.1版。仕様書 25.4・25.9）
import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../dimensions'
import { legacyShelfJob, MELAMINE_ID, SHEET_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import type { AppData } from '../types'
import { inlineAdjustsInExpr, inlineAppDataAdjusts, inlineJobAdjusts } from './finishedAdjusts'

const adjusts = shelfAdjusts()
const M = `{n:${MELAMINE_ID}}`
const S = `{n:${SHEET_ID}}`

describe('inlineAdjustsInExpr（式の中の調整寸法を、今の寸法の数字に）', () => {
  it('天板.W - 20 - メラミン1 → 天板.W - 20 - 1', () => {
    expect(inlineAdjustsInExpr(`天板.W - 20 - ${M}`, adjusts)).toBe('天板.W - 20 - 1')
  })

  it('小数の寸法・2つ以上・かっこの中も置き換える（シート0.5 → 0.5）', () => {
    expect(inlineAdjustsInExpr(`(天板.W - ${S}) × 2 - ${M}`, adjusts)).toBe('(天板.W - 0.5) × 2 - 1')
  })

  it('全角の ｛ｎ：…｝ も置き換える', () => {
    expect(inlineAdjustsInExpr(`900 − ｛ｎ:${MELAMINE_ID}｝`, adjusts)).toBe('900 − 1')
  })

  it('一覧に無い id（削除した調整寸法）はそのまま残す（エラーのまま）', () => {
    expect(inlineAdjustsInExpr('900 - {n:adjust-gone}', adjusts)).toBe('900 - {n:adjust-gone}')
    expect(inlineAdjustsInExpr(`900 - {n:adjust-gone} - ${M}`, adjusts)).toBe('900 - {n:adjust-gone} - 1')
  })

  it('調整寸法の無い式は同じ文字を返す', () => {
    expect(inlineAdjustsInExpr('天板.W - 20', adjusts)).toBe('天板.W - 20')
    expect(inlineAdjustsInExpr('', adjusts)).toBe('')
  })

  it('前後に数字がくっついていても、数字どうしをつなげない（エラーの式はエラーのまま）', () => {
    expect(inlineAdjustsInExpr(`${M}5`, adjusts)).toBe('1 5')
    expect(inlineAdjustsInExpr(`2${M}`, adjusts)).toBe('2 1')
    expect(inlineAdjustsInExpr(`${M}${S}`, adjusts)).toBe('1 0.5')
  })
})

describe('inlineJobAdjusts（仕事の部材の仕上がりの式）', () => {
  it('第2.0版までの棚：棚板 W が 天板.W - 20 - 1 になり、全部の部材の仕上がり寸法は置き換える前と同じ', () => {
    const job = inlineJobAdjusts(legacyShelfJob(), adjusts)
    expect(job.parts[3].expr).toEqual({ W: '天板.W - 20 - 1', H: '天板.H - 20 × 2' })
    const d = computeDimensions(job, adjusts)
    expect(d.errors).toEqual([])
    // 置き換える前（第2.0版の計算）の仕上がり：全体 400×1800、天板 400×1800、側板 400×700、棚板 379×1760
    expect(d.parts.map((p) => p.finished)).toEqual([
      { W: 400, H: 1800 },
      { W: 400, H: 1800 },
      { W: 400, H: 700 },
      { W: 379, H: 1760 },
    ])
  })

  it('調整の欄（Part.adjust）の調整寸法は置き換えない', () => {
    const src = shelfJob()
    src.parts[2] = { ...src.parts[2], expr: { W: `天板.W - ${M}`, H: '700' }, adjust: { W: `-${M}`, H: `-${S}` } }
    const job = inlineJobAdjusts(src, adjusts)
    expect(job.parts[2].expr.W).toBe('天板.W - 1')
    expect(job.parts[2].adjust).toEqual({ W: `-${M}`, H: `-${S}` })
    expect(job.parts[3].adjust).toEqual(shelfJob().parts[3].adjust)
  })

  it('置き換えるものが無ければ同じ仕事（同じオブジェクト）を返す', () => {
    const job = shelfJob()
    expect(inlineJobAdjusts(job, adjusts)).toBe(job)
  })

  it('元の仕事は書き換えない', () => {
    const src = legacyShelfJob()
    inlineJobAdjusts(src, adjusts)
    expect(src.parts[3].expr.W).toBe(`天板.W - 20 - ${M}`)
  })
})

describe('inlineAppDataAdjusts（保存データ全体）', () => {
  const data = (): AppData => ({
    version: 1,
    jobs: [legacyShelfJob('a'), shelfJob('b')],
    adjusts: [...shelfAdjusts(), { id: 'adjust-draft', name: '逃げ', value: null }],
    cellClip: null,
    adjustClip: null,
  })

  it('全部の仕事の仕上がりの式を、使える調整寸法の今の寸法で置き換える。書きかけの行の id はそのまま', () => {
    const d = data()
    d.jobs[1].parts[0] = { ...d.jobs[1].parts[0], expr: { W: '400 - {n:adjust-draft}', H: `1800 - ${S}` } }
    const out = inlineAppDataAdjusts(d)
    expect(out.jobs[0].parts[3].expr.W).toBe('天板.W - 20 - 1')
    expect(out.jobs[1].parts[0].expr).toEqual({ W: '400 - {n:adjust-draft}', H: '1800 - 0.5' })
    expect(out.adjusts).toBe(d.adjusts)
  })

  it('保存してあるコピーしたセルの中の調整寸法も置き換える', () => {
    const d = data()
    d.cellClip = { rows: 1, cols: 3, cells: [['棚板', `天板.W - 20 - ${M}`, `${S} × 2`]] }
    expect(inlineAppDataAdjusts(d).cellClip).toEqual({ rows: 1, cols: 3, cells: [['棚板', '天板.W - 20 - 1', '0.5 × 2']] })
  })

  it('置き換えるものが無ければ同じデータ（同じオブジェクト）を返す', () => {
    const d: AppData = { ...data(), jobs: [shelfJob('b')], cellClip: { rows: 1, cols: 1, cells: [['天板.W']] } }
    expect(inlineAppDataAdjusts(d)).toBe(d)
  })
})
