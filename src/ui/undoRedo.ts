// 戻る・進む（第2.3版 仕様書 27章）の画面の小さな決まり。履歴そのものは store/history.ts

/**
 * 表の選んでいる範囲を外す合図（useGrid の resetKey）。仕事を切り替えたとき・戻す・進むのあと（revision が変わる）に変わる。
 * 調整寸法の表のように仕事によらない表は jobId を null にする
 */
export function gridResetKey(jobId: string | null, revision: number): string {
  return `${jobId ?? ''}#${revision}`
}

