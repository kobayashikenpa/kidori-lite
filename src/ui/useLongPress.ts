// 1つの要素の「押す」と「長押し」を分ける（仕様書 22。部材の表の長押しと同じ決まり：500ms、指が動いたら取り消し）。
// 長押しのあとに来る click は捨てる（出たメニューの背景に click が当たって閉じないよう、画面全体で捨てる）。Android の長押し・マウスの右クリック（contextmenu）でも長押しにする
import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { LONG_PRESS_MS, LONG_PRESS_SLOP } from './useGrid'

export function useLongPress() {
  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null)
  /** 長押しを出したので、次の click は捨てる */
  const swallow = useRef(false)

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }
  useEffect(() => {
    const onClick = (e: globalThis.MouseEvent) => {
      if (!swallow.current) return
      swallow.current = false
      e.preventDefault()
      e.stopPropagation()
    }
    // 次に押し始めたら、捨てる印は消す（長押しのあとに click が来なかったとき）
    const onDown = () => {
      swallow.current = false
    }
    window.addEventListener('click', onClick, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      cancel()
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  /** 要素に付けるもの。onPress は押したとき、onLong は長押ししたとき */
  return (onPress: () => void, onLong: () => void) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      cancel()
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const timer = window.setTimeout(() => {
        press.current = null
        swallow.current = true
        onLong()
      }, LONG_PRESS_MS)
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const p = press.current
      if (!p || p.id !== e.pointerId) return
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault()
      if (swallow.current) return
      cancel()
      swallow.current = true
      onLong()
    },
    onClick: onPress,
  })
}
