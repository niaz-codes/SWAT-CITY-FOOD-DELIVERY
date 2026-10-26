import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Clock,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, formatDateTime, humanizeStatus, statusTone } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Checkbox, Field, Input, Select, Switch, Textarea } from '../components/ui/Field'
import Modal, { ConfirmDialog } from '../components/ui/Modal'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'

interface RestaurantRow {
  _id: string
  name: string
  description?: string | null
  cuisine?: string | null
  category?: string | null
  tags?: string[]
  status: string
  featured?: boolean
  /**
   * Admin approval. Owner-registered restaurants start `false` and stay hidden
   * from the customer app until this flips to true.
   */
  isApproved?: boolean
  rating?: number
  reviewCount?: number
  deliveryTimeMin?: number
  deliveryFee?: number
  minOrder?: number
  deliveryKM?: number
  freeDelivery?: boolean
  promo?: string | null
  imageUrl?: string | null
  emoji?: string | null
  ownerName?: string | null
  phone?: string | null
  addressLine?: string | null
  area?: string | null
  /** Populated with `{ name, email, phone }` by the admin list endpoint. */
  ownerUser?: { _id: string; name?: string | null; email?: string | null } | string | null
  location?: { coordinates?: number[] } | null
  hours?: { open?: string; close?: string } | null
  createdAt: string
}

interface FormState {
  name: string
  description: string
  cuisine: string
  category: string
  tags: string
  status: 'open' | 'closed' | 'busy'
  featured: boolean
  /** Admin-only: whether the kitchen is visible to customers. */
  approved: boolean
  deliveryTimeMin: string
  deliveryFee: string
  minOrder: string
  freeDelivery: boolean
  promo: string
  emoji: string
  ownerName: string
  phone: string
  addressLine: string
  area: string
  lat: string
  lng: string
  openTime: string
  closeTime: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  cuisine: '',
  category: '',
  tags: '',
  status: 'open',
  featured: false,
  approved: true,
  deliveryTimeMin: '30',
  deliveryFee: '0',
  minOrder: '0',
  freeDelivery: false,
  promo: '',
  emoji: '',
  ownerName: '',
  phone: '',
  addressLine: '',
  area: '',
  lat: '',
  lng: '',
  openTime: '10:00',
  closeTime: '23:00',
}

const TIME_PATTERN = /^\d{2}:\d{2}$/

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open — taking orders' },
  { value: 'busy', label: 'Busy — longer waits' },
  { value: 'closed', label: 'Closed — hidden from ordering' },
]

