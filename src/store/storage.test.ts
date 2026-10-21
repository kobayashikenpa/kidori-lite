import { describe, expect, it } from 'vitest'
import { shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
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
const sample = (): AppData => ({ version: 1, jobs: [shelfJob()], adjusts: shelfAdjusts(), clipboard: null })

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
    ['形が違う', JSON.stringify({ version: 1, jobs: 'x', adjusts: [], clipboard: null })],
    ['版が違う', JSON.stringify({ ...sample(), version: 2 })],
    ['部材の枚数がおかしい', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: -1 }] }] })],
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
