import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, Info, RefreshCw, Save } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card, CardBody } from '../components/ui/Card'
import { Field, Input, Switch } from '../components/ui/Field'
import { ErrorState, Skeleton } from '../components/ui/States'

interface PaymentMethodConfig {
  enabled: boolean
  bankName: string
  accountTitle: string
  accountNumber: string
  iban?: string
  branch?: string
}

interface PaymentMethodCard {
  channel: 'ubl' | 'easypaisa' | 'jazzcash'
  label: string
  config: PaymentMethodConfig
  source: 'database' | 'env-default'
  settingKey: string
}

interface PaymentMethodsPayload {
  methods: PaymentMethodCard[]
  transfersEnabled: boolean
}

const CHANNEL_HELP: Record<string, string> = {
  ubl: 'The bank account customers transfer into. Shown on the mobile checkout payment screen.',
  easypaisa: 'The Easypaisa mobile account customers send money to.',
  jazzcash: 'The JazzCash mobile account customers send money to.',
}

/**
 * Finance → Payment Methods: the receiving accounts for UBL / Easypaisa /
 * JazzCash manual transfers. Values are stored in the backend database and go
 * LIVE for the next checkout — no app update and no redeploy needed. An
 * account saved here is served verbatim; blank fields fall back to the server
 * defaults, so the checkout can never render an empty account.
 */
