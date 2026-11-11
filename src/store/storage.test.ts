import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { legacyShelfJob, MELAMINE_ID, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import type { AppData } from '../engine/types'
import { BROKEN_KEY_PREFIX, CURRENT_JOB_KEY, DATA_KEY, loadSaved, parseAppData, saveSaved, type KeyValueStorage } from './storage'

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>()
  failWrite = false
  failRead = false
  getItem(key: string) {
    if (this.failRead) throw new Error('read')
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error('quota')
    this.map.set(key, value)
  }
}

const NOW = new Date('2026-10-21T09:00:00.000Z')
const ids = () => {
  let n = 0
  return (p: string) => `${p}-${++n}`
}
const sample = (): AppData => ({ version: 1, jobs: [shelfJob()], adjusts: shelfAdjusts(), cellClip: null, adjustClip: null })

describe('キー', () => {
  it('すべて kidori-lite. で始まる', () => {
    for (const k of [DATA_KEY, CURRENT_JOB_KEY, BROKEN_KEY_PREFIX]) expect(k.startsWith('kidori-lite.')).toBe(true)
    expect(DATA_KEY).toBe('kidori-lite.data.v1')
    expect(CURRENT_JOB_KEY).toBe('kidori-lite.currentJobId')
  })
})

describe('保存と読み込み', () => {
  it('何も無ければ初めの状態（仕事なし・メラミン1・シート0.5）', () => {
    const r = loadSaved(new MemoryStorage(), ids(), NOW)
    expect(r.status).toBe('empty')
    expect(r.data.jobs).toEqual([])
    expect(r.data.adjusts.map((a) => [a.name, a.value])).toEqual([
      ['メラミン', 1],
      ['シート', 0.5],
    ])
    expect(r.canSave).toBe(true)
  })

  it('書いたものを読み戻せる。開いていた仕事も戻る', () => {
    const st = new MemoryStorage()
    expect(saveSaved(st, sample(), 'job-shelf')).toEqual({ ok: true })
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(sample())
    expect(r.currentJobId).toBe('job-shelf')
  })

  it('第1版の保存データ（名前も枚数も入っている）をそのまま読める', () => {
    // 第1版の形のまま文字で書いた保存データ
    const v1 = JSON.stringify({
      version: 1,
      jobs: [
        {
          id: 'job-1',
          name: '本棚',
          settings: { sheet: { sizeKind: 'shihachi', width: 1220, length: 2430 }, kerf: 3, trim: 5, allowance: 10, cutMode: 'vertical' },
          parts: [
            { id: 'p1', name: '全体', expr: { W: '400', H: '1800' }, quantity: 0, rotatable: false, finishedDone: false },
            { id: 'p2', name: '天板', expr: { W: '全体.W', H: '全体.H' }, quantity: 1, rotatable: false, finishedDone: true },
          ],
          frozenSheets: [],
          createdAt: '2026-10-21T00:00:00.000Z',
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
      ],
      adjusts: [{ id: 'a1', name: 'メラミン', value: 1 }],
      clipboard: [{ name: '棚板', expr: { W: '300', H: '400' }, quantity: 2, rotatable: true }],
    })
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, v1)
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    // 第1.1版までの「コピーした部材」（clipboard）は読んで捨て、コピーしたセルは無し（第1.2版）
    const { clipboard: _old, ...rest } = JSON.parse(v1) as { jobs: { parts: object[] }[] } & Record<string, unknown>
    // 部材の調整（第2.1版）は無いので、調整なし（W・H とも空）として読む
    const jobs = rest.jobs.map((j) => ({ ...j, parts: j.parts.map((p) => ({ ...p, adjust: { W: '', H: '' } })) }))
    expect(r.data).toEqual({ ...rest, jobs, cellClip: null, adjustClip: null })
    expect('clipboard' in r.data).toBe(false)
  })

  it('第1.3版までの切り方「おまかせ」（auto）は縦切り優先にして読む（仕様書 18.2）', () => {
    const old = { ...sample(), jobs: [{ ...shelfJob(), settings: { ...shelfJob().settings, cutMode: 'auto' } }, shelfJob('job-h')] }
    old.jobs[1].settings.cutMode = 'horizontal'
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(old))
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data.jobs.map((j) => j.settings.cutMode)).toEqual(['vertical', 'horizontal'])
    expect(r.data.jobs[0]).toEqual({ ...shelfJob(), settings: { ...shelfJob().settings, cutMode: 'vertical' } })
  })

  it('切り方が縦切り優先・横切り優先・おまかせのどれでもなければ読めない', () => {
    const bad = { ...sample(), jobs: [{ ...shelfJob(), settings: { ...shelfJob().settings, cutMode: 'diagonal' } }] }
    expect(parseAppData(JSON.parse(JSON.stringify(bad)))).toBeNull()
  })

  it('第1.1版の保存データ（名前・枚数が空・コピーした部材が空）も読める', () => {
    const data = { ...sample(), clipboard: null } as Record<string, unknown>
    delete data.cellClip
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(data))
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(sample())
  })

  it('コピーしたセル（第1.2版）を保存して読み戻せる。形が違うコピーは捨てて、仕事は読める', () => {
    const data = sample()
    data.cellClip = { rows: 2, cols: 2, cells: [['棚板', '天板.W - 20'], ['', '3']] }
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    expect(loadSaved(st, ids(), NOW).data).toEqual(data)
    for (const bad of [{ rows: 2, cols: 1, cells: [['1']] }, { rows: 1, cols: 5, cells: [['', '', '', '', '']] }, { rows: 1, cols: 1, cells: [[3]] }, 'x']) {
      st.setItem(DATA_KEY, JSON.stringify({ ...data, cellClip: bad }))
      const r = loadSaved(st, ids(), NOW)
      expect(r.status).toBe('ok')
      expect(r.data).toEqual({ ...data, cellClip: null, adjustClip: null })
    }
  })

  it('切り取りの元が付いたコピー（第1.3版）を保存して読み戻せる。第1.2版の形（元なし）も読める', () => {
    const data = sample()
    data.cellClip = { rows: 1, cols: 2, cells: [['棚板', '3']], cut: { jobId: 'job-shelf', range: { top: 3, left: 2, rows: 1, cols: 2 } } }
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    expect(loadSaved(st, ids(), NOW).data).toEqual(data)
    const v12 = { rows: 1, cols: 1, cells: [['天板.W']] }
    st.setItem(DATA_KEY, JSON.stringify({ ...data, cellClip: v12 }))
    expect(loadSaved(st, ids(), NOW).data.cellClip).toEqual(v12)
  })

  it('切り取りの元の形だけが違うときは、元を外してふつうのコピーとして読む', () => {
    const data = sample()
    const clip = { rows: 1, cols: 2, cells: [['棚板', '3']] }
    const st = new MemoryStorage()
    for (const badCut of [
      'x',
      { jobId: 1, range: { top: 0, left: 0, rows: 1, cols: 2 } },
      { jobId: 'job-shelf', range: { top: 0, left: 3, rows: 1, cols: 2 } },
      { jobId: 'job-shelf', range: { top: 0, left: 0, rows: 2, cols: 2 } },
      { jobId: 'job-shelf', range: { top: -1, left: 0, rows: 1, cols: 2 } },
    ]) {
      st.setItem(DATA_KEY, JSON.stringify({ ...data, cellClip: { ...clip, cut: badCut } }))
      const r = loadSaved(st, ids(), NOW)
      expect(r.status).toBe('ok')
      expect(r.data.cellClip).toEqual(clip)
    }
  })

  it('名前が空・枚数が空（null）の部材も保存して読み戻せる（第1.1版）', () => {
    const data = sample()
    data.jobs[0].parts.push(
      { id: 'p5', name: '', expr: { W: '300', H: '400' }, adjust: { W: '', H: '' }, quantity: null, rotatable: false, finishedDone: false },
      { id: 'p6', name: '', expr: { W: '300', H: '400' }, adjust: { W: '-2', H: '' }, quantity: 1, rotatable: false, finishedDone: false },
    )
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(data)
  })

  it('部材の調整の無い第2.0版の保存データは、調整なし（W・H とも空）として読む（第2.1版。仕様書 25.5）', () => {
    const old = JSON.parse(JSON.stringify(sample())) as { jobs: { parts: Record<string, unknown>[] }[] }
    for (const p of old.jobs[0].parts) delete p.adjust
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(old))
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data.jobs[0].parts.every((p) => p.adjust.W === '' && p.adjust.H === '')).toBe(true)
    expect(r.data.jobs[0].parts.map((p) => p.expr)).toEqual(sample().jobs[0].parts.map((p) => p.expr))
  })

  it('部材の調整を保存して読み戻せる（第2.1版）', () => {
    const data = sample()
    data.jobs[0].parts[3] = { ...data.jobs[0].parts[3], adjust: { W: '−{n:adjust-melamine}×2', H: '-1' } }
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    expect(loadSaved(st, ids(), NOW).data).toEqual(data)
  })

  it('第2.0版の保存データの仕上がりの式の調整寸法は、今の寸法の数字に置き換えて読む（仕様書 25.4）。仕上がり寸法は変わらない', () => {
    const old = { ...sample(), jobs: [legacyShelfJob()] }
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(old))
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    const job = r.data.jobs[0]
    expect(job.parts[3].expr.W).toBe('天板.W - 20 - 1')
    const d = computeDimensions(job, shelfAdjusts())
    expect(d.errors).toEqual([])
    expect(d.parts[3].finished).toEqual({ W: 379, H: 1760 })
    expect(d.parts[3].cut).toEqual({ W: 389, H: 1770 })
  })

  it('削除した調整寸法を使っていた仕上がりの式はそのまま（エラーのまま）。調整の欄は置き換えない', () => {
    const old = sample()
    old.jobs[0].parts[2] = { ...old.jobs[0].parts[2], expr: { W: '全体.W - {n:gone}', H: `700 - {n:${MELAMINE_ID}}` } }
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(old))
    const job = loadSaved(st, ids(), NOW).data.jobs[0]
    expect(job.parts[2].expr).toEqual({ W: '全体.W - {n:gone}', H: '700 - 1' })
    expect(job.parts[3].adjust.W).toBe(`-{n:${MELAMINE_ID}}`)
  })

  it('保存してあるコピーしたセルの中の調整寸法も数字に置き換える（仕様書 25.9）', () => {
    const data = { ...sample(), cellClip: { rows: 1, cols: 2, cells: [['棚板', `天板.W - 20 - {n:${MELAMINE_ID}}`]] } }
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(data))
    expect(loadSaved(st, ids(), NOW).data.cellClip).toEqual({ rows: 1, cols: 2, cells: [['棚板', '天板.W - 20 - 1']] })
  })

  it('［調整］でコピーしたセル（source: adjust。第2.1版）を保存して読み戻せる。調整寸法は置き換えない。印の形が違えば捨てる', () => {
    const data = sample()
    data.cellClip = { rows: 1, cols: 2, cells: [[`-{n:${MELAMINE_ID}}`, '-1']], source: 'adjust', cut: { jobId: 'job-shelf', range: { top: 3, left: 1, rows: 1, cols: 2 } } }
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    expect(loadSaved(st, ids(), NOW).data).toEqual(data)
    st.setItem(DATA_KEY, JSON.stringify({ ...data, cellClip: { ...data.cellClip, source: 'finished' } }))
    expect(loadSaved(st, ids(), NOW).data.cellClip).toBeNull()
  })

  it('開いていた仕事が無ければ開いていない状態', () => {
    const st = new MemoryStorage()
    saveSaved(st, sample(), null)
    expect(loadSaved(st, ids(), NOW).currentJobId).toBeNull()
    st.setItem(CURRENT_JOB_KEY, 'nope')
    expect(loadSaved(st, ids(), NOW).currentJobId).toBeNull()
  })

  it('kidori のキーには触らない', () => {
    const st = new MemoryStorage()
    st.setItem('kidori.jobs.v3', 'kidori のデータ')
    saveSaved(st, sample(), 'job-shelf')
    expect(st.getItem('kidori.jobs.v3')).toBe('kidori のデータ')
    expect([...st.map.keys()].filter((k) => !k.startsWith('kidori-lite.'))).toEqual(['kidori.jobs.v3'])
  })

  it('書けなくても例外を出さず理由を返す', () => {
    const st = new MemoryStorage()
    st.failWrite = true
    const r = saveSaved(st, sample(), null)
    expect(r.ok).toBe(false)
    expect(saveSaved(null, sample(), null).ok).toBe(false)
  })
})

