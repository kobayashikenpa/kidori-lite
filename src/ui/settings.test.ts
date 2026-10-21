import { describe, expect, it } from 'vitest'
import { customSheet, defaultSettings } from '../engine/defaults'
import { parseNum } from './format'
import { groupUsages, settingsSummary, sheetLabel } from './settings'

describe('設定の見出しの1行', () => {
  it('初めの設定は 4×8・刃厚3・端切り5・切り代10・縦切り優先', () => {
    expect(settingsSummary(defaultSettings())).toBe('4×8・刃厚3・端切り5・切り代10・縦切り優先')
  })
  it('自由入力の板は大きさも出す（小さいほうが妻手）', () => {
    expect(sheetLabel(customSheet(2000, 1000))).toBe('自由入力 1000×2000')
  })
})

describe('数字の欄の読み取り', () => {
  it('空は null、数は数、打ちかけの「1.」も読む', () => {
    expect(parseNum('')).toBeNull()
    expect(parseNum('0.5')).toBe(0.5)
    expect(parseNum('1.')).toBe(1)
    expect(parseNum('１２')).toBe(12)
    expect(parseNum('a')).toBeNaN()
  })
})

describe('使っている所を仕事ごとにまとめる', () => {
  it('同じ仕事の部材を1つにまとめ、使っている調整寸法の名前を付ける', () => {
    const adjusts = [
      { id: 'a1', name: 'メラミン', value: 1 },
      { id: 'a2', name: 'シート', value: 0.5 },
    ]
    const g = groupUsages(
      [
        { jobId: 'j1', jobName: '本棚', partId: 'p1', partName: '棚板', axes: ['W'], adjustIds: ['a1'] },
        { jobId: 'j1', jobName: '本棚', partId: 'p2', partName: '側板', axes: ['W', 'H'], adjustIds: ['a1', 'a2'] },
        { jobId: 'j2', jobName: '台', partId: 'p3', partName: '天板', axes: ['H'], adjustIds: ['a2'] },
      ],
      adjusts,
    )
    expect(g).toEqual([
      { jobId: 'j1', jobName: '本棚', parts: ['棚板（W）［メラミン1］', '側板（W・H）［メラミン1・シート0.5］'] },
      { jobId: 'j2', jobName: '台', parts: ['天板（H）［シート0.5］'] },
    ])
  })
})
