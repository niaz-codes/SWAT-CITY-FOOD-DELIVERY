import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Banknote,
  Clock,
  ImageUp,
  MapPin,
  Phone,
  Save,
  Star,
  Timer,
} from 'lucide-react'
import { api, apiErrorMessage, uploadFile } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import type { PortalContextValue } from '../../lib/portalTypes'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Field, Input, Switch, Textarea } from '../../components/ui/Field'
import { Spinner } from '../../components/ui/States'
import { StatCard } from '../../components/ui'

interface ProfileForm {
  name: string
  description: string
  cuisine: string
  category: string
  tags: string
  emoji: string
  ownerName: string
  phone: string
  addressLine: string
  area: string
  deliveryTimeMin: string
  deliveryFee: string
  minOrder: string
  freeDelivery: boolean
  promo: string
  hoursOpen: string
  hoursClose: string
  lat: string
  lng: string
}

function formFrom(restaurant: NonNullable<PortalContextValue['data']>['restaurant']): ProfileForm {
  return {
    name: restaurant.name ?? '',
    description: restaurant.description ?? '',
    cuisine: restaurant.cuisine ?? '',
    category: restaurant.category ?? '',
    tags: (restaurant.tags ?? []).join(', '),
    emoji: restaurant.emoji ?? '',
    ownerName: restaurant.ownerName ?? '',
    phone: restaurant.phone ?? '',
    addressLine: restaurant.addressLine ?? '',
    area: restaurant.area ?? '',
    deliveryTimeMin: restaurant.deliveryTimeMin == null ? '' : String(restaurant.deliveryTimeMin),
    deliveryFee: restaurant.deliveryFee == null ? '' : String(restaurant.deliveryFee),
    minOrder: restaurant.minOrder == null ? '' : String(restaurant.minOrder),
    freeDelivery: restaurant.freeDelivery,
    promo: restaurant.promo ?? '',
    hoursOpen: restaurant.hours?.open ?? '',
    hoursClose: restaurant.hours?.close ?? '',
    lat: restaurant.location?.coordinates?.[1] != null ? String(restaurant.location.coordinates[1]) : '',
    lng: restaurant.location?.coordinates?.[0] != null ? String(restaurant.location.coordinates[0]) : '',
  }
}

/**
 * Numbers arrive as form text; a `_num` helper keeps every field optional the
 * same way: blank means "send nothing", a bad number is a save error, not a
 * silent zero.
 */
