import { describe, expect, it } from 'vitest'
import {
  adjustName,
  adjustNameKey,
  createJob,
  defaultAdjusts,
  defaultAppData,
  defaultSettings,
  customSheet,
  defaultSheet,
  normalizeSheet,
} from './defaults'

function idMaker() {
  let n = 0
  const prefixes: string[] = []
  const newId = (prefix: string) => {
    prefixes.push(prefix)
    return `${prefix}-${++n}`
  }
  return { newId, prefixes }
}

describe('defaultSheet（新しい仕事の板）', () => {
  it('4×8（1220×2430）', () => {
    expect(defaultSheet()).toEqual({ sizeKind: 'shihachi', width: 1220, length: 2430 })
  })
  it('呼ぶたびに別のオブジェクト', () => {
    const a = defaultSheet()
    a.width = 1
    expect(defaultSheet().width).toBe(1220)
  })
})

describe('defaultSettings（新しい仕事の設定）', () => {
  it('4×8（1220×2430）・刃厚3・端切り5・切り代10・縦切り優先', () => {
    expect(defaultSettings()).toEqual({
      sheet: { sizeKind: 'shihachi', width: 1220, length: 2430 },
      kerf: 3,
      trim: 5,
      allowance: 10,
      cutMode: 'vertical',
    })
  })
  it('呼ぶたびに別の板のオブジェクト（仕事どうしで書き換えが漏れない）', () => {
    expect(defaultSettings().sheet).not.toBe(defaultSettings().sheet)
  })
})

describe('defaultAdjusts（初めて開いたときの調整寸法）', () => {
  it('メラミン1・シート0.5 の2つ', () => {
    const { newId } = idMaker()
    const a = defaultAdjusts(newId)
    expect(a.map((x) => [x.name, x.value])).toEqual([
      ['メラミン', 1],
      ['シート', 0.5],
    ])
    expect(a.map(adjustName)).toEqual(['メラミン1', 'シート0.5'])
  })
  it('id は newId("adjust") で作り、別々', () => {
    const { newId, prefixes } = idMaker()
    const a = defaultAdjusts(newId)
    expect(prefixes).toEqual(['adjust', 'adjust'])
    expect(new Set(a.map((x) => x.id)).size).toBe(2)
  })
})

describe('adjustName（調整寸法の表示名＝名前＋寸法）', () => {
  const g = (value: number) => adjustName({ name: '逃げ', value })
  it('mm を付けず、寸法は丸めない（浮動小数の誤差だけ消す）。末尾の .0 は付けない', () => {
    expect(g(1)).toBe('逃げ1')
    expect(g(0.5)).toBe('逃げ0.5')
    expect(g(2.0)).toBe('逃げ2')
    expect(g(0.25)).toBe('逃げ0.25')
    expect(g(0.1 + 0.2)).toBe('逃げ0.3')
  })
  it('名前は登録した名前（ほぞ15）', () => {
    expect(adjustName({ name: 'ほぞ', value: 15 })).toBe('ほぞ15')
  })
})

describe('adjustNameKey（表示名が重なるかの判定）', () => {
  it('名前「逃げ1」寸法5 と 名前「逃げ」寸法15 は、どちらも「逃げ15」で重なる', () => {
    expect(adjustNameKey({ name: '逃げ1', value: 5 })).toBe(adjustNameKey({ name: '逃げ', value: 15 }))
  })
  it('同じ名前でも寸法が違えば別（逃げ0.5 と 逃げ1）', () => {
    expect(adjustNameKey({ name: '逃げ', value: 0.5 })).not.toBe(adjustNameKey({ name: '逃げ', value: 1 }))
  })
  it('同じ寸法でも名前が違えば別（逃げ1 と メラミン1）', () => {
    expect(adjustNameKey({ name: '逃げ', value: 1 })).not.toBe(adjustNameKey({ name: 'メラミン', value: 1 }))
  })
  it('全角・半角の違いと前後の空白は同じとみなす（ほぞ１５ と ほぞ15）', () => {
    expect(adjustNameKey({ name: ' ほぞ１ ', value: 5 })).toBe(adjustNameKey({ name: 'ほぞ', value: 15 }))
    expect(adjustNameKey({ name: 'ＭＤＦ', value: 1 })).toBe(adjustNameKey({ name: 'MDF', value: 1 }))
  })
  it('浮動小数の誤差は同じとみなす（0.1 + 0.2 と 0.3）', () => {
    expect(adjustNameKey({ name: '逃げ', value: 0.1 + 0.2 })).toBe(adjustNameKey({ name: '逃げ', value: 0.3 }))
  })
})

describe('createJob（新しい仕事）', () => {
  it('名前・時刻は引数のまま。初期の設定・部材なし・固定した1枚なし', () => {
    const job = createJob({ id: 'job-1', name: '仕事 10/20', now: '2026-10-20T09:00:00.000Z' })
    expect(job).toEqual({
      id: 'job-1',
      name: '仕事 10/20',
      settings: defaultSettings(),
      parts: [],
      frozenSheets: [],
      createdAt: '2026-10-20T09:00:00.000Z',
      updatedAt: '2026-10-20T09:00:00.000Z',
    })
  })
  it('設定を渡せばそれを使う（仕事のコピー）。渡した設定とは別のオブジェクト', () => {
    const settings = { ...defaultSettings(), allowance: 5, cutMode: 'auto' as const }
    const job = createJob({ id: 'j', name: 'a', now: 't', settings })
    expect(job.settings).toEqual(settings)
    expect(job.settings).not.toBe(settings)
    expect(job.settings.sheet).not.toBe(settings.sheet)
  })
})

describe('defaultAppData（初めて開いたときの保存データ）', () => {
  it('仕事なし・調整寸法は メラミン1・シート0.5・コピーした部材なし', () => {
    const { newId } = idMaker()
    const d = defaultAppData(newId)
    expect(d.version).toBe(1)
    expect(d.jobs).toEqual([])
    expect(d.adjusts.map(adjustName)).toEqual(['メラミン1', 'シート0.5'])
    expect(d.clipboard).toBeNull()
  })
})

describe('normalizeSheet・customSheet（妻手・長手をそろえる）', () => {
  it('逆に入れても小さい方が妻手、大きい方が長手', () => {
    expect(normalizeSheet({ sizeKind: 'custom', width: 2430, length: 1220 })).toEqual({ sizeKind: 'custom', width: 1220, length: 2430 })
    expect(customSheet(1820, 910)).toEqual({ sizeKind: 'custom', width: 910, length: 1820 })
    expect(customSheet(910, 1820)).toEqual({ sizeKind: 'custom', width: 910, length: 1820 })
  })

  it('正方形・そろっている板はそのまま。元の板は書き換えない', () => {
    expect(customSheet(1000, 1000)).toEqual({ sizeKind: 'custom', width: 1000, length: 1000 })
    const s = { sizeKind: 'custom' as const, width: 2430, length: 1220 }
    normalizeSheet(s)
    expect(s.width).toBe(2430)
  })
})
