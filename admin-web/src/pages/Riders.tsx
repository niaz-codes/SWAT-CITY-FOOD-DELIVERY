import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Bike,
  CalendarDays,
  CheckCircle2,
  FileText,
  IdCard,
  MapPin,
  Search,
  ShieldAlert,
  Star,
  Upload,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useListResource } from '../lib/useListResource'
import {
  formatDate,
  formatDateTime,
  formatNumber,
  humanizeStatus,
  statusTone,
  timeAgo,
} from '../lib/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Avatar from '../components/ui/Avatar'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import Drawer from '../components/ui/Drawer'
import Dropdown from '../components/ui/Dropdown'
import Pagination from '../components/ui/Pagination'
import DataTable, { type Column } from '../components/DataTable'
import { InlineError, Skeleton } from '../components/ui/States'

interface PendingVehicle {
  vehicleType?: string | null
  vehicleBrand?: string | null
  vehiclePlate?: string | null
  requestedAt?: string | null
  note?: string | null
}

interface RiderRow {
  _id: string
  name: string
  phone?: string | null
  avatarUrl?: string | null
  photoUrl?: string | null
  cnic?: string | null
  baseCity?: string | null
  experienceYears?: number | null
  vehicleType?: string | null
  vehicleBrand?: string | null
  vehiclePlate?: string | null
  approvalStatus?: string | null
  rejectionReason?: string | null
  status?: string | null
  isOnline?: boolean
  suspendedAt?: string | null
  rating?: number
  totalTrips?: number
  createdAt: string
  reviewedAt?: string | null
  pendingVehicle?: PendingVehicle | null
  user?: {
    _id?: string
    name?: string
    phone?: string
    email?: string
    verified?: boolean
    status?: string
    avatarUrl?: string | null
  } | null
}

interface DocumentRow {
  _id: string
  type: string
  url: string
  status: string
  reviewNote?: string | null
  createdAt?: string
}

interface RiderDetail {
  rider?: RiderRow
  documents?: DocumentRow[]
}

type ActionKind = 'approve' | 'reject' | 'suspend' | 'activate'

const APPROVAL_FILTERS = [
  { value: 'all', label: 'All approvals' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'busy', label: 'Busy' },
]

const PLATE_PATTERN = /^[A-Z]{1,4}[\s-]?\d{1,4}$/i

const ACTION_TITLES: Record<ActionKind, string> = {
  approve: 'Approve this rider?',
  reject: 'Reject this application?',
  suspend: 'Suspend this rider?',
  activate: 'Reactivate this rider?',
}

const ACTION_MESSAGES: Record<ActionKind, string> = {
  approve:
    'The rider is notified immediately and can go online and accept deliveries. Make sure the photo, CNIC and bike number have been checked first.',
  reject:
    'The rider stays off the road. Their pending documents are marked rejected and they are told why — a clear reason helps them re-apply.',
  suspend:
    'The rider is taken offline immediately, removed from dispatch and signed out of work. Their earnings and history stay untouched.',
  activate:
    'The rider is marked approved again, their account becomes active and they can go online right away.',
}