/** The kitchens on the platform: details, fees, hours, photo and open state. */
export default function Restaurants() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [approval, setApproval] = useState('all')
  const list = useListResource<RestaurantRow>({
    endpoint: '/admin/restaurants',
    rowsKey: 'restaurants',
    searchParam: 'search',
  })

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RestaurantRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInput = useRef<HTMLInputElement | null>(null)

  const [deleting, setDeleting] = useState<RestaurantRow | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  /** The owner email typed in to link an account (edit form only). */
  const [ownerEmail, setOwnerEmail] = useState('')

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setPendingImage(null)
    setImagePreview(null)
    setOwnerEmail('')
    setOpen(true)
  }

  const openEdit = (row: RestaurantRow) => {
    const [lng, lat] = row.location?.coordinates ?? []
    setEditing(row)
    setForm({
      name: row.name,
      description: row.description ?? '',
      cuisine: row.cuisine ?? '',
      category: row.category ?? '',
      tags: (row.tags ?? []).join(', '),
      status: row.status === 'closed' ? 'closed' : row.status === 'busy' ? 'busy' : 'open',
      featured: Boolean(row.featured),
      approved: row.isApproved !== false,
      deliveryTimeMin: String(row.deliveryTimeMin ?? 30),
      deliveryFee: String(row.deliveryFee ?? 0),
      minOrder: String(row.minOrder ?? 0),
      freeDelivery: Boolean(row.freeDelivery),
      promo: row.promo ?? '',
      emoji: row.emoji ?? '',
      ownerName: row.ownerName ?? '',
      phone: row.phone ?? '',
      addressLine: row.addressLine ?? '',
      area: row.area ?? '',
      lat: lat != null ? String(lat) : '',
      lng: lng != null ? String(lng) : '',
      openTime: row.hours?.open || '10:00',
      closeTime: row.hours?.close || '23:00',
    })
    setErrors({})
    setPendingImage(null)
    setImagePreview(row.imageUrl ?? null)
    setOwnerEmail('')
    setOpen(true)
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const pickImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Keep the image under 8 MB.')
      return
    }
    setPendingImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    const name = form.name.trim()
    if (name.length < 2 || name.length > 80) next.name = 'Use 2–80 characters.'
    if (form.description.length > 500) next.description = 'Keep it under 500 characters.'
    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (tags.length > 10) next.tags = 'At most 10 tags.'
    if (tags.some((tag) => tag.length > 30)) next.tags = 'Each tag must be 30 characters or less.'
    const deliveryTime = Number(form.deliveryTimeMin)
    if (!Number.isInteger(deliveryTime) || deliveryTime < 1 || deliveryTime > 300) {
      next.deliveryTimeMin = 'Between 1 and 300 minutes.'
    }
    for (const key of ['deliveryFee', 'minOrder'] as const) {
      const value = form[key]
      if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        next[key] = 'Enter zero or more.'
      }
    }
    if (form.lat && (!Number.isFinite(Number(form.lat)) || Math.abs(Number(form.lat)) > 90)) {
      next.lat = 'Latitude must be between -90 and 90.'
    }
    if (form.lng && (!Number.isFinite(Number(form.lng)) || Math.abs(Number(form.lng)) > 180)) {
      next.lng = 'Longitude must be between -180 and 180.'
    }
    if (form.openTime && !TIME_PATTERN.test(form.openTime)) next.openTime = 'Use HH:MM.'
    if (form.closeTime && !TIME_PATTERN.test(form.closeTime)) next.closeTime = 'Use HH:MM.'
    if (form.phone.length > 20) next.phone = 'Keep it under 20 characters.'
    if (form.promo.length > 120) next.promo = 'Keep it under 120 characters.'
    if (form.emoji.length > 4) next.emoji = 'One emoji, please.'
    if (ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) {
      next.ownerEmail = 'Enter a valid email address.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    // On create an empty optional field is left out; on edit it is sent as an
    // empty string, which is how the API clears a value that was set before.
    const text = (value: string) => (editing ? value.trim() : value.trim() || undefined)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: text(form.description),
      cuisine: text(form.cuisine),
      category: text(form.category),
      tags,
      status: form.status,
      featured: form.featured,
      deliveryTimeMin: Number(form.deliveryTimeMin),
      deliveryFee: Number(form.deliveryFee) || 0,
      minOrder: Number(form.minOrder) || 0,
      freeDelivery: form.freeDelivery,
      promo: text(form.promo),
      emoji: text(form.emoji),
      ownerName: text(form.ownerName),
      phone: text(form.phone),
      addressLine: text(form.addressLine),
      area: text(form.area),
      lat: form.lat ? Number(form.lat) : undefined,
      lng: form.lng ? Number(form.lng) : undefined,
      hours:
        form.openTime && form.closeTime
          ? { open: form.openTime, close: form.closeTime }
          : undefined,
    }
    // Admin-only flags, edit only: the create schema does not take them, and a
    // new kitchen is approved by default anyway.
    if (editing) {
      payload.isApproved = form.approved
      // Typing an email here links an existing `restaurant`-role account as
      // the owner; the backend rejects unknown emails with a clear message.
      if (ownerEmail.trim()) payload.ownerEmail = ownerEmail.trim().toLowerCase()
    }
    try {
      let id = editing?._id
      if (editing) {
        await api.patch(`/admin/restaurants/${editing._id}`, payload)
        toast.success('Restaurant updated')
      } else {
        const response = await api.post('/admin/restaurants', payload)
        id = response.data?.data?.restaurant?._id as string | undefined
        toast.success('Restaurant created')
      }

      if (pendingImage && id) {
        try {
          const body = new FormData()
          body.append('file', pendingImage)
          await api.post(`/admin/restaurants/${id}/upload`, body)
          toast.success('Photo uploaded')
        } catch (failure) {
          toast.error(
            apiErrorMessage(failure, 'Restaurant saved, but the photo could not be uploaded.'),
          )
        }
      }

      setOpen(false)
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not save this restaurant.'))
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (row: RestaurantRow) => {
    const nextStatus = row.status === 'open' ? 'closed' : 'open'
    setTogglingId(row._id)
    try {
      await api.patch(`/admin/restaurants/${row._id}`, { status: nextStatus })
      toast.success(nextStatus === 'open' ? 'Restaurant opened' : 'Restaurant closed')
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not change the open state.'))
    } finally {
      setTogglingId(null)
    }
  }

  /**
   * Approve or hide a kitchen for customers. Owner-registrations arrive
   * unapproved; this is the switch that puts them on the map (or takes it off).
   */
  const changeApproval = async (row: RestaurantRow, approved: boolean) => {
    setApprovingId(row._id)
    try {
      await api.patch(`/admin/restaurants/${row._id}`, { isApproved: approved })
      toast.success(
        approved
          ? `${row.name} is now visible to customers`
          : `${row.name} is hidden from customers until re-approved`,
      )
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not change the approval.'))
    } finally {
      setApprovingId(null)
    }
  }

  const remove = async () => {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api.delete(`/admin/restaurants/${deleting._id}`)
      toast.success('Restaurant removed')
      setDeleting(null)
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not remove this restaurant.'))
    } finally {
      setDeletingBusy(false)
    }
  }

  const columns: Column<RestaurantRow>[] = [
    {
      key: 'restaurant',
      label: 'Restaurant',
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-line"
              loading="lazy"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-base">
              {row.emoji || <Store className="h-4 w-4 text-ink-subtle" aria-hidden="true" />}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{row.name}</div>
            <div className="truncate text-xs text-ink-subtle">
              {row.area || row.addressLine || row.category || 'Swat'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'cuisine',
      label: 'Cuisine',
      render: (row) => (
        <div className="text-xs">
          <div className="text-ink">{row.cuisine || row.category || '—'}</div>
          {(row.tags ?? []).length > 0 && (
            <div className="truncate text-ink-subtle">{(row.tags ?? []).slice(0, 3).join(' · ')}</div>
          )}
        </div>
      ),
    },
    {
      key: 'owner',
      label: 'Owner',
      secondary: true,
      render: (row) => {
        // The list populates ownerUser with { name, email, phone }.
        const account =
          row.ownerUser && typeof row.ownerUser === 'object' ? row.ownerUser : null
        return (
          <div className="text-xs">
            <div className="text-ink">{row.ownerName || account?.name || '—'}</div>
            {account?.email ? (
              <div className="truncate text-ink-subtle">{account.email}</div>
            ) : (
              <div className="text-ink-subtle">No owner account</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'rating',
      label: 'Rating',
      align: 'right',
      secondary: true,
      render: (row) =>
        row.rating ? (
          <span className="text-xs">
            <span className="font-semibold text-ink">{row.rating.toFixed(1)}</span>
            <span className="text-ink-subtle"> · {row.reviewCount ?? 0}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-subtle">Not rated</span>
        ),
    },
    {
      key: 'delivery',
      label: 'Delivery',
      align: 'right',
      render: (row) => (
        <div className="text-xs">
          <div className="text-ink">{row.deliveryTimeMin ?? 30} min</div>
          <div className="text-ink-subtle">
            {row.freeDelivery ? 'Free' : formatCurrency(row.deliveryFee ?? 0)} · min{' '}
            {formatCurrency(row.minOrder ?? 0)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(row.status)} dot>
            {humanizeStatus(row.status)}
          </Badge>
          {row.featured && <Badge tone="brand">Featured</Badge>}
          {row.isApproved === false && <Badge tone="warning">Awaiting approval</Badge>}
        </div>
      ),
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Catalog"
        title="Restaurants"
        description="Every kitchen on Swat City — their fees, hours, photo and whether they are taking orders."
        actions={
          <>
            <Button variant="secondary" icon={Store} onClick={() => void list.reload()}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              New restaurant
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-full sm:w-72">
            <Input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                list.setSearch(event.target.value)
              }}
              placeholder="Search kitchens by name"
              icon={Search}
              aria-label="Search restaurants"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                list.setFilter('status', event.target.value)
              }}
              aria-label="Filter restaurants by status"
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'open', label: 'Open' },
                { value: 'busy', label: 'Busy' },
                { value: 'closed', label: 'Closed' },
              ]}
            />
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={approval}
              onChange={(event) => {
                setApproval(event.target.value)
                list.setFilter('approval', event.target.value)
              }}
              aria-label="Filter restaurants by approval"
              options={[
                { value: 'all', label: 'All approvals' },
                { value: 'pending', label: 'Awaiting approval' },
                { value: 'approved', label: 'Approved' },
              ]}
            />
          </div>
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} restaurants
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          emptyTitle="No restaurants yet"
          emptyDescription="Add the first kitchen and it appears in the app immediately."
          emptyIcon={Store}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          onRowClick={openEdit}
          actions={(row) => (
            <Dropdown
              items={[
                { label: 'Edit details', icon: Pencil, onClick: () => openEdit(row) },
                {
                  label: row.status === 'open' ? 'Close restaurant' : 'Open restaurant',
                  icon: Clock,
                  disabled: togglingId === row._id,
                  onClick: () => void toggleStatus(row),
                },
                {
                  // Owner-registrations land here unapproved; one click makes
                  // the kitchen public without opening the edit form.
                  label:
                    row.isApproved === false ? 'Approve for customers' : 'Hide from customers',
                  icon: ShieldCheck,
                  disabled: approvingId === row._id,
                  divider: true,
                  onClick: () => void changeApproval(row, row.isApproved === false),
                },
                {
                  label: 'Remove restaurant',
                  icon: Trash2,
                  danger: true,
                  divider: true,
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
          noun="restaurants"
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New restaurant'}
        description={
          editing
            ? `Joined ${formatDateTime(editing.createdAt)} · every change is visible in the app right away.`
            : 'The kitchen appears in the app as soon as you save it.'
        }
        size="xl"
        busy={saving}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {editing ? 'Save changes' : 'Create restaurant'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Photo */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-muted/40 p-3">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Restaurant"
                className="h-20 w-28 rounded-lg object-cover ring-1 ring-line"
              />
            ) : (
              <span className="flex h-20 w-28 items-center justify-center rounded-lg bg-surface text-2xl ring-1 ring-line">
                {form.emoji || <UtensilsCrossed className="h-6 w-6 text-ink-subtle" aria-hidden="true" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Cover photo</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Landscape works best. It is uploaded after the details are saved.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" icon={ImagePlus} onClick={() => imageInput.current?.click()}>
                  {imagePreview ? 'Replace photo' : 'Choose photo'}
                </Button>
                {pendingImage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPendingImage(null)
                      setImagePreview(editing?.imageUrl ?? null)
                    }}
                  >
                    Undo
                  </Button>
                )}
              </div>
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) pickImage(file)
                  event.target.value = ''
                }}
              />
            </div>
          </div>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-subtle">
              Basics
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="rest-name" required error={errors.name}>
                <Input
                  id="rest-name"
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="Swat Grill House"
                  maxLength={80}
                />
              </Field>
              <Field label="Emoji" htmlFor="rest-emoji" hint="Shown if no photo is set." error={errors.emoji}>
                <Input
                  id="rest-emoji"
                  value={form.emoji}
                  onChange={(event) => set('emoji', event.target.value)}
                  placeholder="🍢"
                  maxLength={4}
                />
              </Field>
              <Field
                label="Description"
                htmlFor="rest-description"
                className="sm:col-span-2"
                error={errors.description}
              >
                <Textarea
                  id="rest-description"
                  value={form.description}
                  onChange={(event) => set('description', event.target.value)}
                  placeholder="What the kitchen is known for."
                  maxLength={500}
                />
              </Field>
              <Field label="Cuisine" htmlFor="rest-cuisine">
                <Input
                  id="rest-cuisine"
                  value={form.cuisine}
                  onChange={(event) => set('cuisine', event.target.value)}
                  placeholder="Pakistani · Fast food"
                  maxLength={60}
                />
              </Field>
              <Field label="Category" htmlFor="rest-category">
                <Input
                  id="rest-category"
                  value={form.category}
                  onChange={(event) => set('category', event.target.value)}
                  placeholder="Fast food"
                  maxLength={60}
                />
              </Field>
              <Field
                label="Tags"
                htmlFor="rest-tags"
                hint="Comma separated, up to 10."
                error={errors.tags}
                className="sm:col-span-2"
              >
                <Input
                  id="rest-tags"
                  value={form.tags}
                  onChange={(event) => set('tags', event.target.value)}
                  placeholder="BBQ, Karahi, Family"
                />
              </Field>
              <Field label="Opening state" htmlFor="rest-status">
                <Select
                  id="rest-status"
                  value={form.status}
                  onChange={(event) => set('status', event.target.value as FormState['status'])}
                  options={STATUS_OPTIONS}
                />
              </Field>
              <div className="flex items-end pb-1">
                <Checkbox
                  label="Feature this restaurant in the app"
                  checked={form.featured}
                  onChange={(event) => set('featured', event.target.checked)}
                />
              </div>
              <Field
                label="Visible to customers"
                htmlFor="rest-approved"
                hint="Owner-registered kitchens stay hidden until approved."
                className="sm:col-span-2"
              >
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                  <p className="text-xs text-ink-muted">
                    {form.approved
                      ? 'Customers can see and order from this kitchen.'
                      : 'Hidden from the customer app until you approve it.'}
                  </p>
                  <Switch
                    checked={form.approved}
                    onChange={(next) => set('approved', next)}
                    label="Approved for customers"
                  />
                </div>
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-subtle">
              Contact & location
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Owner name" htmlFor="rest-owner">
                <Input
                  id="rest-owner"
                  value={form.ownerName}
                  onChange={(event) => set('ownerName', event.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="Phone" htmlFor="rest-phone" error={errors.phone}>
                <Input
                  id="rest-phone"
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  placeholder="0345 1234567"
                  maxLength={20}
                />
              </Field>
              {editing && (
                <Field
                  label="Link owner account (email)"
                  htmlFor="rest-owner-email"
                  hint={
                    typeof editing.ownerUser === 'object' && editing.ownerUser?.email
                      ? `Currently linked: ${editing.ownerUser.email}`
                      : 'No owner account linked yet.'
                  }
                  error={errors.ownerEmail}
                  className="sm:col-span-2"
                >
                  <Input
                    id="rest-owner-email"
                    value={ownerEmail}
                    onChange={(event) => setOwnerEmail(event.target.value)}
                    placeholder="owner@example.com"
                    type="email"
                  />
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    The account must already exist as a restaurant owner - owners self-register on
                    the backend, and the account is linked here if you created the kitchen first.
                  </p>
                </Field>
              )}
              <Field label="Address line" htmlFor="rest-address">
                <Input
                  id="rest-address"
                  value={form.addressLine}
                  onChange={(event) => set('addressLine', event.target.value)}
                  placeholder="Malam Jabba Road"
                  maxLength={200}
                />
              </Field>
              <Field label="Area" htmlFor="rest-area">
                <Input
                  id="rest-area"
                  value={form.area}
                  onChange={(event) => set('area', event.target.value)}
                  placeholder="Mingora"
                  maxLength={60}
                />
              </Field>
              <Field
                label="Latitude"
                htmlFor="rest-lat"
                hint="Optional — used by the delivery map."
                error={errors.lat}
              >
                <Input
                  id="rest-lat"
                  value={form.lat}
                  onChange={(event) => set('lat', event.target.value)}
                  placeholder="34.7795"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Longitude" htmlFor="rest-lng" error={errors.lng}>
                <Input
                  id="rest-lng"
                  value={form.lng}
                  onChange={(event) => set('lng', event.target.value)}
                  placeholder="72.3601"
                  inputMode="decimal"
                />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-subtle">
              Delivery & hours
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Prep + ride (min)" htmlFor="rest-time" error={errors.deliveryTimeMin}>
                <Input
                  id="rest-time"
                  type="number"
                  min={1}
                  max={300}
                  value={form.deliveryTimeMin}
                  onChange={(event) => set('deliveryTimeMin', event.target.value)}
                />
              </Field>
              <Field label="Delivery fee" htmlFor="rest-fee" error={errors.deliveryFee}>
                <Input
                  id="rest-fee"
                  type="number"
                  min={0}
                  value={form.deliveryFee}
                  onChange={(event) => set('deliveryFee', event.target.value)}
                />
              </Field>
              <Field label="Minimum order" htmlFor="rest-min" error={errors.minOrder}>
                <Input
                  id="rest-min"
                  type="number"
                  min={0}
                  value={form.minOrder}
                  onChange={(event) => set('minOrder', event.target.value)}
                />
              </Field>
              <Field label="Opens" htmlFor="rest-open" error={errors.openTime}>
                <Input
                  id="rest-open"
                  type="time"
                  value={form.openTime}
                  onChange={(event) => set('openTime', event.target.value)}
                />
              </Field>
              <Field label="Closes" htmlFor="rest-close" error={errors.closeTime}>
                <Input
                  id="rest-close"
                  type="time"
                  value={form.closeTime}
                  onChange={(event) => set('closeTime', event.target.value)}
                />
              </Field>
              <Field label="Promo label" htmlFor="rest-promo" error={errors.promo} className="col-span-2">
                <Input
                  id="rest-promo"
                  value={form.promo}
                  onChange={(event) => set('promo', event.target.value)}
                  placeholder="e.g. Free delivery over Rs 1,000"
                  maxLength={120}
                />
              </Field>
              <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 sm:col-span-4">
                <div>
                  <p className="text-xs font-semibold text-ink">Free delivery</p>
                  <p className="text-[11px] text-ink-subtle">
                    Overrides the delivery fee for every order from this kitchen.
                  </p>
                </div>
                <Switch
                  checked={form.freeDelivery}
                  onChange={(next) => set('freeDelivery', next)}
                  label="Free delivery"
                />
              </div>
            </div>
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Remove this restaurant?"
        message={`${deleting?.name ?? 'This restaurant'} disappears from the app and all of its dishes are hidden too. Past orders keep their history. This cannot be undone from the panel.`}
        confirmLabel="Remove restaurant"
        busy={deletingBusy}
      />
    </div>
  )
}
