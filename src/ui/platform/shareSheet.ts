// ファイルを送る・保存する（仕様書 15.3・15.4）。kidori の ui/platform/shareSheet.ts を参考にしたもの。
// 共有シートが使えれば navigator.share でファイルを渡し、使えなければ端末に保存（<a download>）する。
// iPhone の Safari は押した操作から続いていない共有を断るので、押した操作の中で（await の前に）呼ぶこと。

/** shared：共有シートで送った／cancelled：閉じた（何も出さない）／saved：端末に保存した／failed：保存もできなかった */
export type ShareResult = 'shared' | 'cancelled' | 'saved' | 'failed'

function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true
  } catch {
    return false
  }
}

/** Blob の URL と <a download> で端末に保存する */
export function downloadFile(file: File): boolean {
  try {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // すぐに消すと保存が始まらないブラウザがあるので、少し待ってから消す
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return true
  } catch {
    return false
  }
}

/** ファイルを送る。共有シートを閉じたときは 'cancelled'（エラーは出さない） */
export async function shareFile(file: File, title: string): Promise<ShareResult> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // ほかの失敗（押した操作から続いていない等）は保存に切り替える
    }
  }
  return downloadFile(file) ? 'saved' : 'failed'
}

/** JSON の文字列からファイルを作る（作れなければ null） */
export function jsonFile(text: string, name: string): File | null {
  try {
    return new File([text], name, { type: 'application/json' })
  } catch {
    return null
  }
}
