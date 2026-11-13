import { describe, expect, it } from 'vitest'
import { pct, scrapLabel, skippedErrorPlace, thicknessTag, withThickness } from './kidoriView'

describe('木取りの画面の文字', () => {
  it('歩留まりは小数第1位までの %', () => {
    expect(pct(0.81234)).toBe('81.2%')
    expect(pct(1)).toBe('100%')
    expect(pct(0)).toBe('0%')
  })
  it('端材は W（妻手方向）×H（長手方向）。横長の配置図は入れ替える', () => {
    expect(scrapLabel({ w: 400, h: 1200 }, 'portrait')).toBe('400×1200')
    expect(scrapLabel({ w: 1200, h: 400 }, 'landscape')).toBe('400×1200')
  })
  it('計算から外した部材のエラーは、直すタブと欄を付けて出す', () => {
    expect(skippedErrorPlace({ field: 'adjust', axis: 'W' })).toBe('［調整］の W')
    expect(skippedErrorPlace({ field: 'finished', axis: 'H' })).toBe('［仕上がり］の H')
  })
  it('部材名の横の厚みは「t18」（小数第1位まで）。空なら付けない（第2.2版）', () => {
    expect(thicknessTag(18)).toBe('t18')
    expect(thicknessTag(2.55)).toBe('t2.6')
    expect(thicknessTag(null)).toBe('')
    expect(withThickness('天板', 18)).toBe('天板 t18')
    expect(withThickness('側板', null)).toBe('側板')
    expect(withThickness('#3', undefined)).toBe('#3')
  })
})
