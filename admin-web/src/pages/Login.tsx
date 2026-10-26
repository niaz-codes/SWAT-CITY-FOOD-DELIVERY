import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  CircleAlert,
  CircleCheckBig,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Timer,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { useAuthStore, homeForRole } from '../stores/authStore'
import { apiErrorMessage, apiErrorStatus } from '../lib/api'
import OtpInput from '../components/OtpInput'
import ThemeToggle from '../components/ThemeToggle'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

/** How many digits the emailed code has. */
const OTP_LENGTH = 6

/**
 * How long to wait before asking for the code again.
 *
 * The mail provider refuses a second code for the same address while its own
 * cooldown runs and answers "try again in N seconds" - but as a bare 500 the
 * panel cannot tell that case from a real failure. Waiting a few seconds and
 * trying again turns "nothing happened" into "the code is on its way".
 */
const RETRY_DELAYS = [12, 22, 30]
const MAX_AUTO_RETRIES = RETRY_DELAYS.length

/**
 * The provider's own per-address cooldown.
 *
 * The same window the backend uses before it hands back the code it already
 * sent - so the "send a new code" button stays quiet for exactly as long as a
 * new code would be refused anyway.
 */
const RESEND_COOLDOWN_SECONDS = 60

/** What the admin panel is about, shown next to the sign-in form. */
const HIGHLIGHTS: { icon: LucideIcon; title: string; copy: string }[] = [
  {
    icon: ShoppingBag,
    title: 'Live order flow',
    copy: 'Watch an order travel from the kitchen to the doorstep.',
  },
  {
    icon: Bike,
    title: 'Rider approvals',
    copy: 'Check the documents and approve a rider in a click.',
  },
  {
    icon: Store,
    title: 'Restaurant network',
    copy: 'Menus, fees and opening hours for every kitchen.',
  },
]

/** "4:59" - the way a countdown reads best. */
function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60)
  const seconds = Math.max(0, totalSeconds) % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * The number of seconds the mail provider asks us to wait, when it says so.
 *
 * "Please try again in 54 seconds" is far more useful than a bare failure, so
 * the number is picked out of the message and used as the retry delay.
 */
