import { forwardRef } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const CONTROL_BASE =
  'w-full rounded-xl border bg-surface text-sm text-ink shadow-sm transition placeholder:text-ink-subtle focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60'
const CONTROL_OK = 'border-line hover:border-ink/25 focus:border-brand focus:ring-brand/10'
const CONTROL_ERROR = 'border-danger/60 focus:border-danger focus:ring-danger/10'

function controlClass(error: boolean | string | undefined, extra = ''): string {
  return [CONTROL_BASE, error ? CONTROL_ERROR : CONTROL_OK, extra].join(' ')
}

interface FieldProps {
  label?: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/** Label + control + hint/error, so every form field lines up the same way. */
export function Field({ label, htmlFor, hint, error, required, children, className = '' }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink-muted"
        >
          {label}
          {required && <span className="text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  icon?: LucideIcon
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, icon: Icon, className = '', ...rest },
  ref,
) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
      )}
      <input
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={controlClass(error, `h-10 ${Icon ? 'pl-9' : 'pl-3'} pr-3 ${className}`)}
        {...rest}
      />
    </div>
  )
})

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
  options: { value: string; label: string }[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error, options, className = '', ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={controlClass(error, `h-10 appearance-none pl-3 pr-9 ${className}`)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
    </div>
  )
})

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error, className = '', rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={error ? true : undefined}
      className={controlClass(error, `resize-y px-3 py-2.5 ${className}`)}
      {...rest}
    />
  )
})

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  disabled?: boolean
  id?: string
}

/** An accessible on/off switch used for availability and "active" flags. */
export function Switch({ checked, onChange, label, disabled, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50',
        checked ? 'border-brand bg-brand' : 'border-line bg-surface-muted',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
        ].join(' ')}
        style={{ height: 18, width: 18 }}
      />
    </button>
  )
}

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
}

export function Checkbox({ label, className = '', ...rest }: CheckboxProps) {
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm text-ink ${className}`}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-line text-brand accent-[rgb(var(--brand))] focus:ring-brand"
        {...rest}
      />
      {label}
    </label>
  )
}
