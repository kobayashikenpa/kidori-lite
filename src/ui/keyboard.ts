/** 入力欄から注目を外して、スマホのキーボードを閉じる（アプリの数字キーを出すときに使う） */
export function closeKeyboard() {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) document.activeElement.blur()
}
