import { useState } from 'react'
import { toast } from 'sonner'
import { Ban, CheckCircle2, Pencil, Plus, Tag } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, formatDate, statusTone } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Checkbox, Field, Input, Select, Textarea } from '../components/ui/Field'
import Modal, { ConfirmDialog } from '../components/ui/Modal'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'

interface PromotionRow {
  _id: string
  code: string
  title?: string | null
  description?: string | null
  type?: string | null
  value?: number
  maxDiscount?: number | null
  minOrder?: number
  audience?: { type?: string; userIds?: string[] } | null
  startsAt?: string | null
  expiresAt?: string | null
  maxUses?: number | null
  usedCount?: number
  active?: boolean
}

interface FormState {
  code: string
  title: string
  description: string
  type: 'percent' | 'flat'
  value: string
  maxDiscount: string
  minOrder: string
  audienceType: 'all' | 'new_customers'
  startsAt: string
  expiresAt: string
  maxUses: string
  active: boolean
}

const EMPTY_FORM: FormState = {
  code: '',
  title: '',
  description: '',
  type: 'percent',
  value: '10',
  maxDiscount: '',
  minOrder: '0',
  audienceType: 'all',
  startsAt: '',
  expiresAt: '',
  maxUses: '',
  active: true,
}

function toInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function audienceLabel(promotion: PromotionRow): string {
  const type = promotion.audience?.type ?? 'all'
  if (type === 'new_customers') return 'New customers'
  if (type === 'specific_users') return 'Specific customers'
  if (type === 'specific_riders') return 'Specific riders'
  return 'Everyone'
}