export default function PaymentMethods() {
  const settings = useApi<PaymentMethodsPayload>('/admin/payment-methods', (payload) => {
    const data = (payload as { data?: Record<string, unknown> })?.data
    return {
      methods: ((data?.methods as PaymentMethodCard[]) ?? []).map((row) => ({
        ...row,
        config: { ...row.config },
      })),
      transfersEnabled: Boolean(data?.transfersEnabled),
    }
  })

  const [drafts, setDrafts] = useState<Record<string, PaymentMethodConfig>>({})
  const [master, setMaster] = useState(true)
  const [masterBusy, setMasterBusy] = useState(false)
  const [savingChannel, setSavingChannel] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Seed the drafts from the load; keep the admin's typing while reloading.
  useEffect(() => {
    if (!settings.data) return
    setMaster(settings.data.transfersEnabled)
    setDrafts((prev) => {
      const next: Record<string, PaymentMethodConfig> = { ...prev }
      for (const row of settings.data?.methods ?? []) {
        if (!next[row.channel]) next[row.channel] = { ...row.config }
      }
      return next
    })
  }, [settings.data])

  const setDraft = (channel: string, patch: Partial<PaymentMethodConfig>) => {
    setDrafts((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], ...patch },
    }))
  }

  const saveChannel = async (card: PaymentMethodCard) => {
    const draft = drafts[card.channel]
    if (!draft) return
    setErrors((prev) => ({ ...prev, [card.channel]: '' }))
    if (draft.enabled && (!draft.accountTitle.trim() || !draft.accountNumber.trim())) {
      setErrors((prev) => ({
        ...prev,
        [card.channel]: 'Account title and number are required while the method is enabled.',
      }))
      return
    }
    setSavingChannel(card.channel)
    try {
      await api.put(`/admin/payment-methods/${card.channel}`, {
        enabled: draft.enabled,
        bankName: draft.bankName.trim() || undefined,
        accountTitle: draft.accountTitle.trim() || undefined,
        accountNumber: draft.accountNumber.trim() || undefined,
        iban: draft.iban?.trim() || undefined,
        branch: draft.branch?.trim() || undefined,
      })
      toast.success(`${card.label} saved — live for the next checkout`)
      await settings.reload()
    } catch (failure) {
      setErrors((prev) => ({
        ...prev,
        [card.channel]: apiErrorMessage(failure, 'Could not save this account.'),
      }))
      toast.error(apiErrorMessage(failure, 'Could not save this account.'))
    } finally {
      setSavingChannel(null)
    }
  }

  const saveMaster = async (enabled: boolean) => {
    setMasterBusy(true)
    try {
      await api.put('/admin/payment-methods/master', { enabled })
      setMaster(enabled)
      toast.success(enabled ? 'Manual transfer payments enabled' : 'Manual transfer payments disabled')
      await settings.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not change the master switch.'))
    } finally {
      setMasterBusy(false)
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Finance"
        title="Payment Methods"
        description="The real accounts customers transfer into for UBL / Easypaisa / JazzCash orders. Saved values go live immediately — no app update needed."
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={settings.loading}
            onClick={() => void settings.reload()}
          >
            Refresh
          </Button>
        }
      />

      {settings.error ? (
        <Card>
          <ErrorState
            message={settings.error}
            onRetry={() => void settings.reload()}
          />
        </Card>
      ) : settings.loading && !settings.data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardBody className="space-y-3">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <Card className="mb-4 border-info/25 bg-info-soft/40">
            <CardBody className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                  <Info className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="text-sm leading-relaxed text-ink-muted">
                  <p className="font-semibold text-ink">Master switch: manual transfer payments</p>
                  <p className="mt-0.5">
                    Turning this OFF hides every transfer method from the mobile checkout and stops
                    new transfers. Existing awaiting-verification payments stay in the queue.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={master ? 'success' : 'neutral'}>{master ? 'On' : 'Off'}</Badge>
                <Switch
                  checked={master}
                  disabled={masterBusy}
                  onChange={(next) => void saveMaster(next)}
                  label="Manual transfer payments"
                />
              </div>
            </CardBody>
          </Card>

          <div className="space-y-3">
            {settings.data?.methods.map((card) => {
              const draft = drafts[card.channel]
              if (!draft) return null
              return (
                <Card key={card.channel}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <Banknote className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-ink">{card.label}</p>
                        <p className="text-xs text-ink-muted">{CHANNEL_HELP[card.channel]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={card.source === 'database' ? 'info' : 'neutral'}>
                        {card.source === 'database' ? 'Saved in database' : 'Server default'}
                      </Badge>
                      <Badge tone={draft.enabled ? 'success' : 'neutral'}>
                        {draft.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  <CardBody className="space-y-3">
                    <Switch
                      checked={draft.enabled}
                      onChange={(next) => setDraft(card.channel, { enabled: next })}
                      label={`${card.label} enabled`}
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Bank / account name" htmlFor={`${card.channel}-bank`}>
                        <Input
                          id={`${card.channel}-bank`}
                          value={draft.bankName}
                          onChange={(event) => setDraft(card.channel, { bankName: event.target.value })}
                          placeholder="UBL — United Bank Limited"
                          maxLength={80}
                        />
                      </Field>
                      <Field label="Account title" htmlFor={`${card.channel}-title`} required={draft.enabled}>
                        <Input
                          id={`${card.channel}-title`}
                          value={draft.accountTitle}
                          onChange={(event) => setDraft(card.channel, { accountTitle: event.target.value })}
                          placeholder="Swat City Food Delivery"
                          maxLength={60}
                        />
                      </Field>
                      <Field label="Account number" htmlFor={`${card.channel}-number`} required={draft.enabled}>
                        <Input
                          id={`${card.channel}-number`}
                          value={draft.accountNumber}
                          onChange={(event) => setDraft(card.channel, { accountNumber: event.target.value })}
                          placeholder="0405289118711"
                          maxLength={60}
                          inputMode={card.channel === 'ubl' ? 'text' : 'numeric'}
                        />
                      </Field>
                      <Field
                        label="IBAN (optional)"
                        htmlFor={`${card.channel}-iban`}
                        hint={card.channel === 'ubl' ? 'Shown with a Copy button in the app' : undefined}
                      >
                        <Input
                          id={`${card.channel}-iban`}
                          value={draft.iban ?? ''}
                          onChange={(event) => setDraft(card.channel, { iban: event.target.value })}
                          placeholder="PK36SCBL0000001123456702"
                          maxLength={34}
                        />
                      </Field>
                      {card.channel === 'ubl' && (
                        <Field label="Branch (optional)" htmlFor={`${card.channel}-branch`}>
                          <Input
                            id={`${card.channel}-branch`}
                            value={draft.branch ?? ''}
                            onChange={(event) => setDraft(card.channel, { branch: event.target.value })}
                            placeholder="Mingora, Swat"
                            maxLength={80}
                          />
                        </Field>
                      )}
                    </div>

                    {errors[card.channel] && (
                      <p className="text-sm font-medium text-danger">{errors[card.channel]}</p>
                    )}

                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        icon={Save}
                        loading={savingChannel === card.channel}
                        onClick={() => void saveChannel(card)}
                      >
                        Save {card.label}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
