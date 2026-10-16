import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export default function RetroTextField({ label, error, className = '', id, ...rest }: Props) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className="retro-field">
      <label htmlFor={fieldId} className="retro-label">{label}</label>
      <input
        id={fieldId}
        className={`retro-input ${className}`}
        data-invalid={error ? 'true' : 'false'}
        aria-invalid={!!error}
        {...rest}
      />
      {error && (
        <RetroFieldError>{error}</RetroFieldError>
      )}
    </div>
  )
}

export function RetroFieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" style={{ color: 'var(--retro-red-light)', fontFamily: 'var(--font-retro-mono)', fontSize: 14 }}>
      ! {children}
    </p>
  )
}
