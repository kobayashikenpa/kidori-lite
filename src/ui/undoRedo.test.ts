import { describe, expect, it } from 'vitest'
import type { StoreState } from '../store/reducer'
import { gridResetKey, historyNoticeText, HISTORY_NOTICE_MS } from './undoRedo'

describe('gridResetKey（表の選んでいる範囲を外す合図）', () => {
  it('仕事が変わると変わる', () => {
    expect(gridResetKey('job-a', 0)).not.toBe(gridResetKey('job-b', 0))
  })
  it('戻す・進むで revision が変わると変わる', () => {
    expect(gridResetKey('job-a', 0)).not.toBe(gridResetKey('job-a', 1))
  })
  it('同じ仕事・同じ revision なら同じ（ふつうの操作では範囲を外さない）', () => {
    expect(gridResetKey('job-a', 3)).toBe(gridResetKey('job-a', 3))
  })
  it('仕事によらない表（調整寸法の表）は revision だけで変わる', () => {
    expect(gridResetKey(null, 1)).not.toBe(gridResetKey(null, 2))
  })
})

describe('historyNoticeText（知らせる文）', () => {
  it('戻せたら知らせる文', () => {
    const r = { ok: true as const, state: {} as StoreState, label: '棚板 の W', notice: '戻しました：棚板 の W' }
    expect(historyNoticeText(r)).toBe('戻しました：棚板 の W')
  })
  it('戻せなければ理由', () => {
    expect(historyNoticeText({ ok: false, message: '戻せる操作がありません' })).toBe('戻せる操作がありません')
  })
  it('出しておく時間は3秒', () => {
    expect(HISTORY_NOTICE_MS).toBe(3000)
  })
})
