import { describe, expect, it } from 'vitest'
import { adjustChangeUsages } from '../engine/adjusts'
import type { AdjustRow, Job } from '../engine/types'
import {
  adjustAddRowsMin,
  adjustConfirmText,
  adjustInputRow,
  adjustRowCount,
  adjustRowLabel,
  nextAdjustCell,
  sessionAdjustMinRows,
  setSessionAdjustMinRows,
} from './adjustTable'

const rows: AdjustRow[] = [
  { id: 'a1', name: 'メラミン', value: 1 },
  { id: 'a2', name: 'シート', value: 0.5 },
]

const job = (id: string, name: string, exprW: string): Pick<Job, 'id' | 'name' | 'parts'> => ({
  id,
  name,
  parts: [{ id: `${id}-p`, name: '棚板', expr: { W: exprW, H: '300' }, quantity: 1, rotatable: false, finishedDone: false }],
})

describe('調整寸法の表の行（仕様書 21.1）', () => {
  it('初めは5行、5行を超えたら行の数 ＋ 空の行1つ', () => {
    expect(adjustRowCount(0)).toBe(5)
    expect(adjustRowCount(2)).toBe(5)
    expect(adjustRowCount(5)).toBe(6)
  })

  it('「＋ 5行足す」で5行増える。足した行はアプリを開いている間だけ（仕事ごとではない）', () => {
    expect(adjustAddRowsMin(2)).toBe(10)
    expect(adjustRowCount(2, adjustAddRowsMin(2))).toBe(10)
    expect(sessionAdjustMinRows()).toBe(5)
    setSessionAdjustMinRows(10)
    expect(sessionAdjustMinRows()).toBe(10)
    setSessionAdjustMinRows(5)
  })

  it('空の行を押すと、いちばん上の空の行に入れる', () => {
    expect(adjustInputRow(4, 2)).toBe(2)
    expect(adjustInputRow(1, 2)).toBe(1)
  })

  it('「次へ」は 名前 → 寸法 → 次の行の名前', () => {
    expect(nextAdjustCell({ row: 0, col: 'name' }, 2)).toEqual({ row: 0, col: 'value' })
    expect(nextAdjustCell({ row: 0, col: 'value' }, 2)).toEqual({ row: 1, col: 'name' })
    expect(nextAdjustCell({ row: 2, col: 'value' }, 3)).toEqual({ row: 3, col: 'name' })
  })

  it('行の呼び方：そろった行は表示名、書きかけは名前か行の番号、空の行は（空）', () => {
    expect(adjustRowLabel(rows[0], 0)).toBe('メラミン1')
    expect(adjustRowLabel({ id: 'x', name: 'ほぞ', value: null }, 2)).toBe('ほぞ')
    expect(adjustRowLabel({ id: 'x', name: '', value: 3 }, 2)).toBe('3行目')
    expect(adjustRowLabel(undefined, 4)).toBe('5行目（空）')
  })
})

describe('変える・消すときの確認の文（仕様書 21.3）', () => {
  const jobs = [job('j1', '本棚', '400 - {n:a1}'), job('j2', '台', '{n:a1} + 100'), job('j3', '棚', '{n:a2}')]

  it('ほかの仕事で使っている調整寸法の寸法を変えると、仕事の数と名前を出す', () => {
    const after = rows.map((r) => (r.id === 'a1' ? { ...r, value: 2 } : r))
    const u = adjustChangeUsages(jobs, rows, after, 'j1')
    expect(adjustConfirmText(u, after, 'j1')).toBe(
      '「メラミン1」を、この仕事のほかに 1件の仕事で使っています（台）。変えると、その仕事の寸法も変わります',
    )
  })

  it('消すときは「消すと、その仕事の式はエラーになります」', () => {
    const after = rows.filter((r) => r.id !== 'a1')
    const u = adjustChangeUsages(jobs, rows, after, 'j3')
    expect(adjustConfirmText(u, after, 'j3')).toBe(
      '「メラミン1」を、この仕事のほかに 2件の仕事で使っています（本棚・台）。消すと、その仕事の式はエラーになります',
    )
  })

  it('この仕事でしか使っていないときは確認しない', () => {
    const after = rows.map((r) => (r.id === 'a2' ? { ...r, value: 0.8 } : r))
    const u = adjustChangeUsages(jobs, rows, after, 'j3')
    expect(adjustConfirmText(u, after, 'j3')).toBeNull()
  })
})