/** Rider accounts, the application review and the approved photo. */
export default function Riders() {
  const list = useListResource<RiderRow>({
    endpoint: '/admin/riders',
    rowsKey: 'riders',
    pageSize: 20,
  })

  const [search, setSearch] = useState('')
  const [approval, setApproval] = useState('all')
  const [status, setStatus] = useState('all')

  const [action, setAction] = useState<{ kind: ActionKind; row: RiderRow } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RiderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [plate, setPlate] = useState('')
  const [plateError, setPlateError] = useState('')
  const [savingPlate, setSavingPlate] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [vehicleBusy, setVehicleBusy] = useState(false)
  const [vehicleRejectOpen, setVehicleRejectOpen] = useState(false)
  const [vehicleReason, setVehicleReason] = useState('')
  const photoInput = useRef<HTMLInputElement | null>(null)

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    try {
      const response = await api.get(`/admin/riders/${id}`)
      const data = (response.data?.data ?? {}) as RiderDetail
      setDetail(data)
      setPlate(data.rider?.vehiclePlate ?? '')
    } catch (failure) {
      setDetailError(apiErrorMessage(failure, 'Could not load this rider.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const openDetail = (row: RiderRow) => {
    setSelectedId(row._id)
    setDetail(null)
    setPlate(row.vehiclePlate ?? '')
    setVehicleRejectOpen(false)
    void loadDetail(row._id)
  }

  const closeAction = () => {
    setAction(null)
    setReason('')
  }

  const runAction = async () => {
    if (!action) return
    const { kind, row } = action
    if (kind === 'reject' && !reason.trim()) {
      toast.error('A rejection reason is required.')
      return
    }
    setBusy(true)
    try {
      if (kind === 'approve') await api.post(`/admin/riders/${row._id}/approve`)
      if (kind === 'reject')
        await api.post(`/admin/riders/${row._id}/reject`, { reason: reason.trim() })
      if (kind === 'suspend') await api.post(`/admin/riders/${row._id}/suspend`)
      if (kind === 'activate') await api.post(`/admin/riders/${row._id}/activate`)

      toast.success(
        kind === 'approve'
          ? 'Rider approved'
          : kind === 'reject'
            ? 'Application rejected'
            : kind === 'suspend'
              ? 'Rider suspended'
              : 'Rider reactivated',
      )
      closeAction()
      await list.reload()
      if (selectedId === row._id) await loadDetail(row._id)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not update this rider.'))
    } finally {
      setBusy(false)
    }
  }

  const savePlate = async () => {
    if (!detail?.rider) return
    const value = plate.trim().toUpperCase()
    if (!PLATE_PATTERN.test(value)) {
      setPlateError('Use a format like SWAT-1234.')
      return
    }
    setPlateError('')
    setSavingPlate(true)
    try {
      await api.patch(`/admin/riders/${detail.rider._id}/vehicle`, { vehiclePlate: value })
      toast.success('Bike number saved')
      await list.reload()
      await loadDetail(detail.rider._id)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not save the bike number.'))
    } finally {
      setSavingPlate(false)
    }
  }

  const uploadPhoto = async (file: File) => {
    if (!detail?.rider) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Keep the photo under 5 MB.')
      return
    }
    setUploading(true)
    const body = new FormData()
    body.append('photo', file)
    try {
      await api.post(`/admin/riders/${detail.rider._id}/avatar`, body)
      toast.success('Approved photo updated')
      await list.reload()
      await loadDetail(detail.rider._id)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not upload the photo.'))
    } finally {
      setUploading(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  const decideVehicleChange = async (decision: 'approve' | 'reject') => {
    if (!detail?.rider) return
    if (decision === 'reject' && !vehicleReason.trim()) {
      toast.error('Add a short reason for the rider.')
      return
    }
    setVehicleBusy(true)
    try {
      if (decision === 'approve') {
        await api.post(`/admin/riders/${detail.rider._id}/vehicle/approve`)
        toast.success('Vehicle change approved')
      } else {
        await api.post(`/admin/riders/${detail.rider._id}/vehicle/reject`, {
          reason: vehicleReason.trim(),
        })
        toast.success('Vehicle change rejected')
      }
      setVehicleRejectOpen(false)
      setVehicleReason('')
      await list.reload()
      await loadDetail(detail.rider._id)
    } catch (failure) {
      toast.error(apiErrorMessage(failure, 'Could not review the vehicle change.'))
    } finally {
      setVehicleBusy(false)
    }
  }

  const applyApproval = (value: string) => {
    setApproval(value)
    list.setFilter('approval', value)
  }

  const applyStatus = (value: string) => {
    setStatus(value)
    list.setFilter('status', value)
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return list.rows
    return list.rows.filter(
      (row) =>
        row.name?.toLowerCase().includes(needle) ||
        row.phone?.toLowerCase().includes(needle) ||
        row.user?.phone?.toLowerCase().includes(needle) ||
        row.vehiclePlate?.toLowerCase().includes(needle) ||
        row.baseCity?.toLowerCase().includes(needle),
    )
  }, [list.rows, search])

  const actionItems = (row: RiderRow) => {
    const items: Parameters<typeof Dropdown>[0]['items'] = [
      { label: 'View details', icon: FileText, onClick: () => openDetail(row) },
    ]
    if (row.approvalStatus !== 'approved') {
      items.push(
        {
          label: 'Approve rider',
          icon: UserCheck,
          divider: true,
          onClick: () => setAction({ kind: 'approve', row }),
        },
        {
          label: 'Reject application',
          icon: UserX,
          danger: true,
          onClick: () => setAction({ kind: 'reject', row }),
        },
      )
    }
    const suspended = Boolean(row.suspendedAt) || row.user?.status === 'suspended'
    if (row.approvalStatus === 'approved' && !suspended) {
      items.push({
        label: 'Suspend rider',
        icon: UserX,
        danger: true,
        divider: true,
        onClick: () => setAction({ kind: 'suspend', row }),
      })
    }
    if (suspended) {
      items.push({
        label: 'Reactivate rider',
        icon: UserCheck,
        divider: true,
        onClick: () => setAction({ kind: 'activate', row }),
      })
    }
    return items
  }

  const columns: Column<RiderRow>[] = [
    {
      key: 'rider',
      label: 'Rider',
      sortable: true,
      sortValue: (row) => row.name ?? '',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar
            name={row.name}
            src={row.avatarUrl || row.photoUrl || row.user?.avatarUrl || undefined}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-ink">{row.name || 'Unnamed rider'}</span>
              {row.approvalStatus === 'approved' && (
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand" aria-label="Approved" />
              )}
            </div>
            <div className="truncate text-xs text-ink-subtle">
              {row.phone || row.user?.phone || 'No phone'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      render: (row) => (
        <div className="text-xs">
          <div className="text-ink">
            {humanizeStatus(row.vehicleType ?? '-')}
            {row.vehicleBrand ? ` · ${row.vehicleBrand}` : ''}
          </div>
          <div className="font-mono text-ink-subtle">{row.vehiclePlate || 'No plate'}</div>
          {row.pendingVehicle?.requestedAt && (
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Change waiting
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'presence',
      label: 'Presence',
      render: (row) => (
        <Badge
          tone={row.status === 'online' ? 'success' : row.status === 'busy' ? 'warning' : 'neutral'}
          dot
        >
          {humanizeStatus(row.status ?? 'offline')}
        </Badge>
      ),
    },
    {
      key: 'rating',
      label: 'Rating',
      secondary: true,
      align: 'right',
      render: (row) =>
        row.rating ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 text-warning" aria-hidden="true" />
            {row.rating.toFixed(1)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'trips',
      label: 'Trips',
      secondary: true,
      align: 'right',
      sortable: true,
      sortValue: (row) => row.totalTrips ?? 0,
      render: (row) => formatNumber(row.totalTrips ?? 0),
    },
    {
      key: 'approval',
      label: 'Approval',
      render: (row) => (
        <Badge tone={statusTone(row.approvalStatus)} dot>
          {humanizeStatus(row.approvalStatus ?? 'pending')}
        </Badge>
      ),
    },
    {
      key: 'joined',
      label: 'Joined',
      align: 'right',
      sortable: true,
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => (
        <span title={formatDateTime(row.createdAt)} className="text-xs">
          {timeAgo(row.createdAt)}
        </span>
      ),
    },
  ]

  const rider = detail?.rider
  const suspended = Boolean(rider?.suspendedAt) || rider?.user?.status === 'suspended'
  const pendingVehicle = rider?.pendingVehicle

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Operations"
        title="Riders"
        description="Applications, approved photos, bike numbers and the suspend switch — all in one place."
        actions={
          <Button variant="secondary" icon={Bike} onClick={() => void list.reload()}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-full sm:w-60">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter this page…"
              icon={Search}
              aria-label="Filter riders on this page"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={approval}
              onChange={(event) => applyApproval(event.target.value)}
              aria-label="Filter riders by approval"
              options={APPROVAL_FILTERS}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              value={status}
              onChange={(event) => applyStatus(event.target.value)}
              aria-label="Filter riders by presence"
              options={STATUS_FILTERS}
            />
          </div>
          <span className="ml-auto hidden text-xs text-ink-subtle sm:block">
            {list.total.toLocaleString('en-PK')} riders
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          loading={list.loading}
          error={list.error}
          emptyTitle="No riders match"
          emptyDescription="Clear the filters, or wait for the next application."
          emptyIcon={Bike}
          onRetry={list.reload}
          rowKey={(row) => row._id}
          onRowClick={openDetail}
          actions={(row) => <Dropdown items={actionItems(row)} />}
        />

        <Pagination
          page={list.page}
          pages={list.pages}
          total={list.total}
          limit={list.limit}
          onPage={list.setPage}
          noun="riders"
        />
      </Card>

      <ConfirmDialog
        open={Boolean(action && action.kind !== 'reject')}
        onClose={closeAction}
        onConfirm={() => void runAction()}
        title={action ? ACTION_TITLES[action.kind] : ''}
        message={
          action ? (
            <div className="space-y-2">
              <p>{ACTION_MESSAGES[action.kind]}</p>
              <div className="rounded-xl border border-line bg-surface-muted p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Rider</span>
                  <span className="font-semibold text-ink">{action.row.name}</span>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <span className="text-ink-muted">Bike</span>
                  <span className="font-mono text-ink">{action.row.vehiclePlate || '—'}</span>
                </div>
              </div>
            </div>
          ) : null
        }
        confirmLabel={action ? ACTION_TITLES[action.kind].replace('?', '') : 'Confirm'}
        tone={action?.kind === 'suspend' || action?.kind === 'reject' ? 'danger' : 'primary'}
        busy={busy}
      />

      <ConfirmDialog
        open={action?.kind === 'reject'}
        onClose={closeAction}
        onConfirm={() => void runAction()}
        title="Reject this application?"
        message="The rider is told why. Be specific and kind — they may fix the issue and apply again."
        confirmLabel="Reject application"
        busy={busy}
      >
        <Field label="Reason" htmlFor="rider-reject-reason" required>
          <Textarea
            id="rider-reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. The bike number in the photo does not match the one entered."
            maxLength={300}
          />
        </Field>
      </ConfirmDialog>

      <Drawer
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null)
          setDetail(null)
        }}
        title={rider?.name || 'Rider'}
        description={
          rider
            ? `${humanizeStatus(rider.approvalStatus ?? 'pending')} · ${
                rider.baseCity || 'Swat'
              } · joined ${formatDate(rider.createdAt)}`
            : 'Loading rider…'
        }
        width="lg"
      >
        {detailLoading && !detail ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detailError ? (
          <InlineError message={detailError} />
        ) : rider ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(rider.approvalStatus)} dot>
                {humanizeStatus(rider.approvalStatus ?? 'pending')}
              </Badge>
              <Badge tone={rider.status === 'online' ? 'success' : 'neutral'} dot>
                {humanizeStatus(rider.status ?? 'offline')}
              </Badge>
              {suspended && <Badge tone="danger">Suspended</Badge>}
              {rider.user?.verified && <Badge tone="info">Phone verified</Badge>}
            </div>

            {/* Approved photo */}
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-muted/40 p-3">
              <Avatar
                name={rider.name}
                src={rider.avatarUrl || rider.user?.avatarUrl || rider.photoUrl || undefined}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Approved profile photo</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Riders cannot change this themselves. Upload the photo you checked against their
                  CNIC.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    icon={Upload}
                    loading={uploading}
                    onClick={() => photoInput.current?.click()}
                  >
                    Upload photo
                  </Button>
                  {rider.photoUrl && !rider.avatarUrl && (
                    <a
                      href={rider.photoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-muted"
                    >
                      View submitted photo
                    </a>
                  )}
                </div>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadPhoto(file)
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: 'Rating',
                  value: rider.rating ? rider.rating.toFixed(1) : '—',
                  icon: Star,
                },
                {
                  label: 'Trips',
                  value: formatNumber(rider.totalTrips ?? 0),
                  icon: Bike,
                },
                {
                  label: 'Experience',
                  value: rider.experienceYears ? `${rider.experienceYears} yrs` : '—',
                  icon: CalendarDays,
                },
                {
                  label: 'Base',
                  value: rider.baseCity || 'Swat',
                  icon: MapPin,
                },
              ].map((stat) => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className="rounded-xl border border-line px-3 py-2">
                    <Icon className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                      {stat.label}
                    </p>
                    <p className="text-sm font-semibold text-ink">{stat.value}</p>
                  </div>
                )
              })}
            </div>

            <dl className="divide-y divide-line rounded-xl border border-line text-sm">
              {[
                ['Phone', rider.phone || rider.user?.phone || '—'],
                ['Email', rider.user?.email || '—'],
                ['CNIC', rider.cnic || 'Not provided'],
                ['Vehicle', `${humanizeStatus(rider.vehicleType ?? '-')}${rider.vehicleBrand ? ` · ${rider.vehicleBrand}` : ''}`],
                ['Rejection reason', rider.rejectionReason || '—'],
                [
                  'Reviewed',
                  rider.reviewedAt ? formatDateTime(rider.reviewedAt) : 'Not reviewed yet',
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="max-w-[65%] break-words text-right text-xs font-medium text-ink">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Bike number */}
            <div className="rounded-xl border border-line p-3">
              <Field
                label="Registered bike number"
                htmlFor="rider-plate"
                error={plateError}
                hint="Admin-managed. This is what dispatch and customers see."
              >
                <div className="flex gap-2">
                  <Input
                    id="rider-plate"
                    value={plate}
                    onChange={(event) => setPlate(event.target.value.toUpperCase())}
                    placeholder="SWAT-1234"
                    className="font-mono"
                  />
                  <Button
                    variant="secondary"
                    loading={savingPlate}
                    disabled={plate.trim().toUpperCase() === (rider.vehiclePlate ?? '').toUpperCase()}
                    onClick={() => void savePlate()}
                  >
                    Save
                  </Button>
                </div>
              </Field>
            </div>

            {/* Pending vehicle change */}
            {pendingVehicle?.requestedAt && (
              <div className="rounded-xl border border-warning/30 bg-warning-soft/50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Vehicle change waiting
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Current</dt>
                    <dd className="font-medium text-ink">
                      {humanizeStatus(rider.vehicleType ?? '-')} · {rider.vehiclePlate || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Requested</dt>
                    <dd className="font-medium text-ink">
                      {humanizeStatus(
                        pendingVehicle.vehicleType || rider.vehicleType || '-',
                      )}{' '}
                      · {pendingVehicle.vehiclePlate || rider.vehiclePlate || '—'}
                    </dd>
                  </div>
                  {pendingVehicle.note && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-muted">Note</dt>
                      <dd className="text-right font-medium text-ink">{pendingVehicle.note}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={CheckCircle2}
                    loading={vehicleBusy && !vehicleRejectOpen}
                    onClick={() => void decideVehicleChange('approve')}
                  >
                    Approve change
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={XCircle}
                    onClick={() => setVehicleRejectOpen(true)}
                  >
                    Reject
                  </Button>
                </div>
                {vehicleRejectOpen && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={vehicleReason}
                      onChange={(event) => setVehicleReason(event.target.value)}
                      placeholder="Why is this change not accepted?"
                      maxLength={200}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setVehicleRejectOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={vehicleBusy}
                        onClick={() => void decideVehicleChange('reject')}
                      >
                        Reject change
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                <IdCard className="h-3.5 w-3.5" aria-hidden="true" /> Submitted documents
              </p>
              {(detail.documents ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs text-ink-muted">
                  No documents attached to this application.
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(detail.documents ?? []).map((document) => (
                    <li key={document._id} className="overflow-hidden rounded-xl border border-line">
                      {document.url?.match(/\.(png|jpe?g|webp|gif)(\?|$)/i) ? (
                        <a href={document.url} target="_blank" rel="noreferrer">
                          <img
                            src={document.url}
                            alt={humanizeStatus(document.type)}
                            className="h-32 w-full object-cover"
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-32 items-center justify-center text-xs font-semibold text-brand hover:underline"
                        >
                          Open document
                        </a>
                      )}
                      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <span className="text-xs font-medium text-ink">
                          {humanizeStatus(document.type)}
                        </span>
                        <Badge tone={statusTone(document.status)}>{humanizeStatus(document.status)}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Decisions */}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {rider.approvalStatus !== 'approved' && (
                <Button
                  variant="primary"
                  icon={UserCheck}
                  onClick={() => setAction({ kind: 'approve', row: rider })}
                >
                  Approve rider
                </Button>
              )}
              {rider.approvalStatus === 'pending' && (
                <Button
                  variant="secondary"
                  icon={UserX}
                  onClick={() => setAction({ kind: 'reject', row: rider })}
                >
                  Reject application
                </Button>
              )}
              {rider.approvalStatus === 'approved' && !suspended && (
                <Button
                  variant="danger"
                  icon={UserX}
                  onClick={() => setAction({ kind: 'suspend', row: rider })}
                >
                  Suspend rider
                </Button>
              )}
              {suspended && (
                <Button
                  variant="primary"
                  icon={UserCheck}
                  onClick={() => setAction({ kind: 'activate', row: rider })}
                >
                  Reactivate rider
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
