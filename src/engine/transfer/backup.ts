// バックアップのファイル（全部・ファイル。仕様書 15.4）。React・ブラウザに依存しない。
// kidori の store/transfer/backup.ts を参考に作り直したもの（調整寸法の一覧もアプリ全体なので入れる）
import type { AppData } from '../types'
import { TRANSFER_APP, TRANSFER_VERSION, type BackupFile } from './envelope'

/** バックアップの中身：全部の仕事（切り出しチェック・仕上がりの完了も）と調整寸法の一覧をそのまま。コピーした部材は入れない */
export function backupFile(data: Pick<AppData, 'jobs' | 'adjusts'>): BackupFile {
  return { app: TRANSFER_APP, kind: 'backup', version: TRANSFER_VERSION, jobs: data.jobs, adjusts: data.adjusts }
}

/** バックアップのファイルの中身（JSON の文字列。空白なし） */
export function buildBackupFile(data: Pick<AppData, 'jobs' | 'adjusts'>): string {
  return JSON.stringify(backupFile(data))
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** バックアップのファイル名：kidori-lite-バックアップ-2026-10-22.json（端末の日付） */
export function backupFileName(now: Date): string {
  return `kidori-lite-バックアップ-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`
}
