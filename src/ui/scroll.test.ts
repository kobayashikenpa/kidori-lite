import { describe, expect, it } from 'vitest'
import { revealDelta, visibleRange } from './scroll'

describe('入力している行を見せるスクロール（第2.2版。仕様書 26.4）', () => {
  it('見えている範囲は、上に止めたタブ・式の欄の下から、キーボード（見えている範囲の下）かアプリのキーの上まで', () => {
    // 画面 667px・キーボードで 360px に狭くなった・タブと式の欄の下の端 180px
    expect(visibleRange({ offsetTop: 0, height: 360 }, 180, null)).toEqual({ top: 180, bottom: 360 })
    // アプリのキーが上にあれば、キーの上まで
    expect(visibleRange({ offsetTop: 0, height: 667 }, 180, 420)).toEqual({ top: 180, bottom: 420 })
    // iPhone：見えている範囲が下にずれて、止めたタブが上に隠れているとき
    expect(visibleRange({ offsetTop: 250, height: 360 }, 180, null)).toEqual({ top: 250, bottom: 610 })
  })

  it('キーボードに隠れる行は、見えている範囲の下の端（余白つき）まで上げる', () => {
    expect(revealDelta({ top: 500, bottom: 546 }, { top: 180, bottom: 360 }, 8)).toBe(194)
  })

  it('止めたタブ・式の欄の下に隠れる行は、その下まで下げる', () => {
    expect(revealDelta({ top: 150, bottom: 196 }, { top: 180, bottom: 360 }, 8)).toBe(-38)
  })

  it('見えていれば動かさない（1px 未満も動かさない）', () => {
    expect(revealDelta({ top: 200, bottom: 246 }, { top: 180, bottom: 360 }, 8)).toBe(0)
    expect(revealDelta({ top: 200, bottom: 352.5 }, { top: 180, bottom: 360 }, 8)).toBe(0)
  })

  it('範囲より高い行は、頭が見えるように上に合わせる', () => {
    expect(revealDelta({ top: 100, bottom: 400 }, { top: 180, bottom: 300 }, 8)).toBe(-88)
  })
})
