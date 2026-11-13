// 寸法の計算（仕上がり・木取り）。kidori の dimensions/finished.test.ts・index.test.ts をもとに、
// 見本を仕様書 6章の棚に、軸を W・H に、木取り寸法を「仕上がり ＋ 切り代（W・H に1回ずつ）」にしたもの
import { describe, expect, it } from 'vitest'
import { legacyShelfJob, MELAMINE_ID, shelfAdjusts, shelfJob, thickShelfJob } from '../fixtures/shelf'
import { packJob } from '../packing'
import type { Adjust, Axis, Job, Part } from '../types'
import { computeDimensions } from './index'

function mkPart(name: string, expr: Partial<Record<Axis, string>>, extra: Partial<Part> = {}): Part {
  return {
    id: `id-${name}`,
    name,
    expr: { W: '100', H: '100', ...expr },
    adjust: { W: '', H: '' },
    thickness: null,
    quantity: 1,
    rotatable: false,
    finishedDone: false,
    ...extra,
  }
}

function withParts(...extra: Part[]): Job {
  const job = shelfJob()
  job.parts.push(...extra)
  return job
}

function dimsOf(job: Job, name: string, adjusts: Adjust[] = shelfAdjusts()) {
  return computeDimensions(job, adjusts).parts.find((p) => p.name === name)!
}

describe('computeDimensions：見本（docs/tasks.md の表。切り代 10）', () => {
  it('仕上がり：全体 400×1800、天板 400×1800、側板 400×700、棚板 380×1760（棚板 W の −メラミン1 は調整。仕様書 25.4）', () => {
    const job = shelfJob()
    expect(dimsOf(job, '全体').finished).toEqual({ W: 400, H: 1800 })
    expect(dimsOf(job, '天板').finished).toEqual({ W: 400, H: 1800 })
    expect(dimsOf(job, '側板').finished).toEqual({ W: 400, H: 700 })
    expect(dimsOf(job, '棚板').finished).toEqual({ W: 380, H: 1760 })
  })

  it('木取り：天板 410×1810、側板 410×710、棚板 389×1770', () => {
    const job = shelfJob()
    expect(dimsOf(job, '天板').cut).toEqual({ W: 410, H: 1810 })
    expect(dimsOf(job, '側板').cut).toEqual({ W: 410, H: 710 })
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 389, H: 1770 })
  })

  it('枚数・名前・id を部材の並び順で返す。見本はエラーなし', () => {
    const job = shelfJob()
    const r = computeDimensions(job, shelfAdjusts())
    expect(r.parts.map((p) => [p.partId, p.name, p.quantity])).toEqual(job.parts.map((p) => [p.id, p.name, p.quantity]))
    expect(r.errors).toEqual([])
    for (const p of r.parts) expect(p.errors).toEqual([])
  })

  it('枚数0の全体も寸法は出す（木取りの値も持つ。切らないかどうかは枚数で決める）', () => {
    const d = dimsOf(shelfJob(), '全体')
    expect(d.quantity).toBe(0)
    expect(d.cut).toEqual({ W: 410, H: 1810 })
  })
})

