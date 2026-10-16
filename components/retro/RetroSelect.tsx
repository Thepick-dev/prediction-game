import type { SelectHTMLAttributes } from 'react'
import { useId } from 'react'

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
}

export default function RetroSelect({ label, className = '', id, children, ...rest }: Props) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className="retro-field">
      <label htmlFor={fieldId} className="retro-label">{label}</label>
      <select id={fieldId} className={`retro-select ${className}`} {...rest}>
        {children}
      </select>
    </div>
  )
}
