import { useState } from 'react'
import { toast } from 'sonner'
import { Ban, Car, Search } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import { formatCurrency, formatDateTime, humanizeStatus, statusTone, timeAgo } from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'

interface RideRow {
  _id: string
  rideNumber?: string | null
  type: string
  status: string
  fare: number
  distanceKm?: number
  durationMin?: number
  paymentMethod?: string | null
  createdAt: string
  pickup?: { address?: string; area?: string | null } | null
  dropoff?: { address?: string; area?: string | null } | null
  customer?: { name?: string; phone?: string } | null
  rider?: { name?: string; phone?: string } | null
  cancelReason?: string | null
}

const RIDE_TYPE_LABELS: Record<string, string> = {
  swat_moto: 'Swat Moto',
  swat_city: 'Swat City',
  swat_van: 'Swat Van',
}

const RIDE_STATUSES = ['searching', 'accepted', 'arriving', 'started', 'completed', 'cancelled']
const CANCELLABLE = ['searching', 'accepted', 'arriving', 'started']

/** Every ride request, with a cancel action for the ones still in flight. */
export default function Rides() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const list = useListResource<RideRow>({
    endpoint: '/admin/rides',
    rowsKey: 'rides',
  })

  const [target, setTarget] = useState<RideRow | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const applyFilters = (nextStatus: string) => {
    setStatus(nextStatus)
    list.setFilter('status', nextStatus)
  }

  const cancel = async () => {
    if (!target) return
    setBusy(true)
    try {
      await api.post(`/admin/rides/${target._id}/cancel`, {
        reason: reason.trim() || 'Cancelled by admin',
      })
      toast.success('Ride cancelled')
      setTarget(null)
      setReason('')
      await list.reload()
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not cancel this ride.'))
    } finally {
      setBusy(false)
    }
  }

  const filtered = search.trim()
    ? list.rows.filter((ride) => {
        const needle = search.trim().toLowerCase()
        return (
          ride.rideNumber?.toLowerCase().includes(needle) ||
          ride.customer?.name?.toLowerCase().includes(needle) ||
          ride.customer?.phone?.toLowerCase().includes(needle) ||
          ride.rider?.name?.toLowerCase().includes(needle) ||
          ride.pickup?.address?.toLowerCase().includes(needle) ||
          ride.dropoff?.address?.toLowerCase().includes(needle)
        )
      })
    : list.rows

  const columns: Column<RideRow>[] = [
    {
      key: 'ride',
      label: 'Ride',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <div>
          <div className="font-semibold text-ink">{row.rideNumber || row._id.slice(-8)}</div>
          <div className="text-xs text-ink-subtle">
            {RIDE_TYPE_LABELS[row.type] ?? row.type} · {timeAgo(row.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'route',
      label: 'Route',
      render: (row) => (
        <div className="max-w-[260px] text-xs">
          <p className="truncate text-ink">{row.pickup?.address || '-'}</p>
          <p className="truncate text-ink-subtle">→ {row.dropoff?.address || '-'}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row) => (
        <div>
          <div className="text-ink">{row.customer?.name || '-'}</div>
          {row.customer?.phone && <div className="text-xs text-ink-subtle">{row.customer.phone}</div>}
        </div>
      ),
    },
    {
      key: 'rider',
      label: 'Rider',
      render: (row) =>
        row.rider?.name ? (
          <span className="text-ink">{row.rider.name}</span>
        ) : (
          <span className="text-ink-subtle">Unassigned</span>
        ),
    },
    {
      key: 'distance',
      label: 'Distance',
      secondary: true,
      align: 'right',
      render: (row) => `${Number(row.distanceKm ?? 0).toFixed(1)} km`,
    },
    {
      key: 'fare',
      label: 'Fare',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.fare ?? 0,
      render: (row) => <span className="font-semibold text-ink">{formatCurrency(row.fare ?? 0)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {humanizeStatus(row.status)}
        </Badge>
      ),
    },
  ]

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Operations"
        title="Rides"
        description="Swat Moto, City and Van rides — who is riding, where to, and what it costs."
        actions={
          <Button variant="secondary" icon={Car} onClick={() => void list.reload()}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-full sm:w-64">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter this page…"
              icon={Search}
              aria-label="Filter rides on this page"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={status}
              onChange={(event) => applyFilters(event.target.value)}
              aria-label="Filter rides by status"
              options={[
                { value: 'all', label: 'All statuses' },
                ...RIDE_STATUSES.map((value) => ({ value, label: humanizeStatus(value) })),
              ]}
            />
          </div>
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} rides
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={list.loading}
          error={list.error}
          emptyTitle="No rides match"
          emptyDescription="Change the status filter or try again."
          emptyIcon={Car}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          actions={(row) => (
            <Dropdown
              items={[
                {
                  label: 'Cancel ride',
                  icon: Ban,
                  danger: true,
                  disabled: !CANCELLABLE.includes(row.status),
                  onClick: () => {
                    setTarget(row)
                    setReason('')
                  },
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
          noun="rides"
        />
      </Card>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        onConfirm={() => void cancel()}
        title="Cancel this ride?"
        message={
          target
            ? `Ride ${target.rideNumber || target._id.slice(-8)} for ${
                target.customer?.name || 'the customer'
              } will be cancelled and the rider notified.`
            : ''
        }
        confirmLabel="Cancel ride"
        cancelLabel="Keep ride"
        busy={busy}
      >
        <Field label="Reason (optional)" htmlFor="ride-cancel-reason">
          <Textarea
            id="ride-cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Rider cannot reach the pickup point"
            maxLength={300}
          />
        </Field>
        {target?.createdAt && (
          <p className="text-xs text-ink-subtle">Requested {formatDateTime(target.createdAt)}</p>
        )}
      </ConfirmDialog>
    </div>
  )
}
