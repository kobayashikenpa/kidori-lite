// kidori の dimensions/resolve.test.ts をもとに、見本を仕様書 6章の棚（全体・天板・側板・棚板）に、軸を W・H にしたもの
import { describe, expect, it } from 'vitest'
import { shelfJob, thickShelfJob } from '../fixtures/shelf'
import type { Axis, Part } from '../types'
import { partsReferencing, resolve } from './resolve'

function mkPart(name: string, expr: Partial<Record<Axis, string>>, thickness: number | null = null): Part {
  return {
    id: `id-${name}`,
    name,
    expr: { W: '100', H: '100', ...expr },
    adjust: { W: '', H: '' },
    thickness,
    quantity: 1,
    rotatable: false,
    finishedDone: false,
  }
}

describe('resolve（参照の依存関係）', () => {
  it('見本の計算順：全体が天板より先、天板が棚板より先、全体.W が側板.W より先', () => {
    const job = shelfJob()
    const r = resolve(job.parts)
    expect(r.errors).toEqual([])
    const idOf = (name: string) => job.parts.find((p) => p.name === name)!.id
    const at = (name: string, axis: Axis) => r.order.findIndex((n) => n.partId === idOf(name) && n.axis === axis)
    for (const axis of ['W', 'H'] as const) {
      expect(at('全体', axis)).toBeLessThan(at('天板', axis))
      expect(at('天板', axis)).toBeLessThan(at('棚板', axis))
    }
    expect(at('全体', 'W')).toBeLessThan(at('側板', 'W'))
  })

  it('計算順にはすべての寸法が1回ずつ入る（4部材 × W・H ＝ 8）', () => {
    const r = resolve(shelfJob().parts)
    expect(r.order).toHaveLength(8)
    expect(new Set(r.order.map((n) => `${n.partId}:${n.axis}`)).size).toBe(8)
  })

  it('天板.W を参照して天板が無いと unknownRef（部材名「天板」を示す）', () => {
    const r = resolve([mkPart('棚板', { W: '天板.W - 36' })])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ partId: 'id-棚板', axis: 'W', kind: 'unknownRef', refs: ['天板'] })
    expect(r.errors[0].message).toContain('天板')
  })

  it('存在しない部材を2つ参照すると、両方の名前を示す', () => {
    const r = resolve([mkPart('棚板', { W: '天板.W - 地板.W' })])
    expect(r.errors[0]).toMatchObject({ kind: 'unknownRef', refs: ['天板', '地板'] })
  })

  it('A.W=B.W・B.W=A.W は cycle（両方の寸法に、関係する部材名を示す）', () => {
    const r = resolve([mkPart('A', { W: 'B.W' }), mkPart('B', { W: 'A.W' })])
    const cycles = r.errors.filter((e) => e.kind === 'cycle')
    expect(cycles.map((e) => [e.partId, e.axis])).toEqual([
      ['id-A', 'W'],
      ['id-B', 'W'],
    ])
    for (const e of cycles) {
      expect([...(e.refs ?? [])].sort()).toEqual(['A', 'B'])
      expect(e.message).toContain('循環参照')
    }
  })

  it('自分自身の参照（A.W=A.W）は cycle', () => {
    const r = resolve([mkPart('A', { W: 'A.W + 1' })])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ partId: 'id-A', axis: 'W', kind: 'cycle', refs: ['A'] })
  })

  it('同じ部材のほかの軸の参照（A.H=A.W）は循環ではない', () => {
    const r = resolve([mkPart('A', { W: '300', H: 'A.W * 2' })])
    expect(r.errors).toEqual([])
    const at = (axis: Axis) => r.order.findIndex((n) => n.axis === axis)
    expect(at('W')).toBeLessThan(at('H'))
  })

  it('3つの部材の循環（A→B→C→A）も見つける。循環を参照しているだけの寸法は cycle にしない', () => {
    const r = resolve([
      mkPart('A', { W: 'B.W' }),
      mkPart('B', { W: 'C.W' }),
      mkPart('C', { W: 'A.W' }),
      mkPart('D', { W: 'A.W' }),
    ])
    const cycles = r.errors.filter((e) => e.kind === 'cycle')
    expect(cycles.map((e) => e.partId)).toEqual(['id-A', 'id-B', 'id-C'])
    expect(cycles[0].message).toContain('A.W → B.W → C.W → A.W')
  })

  it('読めない式は syntax エラー', () => {
    const r = resolve([mkPart('A', { W: '10 +' })])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ partId: 'id-A', axis: 'W', kind: 'syntax' })
  })

  it('参照先より後ろに並んだ部材でも、計算順は参照先が先', () => {
    const r = resolve([mkPart('棚板', { W: '全体.W - 36' }), mkPart('全体', { W: '900' })])
    const at = (id: string) => r.order.findIndex((n) => n.partId === id && n.axis === 'W')
    expect(at('id-全体')).toBeLessThan(at('id-棚板'))
  })

  it('仕上がりの式の調整寸法 {n:id} はエラー（第2.1版。仕様書 25.4）。部材の参照にはならない（依存関係に入らない）', () => {
    const r = resolve([mkPart('A', { W: '100 - {n:adjust-melamine}' })])
    expect(r.errors).toEqual([{ partId: 'id-A', axis: 'W', field: 'finished', kind: 'syntax', message: '仕上がりの式では調整寸法は使えません' }])
    expect(r.nodes.get('id-A:W')!.deps).toEqual([])
  })
})