function num(value: string, label: string, errors: string[]): number | undefined {
  if (value === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} must be a number.`)
    return undefined
  }
  return parsed
}

export default function PortalProfile() {
  const context = useOutletContext<PortalContextValue>()
  const restaurant = context.data?.restaurant

  const [form, setForm] = useState<ProfileForm | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // The layout may reload /restaurant/me (status switch) - keep the form in
  // step without clobbering what the owner is typing: only an untouched form
  // is refilled.
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!restaurant) return
    setForm((current) => (dirty ? current : formFrom(restaurant)))
  }, [restaurant, dirty])

  const stats = context.data?.stats

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setDirty(true)
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const save = async () => {
    if (!form || !restaurant) return
    setError('')
    const problems: string[] = []
    if (form.name.trim().length < 2) problems.push('Restaurant name must be 2 characters or more.')

    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10)

    const deliveryTimeMin = num(form.deliveryTimeMin.trim(), 'Delivery time', problems)
    const deliveryFee = num(form.deliveryFee.trim(), 'Delivery fee', problems)
    const minOrder = num(form.minOrder.trim(), 'Minimum order', problems)

    const numRE = /^-?\d+(\.\d+)?$/
    const hasGeo = form.lat.trim() !== '' || form.lng.trim() !== ''
    if (hasGeo && (form.lat.trim() === '' || form.lng.trim() === '')) {
      problems.push('Set both latitude and longitude, or leave both empty.')
    }
    if (hasGeo && (!numRE.test(form.lat.trim()) || !numRE.test(form.lng.trim()))) {
      problems.push('Latitude and longitude must be numbers.')
    }
    const lat = form.lat.trim() === '' ? undefined : Number(form.lat.trim())
    const lng = form.lng.trim() === '' ? undefined : Number(form.lng.trim())

    if (problems.length > 0) {
      setError(problems[0])
      toast.error(problems[0])
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim(),
        cuisine: form.cuisine.trim(),
        category: form.category.trim(),
        tags,
        ownerName: form.ownerName.trim(),
        phone: form.phone.trim(),
        addressLine: form.addressLine.trim(),
        area: form.area.trim(),
        freeDelivery: form.freeDelivery,
        promo: form.promo.trim(),
      }
      if (deliveryTimeMin !== undefined) body.deliveryTimeMin = deliveryTimeMin
      if (deliveryFee !== undefined) body.deliveryFee = deliveryFee
      if (minOrder !== undefined) body.minOrder = minOrder
      if (lat !== undefined && lng !== undefined) {
        body.lat = lat
        body.lng = lng
      }
      const timeRE = /^\d{2}:\d{2}$/
      if (timeRE.test(form.hoursOpen) || timeRE.test(form.hoursClose)) {
        body.hours = {
          open: timeRE.test(form.hoursOpen) ? form.hoursOpen : undefined,
          close: timeRE.test(form.hoursClose) ? form.hoursClose : undefined,
        }
      }

      const response = await api.patch('/restaurant/me', body)
      if (response.status === 200) {
        setDirty(false)
        context.refreshMe()
        toast.success('Profile saved')
      }
    } catch (failure) {
      const message = apiErrorMessage(failure, 'Could not save your profile.')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const changePhoto = async (file: File) => {
    if (!restaurant) return
    setUploading(true)
    try {
      const body = (await uploadFile('/restaurant/me/upload', file)) as {
        restaurant?: unknown
      }
      if (body?.restaurant) {
        context.refreshMe()
        toast.success('Photo updated')
      }
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not upload the photo.'))
    } finally {
      setUploading(false)
    }
  }

  const imageUrl = restaurant?.imageUrl
  const emoji = restaurant?.emoji

  const headerStats = useMemo(
    () => [
      {
        icon: Star,
        label: 'Rating',
        value: `${(restaurant?.rating ?? 0).toFixed(1)}`,
        hint: `${restaurant?.reviewCount ?? 0} reviews`,
      },
      {
        icon: Timer,
        label: 'Menu dishes',
        value: stats?.menuCount ?? 0,
      },
      {
        icon: Banknote,
        label: 'Revenue today',
        value: formatCurrency(stats?.todayRevenue ?? 0),
      },
    ],
    [restaurant?.rating, restaurant?.reviewCount, stats?.menuCount, stats?.todayRevenue],
  )

  if (!restaurant || !form) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Restaurant profile"
        description="Your shopfront on the app: photos, contact details, delivery terms and opening hours."
        actions={
          <>
            {dirty && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (restaurant) setForm(formFrom(restaurant))
                  setDirty(false)
                  setError('')
                }}
              >
                Discard edits
              </Button>
            )}
            <Button variant="primary" icon={Save} loading={saving} onClick={() => void save()}>
              Save changes
            </Button>
          </>
        }
      />

      {/* Read-only rating/review row - these are platform-managed numbers. */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {headerStats.map((stat) => (
          <StatCard key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </div>

      {/* Banner photo. */}
      <Card className="mb-6">
        <CardHeader
          title="Photo"
          description="Shown on your restaurant card in the app."
        />
        <CardBody>
          <div className="flex flex-wrap items-center gap-4">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Restaurant"
                className="h-24 w-24 rounded-2xl object-cover ring-1 ring-line"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-strong text-3xl font-bold text-brand-contrast">
                {emoji || (form.name.charAt(0) || 'R')}
              </span>
            )}
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-surface-muted">
                <ImageUp className="h-4 w-4" aria-hidden="true" />
                {uploading ? 'Uploading…' : 'Choose a photo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void changePhoto(file)
                    event.target.value = ''
                  }}
                />
              </label>
              <p className="mt-1.5 text-xs text-ink-subtle">PNG, JPG or WEBP, square works best.</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {error && (
        <p className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Identity" description="How the restaurant reads on the app." />
          <CardBody className="grid gap-4">
            <Field label="Name" required hint="Up to 80 characters">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Description" hint="Tell customers what you serve (500 max)">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cuisine">
                <Input
                  value={form.cuisine}
                  placeholder="e.g. Pakistani"
                  onChange={(e) => set('cuisine', e.target.value)}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={form.category}
                  placeholder="e.g. Biryani"
                  onChange={(e) => set('category', e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Emoji" hint="Shown if no photo">
                <Input value={form.emoji} maxLength={4} onChange={(e) => set('emoji', e.target.value)} />
              </Field>
              <Field label="Tags" hint="Comma-separated, up to 10">
                <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contact & location" description="Where riders go and who to call." />
          <CardBody className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Owner name">
                <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
              </Field>
              <Field label="Phone" hint="Shown for order support">
                <Input
                  icon={Phone}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Address">
              <Input
                value={form.addressLine}
                placeholder="e.g. Saidu Sharif, main road"
                onChange={(e) => set('addressLine', e.target.value)}
              />
            </Field>
            <Field label="Area">
              <Input value={form.area} onChange={(e) => set('area', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude" hint="Pins you on the map">
                <GeoInput value={form.lat} onChange={(e) => set('lat', e.target.value)} label="Latitude" />
              </Field>
              <Field label="Longitude">
                <GeoInput value={form.lng} onChange={(e) => set('lng', e.target.value)} label="Longitude" />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Delivery terms"
            description="Your fees and minimum — customers see these at checkout."
          />
          <CardBody className="grid gap-4">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Minutes" hint="Delivery time">
                <Input
                  icon={Clock}
                  type="number"
                  min="1"
                  value={form.deliveryTimeMin}
                  onChange={(e) => set('deliveryTimeMin', e.target.value)}
                />
              </Field>
              <Field label="Fee (Rs)">
                <Input
                  type="number"
                  min="0"
                  value={form.deliveryFee}
                  onChange={(e) => set('deliveryFee', e.target.value)}
                />
              </Field>
              <Field label="Min order (Rs)">
                <Input
                  type="number"
                  min="0"
                  value={form.minOrder}
                  onChange={(e) => set('minOrder', e.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-muted/50 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-ink">Free delivery</p>
                <p className="text-xs text-ink-muted">Waive the delivery fee on your menu.</p>
              </div>
              <Switch
                checked={form.freeDelivery}
                onChange={(next) => set('freeDelivery', next)}
                label="Free delivery"
              />
            </div>
            <Field label="Promo banner" hint="One line shown on your restaurant card (optional)">
              <Input
                aria-label="Promo banner"
                value={form.promo}
                placeholder="e.g. 20% off till Eid"
                onChange={(e) => set('promo', e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Opening hours" description="Shown on your restaurant card." />
          <CardBody className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Opens at" hint="24-hour clock, e.g. 10:00">
                <Input
                  value={form.hoursOpen}
                  placeholder="10:00"
                  onChange={(e) => set('hoursOpen', e.target.value)}
                />
              </Field>
              <Field label="Closes at" hint="e.g. 23:00">
                <Input
                  value={form.hoursClose}
                  placeholder="23:00"
                  onChange={(e) => set('hoursClose', e.target.value)}
                />
              </Field>
            </div>
            <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
              The open/closed switch in the header above overrides these hours for the day — customers
              cannot order while the kitchen is marked closed.
            </p>
          </CardBody>
        </Card>
      </div>

      {dirty && (
        <p className="mt-6 text-right text-xs text-ink-muted">
          You have unsaved changes - <span className="font-semibold text-ink">Save changes</span> makes them live.
        </p>
      )}
    </div>
  )
}

/** A latitude/longitude input with a map-pin icon, shared by both axis fields. */
function GeoInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  label: string
}) {
  return (
    <Input
      aria-label={label}
      icon={MapPin}
      inputMode="decimal"
      value={value}
      onChange={onChange}
      placeholder="34.15"
    />
  )
}
