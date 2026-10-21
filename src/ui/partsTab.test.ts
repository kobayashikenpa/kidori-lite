import { describe, expect, it } from 'vitest'
import { loadPartsTab, savePartsTab, UI_KEY } from './partsTab'

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('選んでいるタブを端末ごとに覚える', () => {
  it('初めは仕上がり', () => {
    expect(loadPartsTab(memory())).toBe('finished')
    expect(loadPartsTab(null)).toBe('finished')
  })
  it('覚えたタブを読む（ほかの画面の状態は残す）', () => {
    const s = memory({ [UI_KEY]: JSON.stringify({ other: 1 }) })
    savePartsTab(s, 'cut')
    expect(loadPartsTab(s)).toBe('cut')
    expect(JSON.parse(s.m.get(UI_KEY)!)).toEqual({ other: 1, partsTab: 'cut' })
  })
  it('壊れた値・読めない・書けないときも画面は動く', () => {
    expect(loadPartsTab(memory({ [UI_KEY]: '{壊れ' }))).toBe('finished')
    expect(loadPartsTab(memory({ [UI_KEY]: JSON.stringify({ partsTab: 'x' }) }))).toBe('finished')
    const broken = {
      getItem: () => {
        throw new Error('x')
      },
      setItem: () => {
        throw new Error('x')
      },
    }
    expect(loadPartsTab(broken)).toBe('finished')
    expect(() => savePartsTab(broken, 'cut')).not.toThrow()
  })
})
