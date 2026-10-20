import { describe, expect, it } from 'vitest'
import { eq1, exactText, round1 } from './round'

describe('round1・eq1（小数第1位に丸めて比べる）', () => {
  it('小数第1位に丸める', () => {
    expect(round1(12.34)).toBe(12.3)
    expect(round1(12.35)).toBe(12.4)
    expect(round1(0.1 + 0.2)).toBe(0.3)
  })
  it('浮動小数の誤差があっても同じ値とみなす', () => {
    expect(eq1(0.1 + 0.2, 0.3)).toBe(true)
    expect(eq1(18, 18.04)).toBe(true)
    expect(eq1(18, 18.1)).toBe(false)
  })
})

describe('exactText（丸めずに文字にする。浮動小数の誤差だけ消す）', () => {
  it('0.25 は 0.25 のまま、0.1 + 0.2 は 0.3、整数は .0 を付けない', () => {
    expect(exactText(0.25)).toBe('0.25')
    expect(exactText(0.1 + 0.2)).toBe('0.3')
    expect(exactText(15)).toBe('15')
  })
})

describe('round1（現場で起こりそうな値）', () => {
  it('切り代を足した値の誤差を消す（900.1 + 10 = 910.1）', () => {
    expect(round1(900.1 + 10)).toBe(910.1)
    expect(eq1(900.1 + 10, 910.1)).toBe(true)
  })
  it('1mm 違えば別の値（ぴったりと 1mm 足りないを取り違えない）', () => {
    expect(eq1(1210, 1209)).toBe(false)
    expect(eq1(1210, 1209.96)).toBe(true)
  })
})
