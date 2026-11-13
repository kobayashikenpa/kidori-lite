// 部材のメモの欄（第2.2版。仕様書 26.3）：下から出るシートに、スマホのキーボードで打つ欄。「保存」で残し、空にして保存するとメモを消す。
// 長押しのメニューの「メモ」と、式の欄の下に出したメモを押したときに開く（［仕上がり］［調整］）。
// ［木取り］の表は見るだけなので、全文を出すだけ（readOnly）。保存は store の setPartMemo（engine の marks.ts）
import { useState } from 'react'
import { Sheet } from './Sheet'

interface Props {
  /** 部材の呼び方（「棚板」「#3」） */
  who: string
  /** 今のメモ */
  memo: string
  /** 見るだけ（［木取り］のタブ） */
  readOnly?: boolean
  /** 「保存」：打った文字（空なら消す）。保存できなければ理由を返す */
  onSave?: (text: string) => string | null
  onClose: () => void
}

export function MemoSheet({ who, memo, readOnly = false, onSave, onClose }: Props) {
  const [text, setText] = useState(memo)
  const [msg, setMsg] = useState<string | null>(null)
  const save = () => {
    const err = onSave?.(text) ?? null
    if (err) {
      setMsg(err)
      return
    }
    onClose()
  }
  return (
    <Sheet title={`${who} のメモ`} onClose={onClose}>
      {readOnly ? (
        <>
          <p className="memo-full">{memo}</p>
          <p className="band-note">メモを直すときは［仕上がり］か［調整］のタブで、その行を長押し →「メモ」</p>
        </>
      ) : (
        <>
          <label className="field">
            <span className="label">メモ（空にして保存すると消えます）</span>
            <textarea
              className="input memo-input"
              value={text}
              rows={5}
              autoFocus
              aria-label={`${who} のメモ`}
              onChange={(e) => {
                setText(e.target.value)
                setMsg(null)
              }}
            />
          </label>
          {msg && (
            <p className="msg err" role="alert">
              {msg}
            </p>
          )}
          <div className="foot">
            <button type="button" className="btn" onClick={onClose}>
              やめる
            </button>
            <button type="button" className="btn primary" onClick={save}>
              保存
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
