'use client'

import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'

type MenuItemProps = {
  children: ReactNode
  onSelect?: () => void
  disabled?: boolean
  active?: boolean
}

export function RetroMenuItem({ children, onSelect, disabled, active }: MenuItemProps) {
  return (
    <button
      type="button"
      className="retro-menu-item"
      data-active={active ? 'true' : 'false'}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="retro-menu-cursor" aria-hidden="true">▶</span>
      {children}
    </button>
  )
}

type MenuProps = {
  children: ReactNode
  className?: string
}

// A vertical nav list with a bobbing ▶ cursor against the active item —
// the design system's signature navigation pattern, replacing plain link
// lists. Keyboard (arrow keys + Enter) and mouse (hover) share one
// "current item" state, per the spec. Only direct RetroMenuItem children
// participate in roving navigation.
export default function RetroMenu({ children, className = '' }: MenuProps) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<MenuItemProps>[]
  const [activeIndex, setActiveIndex] = useState(0)

  function handleKeyDown(e: React.KeyboardEvent) {
    const enabledIndices = items.reduce<number[]>((acc, item, i) => {
      if (!item.props.disabled) acc.push(i)
      return acc
    }, [])
    if (enabledIndices.length === 0) return
    const currentPos = enabledIndices.indexOf(activeIndex)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = enabledIndices[(currentPos + 1 + enabledIndices.length) % enabledIndices.length]
      setActiveIndex(next)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = enabledIndices[(currentPos - 1 + enabledIndices.length) % enabledIndices.length]
      setActiveIndex(prev)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      items[activeIndex]?.props.onSelect?.()
    }
  }

  return (
    <div role="menu" className={`retro-menu ${className}`} onKeyDown={handleKeyDown}>
      {items.map((item, i) =>
        cloneElement(item, {
          key: i,
          active: i === activeIndex,
          onSelect: () => {
            setActiveIndex(i)
            item.props.onSelect?.()
          },
        })
      )}
    </div>
  )
}
