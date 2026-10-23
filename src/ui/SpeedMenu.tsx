import { useEffect, useRef, useState } from 'react'
import { SPEEDS, type Speed } from './storage'

interface Props {
  speed: Speed
  skipping: boolean
  disabled: boolean
  onSpeed: (speed: Speed) => void
  onSkip: () => void
}

/** The speed button in the top bar: a menu of speeds and fast-forwarding to the next decision. */
export function SpeedMenu({ speed, skipping, disabled, onSpeed, onSkip }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (action: () => void) => {
    action()
    setOpen(false)
  }

  return (
    <div className="speed-menu" ref={ref}>
      <button className="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`速度：${skipping ? '快轉中' : `${speed} 倍`}`}>
        <span className="control-label">速度：</span>
        {skipping ? '快轉中' : `${speed}×`}
      </button>
      {open && (
        <div className="speed-list" role="menu" aria-label="速度">
          {SPEEDS.map((s) => (
            <button
              key={s}
              role="menuitemradio"
              aria-checked={!skipping && s === speed}
              className={!skipping && s === speed ? 'active' : ''}
              onClick={() => choose(() => onSpeed(s))}
            >
              {s}×
            </button>
          ))}
          <button role="menuitem" className="speed-skip" disabled={disabled} onClick={() => choose(onSkip)}>
            快轉到下一個抉擇 »
          </button>
        </div>
      )}
    </div>
  )
}