describe('木取り寸法 ＝ 調整後 ＋ 切り代（調整の無い部材は 仕上がり ＋ 切り代）', () => {
  it('切り代を 5 にすると棚板の木取りは 384×1765（仕上がりは変わらない）', () => {
    const job = shelfJob()
    job.settings.allowance = 5
    const d = dimsOf(job, '棚板')
    expect(d.finished).toEqual({ W: 380, H: 1760 })
    expect(d.cut).toEqual({ W: 384, H: 1765 })
  })

  it('仕様書 5.1 の例：切り代 10、仕上がり W900×H300 → 木取り W910×H310', () => {
    const job = withParts(mkPart('X', { W: '900', H: '300' }))
    expect(dimsOf(job, 'X').cut).toEqual({ W: 910, H: 310 })
  })

  it('切り代 0 なら木取り ＝ 調整後（棚板 W は 380 − 1）', () => {
    const job = shelfJob()
    job.settings.allowance = 0
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 379, H: 1760 })
  })

  it('式の参照はいつも仕上がり寸法：棚受けの W は棚板の仕上がり 380（調整後 379・木取り 389 ではない）、H は天板の仕上がり 1800', () => {
    const job = withParts(mkPart('棚受け', { W: '棚板.W', H: '天板.H' }))
    const d = dimsOf(job, '棚受け')
    expect(d.finished).toEqual({ W: 380, H: 1800 })
    // 切り代は1回だけ足す（参照先の切り代・調整は重ならない）
    expect(d.cut).toEqual({ W: 390, H: 1810 })
  })

  it('小数の切り代も足す（0.5）', () => {
    const job = shelfJob()
    job.settings.allowance = 0.5
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 379.5, H: 1760.5 })
  })
})

describe('仕上がりの式と調整寸法（第2.1版。仕様書 25.4：仕上がりの式では調整寸法を使えない）', () => {
  it('仕上がりの式に調整寸法があればエラー「仕上がりの式では調整寸法は使えません」（syntax・field: finished）', () => {
    const d = dimsOf(legacyShelfJob(), '棚板')
    expect(d.errors).toEqual([
      { partId: 'part-tanaita', axis: 'W', field: 'finished', kind: 'syntax', message: '仕上がりの式では調整寸法は使えません' },
    ])
    expect(d.finished).toBeNull()
    expect(d.finishedByAxis).toEqual({ H: 1760 })
    expect(d.cut).toBeNull()
  })

  it('削除した調整寸法でも同じエラー。その寸法を参照する部材にも伝わる（元のエラーを from で示す）', () => {
    const job = withParts(mkPart('前板', { W: '400 - {n:gone}' }), mkPart('裏板', { W: '前板.W' }))
    expect(dimsOf(job, '前板').errors[0]).toMatchObject({ kind: 'syntax', message: '仕上がりの式では調整寸法は使えません' })
    expect(dimsOf(job, '裏板').errors[0]).toMatchObject({ kind: 'syntax', from: { partId: 'id-前板', axis: 'W' } })
    expect(dimsOf(job, '裏板').errors[0].message).toContain('前板.W')
  })

  it('仕上がりの式で調整寸法を使えないのは、調整寸法の一覧にあってもなくても同じ', () => {
    for (const adjusts of [shelfAdjusts(), []]) {
      const d = dimsOf(withParts(mkPart('X', { W: `1 + {n:${MELAMINE_ID}}` })), 'X', adjusts)
      expect(d.errors[0]).toMatchObject({ axis: 'W', field: 'finished', kind: 'syntax' })
    }
  })

  it('入れている途中の式（全体.W -）は syntax に incomplete が付く。参照している寸法に伝わったエラーには付けない（第1.4版）', () => {
    const job = withParts(mkPart('前板', { W: '全体.W -' }), mkPart('裏板', { W: '前板.W' }))
    const d = dimsOf(job, '前板')
    expect(d.errors).toEqual([
      {
        partId: 'id-前板',
        axis: 'W',
        field: 'finished',
        kind: 'syntax',
        message: '式が「−」で終わっています（後ろに数値か部材の寸法を入れてください）',
        incomplete: true,
      },
    ])
    expect(d.finishedByAxis).toEqual({ H: 100 })
    const back = dimsOf(job, '裏板').errors[0]
    expect(back).toMatchObject({ kind: 'syntax', from: { partId: 'id-前板', axis: 'W' } })
    expect(back.incomplete).toBeUndefined()
    expect(back.message).toBe('参照している「前板.W」が計算できません（式が「−」で終わっています（後ろに数値か部材の寸法を入れてください））')
  })

  it('記号が抜けている式のエラーの文は、調整寸法を表示名（メラミン1）で出す。途中の印は付かない（第1.4版）', () => {
    const job = withParts(mkPart('前板', { W: `全体.W {n:${MELAMINE_ID}}`, H: '全体.W 0' }))
    const d = dimsOf(job, '前板')
    expect(d.errors.map((e) => [e.axis, e.message, e.incomplete])).toEqual([
      ['W', '「全体.W」と「メラミン1」の間に ＋ − × ÷ のどれかを入れてください', undefined],
      ['H', '「全体.W」と「0」の間に ＋ − × ÷ のどれかを入れてください', undefined],
    ])
  })

  it('空の W は途中の印つきのエラー（数値か式を入れてください）', () => {
    const d = dimsOf(withParts(mkPart('前板', { W: '' })), '前板')
    expect(d.errors[0]).toMatchObject({ kind: 'syntax', message: '数値か式を入れてください', incomplete: true })
  })
})

