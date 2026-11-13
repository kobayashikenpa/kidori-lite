// 戻る・進む（第2.3版 仕様書 27章）の画面の小さな決まり。履歴そのものは store/history.ts
import type { HistoryResult } from '../store/history'

/**
 * 表の選んでいる範囲を外す合図（useGrid の resetKey）。仕事を切り替えたとき・戻す・進むのあと（revision が変わる）に変わる。
 * 調整寸法の表のように仕事によらない表は jobId を null にする
 */
export function gridResetKey(jobId: string | null, revision: number): string {
  return `${jobId ?? ''}#${revision}`
}

/** 戻す・進むの結果から、ボタンの帯の下に出す知らせる文（できたら「戻しました：棚板 の W」、できなければ理由） */
export function historyNoticeText(r: HistoryResult): string {
  return r.ok ? r.notice : r.message
}

/** 知らせる文を出しておく時間（仕様書 27.4「3秒ほど」） */
export const HISTORY_NOTICE_MS = 3000
