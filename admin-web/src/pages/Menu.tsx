import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, statusTone, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Checkbox, Field, Input, Select, Switch, Textarea } from '../components/ui/Field'
import Modal, { ConfirmDialog } from '../components/ui/Modal'
import Tabs from '../components/ui/Tabs'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'

interface RestaurantOption {
  _id: string
  name: string
  status?: string
}

interface CategoryRow {
  _id: string
  name: string
  slug?: string | null
  emoji?: string | null
  sortOrder?: number
  active?: boolean
}

interface FoodRow {
  _id: string
  name: string
  description?: string | null
  category?: string | null
  price: number
  emoji?: string | null
  imageUrl?: string | null
  calories?: number | null
  prepMin?: number | null
  popular?: boolean
  available?: boolean
  isVeg?: boolean
  createdAt: string
  restaurant?: { _id?: string; name?: string } | string | null
}

interface DishForm {
  restaurantId: string
  name: string
  description: string
  category: string
  price: string
  emoji: string
  calories: string
  prepMin: string
  popular: boolean
  available: boolean
  isVeg: boolean
}

interface CategoryForm {
  name: string
  emoji: string
  sortOrder: string
}

const EMPTY_DISH: DishForm = {
  restaurantId: '',
  name: '',
  description: '',
  category: '',
  price: '',
  emoji: '',
  calories: '',
  prepMin: '',
  popular: false,
  available: true,
  isVeg: false,
}

const EMPTY_CATEGORY: CategoryForm = { name: '', emoji: '', sortOrder: '0' }

function restaurantName(row: FoodRow): string {
  if (!row.restaurant) return '—'
  if (typeof row.restaurant === 'string') return row.restaurant
  return row.restaurant.name || '—'
}

