import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  title?: string
  variant?: 'default' | 'red' | 'gold' | 'green' | 'blue'
  flat?: boolean
  className?: string
}

// The core container — replaces .pop-panel/.pop-art-theme cards. Double
// white border (via border + outline), banded blue gradient fill, hard
// drop shadow, no border-radius ever. Title sits on the border via an
// absolutely-positioned tab, matching the design system's "window title
// breaks the border" signature.
export default function RetroWindow({ children, title, variant = 'default', flat = false, className = '' }: Props) {
  const variantClass = variant !== 'default' ? `retro-window--${variant}` : ''
  return (
    <div className={`retro-window ${variantClass} ${flat ? 'retro-window--flat' : ''} ${className}`}>
      {title && <span className="retro-window-title">{title}</span>}
      {children}
    </div>
  )
}