function parseRetryAfter(message: string): number | null {
  const match = /in\s+(\d+)\s+second/i.exec(message)
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

interface TextFieldProps {
  id: string
  label: string
  icon: LucideIcon
  error?: string
  /** A control that sits inside the field, on the right. */
  trailing?: ReactNode
  inputProps: ComponentProps<'input'>
}

/** A labelled input with an icon, an error message and a focus ring. */
function TextField({ id, label, icon: Icon, error, trailing, inputProps }: TextFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-ink-muted"
      >
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-ink-subtle">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <input
          id={id}
          {...inputProps}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={[
            'h-12 w-full rounded-xl border bg-surface pl-11 text-[15px] text-ink shadow-sm outline-none transition duration-200 placeholder:text-ink-subtle focus:ring-4',
            trailing ? 'pr-12' : 'pr-4',
            error
              ? 'border-danger/60 focus:border-danger focus:ring-danger/15'
              : 'border-line focus:border-brand focus:ring-brand/15',
          ].join(' ')}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</div>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The admin login, in two steps:
 *
 *   1. email + password - the API checks the password and emails a 6-digit code
 *   2. the 6-digit code - the API answers with the session
 *
 * The code step stays on screen (and in storage) until it is used, so a slow
 * connection, a refresh or a mistyped code never throws the admin back to a
 * form that looks like nothing happened.
 */
export default function Login() {
  const navigate = useNavigate()
  const { challenge, startLogin, verifyOtp, resendOtp, clearChallenge } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [notice, setNotice] = useState('')
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otpResetKey, setOtpResetKey] = useState(0)

  /** The retry that is scheduled (a timestamp) and what it is retrying. */
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const retryRef = useRef<{ email: string; password: string; attempt: number } | null>(null)

  /** A second ticker, so the countdowns stay in step. */
  const [now, setNow] = useState(() => Date.now())

  /** Guards against a second submit while the first one is still running. */
  const submittingRef = useRef(false)

  /** The provider's own cooldown, when it named one in an error message. */
  const cooldownUntilRef = useRef(0)

  const emailRef = useRef<HTMLInputElement | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const emailField = register('email')
  const passwordField = register('password')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // A session that is already good does not need the form again - this makes
  // a refresh with a stored token land on the right home directly.
  const user = useAuthStore((state) => state.user)
  useEffect(() => {
    if (user && !challenge) {
      navigate(homeForRole(user.role), { replace: true })
    }
  }, [user, challenge, navigate])

  // The code was emailed the moment the panel received the challenge, so both
  // the cooldown and the lifetime are counted from there.
  const issuedAt = challenge?.issuedAt ?? now
  const resendLeft = Math.max(
    0,
    Math.ceil(
      (Math.max(issuedAt + RESEND_COOLDOWN_SECONDS * 1000, cooldownUntilRef.current) - now) /
        1000,
    ),
  )
  const expiresLeft = challenge
    ? Math.max(0, Math.ceil((issuedAt + (challenge.ttlSeconds ?? 300) * 1000 - now) / 1000))
    : 0
  const retryLeft = retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000))
  const codeExpired = Boolean(challenge) && expiresLeft === 0
  /** A rate-limited or temporarily refused send needs a wait, not a retry loop. */
  const describeFailure = (failure: unknown, fallback: string) => {
    const status = apiErrorStatus(failure)
    const message = apiErrorMessage(failure, fallback)
    if (status === 429) {
      setHint('Too many attempts. Wait a couple of minutes, then ask for the code again.')
    } else if (status === 502 || status === 503 || status === 500) {
      setHint('The code could not be sent just now. Try again in a moment.')
    } else {
      setHint('')
    }
    setError(message)
  }

  /** Step 1: the password is checked and the API emails a 6-digit code. */
  const submitLogin = async (email: string, password: string, attempt: number) => {
    setLoading(true)
    setError('')
    setHint('')
    setNotice('')
    try {
      await startLogin(email, password)
      setRetryAt(null)
      retryRef.current = null
    } catch (failure) {
      const status = apiErrorStatus(failure)
      const message = apiErrorMessage(failure, 'Could not sign you in')
      const wait = parseRetryAfter(message)
      const sendFailed = status === undefined || status === 500 || status === 502 || status === 503
      if (sendFailed && attempt < MAX_AUTO_RETRIES) {
        // The provider names the wait it needs - believe it instead of guessing.
        const delay = wait ?? RETRY_DELAYS[attempt]
        retryRef.current = { email, password, attempt: attempt + 1 }
        setRetryAt(Date.now() + delay * 1000)
        setError('The code could not be sent just now.')
        setHint(
          wait
            ? `The mail server asked us to wait ${delay} seconds - retrying then.`
            : `Trying again in ${delay} seconds...`,
        )
      } else {
        setRetryAt(null)
        retryRef.current = null
        describeFailure(failure, 'Could not sign you in')
        toast.error(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (data: LoginForm) => submitLogin(data.email, data.password, 0)

  /** Step 2: the emailed code is confirmed and the session is minted. */
  const onVerify = async (code: string) => {
    if (!challenge || submittingRef.current) return
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.')
      return
    }

    submittingRef.current = true
    setLoading(true)
    setError('')
    setHint('')
    setNotice('')
    try {
      await verifyOtp(challenge.challengeToken, code)
      toast.success('Login successful')
      // Admins land on the panel, restaurant owners on their portal.
      navigate(homeForRole(useAuthStore.getState().user?.role))
    } catch (failure) {
      const message = apiErrorMessage(failure, 'Invalid code')
      if (apiErrorStatus(failure) === 401 && /expire/i.test(message)) {
        // The code (or the challenge) ran out. Start the flow again rather
        // than leaving the admin on a screen that can no longer succeed.
        clearChallenge()
        setOtp('')
        setOtpResetKey((key) => key + 1)
        setError('That code has expired. Enter your password to get a new one.')
        setHint('')
        emailRef.current?.focus()
      } else {
        describeFailure(failure, 'Invalid code')
        // Start with an empty row so the admin can type the code again.
        setOtp('')
        setOtpResetKey((key) => key + 1)
      }
      toast.error(message)
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  const onResend = async () => {
    if (!challenge || resending || resendLeft > 0) return
    setResending(true)
    setError('')
    setHint('')
    setNotice('')
    try {
      await resendOtp(challenge.challengeToken)
      setOtp('')
      setOtpResetKey((key) => key + 1)
      setNotice('A new code is on its way. The code you had before no longer works.')
      toast.success('A new code is on its way')
    } catch (failure) {
      const message = apiErrorMessage(failure, 'Could not resend the code')
      const wait = parseRetryAfter(message)
      if (wait) {
        // The provider named its own cooldown - count it down instead of
        // letting the admin hammer the button.
        cooldownUntilRef.current = Date.now() + wait * 1000
      }
      describeFailure(failure, 'Could not resend the code')
      toast.error(message)
    } finally {
      setResending(false)
    }
  }

  /** Start over with a different account. */
  const startOver = () => {
    clearChallenge()
    setError('')
    setHint('')
    setNotice('')
    setOtp('')
    setOtpResetKey((key) => key + 1)
    setRetryAt(null)
    retryRef.current = null
    window.setTimeout(() => emailRef.current?.focus(), 0)
  }

  // Retry the send once the mail provider's cooldown has passed.
  useEffect(() => {
    if (retryAt === null || !retryRef.current) return
    const timer = window.setTimeout(
      () => {
        const next = retryRef.current
        setRetryAt(null)
        if (next) void submitLogin(next.email, next.password, next.attempt)
      },
      Math.max(0, retryAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryAt])

  return (
    <div className="min-h-screen bg-canvas">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* The brand panel - hidden on small screens, where the form speaks
            for itself. */}
        <aside className="relative hidden overflow-hidden bg-[#061f1c] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute -left-28 -top-28 h-[30rem] w-[30rem] animate-breathe rounded-full bg-teal-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.07)_1px,transparent_0)] bg-[length:28px_28px]" />

          <div className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-emerald-950/60">
              <UtensilsCrossed className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-tight text-white">
                Swat City
              </span>
              <span className="block text-xs font-medium tracking-wide text-teal-200/70">
                Food Delivery
              </span>
            </span>
          </div>

          <div className="relative max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-teal-100/80">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Admin console
            </span>
            <h2 className="mt-6 text-[2.1rem] font-bold leading-[1.12] tracking-tight text-white xl:text-[2.6rem]">
              Every order, rider and restaurant in one place.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300/80">
              Sign in to follow live orders, approve riders, keep the restaurant
              network running and watch every payment land.
            </p>

            <ul className="mt-10 space-y-5">
              {HIGHLIGHTS.map(({ icon: Icon, title, copy }) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07]">
                    <Icon className="h-[18px] w-[18px] text-teal-300" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{title}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-slate-400">
                      {copy}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Swat City Food Delivery &middot; Mingora, Swat
          </p>
        </aside>

        {/* The form. */}
        <main className="relative flex min-h-screen flex-col">
          <div className="absolute left-5 top-5 z-10 flex items-center gap-2.5 sm:left-8 sm:top-8 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md shadow-teal-900/25">
              <UtensilsCrossed className="h-4 w-4 text-white" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">
              Swat City <span className="font-normal text-ink-muted">Admin</span>
            </span>
          </div>

          <div className="absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
            <ThemeToggle />
          </div>

          <div className="flex flex-1 items-center justify-center px-5 pb-12 pt-24 sm:px-8 sm:pt-20">
            <div className="w-full max-w-[26.5rem] animate-fade-up">
              <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8 dark:shadow-none">
                {/* How far along the login is. */}
                <div className="mb-7">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-contrast shadow-card">
                      1
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-strong transition-all duration-700 ease-out"
                        style={{ width: challenge ? '100%' : '38%' }}
                      />
                    </span>
                    <span
                      className={[
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition',
                        challenge
                          ? 'bg-brand text-brand-contrast shadow-card'
                          : 'bg-surface-muted text-ink-subtle',
                      ].join(' ')}
                    >
                      2
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em]">
                    <span className={challenge ? 'text-ink-subtle' : 'text-brand'}>
                      Sign in
                    </span>
                    <span className={challenge ? 'text-brand' : 'text-ink-subtle'}>
                      Verify code
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[28px]">
                    {challenge ? 'Enter your security code' : 'Welcome back'}
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {challenge ? (
                      <>
                        We sent a {OTP_LENGTH}-digit code to{' '}
                        <span className="font-medium text-ink">{challenge.email}</span>.
                      </>
                    ) : (
                      'Sign in with your admin or restaurant-owner account to manage the Swat City network.'
                    )}
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger-soft p-3.5 text-sm text-danger"
                  >
                    <CircleAlert className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span>
                      <span className="block font-medium">{error}</span>
                      {hint && <span className="mt-1 block opacity-90">{hint}</span>}
                    </span>
                  </div>
                )}

                {!error && notice && (
                  <div
                    role="status"
                    className="mb-5 flex items-start gap-3 rounded-2xl border border-positive/25 bg-positive-soft p-3.5 text-sm text-positive"
                  >
                    <CircleCheckBig
                      className="mt-0.5 h-[18px] w-[18px] shrink-0"
                      aria-hidden="true"
                    />
                    <span className="font-medium">{notice}</span>
                  </div>
                )}

                {challenge ? (
                  <form
                    className="space-y-6"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void onVerify(otp)
                    }}
                  >
                    <div>
                      <label
                        id="otp-label"
                        className="mb-3 block text-center text-sm font-medium text-ink-muted"
                      >
                        Enter the code from the email
                      </label>
                      <OtpInput
                        value={otp}
                        onChange={setOtp}
                        onComplete={(code) => void onVerify(code)}
                        length={OTP_LENGTH}
                        disabled={loading}
                        invalid={Boolean(error)}
                        autoFocus
                        resetKey={otpResetKey}
                        labelledBy="otp-label"
                      />
                      <p className="mt-3 text-center text-xs text-ink-muted">
                        {codeExpired ? (
                          <span className="font-medium text-warning">
                            This code has expired - ask for a new one.
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                            The code expires in {formatClock(expiresLeft)}
                          </span>
                        )}
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-brand-contrast shadow-card transition duration-200 hover:bg-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {loading ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Verifying&hellip;
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                          Verify code
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between gap-3 text-sm">
                      <button
                        type="button"
                        onClick={onResend}
                        disabled={resending || resendLeft > 0}
                        className="inline-flex items-center gap-1.5 font-medium text-brand transition hover:opacity-80 focus:outline-none disabled:cursor-not-allowed disabled:text-ink-subtle"
                      >
                        {resending ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {resending
                          ? 'Sending...'
                          : resendLeft > 0
                            ? `Resend code in ${formatClock(resendLeft)}`
                            : 'Resend code'}
                      </button>
                      <button
                        type="button"
                        onClick={startOver}
                        className="inline-flex items-center gap-1.5 font-medium text-ink-muted transition hover:text-ink focus:outline-none"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        Use a different account
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
                    <TextField
                      id="email"
                      label="Email address"
                      icon={Mail}
                      error={errors.email?.message}
                      inputProps={{
                        ...emailField,
                        ref: (element: HTMLInputElement | null) => {
                          emailField.ref(element)
                          emailRef.current = element
                        },
                        type: 'email',
                        autoComplete: 'email',
                        autoFocus: true,
                        placeholder: 'admin@swatcity.pk',
                      }}
                    />

                    <TextField
                      id="password"
                      label="Password"
                      icon={Lock}
                      error={errors.password?.message}
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          onMouseDown={(event) => event.preventDefault()}
                          aria-label={showPassword ? 'Hide the password' : 'Show the password'}
                          title={showPassword ? 'Hide the password' : 'Show the password'}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-surface-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {showPassword ? (
                            <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
                          ) : (
                            <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
                          )}
                        </button>
                      }
                      inputProps={{
                        ...passwordField,
                        type: showPassword ? 'text' : 'password',
                        autoComplete: 'current-password',
                        placeholder: 'Your password',
                      }}
                    />

                    <div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-brand-contrast shadow-card transition duration-200 hover:bg-brand-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {loading ? (
                          <>
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Sending code&hellip;
                          </>
                        ) : retryLeft !== null ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Retrying in {retryLeft}s
                          </>
                        ) : (
                          <>
                            Continue
                            <ArrowRight
                              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </>
                        )}
                      </button>
                      <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">
                        We email you a {OTP_LENGTH}-digit code - it can take a few seconds to
                        arrive.
                      </p>
                    </div>
                  </form>
                )}
              </div>

              <p className="mt-6 text-center text-xs text-ink-subtle">
                Protected by a one-time code. Sessions expire after 15 minutes of inactivity.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
