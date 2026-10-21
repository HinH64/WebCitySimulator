import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  label?: string
  onClose?: () => void
  wide?: boolean
  children: ReactNode
}

/** Modal overlay. Without `onClose` it cannot be dismissed (used for decisions the game needs). */
export function Dialog({ title, label, onClose, wide, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className={wide ? 'dialog dialog-wide' : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-head">
          {label && <div className="eyebrow">{label}</div>}
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-button dialog-close" onClick={onClose} aria-label="關閉">
              ×
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  )
}
