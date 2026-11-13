// 何を戻したかの文（第2.3版。仕様書 27.1・27.4、architecture 16.3）
import { describe, expect, it } from 'vitest'
import { usableAdjusts } from '../engine/adjusts'
import { computeDimensions } from '../engine/dimensions'
import { shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import { packJob } from '../engine/packing'
import { dispatchWithHistory, redoHistory, undoHistory } from './history'
import { historyLabel, historyNotice } from './historyLabel'
import { currentJob, initialState, type Env, type StoreAction, type StoreState } from './reducer'

function makeEnv(): Env {
  let n = 0
  return { newId: (prefix) => `${prefix}-${++n}`, now: new Date(2026, 10, 13, 9, 0, 0) }
}

function start(): StoreState {
  return initialState({
    status: 'ok',
    data: { version: 1, jobs: [shelfJob()], adjusts: shelfAdjusts(), cellClip: null, adjustClip: null },
    currentJobId: 'job-shelf',
    canSave: true,
  })
}

const tanaita = (s: StoreState) => currentJob(s)!.parts[3]
const label = (action: StoreAction, s: StoreState = start()) => historyLabel(action, s)

describe('historyLabel：部材の欄（部材の呼び名は操作の前の表示名）', () => {
  it('棚板の W の式を変える →「棚板 の W」（W・H の両方を渡しても、変わった欄の名前）', () => {
    const s = start()
    expect(label({ type: 'updatePart', partId: 'part-tanaita', patch: { expr: { ...tanaita(s).expr, W: '300' } } }, s)).toBe('棚板 の W')
    expect(label({ type: 'updatePart', partId: 'part-tanaita', patch: { expr: { ...tanaita(s).expr, H: '900' } } }, s)).toBe('棚板 の H')
  })

  it('厚み・枚数・名前（前の名前）', () => {
    expect(label({ type: 'updatePart', partId: 'part-tanaita', patch: { thickness: 18 } })).toBe('棚板 の厚み')
    expect(label({ type: 'updatePart', partId: 'part-tanaita', patch: { quantity: 12 } })).toBe('棚板 の枚数')
    expect(label({ type: 'updatePart', partId: 'part-tenita', patch: { name: '甲板' } })).toBe('天板 の名前')
  })

  it('回転・仕上がり・メモ', () => {
    expect(label({ type: 'updatePart', partId: 'part-tanaita', patch: { rotatable: true } })).toBe('棚板 の回転')
    expect(label({ type: 'updatePart', partId: 'part-tanaita', patch: { finishedDone: true } })).toBe('棚板 の仕上がり')
    expect(label({ type: 'setPartMemo', partId: 'part-tanaita', text: '木目 縦' })).toBe('棚板 のメモ')
  })

  it('［調整］の H →「棚板 の調整 H」', () => {
    expect(label({ type: 'setPartAdjust', partId: 'part-tanaita', axis: 'H', text: '2' })).toBe('棚板 の調整 H')
    expect(label({ type: 'setPartAdjust', partId: 'part-tanaita', axis: 'W', text: '' })).toBe('棚板 の調整 W')
  })

  it('空の行に入れて部材ができる →「#5 の W」（4つの部材の下の行）', () => {
    expect(label({ type: 'addPart', part: { name: '', expr: { W: '300', H: '' }, quantity: null } })).toBe('#5 の W')
    expect(label({ type: 'addPart', part: { name: '', expr: { W: '', H: '' }, quantity: 2 } })).toBe('#5 の枚数')
    expect(label({ type: 'addPart', part: { name: '背板', expr: { W: '', H: '' }, quantity: null } })).toBe('#5 の名前')
    expect(label({ type: 'addPart', part: { name: '', expr: { W: '', H: '' }, quantity: null, thickness: 18 } })).toBe('#5 の厚み')
  })

  it('名前の無い部材は「#3」', () => {
    const s = start()
    const r = dispatchWithHistory(s, { type: 'updatePart', partId: 'part-gawaita', patch: { name: '' } }, makeEnv())
    if (!r.ok) throw new Error(r.message)
    expect(label({ type: 'updatePart', partId: 'part-gawaita', patch: { quantity: 4 } }, r.state)).toBe('#3 の枚数')
  })
})

describe('historyLabel：表の操作・木取り', () => {
  const range = { top: 0, left: 2, rows: 1, cols: 1 }
  it('行の操作', () => {
    expect(label({ type: 'insertPart', index: 1, part: {} })).toBe('行の挿入')
    expect(label({ type: 'removePart', partId: 'part-tanaita' })).toBe('行の削除')
    expect(label({ type: 'deleteRows', range })).toBe('行の削除')
    expect(label({ type: 'duplicatePart', partId: 'part-tanaita' })).toBe('複製')
    expect(label({ type: 'sortParts', key: 'W', order: 'desc' })).toBe('並べ替え')
    expect(label({ type: 'moveParts', from: 0, count: 1, to: 3 })).toBe('行の移動')
  })

  it('貼り付け・オートフィル・クリア（［調整］も同じ）・色・全部回転してよい', () => {
    expect(label({ type: 'pasteCells', range })).toBe('貼り付け')
    expect(label({ type: 'fillCells', from: range, to: { ...range, rows: 3 } })).toBe('オートフィル')
    expect(label({ type: 'clearCells', range })).toBe('クリア')
    expect(label({ type: 'pastePartAdjustCells', range })).toBe('貼り付け')
    expect(label({ type: 'fillPartAdjustCells', from: range, to: { ...range, rows: 3 } })).toBe('オートフィル')
    expect(label({ type: 'clearPartAdjustCells', range })).toBe('クリア')
    expect(label({ type: 'setCellColor', range, color: 'red' })).toBe('色')
    expect(label({ type: 'setRowColor', range, color: null })).toBe('色')
    expect(label({ type: 'setAllRotatable', rotatable: true })).toBe('全部回転してよい')
  })

  it('調整寸法の表の操作は「調整寸法の表」', () => {
    expect(label({ type: 'setAdjustCell', pos: { row: 0, col: 'value' }, text: '2' })).toBe('調整寸法の表')
    expect(label({ type: 'insertAdjustRow', index: 0 })).toBe('調整寸法の表')
    expect(label({ type: 'removeAdjusts', adjustIds: ['x'] })).toBe('調整寸法の表')
    expect(label({ type: 'addAdjust', name: '逃げ', value: 1 })).toBe('調整寸法の表')
  })

  it('木取りの画面：板のサイズ・刃厚・端切り・切り代・切り方・切り出しチェック', () => {
    const s = start()
    expect(label({ type: 'setSheet', sheet: { sizeKind: 'shihachi', width: 1220, length: 2440 } })).toBe('板のサイズ')
    expect(label({ type: 'updateSettings', patch: { kerf: 4 } })).toBe('刃厚')
    expect(label({ type: 'updateSettings', patch: { trim: 0 } })).toBe('端切り')
    expect(label({ type: 'updateSettings', patch: { allowance: 5 } })).toBe('切り代')
    expect(label({ type: 'updateSettings', patch: { cutMode: 'horizontal' } })).toBe('切り方')
    expect(label({ type: 'updateSettings', patch: { kerf: 4, trim: 3 } })).toBe('刃厚・端切り')
    const job = currentJob(s)!
    const res = packJob(job, computeDimensions(job, usableAdjusts(s.data.adjusts)))
    const target = { kind: 'computed' as const, mode: res.mode, layout: res.sheets[0] }
    expect(label({ type: 'setPartCheck', target, partId: 'part-gawaita', done: true }, s)).toBe('切り出しチェック')
    expect(label({ type: 'setPieceCheck', target, pieceId: 'x', done: true }, s)).toBe('切り出しチェック')
  })
})

describe('historyNotice と、戻す・進むの結果', () => {
  it('「戻しました：棚板 の W」「進めました：棚板 の W」', () => {
    expect(historyNotice('undo', '棚板 の W')).toBe('戻しました：棚板 の W')
    expect(historyNotice('redo', '棚板 の W')).toBe('進めました：棚板 の W')
  })

  it('記録した1回に名前が付き、戻す・進むの結果に名前と知らせる文が入る（まとまりは最初の操作の名前）', () => {
    const env = makeEnv()
    let s = start()
    for (const w of ['3', '30', '300']) {
      const r = dispatchWithHistory(s, { type: 'updatePart', partId: 'part-tanaita', patch: { expr: { ...tanaita(s).expr, W: w } } }, env, { group: 'g1' })
      if (!r.ok) throw new Error(r.message)
      s = r.state
    }
    // 同じ印で名前を変えても、名前は最初の操作（W）のまま
    const r2 = dispatchWithHistory(s, { type: 'updatePart', partId: 'part-tanaita', patch: { name: '中板' } }, env, { group: 'g1' })
    if (!r2.ok) throw new Error(r2.message)
    expect(r2.state.history.past).toHaveLength(1)
    expect(r2.state.history.past[0].label).toBe('棚板 の W')

    const u = undoHistory(r2.state, env)
    if (!u.ok) throw new Error(u.message)
    expect(u.label).toBe('棚板 の W')
    expect(u.notice).toBe('戻しました：棚板 の W')
    expect(tanaita(u.state).name).toBe('棚板')

    const d = redoHistory(u.state, env)
    if (!d.ok) throw new Error(d.message)
    expect(d.notice).toBe('進めました：棚板 の W')
  })
})
