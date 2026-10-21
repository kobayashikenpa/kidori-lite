import { describe, expect, it } from 'vitest'
import { pressKey } from './numpad'

describe('数字キー', () => {
  it('数字を足す。開いた直後は入れ替え', () => {
    expect(pressKey('12', '3', false, false)).toBe('123')
    expect(pressKey('12', '3', true, false)).toBe('3')
  })
  it('0 の次の数字は入れ替え、小数点は1つだけ', () => {
    expect(pressKey('0', '5', false, false)).toBe('5')
    expect(pressKey('', '.', false, false)).toBe('0.')
    expect(pressKey('1.5', '.', false, false)).toBe('1.5')
  })
  it('整数の欄では小数点が入らない', () => {
    expect(pressKey('3', '.', false, true)).toBe('3')
  })
  it('1字消す・全部消す', () => {
    expect(pressKey('123', 'back', false, false)).toBe('12')
    expect(pressKey('123', 'clear', false, false)).toBe('')
  })
  it('8桁まで', () => {
    expect(pressKey('12345678', '9', false, false)).toBe('12345678')
  })
})
