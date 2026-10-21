// 数の欄（アプリの数字キーで入れる）。打っている途中の文字はここで持ち、数字キーを閉じたときに onCommit で確定する。
// 確定できなかったとき（空・0 以下など）は呼ぶ側が理由を返し、欄は元の値に戻す
import { useState } from 'react'
import { exactText } from '../../engine/round'
import { parseNum } from '../format'
import { KeypadField } from './KeypadField'

interface Props {
  value: number
  /** 読めた数で確定する。だめなら理由（画面に出す）、よければ null */
  onCommit: (v: number) => string | null
  /** 理由を出す・消す */
  onError: (message: string | null) => void
  label: string
  id?: string
  unit?: string
}

export function NumberField({ value, onCommit, onError, label, id, unit = 'mm' }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const shown = editing ?? exactText(value)
  const parsed = parseNum(shown)
  const bad = parsed === null || Number.isNaN(parsed)

  const commit = () => {
    if (editing === null) return
    setEditing(null)
    const v = parseNum(editing)
    if (v === null || Number.isNaN(v)) {
      onError(`${label}に数を入れてください`)
      return
    }
    onError(v === value ? null : onCommit(v))
  }

  return (
    <KeypadField
      id={id}
      label={label}
      text={shown}
      bad={editing !== null && bad}
      unit={unit}
      onText={(t) => {
        setEditing(t)
        onError(null)
      }}
      onClose={commit}
    />
  )
}