/** Dishes, their prices and availability, plus the category list. */
export default function Menu() {
  const [tab, setTab] = useState('dishes')
  const [search, setSearch] = useState('')
  const [restaurantFilter, setRestaurantFilter] = useState('all')

  const dishes = useListResource<FoodRow>({
    endpoint: '/admin/food',
    rowsKey: 'items',
    pageSize: 50,
    enabled: tab === 'dishes',
  })

  const restaurants = useApi<RestaurantOption[]>('/admin/restaurants?limit=100', (payload) => {
    const data = (payload as { data?: { restaurants?: RestaurantOption[] } })?.data
    return data?.restaurants ?? []
  })

  const categories = useApi<CategoryRow[]>('/admin/categories', (payload) => {
    const data = (payload as { data?: { categories?: CategoryRow[] } })?.data
    return data?.categories ?? []
  })

  // Dish modal
  const [dishOpen, setDishOpen] = useState(false)
  const [editingDish, setEditingDish] = useState<FoodRow | null>(null)
  const [dishForm, setDishForm] = useState<DishForm>(EMPTY_DISH)
  const [dishErrors, setDishErrors] = useState<Record<string, string>>({})
  const [savingDish, setSavingDish] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInput = useRef<HTMLInputElement | null>(null)

  // Category modal
  const [catOpen, setCatOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null)
  const [catForm, setCatForm] = useState<CategoryForm>(EMPTY_CATEGORY)
  const [catErrors, setCatErrors] = useState<Record<string, string>>({})
  const [savingCategory, setSavingCategory] = useState(false)

  const [deletingDish, setDeletingDish] = useState<FoodRow | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<CategoryRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const restaurantOptions = restaurants.data ?? []
  const categoryRows = categories.data ?? []

  const restaurantSelectOptions = [
    { value: '', label: 'Choose a kitchen…' },
    ...restaurantOptions.map((restaurant) => ({
      value: restaurant._id,
      label: restaurant.status === 'closed' ? `${restaurant.name} (closed)` : restaurant.name,
    })),
  ]

  const categorySelectOptions = useMemo(() => {
    const names = new Set(categoryRows.filter((row) => row.active !== false).map((row) => row.name))
    if (dishForm.category && !names.has(dishForm.category)) names.add(dishForm.category)
    return [
      { value: '', label: 'No category' },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    ]
  }, [categoryRows, dishForm.category])

  const openCreateDish = () => {
    setEditingDish(null)
    setDishForm({
      ...EMPTY_DISH,
      restaurantId: restaurantFilter !== 'all' ? restaurantFilter : '',
      category: categoryRows.find((row) => row.active !== false)?.name ?? '',
    })
    setDishErrors({})
    setPendingImage(null)
    setImagePreview(null)
    setDishOpen(true)
  }

  const openEditDish = (row: FoodRow) => {
    setEditingDish(row)
    setDishForm({
      restaurantId:
        typeof row.restaurant === 'string' ? row.restaurant : row.restaurant?._id ?? '',
      name: row.name,
      description: row.description ?? '',
      category: row.category ?? '',
      price: String(row.price ?? ''),
      emoji: row.emoji ?? '',
      calories: row.calories != null ? String(row.calories) : '',
      prepMin: row.prepMin != null ? String(row.prepMin) : '',
      popular: Boolean(row.popular),
      available: row.available !== false,
      isVeg: Boolean(row.isVeg),
    })
    setDishErrors({})
    setPendingImage(null)
    setImagePreview(row.imageUrl ?? null)
    setDishOpen(true)
  }

  const pickDishImage = (file: File) => {
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

  const validateDish = (): boolean => {
    const next: Record<string, string> = {}
    const name = dishForm.name.trim()
    if (!editingDish) {
      if (!dishForm.restaurantId) next.restaurantId = 'Choose the kitchen this dish belongs to.'
      if (name.length < 2 || name.length > 100) next.name = 'Use 2–100 characters.'
    }
    const price = Number(dishForm.price)
    if (!Number.isFinite(price) || price <= 0) next.price = 'Price must be greater than zero.'
    if (dishForm.description.length > 500) next.description = 'Keep it under 500 characters.'
    if (dishForm.emoji.length > 4) next.emoji = 'One emoji, please.'
    if (!editingDish) {
      if (
        dishForm.calories &&
        (!Number.isInteger(Number(dishForm.calories)) || Number(dishForm.calories) < 0)
      ) {
        next.calories = 'Whole number, zero or more.'
      }
      if (
        dishForm.prepMin &&
        (!Number.isInteger(Number(dishForm.prepMin)) || Number(dishForm.prepMin) < 0)
      ) {
        next.prepMin = 'Whole number, zero or more.'
      }
    }
    setDishErrors(next)
    return Object.keys(next).length === 0
  }

  const saveDish = async () => {
    if (!validateDish()) return
    setSavingDish(true)
    try {
      let id = editingDish?._id
      if (editingDish) {
        // The API deliberately locks name, kitchen, calories, prep time and the
        // veg flag after creation, so only the editable fields are sent.
        await api.patch(`/admin/food/${editingDish._id}`, {
          // Empty strings clear an optional field; the update schema accepts
          // them, while `undefined` would leave the old value in place.
          description: dishForm.description.trim(),
          category: dishForm.category.trim(),
          price: Number(dishForm.price),
          emoji: dishForm.emoji.trim(),
          popular: dishForm.popular,
          available: dishForm.available,
        })
        toast.success('Dish updated')
      } else {
        const response = await api.post('/admin/food', {
          restaurantId: dishForm.restaurantId,
          name: dishForm.name.trim(),
          description: dishForm.description.trim() || undefined,
          category: dishForm.category.trim() || undefined,
          price: Number(dishForm.price),
          emoji: dishForm.emoji.trim() || undefined,
          calories: dishForm.calories ? Number(dishForm.calories) : undefined,
          prepMin: dishForm.prepMin ? Number(dishForm.prepMin) : undefined,
          popular: dishForm.popular,
          available: dishForm.available,
          isVeg: dishForm.isVeg,
        })
        id = response.data?.data?.item?._id as string | undefined
        toast.success('Dish added')
      }

      if (pendingImage && id) {
        try {
          const body = new FormData()
          body.append('file', pendingImage)
          await api.post(`/admin/food/${id}/upload`, body)
          toast.success('Dish photo uploaded')
        } catch (failure) {
          toast.error(apiErrorMessage(failure, 'Dish saved, but the photo could not be uploaded.'))
        }
      }

      setDishOpen(false)
      await dishes.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not save this dish.'))
    } finally {
      setSavingDish(false)
    }
  }

  const toggleAvailability = async (row: FoodRow) => {
    setTogglingId(row._id)
    try {
      await api.patch(`/admin/food/${row._id}`, { available: !row.available })
      toast.success(row.available ? 'Dish marked unavailable' : 'Dish marked available')
      await dishes.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not change availability.'))
    } finally {
      setTogglingId(null)
    }
  }

  const removeDish = async () => {
    if (!deletingDish) return
    setDeleteBusy(true)
    try {
      await api.delete(`/admin/food/${deletingDish._id}`)
      toast.success('Dish removed')
      setDeletingDish(null)
      await dishes.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not remove this dish.'))
    } finally {
      setDeleteBusy(false)
    }
  }

  const openCreateCategory = () => {
    setEditingCategory(null)
    setCatForm({ ...EMPTY_CATEGORY, sortOrder: String(categoryRows.length) })
    setCatErrors({})
    setCatOpen(true)
  }

  const openEditCategory = (row: CategoryRow) => {
    setEditingCategory(row)
    setCatForm({
      name: row.name,
      emoji: row.emoji ?? '',
      sortOrder: String(row.sortOrder ?? 0),
    })
    setCatErrors({})
    setCatOpen(true)
  }

  const saveCategory = async () => {
    const next: Record<string, string> = {}
    if (catForm.name.trim().length < 2 || catForm.name.trim().length > 60) {
      next.name = 'Use 2–60 characters.'
    }
    if (catForm.emoji.length > 4) next.emoji = 'One emoji, please.'
    const sortOrder = Number(catForm.sortOrder)
    if (!Number.isInteger(sortOrder) || sortOrder < 0) next.sortOrder = 'Whole number, zero or more.'
    setCatErrors(next)
    if (Object.keys(next).length > 0) return

    setSavingCategory(true)
    try {
      const payload = {
        name: catForm.name.trim(),
        emoji: catForm.emoji.trim() || undefined,
        sortOrder,
      }
      if (editingCategory) {
        await api.patch(`/admin/categories/${editingCategory._id}`, payload)
        toast.success('Category updated')
      } else {
        await api.post('/admin/categories', payload)
        toast.success('Category created')
      }
      setCatOpen(false)
      await categories.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not save this category.'))
    } finally {
      setSavingCategory(false)
    }
  }

  const deactivateCategory = async () => {
    if (!deletingCategory) return
    setDeleteBusy(true)
    try {
      await api.delete(`/admin/categories/${deletingCategory._id}`)
      toast.success('Category deactivated')
      setDeletingCategory(null)
      await categories.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not deactivate this category.'))
    } finally {
      setDeleteBusy(false)
    }
  }

  const filteredDishes = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return dishes.rows
    return dishes.rows.filter(
      (row) =>
        row.name?.toLowerCase().includes(needle) ||
        row.category?.toLowerCase().includes(needle) ||
        restaurantName(row).toLowerCase().includes(needle),
    )
  }, [dishes.rows, search])

  const filteredCategories = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return categoryRows
    return categoryRows.filter(
      (row) =>
        row.name?.toLowerCase().includes(needle) || row.slug?.toLowerCase().includes(needle),
    )
  }, [categoryRows, search])

  const dishColumns: Column<FoodRow>[] = [
    {
      key: 'dish',
      label: 'Dish',
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-line"
              loading="lazy"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-base">
              {row.emoji || (
                <UtensilsCrossed className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
              )}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-ink">{row.name}</span>
              {row.popular && <Badge tone="brand">Popular</Badge>}
              {row.isVeg && <Badge tone="success">Veg</Badge>}
            </div>
            <div className="truncate text-xs text-ink-subtle">
              {row.category || 'Uncategorised'}
              {row.calories ? ` · ${row.calories} kcal` : ''}
              {row.prepMin ? ` · ${row.prepMin} min` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'restaurant',
      label: 'Kitchen',
      render: (row) => <span className="text-xs text-ink">{restaurantName(row)}</span>,
    },
    {
      key: 'price',
      label: 'Price',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.price ?? 0,
      render: (row) => (
        <span className="font-semibold text-ink">{formatCurrency(row.price ?? 0)}</span>
      ),
    },
    {
      key: 'available',
      label: 'Available',
      render: (row) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Switch
            checked={row.available !== false}
            disabled={togglingId === row._id}
            onChange={() => void toggleAvailability(row)}
            label={`Availability for ${row.name}`}
          />
        </div>
      ),
    },
    {
      key: 'added',
      label: 'Added',
      align: 'right',
      secondary: true,
      render: (row) => <span className="text-xs">{timeAgo(row.createdAt)}</span>,
    },
  ]

  const categoryColumns: Column<CategoryRow>[] = [
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-base">
            {row.emoji || <Tag className="h-4 w-4 text-ink-subtle" aria-hidden="true" />}
          </span>
          <div>
            <div className="font-semibold text-ink">{row.name}</div>
            <div className="font-mono text-[11px] text-ink-subtle">{row.slug || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'sortOrder',
      label: 'Order',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.sortOrder ?? 0,
      render: (row) => row.sortOrder ?? 0,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge tone={row.active === false ? 'danger' : statusTone('active')} dot>
          {row.active === false ? 'Inactive' : 'Active'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Catalog"
        title="Menu"
        description="Every dish, its kitchen and price — plus the categories the app groups them by."
        actions={
          <>
            <Button
              variant="secondary"
              icon={UtensilsCrossed}
              onClick={() => (tab === 'dishes' ? void dishes.reload() : void categories.reload())}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={tab === 'dishes' ? openCreateDish : openCreateCategory}
            >
              {tab === 'dishes' ? 'New dish' : 'New category'}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            items={[
              { value: 'dishes', label: 'Dishes', count: dishes.total },
              { value: 'categories', label: 'Categories', count: categoryRows.length },
            ]}
            value={tab}
            onChange={(value) => {
              setTab(value)
              setSearch('')
            }}
          />
          <div className="w-full sm:w-64">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter this page…"
              icon={Search}
              aria-label="Filter menu on this page"
            />
          </div>
          {tab === 'dishes' && (
            <div className="w-full sm:w-56">
              <Select
                value={restaurantFilter}
                onChange={(event) => {
                  setRestaurantFilter(event.target.value)
                  dishes.setFilter('restaurantId', event.target.value)
                }}
                aria-label="Filter dishes by kitchen"
                options={[
                  { value: 'all', label: 'All kitchens' },
                  ...restaurantOptions.map((restaurant) => ({
                    value: restaurant._id,
                    label: restaurant.name,
                  })),
                ]}
              />
            </div>
          )}
        </div>
      </PageHeader>

      {tab === 'dishes' ? (
        <Card>
          <DataTable
            columns={dishColumns}
            rows={filteredDishes}
            loading={dishes.loading}
            error={dishes.error}
            emptyTitle="No dishes match"
            emptyDescription="Change the kitchen filter or add the first dish."
            emptyIcon={UtensilsCrossed}
            onRetry={dishes.reload}
            rowKey={(row) => row._id}
            onRowClick={openEditDish}
            emptyAction={
              <Button variant="primary" icon={Plus} onClick={openCreateDish}>
                Add a dish
              </Button>
            }
            actions={(row) => (
              <Dropdown
                items={[
                  { label: 'Edit dish', icon: Pencil, onClick: () => openEditDish(row) },
                  {
                    label: row.available ? 'Mark unavailable' : 'Mark available',
                    icon: UtensilsCrossed,
                    onClick: () => void toggleAvailability(row),
                  },
                  {
                    label: 'Remove dish',
                    icon: Trash2,
                    danger: true,
                    divider: true,
                    onClick: () => setDeletingDish(row),
                  },
                ]}
              />
            )}
          />
          <Pagination
            page={dishes.page}
            pages={dishes.pages}
            total={dishes.total}
            limit={dishes.limit}
            onPage={dishes.setPage}
            noun="dishes"
          />
        </Card>
      ) : (
        <Card>
          <DataTable
            columns={categoryColumns}
            rows={filteredCategories}
            loading={categories.loading}
            error={categories.error}
            emptyTitle="No categories yet"
            emptyDescription="Categories group dishes in the app's menu."
            emptyIcon={Tag}
            onRetry={categories.reload}
            rowKey={(row) => row._id}
            onRowClick={openEditCategory}
            actions={(row) => (
              <Dropdown
                items={[
                  { label: 'Edit category', icon: Pencil, onClick: () => openEditCategory(row) },
                  {
                    label: 'Deactivate',
                    icon: Trash2,
                    danger: true,
                    divider: true,
                    disabled: row.active === false,
                    onClick: () => setDeletingCategory(row),
                  },
                ]}
              />
            )}
          />
          <div className="border-t border-line px-4 py-3 text-xs text-ink-subtle">
            {categoryRows.length} categories · {categoryRows.filter((row) => row.active === false).length}{' '}
            inactive
          </div>
        </Card>
      )}

      {/* Dish modal */}
      <Modal
        open={dishOpen}
        onClose={() => setDishOpen(false)}
        title={editingDish ? editingDish.name : 'New dish'}
        description={
          editingDish
            ? `${restaurantName(editingDish)} · the name, kitchen, calories, prep time and veg flag are locked after creation.`
            : 'The dish appears in the app as soon as it is saved.'
        }
        size="lg"
        busy={savingDish}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDishOpen(false)} disabled={savingDish}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingDish} onClick={() => void saveDish()}>
              {editingDish ? 'Save changes' : 'Add dish'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-muted/40 p-3">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Dish"
                className="h-20 w-20 rounded-lg object-cover ring-1 ring-line"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface text-2xl ring-1 ring-line">
                {dishForm.emoji || (
                  <UtensilsCrossed className="h-6 w-6 text-ink-subtle" aria-hidden="true" />
                )}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Dish photo</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                A square photo works best. Uploaded after the dish is saved.
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
                      setImagePreview(editingDish?.imageUrl ?? null)
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
                  if (file) pickDishImage(file)
                  event.target.value = ''
                }}
              />
            </div>
          </div>

          {!editingDish && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Kitchen"
                htmlFor="dish-restaurant"
                required
                error={dishErrors.restaurantId}
              >
                <Select
                  id="dish-restaurant"
                  value={dishForm.restaurantId}
                  onChange={(event) =>
                    setDishForm((current) => ({ ...current, restaurantId: event.target.value }))
                  }
                  options={restaurantSelectOptions}
                />
              </Field>
              <Field label="Name" htmlFor="dish-name" required error={dishErrors.name}>
                <Input
                  id="dish-name"
                  value={dishForm.name}
                  onChange={(event) =>
                    setDishForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Chicken Karahi"
                  maxLength={100}
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Price (Rs)" htmlFor="dish-price" required error={dishErrors.price}>
              <Input
                id="dish-price"
                type="number"
                min={1}
                value={dishForm.price}
                onChange={(event) =>
                  setDishForm((current) => ({ ...current, price: event.target.value }))
                }
                placeholder="450"
              />
            </Field>
            <Field label="Category" htmlFor="dish-category">
              <Select
                id="dish-category"
                value={dishForm.category}
                onChange={(event) =>
                  setDishForm((current) => ({ ...current, category: event.target.value }))
                }
                options={categorySelectOptions}
              />
            </Field>
            <Field
              label="Description"
              htmlFor="dish-description"
              className="sm:col-span-2"
              error={dishErrors.description}
            >
              <Textarea
                id="dish-description"
                value={dishForm.description}
                onChange={(event) =>
                  setDishForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="What is in it, and how is it made?"
                maxLength={500}
              />
            </Field>
            <Field label="Emoji" htmlFor="dish-emoji" hint="Shown if no photo is set." error={dishErrors.emoji}>
              <Input
                id="dish-emoji"
                value={dishForm.emoji}
                onChange={(event) =>
                  setDishForm((current) => ({ ...current, emoji: event.target.value }))
                }
                placeholder="🍗"
                maxLength={4}
              />
            </Field>
            {!editingDish && (
              <>
                <Field label="Calories" htmlFor="dish-calories" error={dishErrors.calories}>
                  <Input
                    id="dish-calories"
                    type="number"
                    min={0}
                    value={dishForm.calories}
                    onChange={(event) =>
                      setDishForm((current) => ({ ...current, calories: event.target.value }))
                    }
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Prep time (min)" htmlFor="dish-prep" error={dishErrors.prepMin}>
                  <Input
                    id="dish-prep"
                    type="number"
                    min={0}
                    value={dishForm.prepMin}
                    onChange={(event) =>
                      setDishForm((current) => ({ ...current, prepMin: event.target.value }))
                    }
                    placeholder="Optional"
                  />
                </Field>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <Checkbox
              label="Available — customers can order this right now"
              checked={dishForm.available}
              onChange={(event) =>
                setDishForm((current) => ({ ...current, available: event.target.checked }))
              }
            />
            <Checkbox
              label="Popular — show in the Popular row in the app"
              checked={dishForm.popular}
              onChange={(event) =>
                setDishForm((current) => ({ ...current, popular: event.target.checked }))
              }
            />
            {!editingDish && (
              <Checkbox
                label="Vegetarian"
                checked={dishForm.isVeg}
                onChange={(event) =>
                  setDishForm((current) => ({ ...current, isVeg: event.target.checked }))
                }
              />
            )}
          </div>
        </div>
      </Modal>

      {/* Category modal */}
      <Modal
        open={catOpen}
        onClose={() => setCatOpen(false)}
        title={editingCategory ? `Edit ${editingCategory.name}` : 'New category'}
        description="Categories order the menu in the app."
        size="sm"
        busy={savingCategory}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCatOpen(false)} disabled={savingCategory}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingCategory} onClick={() => void saveCategory()}>
              {editingCategory ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="cat-name" required error={catErrors.name}>
            <Input
              id="cat-name"
              value={catForm.name}
              onChange={(event) =>
                setCatForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="BBQ"
              maxLength={60}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Emoji" htmlFor="cat-emoji" error={catErrors.emoji}>
              <Input
                id="cat-emoji"
                value={catForm.emoji}
                onChange={(event) =>
                  setCatForm((current) => ({ ...current, emoji: event.target.value }))
                }
                placeholder="🔥"
                maxLength={4}
              />
            </Field>
            <Field label="Sort order" htmlFor="cat-sort" error={catErrors.sortOrder}>
              <Input
                id="cat-sort"
                type="number"
                min={0}
                value={catForm.sortOrder}
                onChange={(event) =>
                  setCatForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
              />
            </Field>
          </div>
          <p className="text-xs text-ink-subtle">
            Lower numbers appear first. Deactivating a category hides it from the app but leaves its
            dishes in place.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingDish)}
        onClose={() => setDeletingDish(null)}
        onConfirm={() => void removeDish()}
        title="Remove this dish?"
        message={`${deletingDish?.name ?? 'This dish'} disappears from the app and its menu. Past orders keep their history.`}
        confirmLabel="Remove dish"
        busy={deleteBusy}
      />

      <ConfirmDialog
        open={Boolean(deletingCategory)}
        onClose={() => setDeletingCategory(null)}
        onConfirm={() => void deactivateCategory()}
        title="Deactivate this category?"
        message={`${deletingCategory?.name ?? 'This category'} is hidden from the app menu. Its dishes stay in the catalog and can be moved to another category.`}
        confirmLabel="Deactivate"
        busy={deleteBusy}
      />
    </div>
  )
}