describe('全角・半角の違う部材名', () => {
  it('式の「棚板１．Ｗ」は部材「棚板１」を指す', () => {
    const r = resolve([mkPart('棚板１', { W: '300' }), mkPart('X', { W: '棚板１．Ｗ + 1' })])
    expect(r.errors).toEqual([])
    expect(r.nodes.get('id-X:W')!.deps).toEqual([{ partId: 'id-棚板１', axis: 'W' }])
  })
})

describe('partsReferencing：その部材の寸法を式で使っている、ほかの部材（部材の削除の確認に使う）', () => {
  it('天板を使っているのは棚板（W・H）。全体を使っているのは天板（W・H）・側板（W）', () => {
    const parts = shelfJob().parts
    expect(partsReferencing(parts, 'part-tenita')).toEqual([{ partId: 'part-tanaita', name: '棚板', axes: ['W', 'H'] }])
    expect(partsReferencing(parts, 'part-zentai')).toEqual([
      { partId: 'part-tenita', name: '天板', axes: ['W', 'H'] },
      { partId: 'part-gawaita', name: '側板', axes: ['W'] },
    ])
  })
  it('だれも使っていなければ空。自分自身の参照は数えない', () => {
    const parts = shelfJob().parts
    expect(partsReferencing(parts, 'part-tanaita')).toEqual([])
    expect(partsReferencing([mkPart('A', { W: 'A.H', H: '1' })], 'id-A')).toEqual([])
  })
})

describe('厚みの参照（部材名.T。第2.2版 仕様書 26.1）', () => {
  it('天板.T は計算順・循環の辿りに入らない（厚みは式ではなく数字）', () => {
    const r = resolve(thickShelfJob().parts)
    expect(r.errors).toEqual([])
    expect(r.nodes.get('part-gawaita:H')!.deps).toEqual([{ partId: 'part-zentai', axis: 'H' }])
    expect(r.nodes.get('part-gawaita:H')!.thicknessDeps).toEqual(['part-tenita'])
    expect(r.order).toHaveLength(8)
  })

  it('自分の厚みを使う式（A.H ＝ A.T × 2）は循環ではない', () => {
    const r = resolve([mkPart('A', { H: 'A.T × 2' }, 9)])
    expect(r.errors).toEqual([])
  })

  it('厚みが空の部材の .T は noThickness「天板 の厚みが入っていません」（部材名を示す）', () => {
    const parts = thickShelfJob().parts
    parts[1] = { ...parts[1], thickness: null }
    expect(resolve(parts).errors).toEqual([
      { partId: 'part-gawaita', axis: 'H', field: 'finished', kind: 'noThickness', message: '天板 の厚みが入っていません', refs: ['天板'] },
    ])
  })

  it('存在しない部材の .T は今までどおり unknownRef「「天板」という部材はありません」', () => {
    const r = resolve([mkPart('X', { W: '天板.T + 1' })])
    expect(r.errors).toEqual([
      { partId: 'id-X', axis: 'W', field: 'finished', kind: 'unknownRef', message: '「天板」という部材はありません', refs: ['天板'] },
    ])
  })

  it('天板を消す前の確認：厚みを使っている側板も「使っている」に入る', () => {
    expect(partsReferencing(thickShelfJob().parts, 'part-tenita')).toEqual([
      { partId: 'part-gawaita', name: '側板', axes: ['H'] },
      { partId: 'part-tanaita', name: '棚板', axes: ['W', 'H'] },
    ])
  })
})
