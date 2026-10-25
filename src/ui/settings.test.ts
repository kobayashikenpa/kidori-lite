import { describe, expect, it } from 'vitest'
import { customSheet } from '../engine/defaults'
import { parseNum } from './format'
import { sheetLabel } from './settings'

describe('板の呼び名', () => {
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
