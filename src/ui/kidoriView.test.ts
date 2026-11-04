import { describe, expect, it } from 'vitest'
import { pct, scrapLabel } from './kidoriView'

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
})
