import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'a' | 'b' | 'select' | 'menu'
  active?: boolean
}

// "A/B/Select" bevel buttons, see globals.css .retro-button*. `variant="a"`
// is the primary action (red), "b" secondary (gold), "select" tertiary
// utility (grey, smaller), "menu" a plain text button for nav items.
export default function RetroButton({ variant = 'a', active, className = '', children, ...rest }: Props) {
  return (
    <button
      className={`retro-button retro-button--${variant} ${className}`}
      data-active={variant === 'menu' ? (active ? 'true' : 'false') : undefined}
      {...rest}
    >
      {children}
    </button>
  )
}
