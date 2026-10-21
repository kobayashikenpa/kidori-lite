// 数字の欄（仕様書 5.4）。<input> を使わず数字を見せる枠にするので、押してもスマホのキーボードは出ない。
// 枠を押すと画面の下にアプリの数字キーが出る。開いた直後に数字を押すと入れ替え、⌫ は1字消す。ほかを押すか「決定」で閉じる。
// kidori の KeypadField.tsx をもとにしたもの
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { claimOpen } from '../exclusive'
import { closeKeyboard } from '../keyboard'
import { pressKey } from '../numpad'

interface Props {
  /** 見せている文字（打っている途中も含む） */
  text: string
  /** 数字キーを押すたびに呼ぶ */
  onText: (t: string) => void
  /** 閉じたときに呼ぶ（打った値を確定する） */
  onClose?: () => void
  /** 整数だけか（「.」のキーを出さない。枚数など） */
  integer?: boolean
  bad?: boolean
  unit?: string
  placeholder?: string
  id?: string
  /** 見出し（読み上げと、数字キーの上に出す名前） */
  label?: string
}

/** 数字キーに欄が隠れないよう、画面の下に余白を足して欄を上へ動かす。返す関数で余白を戻す */
function keepAbovePad(field: HTMLElement, pad: HTMLElement): () => void {
  const body = document.body
  const prev = body.style.paddingBottom
  body.style.paddingBottom = `${pad.offsetHeight}px`
  const overlap = field.getBoundingClientRect().bottom - pad.getBoundingClientRect().top + 8
  if (overlap > 0) window.scrollBy({ top: overlap })
  return () => {
    body.style.paddingBottom = prev
  }
}

export function KeypadField({ text, onText, onClose, integer = false, bad, unit = 'mm', placeholder, id, label }: Props) {
  const [open, setOpen] = useState(false)
  const [fresh, setFresh] = useState(false)
  const boxRef = useRef<HTMLButtonElement>(null)
  const padRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const padId = `${useId()}-pad`

  const press = (key: string) => {
    onText(pressKey(text, key, fresh && key !== 'back', integer))
    setFresh(false)
  }
  const pressRef = useRef(press)
  const openRef = useRef(open)
  useEffect(() => {
    closeRef.current = onClose
    pressRef.current = press
    openRef.current = open
  })
  // 数字キーを開いたまま欄が消えた（画面の切り替えなど）ときも、閉じたときと同じく打った値を確定する
  useEffect(
    () => () => {
      if (openRef.current) closeRef.current?.()
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    const close = () => {
      setOpen(false)
      closeRef.current?.()
    }
    const release = claimOpen('pad', close)
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (boxRef.current?.contains(t) || padRef.current?.contains(t))
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close()
    }
    // パソコンで試すとき用に、キーボードの数字も受ける
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        close()
        boxRef.current?.focus()
      } else if (/^[\d.]$/.test(e.key)) pressRef.current(e.key)
      else if (e.key === 'Backspace') pressRef.current('back')
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    let restore = () => {}
    const frame = requestAnimationFrame(() => {
      if (boxRef.current && padRef.current) restore = keepAbovePad(boxRef.current, padRef.current)
    })
    return () => {
      release()
      cancelAnimationFrame(frame)
      restore()
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const openPad = () => {
    if (open) return
    closeKeyboard()
    setFresh(true)
    setOpen(true)
  }
  const done = () => {
    setOpen(false)
    closeRef.current?.()
  }
  // キーを押しても枠から注目が外れないようにする
  const keep = (e: ReactPointerEvent) => e.preventDefault()
  const key = (text: string, k: string, cls = 'num', aria?: string) => (
    <button type="button" className={`pad-key ${cls}`} aria-label={aria} onPointerDown={keep} onClick={() => press(k)}>
      {text}
    </button>
  )

  return (
    <span className="unit-input">
      <button
        ref={boxRef}
        id={id}
        type="button"
        className={`input num keypad-box${open ? ' active' : ''}${bad ? ' bad' : ''}`}
        aria-label={`${label ?? ''} ${text || '空'}`.trim()}
        aria-expanded={open}
        aria-controls={padId}
        aria-invalid={bad || undefined}
        onClick={openPad}
      >
        {text === '' ? (
          <span className="keypad-placeholder">{placeholder}</span>
        ) : (
          <span className={open && fresh ? 'keypad-fresh' : undefined}>{text}</span>
        )}
      </button>
      {unit && <span className="unit">{unit}</span>}
      {open &&
        createPortal(
          <div className="numpad" id={padId} ref={padRef} role="group" aria-label={`${label ?? '数'}の数字キー`}>
            <div className="numpad-in">
              <div className="numpad-show num" aria-live="polite">
                <span className="numpad-name">{label}</span>
                <span className={`numpad-val${bad ? ' bad' : ''}`}>
                  {text === '' ? '―' : text} {unit}
                </span>
              </div>
              <div className="pad-keys numpad-keys">
                {key('7', '7')}
                {key('8', '8')}
                {key('9', '9')}
                {key('⌫', 'back', '', '1字消す')}
                {key('4', '4')}
                {key('5', '5')}
                {key('6', '6')}
                {key('クリア', 'clear', '', '全部消す')}
                {key('1', '1')}
                {key('2', '2')}
                {key('3', '3')}
                <button type="button" className="pad-key done numpad-done" onPointerDown={keep} onClick={done}>
                  決定
                </button>
                {integer ? (
                  <button type="button" className="pad-key num span3" onPointerDown={keep} onClick={() => press('0')}>
                    0
                  </button>
                ) : (
                  <>
                    <button type="button" className="pad-key num span2" onPointerDown={keep} onClick={() => press('0')}>
                      0
                    </button>
                    {key('.', '.')}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </span>
  )
}