/** Coupon codes, their limits and their validity. */
export default function Promotions() {
  const list = useListResource<PromotionRow>({
    endpoint: '/admin/promotions',
    rowsKey: 'promotions',
  })

  const [editing, setEditing] = useState<PromotionRow | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [originalAudience, setOriginalAudience] = useState<{ type?: string; userIds?: string[] }>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<PromotionRow | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOriginalAudience({})
    setErrors({})
    setOpen(true)
  }

  const openEdit = (promotion: PromotionRow) => {
    setEditing(promotion)
    setForm({
      code: promotion.code,
      title: promotion.title ?? '',
      description: promotion.description ?? '',
      type: promotion.type === 'flat' ? 'flat' : 'percent',
      value: String(promotion.value ?? 0),
      maxDiscount: promotion.maxDiscount != null ? String(promotion.maxDiscount) : '',
      minOrder: String(promotion.minOrder ?? 0),
      audienceType:
        promotion.audience?.type === 'new_customers' ? 'new_customers' : 'all',
      startsAt: toInput(promotion.startsAt),
      expiresAt: toInput(promotion.expiresAt),
      maxUses: promotion.maxUses != null ? String(promotion.maxUses) : '',
      active: promotion.active !== false,
    })
    setOriginalAudience(promotion.audience ?? {})
    setErrors({})
    setOpen(true)
  }

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }))

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    const code = form.code.trim().toUpperCase()
    if (code.length < 3 || code.length > 20) next.code = 'Use 3–20 characters.'
    if (form.title.trim().length < 2) next.title = 'A title helps the app show the offer.'
    const value = Number(form.value)
    if (!Number.isFinite(value) || value < 0) next.value = 'Enter a number of 0 or more.'
    if (form.type === 'percent' && value > 100) next.value = 'A percentage cannot exceed 100.'
    if (form.maxDiscount && Number(form.maxDiscount) < 0) next.maxDiscount = 'Cannot be negative.'
    if (Number(form.minOrder) < 0) next.minOrder = 'Cannot be negative.'
    if (form.maxUses && (!Number.isInteger(Number(form.maxUses)) || Number(form.maxUses) < 1)) {
      next.maxUses = 'Use a whole number of 1 or more.'
    }
    if (form.startsAt && form.expiresAt && new Date(form.startsAt) >= new Date(form.expiresAt)) {
      next.expiresAt = 'Must be after the start date.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    const payload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      value: Number(form.value),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
      minOrder: Number(form.minOrder) || 0,
      audience: {
        type: form.audienceType,
        userIds:
          originalAudience.type === form.audienceType ? originalAudience.userIds ?? [] : [],
      },
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      active: form.active,
    }
    try {
      if (editing) {
        await api.patch(`/admin/promotions/${editing._id}`, payload)
        toast.success('Promotion updated')
      } else {
        await api.post('/admin/promotions', payload)
        toast.success('Promotion created')
      }
      setOpen(false)
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not save this promotion.'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (promotion: PromotionRow) => {
    try {
      await api.patch(`/admin/promotions/${promotion._id}`, { active: !promotion.active })
      toast.success(promotion.active ? 'Promotion paused' : 'Promotion activated')
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not change this promotion.'))
    }
  }

  const deactivate = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api.delete(`/admin/promotions/${deleting._id}`)
      toast.success('Promotion deactivated')
      setDeleting(null)
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not deactivate this promotion.'))
    } finally {
      setDeletingBusy(false)
    }
  }

  const columns: Column<PromotionRow>[] = [
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      sortValue: (row) => row.code,
      render: (row) => (
        <div>
          <span className="rounded-md border border-brand/25 bg-brand-soft px-2 py-0.5 font-mono text-xs font-bold text-brand">
            {row.code}
          </span>
          <div className="mt-1 max-w-[220px] truncate text-xs text-ink-muted">
            {row.title || 'Untitled promotion'}
          </div>
        </div>
      ),
    },
    {
      key: 'value',
      label: 'Discount',
      render: (row) => (
        <div>
          <div className="font-semibold text-ink">
            {row.type === 'flat' ? formatCurrency(row.value ?? 0) : `${row.value ?? 0}% off`}
          </div>
          {row.maxDiscount ? (
            <div className="text-xs text-ink-subtle">up to {formatCurrency(row.maxDiscount)}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'minOrder',
      label: 'Min order',
      secondary: true,
      align: 'right',
      render: (row) => formatCurrency(row.minOrder ?? 0),
    },
    {
      key: 'audience',
      label: 'Audience',
      secondary: true,
      render: (row) => audienceLabel(row),
    },
    {
      key: 'usage',
      label: 'Used',
      align: 'right',
      render: (row) => (
        <span className="text-ink">
          {row.usedCount ?? 0}
          {row.maxUses ? <span className="text-ink-subtle"> / {row.maxUses}</span> : null}
        </span>
      ),
    },
    {
      key: 'validity',
      label: 'Valid',
      secondary: true,
      render: (row) => {
        const expired = row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false
        return (
          <div className="text-xs">
            <div className={expired ? 'text-danger' : 'text-ink'}>
              {row.expiresAt ? `Until ${formatDate(row.expiresAt)}` : 'No expiry'}
            </div>
            {row.startsAt && (
              <div className="text-ink-subtle">From {formatDate(row.startsAt)}</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        const expired = row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false
        if (expired) return <Badge tone="danger">Expired</Badge>
        return (
          <Badge tone={row.active ? statusTone('active') : 'neutral'} dot>
            {row.active ? 'Active' : 'Paused'}
          </Badge>
        )
      },
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Finance"
        title="Promotions"
        description="Coupon codes, how much they take off, who can use them and how often they were redeemed."
        actions={
          <>
            <Button variant="secondary" icon={Tag} onClick={() => void list.reload()}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              New promotion
            </Button>
          </>
        }
      />

      <Card>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          emptyTitle="No promotions yet"
          emptyDescription="Create a code to give customers a reason to order today."
          emptyIcon={Tag}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          actions={(row) => (
            <Dropdown
              items={[
                { label: 'Edit', icon: Pencil, onClick: () => openEdit(row) },
                {
                  label: row.active ? 'Pause' : 'Activate',
                  icon: row.active ? Ban : CheckCircle2,
                  onClick: () => void toggleActive(row),
                },
                {
                  label: 'Deactivate',
                  icon: Ban,
                  danger: true,
                  divider: true,
                  disabled: !row.active,
                  onClick: () => setDeleting(row),
                },
              ]}
            />
          )}
        />
        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="promotions"
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'New promotion'}
        description="Codes are matched exactly and are always shown in capitals."
        size="lg"
        busy={saving}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {editing ? 'Save changes' : 'Create promotion'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="promo-code" required error={errors.code}>
            <Input
              id="promo-code"
              value={form.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              placeholder="SWAT10"
              maxLength={20}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Title" htmlFor="promo-title" required error={errors.title}>
            <Input
              id="promo-title"
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="10% off your first order"
              maxLength={80}
            />
          </Field>
          <Field label="Description" htmlFor="promo-description" className="sm:col-span-2">
            <Textarea
              id="promo-description"
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="Shown in the app under the code."
              maxLength={300}
            />
          </Field>

          <Field label="Discount type" htmlFor="promo-type">
            <Select
              id="promo-type"
              value={form.type}
              onChange={(event) => set('type', event.target.value)}
              options={[
                { value: 'percent', label: 'Percentage off' },
                { value: 'flat', label: 'Fixed amount off' },
              ]}
            />
          </Field>
          <Field
            label={form.type === 'percent' ? 'Percentage' : 'Amount (Rs)'}
            htmlFor="promo-value"
            required
            error={errors.value}
          >
            <Input
              id="promo-value"
              type="number"
              min={0}
              step={form.type === 'percent' ? 1 : 10}
              value={form.value}
              onChange={(event) => set('value', event.target.value)}
            />
          </Field>

          <Field
            label="Maximum discount (Rs)"
            htmlFor="promo-max"
            hint="Caps a percentage discount. Leave empty for no cap."
            error={errors.maxDiscount}
          >
            <Input
              id="promo-max"
              type="number"
              min={0}
              value={form.maxDiscount}
              onChange={(event) => set('maxDiscount', event.target.value)}
              placeholder="No cap"
            />
          </Field>
          <Field label="Minimum order (Rs)" htmlFor="promo-min" error={errors.minOrder}>
            <Input
              id="promo-min"
              type="number"
              min={0}
              value={form.minOrder}
              onChange={(event) => set('minOrder', event.target.value)}
            />
          </Field>

          <Field label="Audience" htmlFor="promo-audience">
            <Select
              id="promo-audience"
              value={form.audienceType}
              onChange={(event) => set('audienceType', event.target.value)}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'new_customers', label: 'New customers only' },
              ]}
            />
          </Field>
          <Field
            label="Usage limit"
            htmlFor="promo-uses"
            hint="Total redemptions. Leave empty for unlimited."
            error={errors.maxUses}
          >
            <Input
              id="promo-uses"
              type="number"
              min={1}
              value={form.maxUses}
              onChange={(event) => set('maxUses', event.target.value)}
              placeholder="Unlimited"
            />
          </Field>

          <Field label="Starts" htmlFor="promo-start">
            <Input
              id="promo-start"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set('startsAt', event.target.value)}
            />
          </Field>
          <Field label="Expires" htmlFor="promo-end" error={errors.expiresAt}>
            <Input
              id="promo-end"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) => set('expiresAt', event.target.value)}
            />
          </Field>

          <div className="sm:col-span-2">
            <Checkbox
              label="Active — customers can redeem this code right away"
              checked={form.active}
              onChange={(event) => set('active', event.target.checked)}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void deactivate()}
        title="Deactivate this promotion?"
        message={`${deleting?.code ?? 'This code'} will stop working immediately. Past orders keep their discount. This cannot be undone from here.`}
        confirmLabel="Deactivate"
        busy={deletingBusy}
      />
    </div>
  )
}
