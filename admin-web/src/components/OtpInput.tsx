import { useEffect, useRef } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'

interface OtpInputProps {
  /** The digits entered so far, without gaps (e.g. "1423"). */
  value: string
  /** Called with the digits entered so far whenever they change. */
  onChange: (value: string) => void
  /** Called once every box holds a digit. */
  onComplete?: (value: string) => void
  /** How many boxes the code has. */
  length?: number
  disabled?: boolean
  /** Marks the whole row as wrong (a rejected code). */
  invalid?: boolean
  /** Puts the cursor in the first empty box when the row appears. */
  autoFocus?: boolean
  /**
   * Bump this to clear the row and move the cursor back to the first box -
   * used after a wrong code, so the admin can type a new one straight away.
   */
  resetKey?: number
  /** Id of the element that labels the whole row. */
  labelledBy?: string
}

const NON_DIGITS = /\D/g

/**
 * The 6 separate boxes for a one-time code.
 *
 * The boxes are uncontrolled on purpose: the digits live in a ref and in the
 * DOM, so a fast typist (or a pasted code) can never lose a digit to a
 * re-render. React only ever hears about the finished value.
 *
 * What it supports:
 *   - one digit per box, the cursor moves on by itself
 *   - Backspace steps back and clears the box before it
 *   - pasting a full code fills the whole row, whatever box was focused
 *   - arrow keys, Home and End move the cursor without changing anything
 *   - typing over a filled box replaces the digit in it
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  invalid = false,
  autoFocus = false,
  resetKey,
  labelledBy,
}: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const digits = useRef<string[]>(Array.from({ length }, () => ''))

  /** Moves the cursor into a box and selects what is in it. */
  const focusBox = (index: number) => {
    const element = inputs.current[index]
    if (!element) return
    element.focus()
    // Selecting means a typed digit replaces the one in the box instead of
    // being appended to it.
    element.select()
  }

  /** Publishes the current row and tells the caller when it is complete. */
  const publish = (next: string[]) => {
    digits.current = next
    const joined = next.join('')
    onChange(joined)
    if (next.length === length && next.every((digit) => digit !== '')) {
      onComplete?.(joined)
    }
  }

  /** Writes one digit into one box (DOM included) and publishes the row. */
  const setBox = (index: number, digit: string) => {
    const element = inputs.current[index]
    if (element && element.value !== digit) element.value = digit
    const next = digits.current.slice()
    next[index] = digit
    publish(next)
  }

  /** Drops several digits into the row - a pasted or auto-filled code. */
  const spread = (startIndex: number, text: string) => {
    const chars = text.replace(NON_DIGITS, '')
    if (!chars.length) return

    const next = digits.current.slice()
    // A pasted code with all the digits fills the whole row, whatever box was
    // focused. A shorter paste continues where the cursor is.
    const from = chars.length >= length ? 0 : startIndex
    let last = from

    for (let offset = 0; offset < chars.length && from + offset < length; offset += 1) {
      const index = from + offset
      next[index] = chars[offset]
      const element = inputs.current[index]
      if (element) element.value = chars[offset]
      last = index
    }

    publish(next)

    const firstEmpty = next.findIndex((digit) => digit === '')
    focusBox(firstEmpty === -1 ? last : firstEmpty)
  }

  const handleChange = (index: number, raw: string) => {
    if (disabled) return
    const chars = raw.replace(NON_DIGITS, '')

    if (!chars.length) {
      // The box was emptied (cut, or a delete key).
      setBox(index, '')
      return
    }
    if (chars.length > 1) {
      // More than one digit arrived at once: a paste or an auto-filled code.
      spread(index, chars)
      return
    }

    setBox(index, chars)
    if (index < length - 1) focusBox(index + 1)
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (event.key === 'Backspace') {
      event.preventDefault()
      const element = inputs.current[index]
      if (element && element.value) {
        setBox(index, '')
      } else if (index > 0) {
        // The box was already empty: step back and clear the one before it.
        setBox(index - 1, '')
        focusBox(index - 1)
      }
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      setBox(index, '')
      return
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusBox(index - 1)
      return
    }

    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault()
      focusBox(index + 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusBox(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusBox(length - 1)
    }
  }

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    if (disabled) return
    spread(index, event.clipboardData.getData('text'))
  }

  // Follow the value that comes from outside (a wrong code is cleared).
  useEffect(() => {
    if (digits.current.join('') === value) return
    const incoming = value.replace(NON_DIGITS, '').split('')
    digits.current = Array.from({ length }, (_, index) => incoming[index] ?? '')
    digits.current.forEach((digit, index) => {
      const element = inputs.current[index]
      if (element && element.value !== digit) element.value = digit
    })
  }, [value, length])

  // Start in the first empty box.
  useEffect(() => {
    if (!autoFocus) return
    const firstEmpty = digits.current.findIndex((digit) => digit === '')
    focusBox(firstEmpty === -1 ? 0 : firstEmpty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

  // A new reset key means: empty the row and start over in the first box.
  useEffect(() => {
    if (resetKey === undefined) return
    const empty = Array.from({ length }, () => '')
    digits.current = empty
    empty.forEach((_, index) => {
      const element = inputs.current[index]
      if (element) element.value = ''
    })
    onChange('')
    if (!disabled) focusBox(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="mx-auto grid w-full max-w-[23rem] grid-cols-6 gap-1.5 sm:gap-2.5"
    >
      {Array.from({ length }, (_, index) => {
        // Read from the value the parent holds, so the box always shows the
        // digit that is really in it.
        const filled = index < value.length && value[index] !== ''
        return (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element
            }}
            id={`otp-digit-${index + 1}`}
            name={`otp-digit-${index + 1}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={invalid || undefined}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.target.select()}
            className={[
              'h-12 w-full rounded-xl border text-center text-lg font-semibold tabular-nums shadow-sm outline-none transition duration-200 sm:h-14 sm:rounded-2xl sm:text-xl',
              'focus:z-10 focus:scale-[1.04] focus:shadow-lg disabled:cursor-not-allowed disabled:opacity-60',
              invalid
                ? 'border-danger/60 bg-danger-soft text-danger focus:border-danger focus:ring-4 focus:ring-danger/15'
                : filled
                  ? 'border-brand/40 bg-brand-soft text-brand focus:border-brand focus:ring-4 focus:ring-brand/15'
                  : 'border-line bg-surface text-ink focus:border-brand focus:ring-4 focus:ring-brand/15',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}
