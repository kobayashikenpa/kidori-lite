// 色とメモ（第2.2版。仕様書 26.3・26.8）
import { describe, expect, it } from 'vitest'
import { rowRange } from './clipboard/cells'
import { shelfJob } from './fixtures/shelf'
import { cellColor, hasMemo, setCellColor, setPartMemo, setRowColor } from './marks'
import type { CellCol, CellPos, Job } from './types'

const c = (row: number, col: CellCol): CellPos => ({ row, col })

function okJob(r: { ok: true; job: Job } | { ok: false; message: string }): Job {
  if (!r.ok) throw new Error(r.message)
  return r.job
}

describe('セルの色（setCellColor）', () => {
  it('棚板の W のセルを赤にする。ほかの部材・ほかの列は色なし。元の仕事は変えない', () => {
    const job = shelfJob()
    const before = JSON.stringify(job)
    const r = setCellColor(job, [c(3, 'W')], 'red')
    expect(r.parts[3].cellColors).toEqual({ W: 'red' })
    expect(r.parts.slice(0, 3).map((p) => p.cellColors)).toEqual([{}, {}, {}])
    expect(JSON.stringify(job)).toBe(before)
  })

  it('範囲を選んでいれば全部に付く（厚みの列も）。部材の無い空の行には付けず、部材も作らない', () => {
    const r = setCellColor(shelfJob(), { top: 2, left: 0, rows: 4, cols: 2 }, 'yellow')
    expect(r.parts).toHaveLength(4)
    expect(r.parts.map((p) => p.cellColors)).toEqual([{}, {}, { name: 'yellow', T: 'yellow' }, { name: 'yellow', T: 'yellow' }])
  })

  it('「なし」（null）で消す。消す色が無ければ同じ仕事を返す（変わらなければ同じ仕事）', () => {
    const red = setCellColor(shelfJob(), [c(3, 'W'), c(3, 'H')], 'red')
    const r = setCellColor(red, [c(3, 'W')], null)
    expect(r.parts[3].cellColors).toEqual({ H: 'red' })
    expect(setCellColor(r, [c(0, 'W')], null)).toBe(r)
    expect(setCellColor(r, [c(3, 'H')], 'red')).toBe(r)
  })

  it('空の行だけを選んでいるときは何もしない（同じ仕事）', () => {
    const job = shelfJob()
    expect(setCellColor(job, [c(4, 'W'), c(9, 'name')], 'blue')).toBe(job)
  })
})

describe('行の色（setRowColor）', () => {
  it('選んでいる行（範囲の行）全体に付ける。空の行は付けない', () => {
    const r = setRowColor(shelfJob(), rowRange(2, 3), 'blue')
    expect(r.parts.map((p) => p.rowColor)).toEqual([null, null, 'blue', 'blue'])
    expect(r.parts).toHaveLength(4)
  })

  it('セルの選び方でも、行の位置で決まる（同じ行の2つのセルでも1回）', () => {
    const r = setRowColor(shelfJob(), [c(1, 'W'), c(1, 'H')], 'red')
    expect(r.parts.map((p) => p.rowColor)).toEqual([null, 'red', null, null])
  })

  it('「なし」は行の色だけを消す（セルの色は残る）。変わらなければ同じ仕事', () => {
    let job = setCellColor(shelfJob(), [c(2, 'W')], 'red')
    job = setRowColor(job, [c(2, 'W')], 'blue')
    const r = setRowColor(job, [c(2, 'name')], null)
    expect(r.parts[2]).toMatchObject({ rowColor: null, cellColors: { W: 'red' } })
    expect(setRowColor(r, [c(2, 'name')], null)).toBe(r)
    expect(setRowColor(r, [c(7, 'name')], 'red')).toBe(r)
  })
})

describe('見せる色（cellColor）', () => {
  it('セルの色と行の色が両方あるときはセルの色。セルの色が無ければ行の色。どちらも無ければ null', () => {
    let job = setRowColor(shelfJob(), [c(2, 'W')], 'blue')
    job = setCellColor(job, [c(2, 'W')], 'yellow')
    const p = job.parts[2]
    expect([cellColor(p, 'W'), cellColor(p, 'H'), cellColor(job.parts[0], 'W')]).toEqual(['yellow', 'blue', null])
  })
})

describe('メモ（setPartMemo）', () => {
  it('棚板にメモ「木目を縦に」を入れる（改行もそのまま）', () => {
    let job = okJob(setPartMemo(shelfJob(), 'part-tanaita', '木目を縦に'))
    expect(job.parts[3].memo).toBe('木目を縦に')
    expect(hasMemo(job.parts[3])).toBe(true)
    expect(hasMemo(job.parts[0])).toBe(false)
    job = okJob(setPartMemo(job, 'part-tanaita', '木目を縦に\n角は R2'))
    expect(job.parts[3].memo).toBe('木目を縦に\n角は R2')
  })

  it('空にして保存するとメモを消す（空白・改行だけも空）', () => {
    const job = okJob(setPartMemo(shelfJob(), 'part-tanaita', '木目を縦に'))
    expect(okJob(setPartMemo(job, 'part-tanaita', '')).parts[3].memo).toBe('')
    expect(okJob(setPartMemo(job, 'part-tanaita', ' \n　')).parts[3].memo).toBe('')
  })

  it('同じメモなら同じ仕事。無い部材は断る', () => {
    const job = okJob(setPartMemo(shelfJob(), 'part-tanaita', '木目を縦に'))
    expect(okJob(setPartMemo(job, 'part-tanaita', '木目を縦に'))).toBe(job)
    const empty = shelfJob()
    expect(okJob(setPartMemo(empty, 'part-tanaita', '  '))).toBe(empty)
    expect(setPartMemo(job, 'nope', 'x')).toEqual({ ok: false, message: '部材が見つかりません' })
  })

  it('長いメモも切らずに入れる（長さの上限なし）', () => {
    const long = 'あ'.repeat(5000)
    expect(okJob(setPartMemo(shelfJob(), 'part-tanaita', long)).parts[3].memo).toHaveLength(5000)
  })
})
