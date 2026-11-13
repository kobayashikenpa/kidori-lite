// 画面から保存データを使うためのフック
import { createContext, useContext } from 'react'
import type { AppData, Job } from '../engine/types'
import type { DispatchOptions, HistoryResult } from './history'
import type { ReduceResult, StoreAction, StoreState } from './reducer'

/**
 * 操作を1回だけ当てる。失敗したら理由を返す（画面に出す）。戻せる操作は戻す・進むの履歴に記録する（仕様書 27.2）。
 * opts.group：同じ印の操作は1回にまとめる（セルの入力を始めるたびに新しい印）。opts.follow：直前の1回に含める（空の行を外す後片付け）
 */
export type Dispatch = (action: StoreAction, opts?: DispatchOptions) => ReduceResult

export interface JobStoreValue {
  state: StoreState
  /** 保存データ（仕事・調整寸法・コピーしたセル） */
  data: AppData
  /** 開いている仕事（無ければ null） */
  job: Job | null
  /** 操作を1回だけ当てる（Dispatch） */
  dispatch: Dispatch
  /** 戻す（仕様書 27.1）。結果の notice は知らせる文（「戻しました：棚板 の W」）。戻せなければ ok: false */
  undo: () => HistoryResult
  /** 進む。結果の notice は「進めました：棚板 の W」 */
  redo: () => HistoryResult
  /** 戻せる操作があるか（無ければ「戻る」を薄く） */
  canUndo: boolean
  /** 進める操作があるか */
  canRedo: boolean
  /** 戻す・進むのたびに変わる数（表は入力を終え、選んでいる範囲を外す。仕様書 27.4） */
  historyRevision: number
  /** 保存に失敗したときの知らせ */
  saveError: string | null
}

export const JobStoreContext = createContext<JobStoreValue | null>(null)

export function useJobStore(): JobStoreValue {
  const v = useContext(JobStoreContext)
  if (!v) throw new Error('JobStoreProvider の中で使ってください')
  return v
}
