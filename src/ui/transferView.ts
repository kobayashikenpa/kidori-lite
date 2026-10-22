// 共有とバックアップの画面の文言（仕様書 15.3・15.4）。React に依存しない
import type { TransferRead } from '../engine/transfer/read'
import type { ShareResult } from './platform/shareSheet'

/** ファイルを作れなかった・保存もできなかったとき */
export const MAKE_FAILED = 'ファイルを作れませんでした'

/** 送る・書き出すの結果ごとに出す文。null は何も出さない（送った・共有シートを閉じた） */
export function shareResultText(r: ShareResult, kind: 'job' | 'backup'): { ok: boolean; text: string } | null {
  if (r === 'saved') {
    return {
      ok: true,
      text: kind === 'job' ? 'ファイルを保存しました。LINE などからこのファイルを送ってください' : 'バックアップのファイルを保存しました',
    }
  }
  if (r === 'failed') return { ok: false, text: MAKE_FAILED }
  return null
}

/** 確認の画面で名前を並べる数（残りは「ほか ◯件」） */
export const MAX_IMPORT_NAMES = 10

const shownName = (name: string) => (name.trim() === '' ? '（名前なし）' : name)

/** 取り込みの確認の文言。共有：「共有された仕事：本棚（部材 4件）」／バックアップ：「バックアップ：仕事 3件」と名前の一覧 */
export function importSummary(read: Extract<TransferRead, { ok: true }>): {
  title: string
  names: string[]
  rest: number
  action: string
} {
  if (read.kind === 'job') {
    return {
      title: `共有された仕事：${shownName(read.summary.jobName)}（部材 ${read.summary.partCount}件）`,
      names: [],
      rest: 0,
      action: '取り込む',
    }
  }
  const all = read.summary.jobNames.map(shownName)
  return {
    title: `バックアップ：仕事 ${read.summary.jobCount}件`,
    names: all.slice(0, MAX_IMPORT_NAMES),
    rest: Math.max(0, all.length - MAX_IMPORT_NAMES),
    action: '追加する',
  }
}
