// 上の仕事の名前の帯（.topbar）の高さ（px）。画面の上に止める帯（部材の画面のタブ・木取りの画面の見出し）の top に使う。
// 文字の大きさ・画面の向きで変わるので測る。測れないときは 0
import { useEffect, useState } from 'react'

export function useTopbarHeight(): number {
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.topbar')
    if (!el) return
    const measure = () => setH(el.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return h
}