describe('壊れた保存データ', () => {
  it.each([
    ['JSON でない', '{こわれた'],
    ['形が違う', JSON.stringify({ version: 1, jobs: 'x', adjusts: [], cellClip: null, adjustClip: null })],
    ['版が違う', JSON.stringify({ ...sample(), version: 2 })],
    ['部材の枚数がおかしい', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: -1 }] }] })],
    ['部材の枚数が文字', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: '1' }] }] })],
    ['部材の枚数が無い', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: undefined }] }] })],
    ['調整寸法が 0', JSON.stringify({ ...sample(), adjusts: [{ id: 'a', name: '逃げ', value: 0 }] })],
  ])('%s：空の一覧で始め「保存データを読めませんでした」。元のデータは書き換えず、控えに残す', (_label, raw) => {
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, raw)
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('error')
    expect(r.data.jobs).toEqual([])
    expect(r.message).toMatch(/^保存データを読めませんでした/)
    expect(st.getItem(DATA_KEY)).toBe(raw)
    expect(st.getItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}`)).toBe(raw)
    expect(r.canSave).toBe(true)
  })

  it('控えに残せなければ、このあと保存しない（canSave: false）', () => {
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, '{こわれた')
    st.failWrite = true
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('error')
    expect(r.canSave).toBe(false)
    expect(st.getItem(DATA_KEY)).toBe('{こわれた')
  })

  it('同じ時刻の控えがあっても上書きしない', () => {
    const st = new MemoryStorage()
    st.setItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}`, '前の控え')
    st.setItem(DATA_KEY, '{こわれた')
    loadSaved(st, ids(), NOW)
    expect(st.getItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}`)).toBe('前の控え')
    expect(st.getItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}.1`)).toBe('{こわれた')
  })

  it('読めない（例外）・localStorage が無いときも画面は始められる。保存はしない', () => {
    const st = new MemoryStorage()
    st.failRead = true
    const r = loadSaved(st, ids(), NOW)
    expect(r).toMatchObject({ status: 'error', canSave: false })
    expect(r.data.jobs).toEqual([])
    expect(loadSaved(null, ids(), NOW)).toMatchObject({ status: 'error', canSave: false })
  })

  it('同じ id の仕事が2つあれば読めないとする', () => {
    expect(parseAppData({ ...sample(), jobs: [shelfJob(), shelfJob()] })).toBeNull()
  })
})