describe('エラー', () => {
  it('全体.H - 2000 は nonPositive（計算結果を示す）。木取り寸法も出さない', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '全体.H - 2000' })), 'X')
    expect(d.finished).toBeNull()
    expect(d.cut).toBeNull()
    expect(d.errors).toHaveLength(1)
    expect(d.errors[0]).toMatchObject({ partId: 'id-X', axis: 'W', kind: 'nonPositive' })
    expect(d.errors[0].message).toContain('（−200）')
  })

  it('エラーの無い軸の値は軸ごとの値（finishedByAxis・cutByAxis）で出す（式の隣に出す値。仕様書 5.2）', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '全体.H - 2000', H: '300' })), 'X')
    expect(d.finished).toBeNull()
    expect(d.finishedByAxis).toEqual({ H: 300 })
    expect(d.cutByAxis).toEqual({ H: 310 })
    const ok = dimsOf(shelfJob(), '棚板')
    expect(ok.finishedByAxis).toEqual({ W: 380, H: 1760 })
    expect(ok.cutByAxis).toEqual({ W: 389, H: 1770 })
  })

  it('ちょうど 0 も nonPositive', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '全体.H - 1800' })), 'X')
    expect(d.errors[0]).toMatchObject({ kind: 'nonPositive' })
  })

  it('切り代を足せば正になっても、仕上がりが 0 以下なら nonPositive（0 − ... ＋ 10 にしない）', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '5 - 5' })), 'X')
    expect(d.errors[0]).toMatchObject({ kind: 'nonPositive' })
    expect(d.cut).toBeNull()
  })

  it('浮動小数の誤差で 0 以下の判定がずれない（0.3 − 0.1 − 0.2 は 0 として nonPositive）', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '0.3 - 0.1 - 0.2' })), 'X')
    expect(d.errors[0]).toMatchObject({ kind: 'nonPositive' })
  })

  it('0.1 のように小さくても正なら計算する', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '0.1' })), 'X')
    expect(d.errors).toEqual([])
    expect(d.finished?.W).toBeCloseTo(0.1)
    expect(d.cut?.W).toBeCloseTo(10.1)
  })

  it('0 除算は divideByZero', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '全体.W / (側板.H - 700)' })), 'X')
    expect(d.errors[0]).toMatchObject({ axis: 'W', kind: 'divideByZero' })
  })

  it('読めない式は syntax', () => {
    const d = dimsOf(withParts(mkPart('X', { H: '10 +' })), 'X')
    expect(d.errors[0]).toMatchObject({ axis: 'H', kind: 'syntax' })
    expect(d.finished).toBeNull()
  })

  it('存在しない部材は unknownRef、循環参照は cycle', () => {
    const job = withParts(mkPart('A', { W: '地板.W' }), mkPart('B', { W: 'C.W' }), mkPart('C', { W: 'B.W' }))
    expect(dimsOf(job, 'A').errors[0]).toMatchObject({ kind: 'unknownRef', refs: ['地板'] })
    expect(dimsOf(job, 'B').errors[0]).toMatchObject({ kind: 'cycle' })
    expect(dimsOf(job, 'C').errors[0]).toMatchObject({ kind: 'cycle' })
    for (const n of ['A', 'B', 'C']) {
      expect(dimsOf(job, n).finished).toBeNull()
      expect(dimsOf(job, n).cut).toBeNull()
    }
  })

  it('天板.D（D は無い寸法）はエラー', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '天板.D' })), 'X')
    expect(d.errors).toHaveLength(1)
    expect(d.finished).toBeNull()
  })

  it('エラーのある寸法を参照している寸法も計算しない（2段先でも元のエラーの寸法を指す）', () => {
    const job = withParts(mkPart('X', { W: '全体.H - 2000' }), mkPart('Y', { W: 'X.W + 10' }), mkPart('Z', { H: 'Y.W' }))
    const y = dimsOf(job, 'Y')
    expect(y.finished).toBeNull()
    expect(y.errors[0]).toMatchObject({ partId: 'id-Y', axis: 'W', kind: 'nonPositive', from: { partId: 'id-X', axis: 'W' } })
    expect(y.errors[0].message).toContain('X.W')
    const z = dimsOf(job, 'Z')
    expect(z.errors[0]).toMatchObject({ partId: 'id-Z', axis: 'H', from: { partId: 'id-X', axis: 'W' } })
  })

  it('循環参照・存在しない部材を参照している部材も計算しない', () => {
    const job = withParts(
      mkPart('B', { W: 'C.W' }),
      mkPart('C', { W: 'B.W' }),
      mkPart('D', { W: 'B.W' }),
      mkPart('E', { H: '地板.H' }),
      mkPart('F', { H: 'E.H' }),
    )
    const d = dimsOf(job, 'D')
    expect(d.finished).toBeNull()
    expect(d.errors[0]).toMatchObject({ kind: 'cycle', from: { partId: 'id-B', axis: 'W' } })
    const f = dimsOf(job, 'F')
    expect(f.finished).toBeNull()
    expect(f.errors[0]).toMatchObject({ kind: 'unknownRef', refs: ['地板'], from: { partId: 'id-E', axis: 'H' } })
  })

  it('全部材のエラーを errors にまとめる（部材の並び順 → W・H の順）', () => {
    const job = withParts(mkPart('X', { W: '0', H: '0' }), mkPart('Y', { H: '地板.H' }))
    const r = computeDimensions(job, shelfAdjusts())
    expect(r.errors.map((e) => [e.partId, e.axis, e.kind])).toEqual([
      ['id-X', 'W', 'nonPositive'],
      ['id-X', 'H', 'nonPositive'],
      ['id-Y', 'H', 'unknownRef'],
    ])
  })

  it('参照先のエラーを直すと、参照している部材も計算される', () => {
    const job = withParts(mkPart('X', { W: '全体.H - 2000' }), mkPart('Y', { W: 'X.W + 10' }))
    expect(dimsOf(job, 'Y').finished).toBeNull()
    job.parts.find((p) => p.name === 'X')!.expr.W = '全体.H - 1000'
    expect(dimsOf(job, 'Y').finished).toEqual({ W: 810, H: 100 })
  })
})

