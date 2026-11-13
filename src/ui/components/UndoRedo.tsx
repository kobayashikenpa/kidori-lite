// 「↶ 戻る」「↷ 進む」のボタン（第2.3版 仕様書 27.1・27.4）。部材の画面（タブの右）と木取りの画面（上に止めた見出しの右）に置く。
// 記号の下に小さく「戻る」「進む」の2段、1つ 48px 幅・高さ 44px 以上。戻せない・進めないときは薄くする。
// 薄くても押せる形（aria-disabled）にする：入力中に押したとき、指を置いた時点でその入力が確定して戻せるようになるため（disabled だと押した扱いにならない）
// 押したら何を戻した／進めたかを、ボタンの帯（止めてある帯）のすぐ下に表に重ねて3秒ほど出す（帯は position: sticky なので、その下に置ける）。
// 入力中に押したときは、指を置いた時点で表の入力が確定し（useOutsideEnd・数字キーの欄も同じ）、そのあと押したことで戻す（仕様書 27.4）
import { useEffect, useState } from 'react'
import { useJobStore } from '../../store/useJobStore'
import { HISTORY_NOTICE_MS, historyNoticeText } from '../undoRedo'

export function UndoRedo() {
  const { undo, redo, canUndo, canRedo, state } = useJobStore()
  // 知らせる文（同じ文が続いても出し直すよう、押した回数も持つ）
  const [notice, setNotice] = useState<{ text: string; n: number } | null>(null)
  // ほかの仕事を開いたら消す
  const [jobId, setJobId] = useState(state.currentJobId)
  if (jobId !== state.currentJobId) {
    setJobId(state.currentJobId)
    setNotice(null)
  }
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), HISTORY_NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])

  const press = (kind: 'undo' | 'redo') => {
    const r = kind === 'undo' ? undo() : redo()
    setNotice((p) => ({ text: historyNoticeText(r), n: (p?.n ?? 0) + 1 }))
  }

  return (
    <>
      <div className="ur" role="group" aria-label="戻る・進む">
        <button type="button" className="ur-btn" aria-label="戻る" aria-disabled={!canUndo} onClick={() => press('undo')}>
          <span className="ur-icon" aria-hidden="true">
            ↶
          </span>
          <span className="ur-text" aria-hidden="true">
            戻る
          </span>
        </button>
        <button type="button" className="ur-btn" aria-label="進む" aria-disabled={!canRedo} onClick={() => press('redo')}>
          <span className="ur-icon" aria-hidden="true">
            ↷
          </span>
          <span className="ur-text" aria-hidden="true">
            進む
          </span>
        </button>
      </div>
      {/* 読み上げの欄は出したままにして、中の文だけ変える（作り直すと読まれないことがある） */}
      <p className={`ur-notice${notice ? '' : ' empty'}`} role="status" aria-live="polite">
        {notice && <span key={notice.n}>{notice.text}</span>}
      </p>
    </>
  )
}
