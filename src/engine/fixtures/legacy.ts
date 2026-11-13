// 前の版（第2.1版）の保存データ・ファイルの形を作るテスト用の道具（第2.2版。仕様書 26.7）
// 第2.2版で部材に足した欄（厚み など）を消した写しを作り、「なし」として読めるかを確かめる

/** 第2.2版で部材に足した欄。前の版の保存データ・ファイルには無い */
export const V22_PART_KEYS = ['thickness'] as const

/**
 * JSON で写し、中の仕事の部材（`parts` の配列の中身）から第2.2版の欄を消したもの（第2.1版の形）。
 * 保存データ（jobs）・送るファイル（job）・バックアップ（jobs）・仕事1つのどれでも渡せる。元は変えない
 */
export function toV21<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as unknown
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (typeof v !== 'object' || v === null) return
    const rec = v as Record<string, unknown>
    if (Array.isArray(rec.parts)) {
      for (const p of rec.parts) {
        if (typeof p === 'object' && p !== null) for (const k of V22_PART_KEYS) delete (p as Record<string, unknown>)[k]
      }
    }
    for (const x of Object.values(rec)) walk(x)
  }
  walk(copy)
  return copy as T
}