describe('参照の追従', () => {
  it('参照先の寸法を変えると、参照している部材も変わる（全体 H 1800 → 1500 で天板 1500、棚板 1460）', () => {
    const job = shelfJob()
    job.parts[0].expr.H = '1500'
    expect(dimsOf(job, '天板').finished).toEqual({ W: 400, H: 1500 })
    expect(dimsOf(job, '棚板').finished).toEqual({ W: 380, H: 1460 })
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 389, H: 1470 })
  })

  it('全角で書いた参照も、全角の名前の部材も計算できる', () => {
    const job = withParts(mkPart('棚板１', { W: '（全体．Ｈ − ２００）÷２' }), mkPart('Y', { W: '棚板１.W × 2' }))
    expect(dimsOf(job, '棚板１').finished?.W).toBe(800)
    expect(dimsOf(job, 'Y').finished?.W).toBe(1600)
  })

  it('小数の計算も、丸め誤差なく参照先に渡る', () => {
    const job = withParts(mkPart('X', { W: '100 / 3' }), mkPart('Y', { W: 'X.W * 3' }))
    expect(dimsOf(job, 'Y').finished?.W).toBeCloseTo(100)
  })

  it('自分の別の軸を参照できる（W = A.H）', () => {
    const job = withParts(mkPart('A', { W: 'A.H', H: '300' }))
    expect(dimsOf(job, 'A').finished).toEqual({ W: 300, H: 300 })
  })

  it('同じ軸に戻るのは循環参照。循環に関係しない軸は計算できるが、部材としては寸法を出さない', () => {
    const job = withParts(mkPart('P', { W: 'Q.W', H: '300' }), mkPart('Q', { W: 'P.W' }, { quantity: 0 }))
    const p = dimsOf(job, 'P')
    expect(p.errors.map((e) => [e.axis, e.kind])).toEqual([['W', 'cycle']])
    expect(p.finished).toBeNull()
  })
})

