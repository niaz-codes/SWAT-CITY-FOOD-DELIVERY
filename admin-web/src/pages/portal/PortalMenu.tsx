import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CircleAlert,
  ImageUp,
  Leaf,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { api, apiErrorMessage, uploadFile } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import type { PortalMenuCategory, PortalMenuItem } from '../../lib/portalTypes'
import type { PortalContextValue } from '../../lib/portalTypes'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal, { ConfirmDialog } from '../../components/ui/Modal'
import { Checkbox, Field, Input, Select, Switch, Textarea } from '../../components/ui/Field'
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/States'
import Tabs from '../../components/ui/Tabs'

/** The payload `GET /restaurant/menu` answers with. */
interface MenuPayload {
  restaurant: { _id: string; name: string }
  items: PortalMenuItem[]
  categories: PortalMenuCategory[]
}

/** Editable form for one menu item. */
interface ItemForm {
  name: string
  description: string
  category: string
  price: string
  prepMin: string
  calories: string
  emoji: string
  popular: boolean
  available: boolean
  isVeg: boolean
}

const EMPTY_FORM: ItemForm = {
  name: '',
  description: '',
  category: '',
  price: '',
  prepMin: '',
  calories: '',
  emoji: '',
  popular: false,
  available: true,
  isVeg: false,
}

function formFromItem(item: PortalMenuItem): ItemForm {
  return {
    name: item.name,
    description: item.description ?? '',
    category: item.category ?? '',
    price: String(item.price),
    prepMin: item.prepMin == null ? '' : String(item.prepMin),
    calories: item.calories == null ? '' : String(item.calories),
    emoji: item.emoji ?? '',
    popular: item.popular,
    available: item.available,
    isVeg: item.isVeg,
  }
}

/** Numbers arrive as text; empty means "leave it out", not "zero". */
function toBody(form: ItemForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    available: form.available,
    popular: form.popular,
    isVeg: form.isVeg,
  }
  const trimmedDescription = form.description.trim()
  if (trimmedDescription) body.description = trimmedDescription
  if (form.category) body.category = form.category
  const trimmedEmoji = form.emoji.trim()
  // A two-codepoint emoji (e.g. the color squares) is 8 bytes at most - a
  // string longer than that is a paste accident, not an emoji.
  if (trimmedEmoji && trimmedEmoji.length <= 4) body.emoji = trimmedEmoji
  const price = Number(form.price)
  if (Number.isFinite(price) && price > 0) body.price = price
  const prepMin = Number(form.prepMin)
  if (Number.isFinite(prepMin) && form.prepMin !== '') body.prepMin = Math.max(0, Math.round(prepMin))
  const calories = Number(form.calories)
  if (Number.isFinite(calories) && form.calories !== '') {
    body.calories = Math.max(0, Math.round(calories))
  }
  return body
}

function validateForm(form: ItemForm): string {
  if (form.name.trim().length < 2) return 'The dish needs a name (2 characters or more).'
  const price = Number(form.price)
  if (!Number.isFinite(price) || price <= 0) return 'Enter a price greater than Rs 0.'
  return ''
}

/** Pick an image file with a hidden input, `ref`-driven. */
function ImagePicker({
  acceptLabel,
  onFile,
  busy,
}: {
  acceptLabel: string
  onFile: (file: File) => void
  busy: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          // The same file can be chosen twice in a row.
          event.target.value = ''
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        icon={ImageUp}
        loading={busy}
        onClick={() => inputRef.current?.click()}
        aria-label={acceptLabel}
      >
        {acceptLabel}
      </Button>
    </>
  )
}

