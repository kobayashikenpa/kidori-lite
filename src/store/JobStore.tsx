// 保存データの状態と、変わったときの自動保存（300ms ほどまとめて書く。画面を閉じるときはすぐ書く）
// kidori の store/JobStore.tsx を参考に作り直したもの
// 第2.3版（仕様書 27章）：操作は dispatchWithHistory で当てて戻す・進むの履歴に記録する（履歴は保存しない）。undo・redo で戻す・進む
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { newId } from './jobs'
import { canRedo, canUndo, dispatchWithHistory, redoHistory, undoHistory, type DispatchOptions, type HistoryResult } from './history'
import { currentJob, initialState, type ReduceResult, type StoreAction, type StoreState } from './reducer'
import { browserStorage, loadSaved, saveSaved } from './storage'
import { JobStoreContext, type JobStoreValue } from './useJobStore'

/** 入力中の連打をまとめて保存するまでの待ち時間 */
const SAVE_DELAY_MS = 300

function init(): StoreState {
  return initialState(loadSaved(browserStorage(), newId))
}

export function JobStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(init)
  const [saveError, setSaveError] = useState<string | null>(null)
  // 同じ操作の中で続けて dispatch を呼んでも最新の状態に当てられるよう、状態を手元にも持つ
  const latest = useRef(state)

  const dispatch = useCallback((action: StoreAction, opts?: DispatchOptions): ReduceResult => {
    // 操作はここで1回だけ当てる（id・時刻を作るので、React の reducer の中ではやり直さない）。
    // 戻せる操作は履歴に記録する（opts.group が同じなら1回にまとめる・opts.follow は直前の1回に含める）
    const r = dispatchWithHistory(latest.current, action, { newId, now: new Date() }, opts)
    if (r.ok && r.state !== latest.current) {
      latest.current = r.state
      setState(r.state)
    }
    return r
  }, [])

  // 戻す・進む（仕様書 27.1）。中身が変わるので、今の自動保存がそのまま保存する
  const move = useCallback((kind: 'undo' | 'redo'): HistoryResult => {
    const env = { newId, now: new Date() }
    const r = kind === 'undo' ? undoHistory(latest.current, env) : redoHistory(latest.current, env)
    if (r.ok) {
      latest.current = r.state
      setState(r.state)
    }
    return r
  }, [])
  const undo = useCallback(() => move('undo'), [move])
  const redo = useCallback(() => move('redo'), [move])

  // 自動保存：状態が変わったら少し待ってから書く。画面を閉じる・隠すときはすぐ書く
  const { data, currentJobId, canSave } = state
  const first = useRef(true)
  useEffect(() => {
    // 読んだばかりのデータは書き直さない（読めなかったときに元のデータを上書きしないため、変更があったときだけ書く）
    if (first.current) {
      first.current = false
      return
    }
    if (!canSave) return
    let pending = true
    const save = () => {
      if (!pending) return
      pending = false
      const r = saveSaved(browserStorage(), data, currentJobId)
      setSaveError(r.ok ? null : r.message)
    }
    const timer = setTimeout(save, SAVE_DELAY_MS)
    const onHide = () => {
      clearTimeout(timer)
      save()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [data, currentJobId, canSave])

  const value = useMemo<JobStoreValue>(
    () => ({
      state,
      data: state.data,
      job: currentJob(state),
      dispatch,
      undo,
      redo,
      canUndo: canUndo(state.history),
      canRedo: canRedo(state.history),
      historyRevision: state.history.revision,
      saveError,
    }),
    [state, dispatch, undo, redo, saveError],
  )
  return <JobStoreContext.Provider value={value}>{children}</JobStoreContext.Provider>
}