describe('厚みを式で使う（天板.T。第2.2版 仕様書 26.1）', () => {
  it('見本：側板の H ＝ 全体.H − 天板.T × 2 は仕上がり 1764・木取り 1774', () => {
    const d = dimsOf(thickShelfJob(), '側板')
    expect(d.errors).toEqual([])
    expect(d.finished).toEqual({ W: 400, H: 1764 })
    expect(d.adjusted).toEqual({ W: 400, H: 1764 })
    expect(d.cut).toEqual({ W: 410, H: 1774 })
  })

  it('天板の厚みを 20 にすると 1760、2.5 にすると 1795', () => {
    const job = thickShelfJob()
    job.parts[1] = { ...job.parts[1], thickness: 20 }
    expect(dimsOf(job, '側板').finished?.H).toBe(1760)
    job.parts[1] = { ...job.parts[1], thickness: 2.5 }
    expect(dimsOf(job, '側板').finished?.H).toBe(1795)
  })

  it('天板の厚みを空にすると、側板の H が「天板 の厚みが入っていません」のエラーで木取りから外れる', () => {
    const job = thickShelfJob()
    job.parts[1] = { ...job.parts[1], thickness: null }
    const dims = computeDimensions(job, shelfAdjusts())
    const d = dims.parts[2]
    expect(d.errors).toEqual([
      { partId: 'part-gawaita', axis: 'H', field: 'finished', kind: 'noThickness', message: '天板 の厚みが入っていません', refs: ['天板'] },
    ])
    expect(d.finishedByAxis).toEqual({ W: 400 })
    expect(d.cut).toBeNull()
    expect(packJob(job, dims).skipped).toEqual([{ partId: 'part-gawaita', name: '側板', reason: 'dimensionError' }])
  })

  it('側板の H を参照している式にもエラーが伝わる', () => {
    const job = thickShelfJob()
    job.parts[1] = { ...job.parts[1], thickness: null }
    job.parts.push(mkPart('幕板', { H: '側板.H' }))
    const d = dimsOf(job, '幕板')
    expect(d.errors[0]).toMatchObject({ kind: 'noThickness', from: { partId: 'part-gawaita', axis: 'H' } })
    expect(d.errors[0].message).toBe('参照している「側板.H」が計算できません（天板 の厚みが入っていません）')
  })

  it('全角の 全体．Ｈ − 天板．Ｔ × ２ も読める', () => {
    const job = thickShelfJob()
    job.parts[2] = { ...job.parts[2], expr: { W: '全体.W', H: '全体．Ｈ − 天板．Ｔ × ２' } }
    expect(dimsOf(job, '側板').finished?.H).toBe(1764)
  })

  it('厚みは天板の W・H のエラーと関係なく使える（厚みは数字）', () => {
    const job = thickShelfJob()
    job.parts[1] = { ...job.parts[1], expr: { W: '無い.W', H: '全体.H' } }
    expect(dimsOf(job, '側板').finished?.H).toBe(1764)
  })

  it('存在しない部材の .T は「「地板」という部材はありません」', () => {
    const job = withParts(mkPart('幕板', { W: '地板.T × 10' }))
    expect(dimsOf(job, '幕板').errors).toEqual([
      { partId: 'id-幕板', axis: 'W', field: 'finished', kind: 'unknownRef', message: '「地板」という部材はありません', refs: ['地板'] },
    ])
  })

  it('調整に 天板.T を書くと「調整には部材の寸法は使えません」（調整の欄のエラー）', () => {
    const job = thickShelfJob()
    job.parts[3] = { ...job.parts[3], adjust: { W: '-天板.T', H: '' } }
    const d = dimsOf(job, '棚板')
    expect(d.errors).toEqual([{ partId: 'part-tanaita', axis: 'W', field: 'adjust', kind: 'syntax', message: '調整には部材の寸法は使えません' }])
  })

  it('厚みは木取り寸法・板の並べ方に足さない（厚みのある部材の寸法は今までどおり）', () => {
    const job = shelfJob()
    job.parts[3] = { ...job.parts[3], thickness: 18 }
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 389, H: 1770 })
    const a = packJob(shelfJob(), computeDimensions(shelfJob(), shelfAdjusts()))
    const b = packJob(job, computeDimensions(job, shelfAdjusts()))
    expect(b.sheets.map((s) => s.placements.map((p) => [p.x, p.y, p.w, p.h]))).toEqual(a.sheets.map((s) => s.placements.map((p) => [p.x, p.y, p.w, p.h])))
  })
})