export default function PortalMenu() {
  const context = useOutletContext<PortalContextValue>()

  const [payload, setPayload] = useState<MenuPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Create/edit dialog state.
  const [editing, setEditing] = useState<PortalMenuItem | null>(null)
  const [creating, setCreating] = useState(false) // dialog open for a new item
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PortalMenuItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const requestId = useRef(0)

  const load = async () => {
    const current = ++requestId.current
    setLoading(true)
    try {
      const response = await api.get('/restaurant/menu')
      if (current !== requestId.current) return
      const body = response.data as { data?: MenuPayload }
      setPayload(body?.data ?? null)
      setError('')
    } catch (failure) {
      if (current !== requestId.current) return
      setError(apiErrorMessage(failure, 'Could not load your menu.'))
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const items = payload?.items ?? []
  const categories = payload?.categories ?? []

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      const key = item.category || 'Other'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [items])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      if (categoryFilter !== 'all' && (item.category || 'Other') !== categoryFilter) return false
      if (!term) return true
      return `${item.name} ${item.description ?? ''}`.toLowerCase().includes(term)
    })
  }, [items, categoryFilter, search])

  /** Items grouped for the grid: category buckets in the order the tabs list. */
  const grouped = useMemo(() => {
    const map = new Map<string, PortalMenuItem[]>()
    for (const item of visible) {
      const key = item.category || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    const order = categories.map((category) => category.name)
    return [...map.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || a[0].localeCompare(b[0]),
    )
  }, [visible, categories])

  // ---------------------------------------------------------------- dialogs

  const openCreate = () => {
    const firstCategory = categories[0]?.name ?? ''
    setForm({ ...EMPTY_FORM, category: firstCategory, popular: false })
    setEditing(null)
    setFormError('')
    setCreating(true)
  }

  const openEdit = (item: PortalMenuItem) => {
    setForm(formFromItem(item))
    setEditing(item)
    setFormError('')
    setCreating(true)
  }

  const closeForm = () => {
    if (formBusy) return
    setCreating(false)
    setEditing(null)
    setFormError('')
  }

  /** Create or update, from the same dialog: only the URL differs. */
  const submitForm = async () => {
    const problem = validateForm(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setFormBusy(true)
    setFormError('')
    try {
      const body = toBody(form)
      if (editing) {
        const response = await api.patch(`/restaurant/menu/${editing._id}`, body)
        const updated = (response.data as { data?: { item?: PortalMenuItem } })?.data?.item
        if (updated) {
          setPayload((current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) => (item._id === updated._id ? updated : item)),
                }
              : current,
          )
        } else {
          void load()
        }
        toast.success(`${updated?.name ?? form.name} updated`)
      } else {
        const response = await api.post('/restaurant/menu', body)
        const created = (response.data as { data?: { item?: PortalMenuItem } })?.data?.item
        if (created) {
          setPayload((current) =>
            current ? { ...current, items: [created, ...current.items] } : current,
          )
        } else {
          void load()
        }
        toast.success(`${created?.name ?? form.name} added to your menu`)
      }
      setCreating(false)
      setEditing(null)
    } catch (failure) {
      setFormError(apiErrorMessage(failure, 'Could not save the dish.'))
    } finally {
      setFormBusy(false)
    }
  }

  /** Flip one switch without a dialog - availability is the most edited field. */
  const toggleAvailability = async (item: PortalMenuItem) => {
    const next = !item.available
    setPayload((current) =>
      current
        ? {
            ...current,
            items: current.items.map((row) =>
              row._id === item._id ? { ...row, available: next } : row,
            ),
          }
        : current,
    )
    try {
      const response = await api.patch(`/restaurant/menu/${item._id}`, { available: next })
      const updated = (response.data as { data?: { item?: PortalMenuItem } })?.data?.item
      if (updated) {
        setPayload((inner) =>
          inner
            ? {
                ...inner,
                items: inner.items.map((row) => (row._id === updated._id ? updated : row)),
              }
            : inner,
        )
      }
      toast.success(next ? `${item.name} is back on the menu` : `${item.name} is now hidden`)
    } catch (failure) {
      // Re-roll the optimistic flip: the server said no, so show it as it was.
      setPayload((current) =>
        current
          ? {
              ...current,
              items: current.items.map((row) =>
                row._id === item._id ? { ...row, available: item.available } : row,
              ),
            }
          : current,
      )
      toast.error(apiErrorMessage(failure, 'Could not change availability.'))
    }
  }

  const changeImage = async (item: PortalMenuItem, file: File) => {
    setUploadingId(item._id)
    try {
      const body = (await uploadFile(`/restaurant/menu/${item._id}/upload`, file)) as {
        item?: PortalMenuItem
      }
      if (body?.item) {
        const updated = body.item
        setPayload((current) =>
          current
            ? {
                ...current,
                items: current.items.map((row) => (row._id === updated._id ? updated : row)),
              }
            : current,
        )
        toast.success('Image updated')
      }
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not upload the image.'))
    } finally {
      setUploadingId(null)
    }
  }

  const removeItem = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await api.delete(`/restaurant/menu/${deleting._id}`)
      setPayload((current) =>
        current ? { ...current, items: current.items.filter((row) => row._id !== deleting._id) } : current,
      )
      toast.success(`${deleting.name} removed from your menu`)
      setDeleting(null)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not remove the dish.'))
    } finally {
      setDeleteBusy(false)
    }
  }

  // -------------------------------------------------------------------- view

  if (error && !payload) {
    return (
      <div>
        <PageHeader title="Menu" />
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    )
  }

  const categoryOptions = [
    { value: '', label: 'No category' },
    ...categories.map((category) => ({ value: category.name, label: category.name })),
  ]

  return (
    <div>
      <PageHeader
        title="Menu"
        description={
          context.data?.restaurant.isApproved
            ? 'What customers order from. Switch a dish off when it runs out - it disappears from the app instantly.'
            : 'Prepare your menu while you wait for admin approval - customers see it the moment you are approved.'
        }
        actions={
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            Add dish
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            items={[
              { value: 'all', label: 'All', count: items.length },
              ...categories.map((category) => ({
                value: category.name,
                label: category.name,
                count: counts.get(category.name) ?? 0,
              })),
            ]}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <Input
              className="w-56 pl-9"
              placeholder="Search your menu…"
              aria-label="Search menu items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </PageHeader>

      {loading && !payload ? (
        <TableSkeleton rows={4} columns={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Your menu is empty"
          description="Add your first dish - name, price and category are enough to start."
          action={
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              Add dish
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches"
          description="Try a different search or category."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([category, groupItems]) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-bold text-ink">
                {category}
                <span className="ml-2 text-xs font-medium text-ink-subtle">
                  {groupItems.length}
                </span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groupItems.map((item) => (
                  <ItemCard
                    key={item._id}
                    item={item}
                    uploading={uploadingId === item._id}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeleting(item)}
                    onToggle={() => void toggleAvailability(item)}
                    onImage={(file) => void changeImage(item, file)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Create / edit modal. */}
      {creating && (
        <Modal
          open
          onClose={closeForm}
          title={editing ? 'Edit dish' : 'Add a dish'}
          description={
            editing
              ? `Editing ${editing.name}.`
              : 'Customers see exactly what you write here, so keep the description short and clear.'
          }
          busy={formBusy}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={closeForm} disabled={formBusy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void submitForm()} loading={formBusy}>
                {editing ? 'Save changes' : 'Add to menu'}
              </Button>
            </>
          }
        >
          {editing && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface-muted/50 p-3">
              {editing.imageUrl ? (
                <img
                  src={editing.imageUrl}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover ring-1 ring-line"
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-muted text-lg">
                  {editing.emoji || '🍽️'}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <ImagePicker
                  acceptLabel={editing.imageUrl ? 'Change photo' : 'Add a photo'}
                  busy={uploadingId === editing._id}
                  onFile={(file) => void changeImage(editing, file)}
                />
                <p className="mt-1.5 text-[11px] text-ink-subtle">
                  Photos upload over the saved dish, so save your text changes first.
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dish name" required className="sm:col-span-2">
              <Input
                value={form.name}
                placeholder="e.g. Chicken Biryani"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Description" hint="Up to 500 characters" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={form.description}
                placeholder="What is in it, how spicy, what comes with it…"
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            <Field label="Category">
              <Select
                options={categoryOptions}
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
            </Field>
            <Field label="Price (Rs)" required>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.price}
                placeholder="e.g. 350"
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </Field>
            <Field label="Prep time (min)" hint="How long to cook it">
              <Input
                type="number"
                min="0"
                value={form.prepMin}
                placeholder="e.g. 20"
                onChange={(event) => setForm({ ...form, prepMin: event.target.value })}
              />
            </Field>
            <Field label="Calories" hint="Optional">
              <Input
                type="number"
                min="0"
                value={form.calories}
                placeholder="e.g. 420"
                onChange={(event) => setForm({ ...form, calories: event.target.value })}
              />
            </Field>
            <Field label="Emoji" hint="Shown if there is no photo" className="sm:col-span-2">
              <Input
                value={form.emoji}
                placeholder="🍛"
                maxLength={4}
                onChange={(event) => setForm({ ...form, emoji: event.target.value })}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <Checkbox
                checked={form.available}
                onChange={(event) => setForm({ ...form, available: event.target.checked })}
                label="Available now"
              />
              <Checkbox
                checked={form.popular}
                onChange={(event) => setForm({ ...form, popular: event.target.checked })}
                label="Mark as popular"
              />
              <Checkbox
                checked={form.isVeg}
                onChange={(event) => setForm({ ...form, isVeg: event.target.checked })}
                label="Vegetarian"
              />
            </div>
          </div>
          {formError && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs font-medium text-danger">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting ? `Remove ${deleting.name}?` : 'Remove this dish?'}
        message="It is taken off the app straight away. Orders already placed are not affected."
        confirmLabel="Remove"
        busy={deleteBusy}
        onConfirm={() => void removeItem()}
        onClose={() => !deleteBusy && setDeleting(null)}
      />
    </div>
  )
}

/** One dish tile: photo, price, availability switch and the edit/delete actions. */
function ItemCard({
  item,
  uploading,
  onEdit,
  onDelete,
  onToggle,
  onImage,
}: {
  item: PortalMenuItem
  uploading: boolean
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onImage: (file: File) => void
}) {
  return (
    <li
      className={[
        'rounded-2xl border bg-surface p-4 shadow-card transition hover:border-ink/20',
        item.available ? 'border-line' : 'border-line bg-surface/70',
      ].join(' ')}
    >
      <div className="flex gap-3">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-line"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ring-1 ring-line bg-gradient-to-br from-[rgb(var(--line))] to-surface-muted text-2xl">
            {item.emoji || '🍽️'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-sm font-bold text-ink">{item.name}</h3>
            <span className="shrink-0 text-sm font-bold text-ink">{formatCurrency(item.price)}</span>
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
              {item.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item.popular && (
              <Badge tone="brand">
                <Star className="h-3 w-3" aria-hidden="true" />
                Popular
              </Badge>
            )}
            {item.isVeg && (
              <Badge tone="success">
                <Leaf className="h-3 w-3" aria-hidden="true" />
                Veg
              </Badge>
            )}
            {!item.available && <Badge tone="danger">Hidden</Badge>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="flex items-center gap-2 text-xs font-medium text-ink-muted">
          <Switch checked={item.available} onChange={onToggle} label={`Available: ${item.name}`} />
          {item.available ? 'On the menu' : 'Hidden'}
        </span>
        <span className="flex items-center gap-1">
          <ImagePicker acceptLabel="Photo" busy={uploading} onFile={onImage} />
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label={`Edit ${item.name}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label={`Remove ${item.name}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </span>
      </div>
    </li>
  )
}