describe('同じ名前の部材（第2.2版 仕様書 26.6）', () => {
  /** 見本の棚に、もう1つ「棚板」（W 300×H 500・2枚）を足したもの */
  function twoShelves(): Job {
    return withParts(mkPart('棚板', { W: '300', H: '500' }, { id: 'id-棚板2', quantity: 2 }))
  }

  it('棚板.W を使う式が「棚板 が2つあります」のエラーになり、木取りから外れる', () => {
    const job = twoShelves()
    job.parts.push(mkPart('幕板', { W: '棚板.W', H: '100' }))
    const dims = computeDimensions(job, shelfAdjusts())
    const d = dims.parts.find((p) => p.name === '幕板')!
    expect(d.errors).toEqual([{ partId: 'id-幕板', axis: 'W', field: 'finished', kind: 'ambiguousRef', message: '棚板 が2つあります', refs: ['棚板'] }])
    expect(d.cut).toBeNull()
    expect(packJob(job, dims).skipped.map((s) => s.name)).toEqual(['幕板'])
  })

  it('2つの棚板はどちらも寸法を計算し、木取りに入る', () => {
    const job = twoShelves()
    const dims = computeDimensions(job, shelfAdjusts())
    const shelves = dims.parts.filter((p) => p.name === '棚板')
    expect(shelves.map((p) => [p.finished, p.cut])).toEqual([
      [{ W: 380, H: 1760 }, { W: 389, H: 1770 }],
      [{ W: 300, H: 500 }, { W: 310, H: 510 }],
    ])
    const placed = packJob(job, dims).sheets.flatMap((s) => s.placements.map((p) => p.partId))
    expect(placed.filter((id) => id === 'part-tanaita')).toHaveLength(3)
    expect(placed.filter((id) => id === 'id-棚板2')).toHaveLength(2)
  })

  it('片方の名前を変えるとエラーが消え、残った棚板を指す', () => {
    const job = twoShelves()
    job.parts.push(mkPart('幕板', { W: '棚板.W', H: '100' }))
    job.parts[4] = { ...job.parts[4], name: '棚板2' }
    const d = dimsOf(job, '幕板')
    expect(d.errors).toEqual([])
    expect(d.finished?.W).toBe(380)
  })
})
